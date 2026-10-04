// GLYPHTENDER'S AI PLUG — what the framework's brain (kit/brain.ts) needs to play Glyphtender: its 7 goals, its
// readings, how to imagine the hidden seeds, which moves to look at, how to name a move, and the special decisions.
// Data flow for one decision: seat's view → readings (readings.ts) → mood shifts + goal roll (brain) → imagined
// worlds (imagine.ts) → special decision? (decisions.ts: draft / refresh / call it) → candidates (here) → every goal
// scores every candidate (goals/) → the brain picks like a person and writes a note.
import { getBoard } from '../engine/boards'
import { hexKey } from '../engine/hex'
import { legalActions, type SeatView } from '../engine/rules'
import type { Action, GameState, WordList } from '../engine/types'
import { sample } from './kit/random'
import type { GamePlug } from './kit/types'
import { specialDecision } from './decisions'
import { buildGoal } from './goals/build'
import { denyGoal } from './goals/deny'
import { dumpGoal } from './goals/dump'
import { escapeGoal } from './goals/escape'
import { scoreGoal } from './goals/score'
import { stealGoal } from './goals/steal'
import { trapGoal } from './goals/trap'
import { imagineWorld } from './imagine'
import { mobilityNow, movesFrom, occupiedHexes, openDirections, turnKey, type TurnAction } from './look'
import { readingsFor } from './readings'
import goalsFile from '../../content/ai/goals.json'

export type GlyphPlug = GamePlug<SeatView, Action, GameState>

/**
 * The moves that must never be thinned away: those that TANGLE a rival glyphling and those that RESCUE one of its own
 * (an endangered glyphling — ≤ 2 moves — that ends the turn with more moves than it had). Checked quickly: only rival
 * glyphlings with ≤ 2 directions open can be tangled in one turn (a turn blocks at most 2 hexes).
 */
export function mustKeep(world: GameState, seat: number, actions: readonly Action[]): { tangles: Action[]; rescues: Action[] } {
  const moves = mobilityNow(world)
  const taken = occupiedHexes(world)
  const prey = world.glyphlings.filter((g) => g.seat !== seat && moves[g.id] > 0 && openDirections(world, taken, g.hex) <= 2)
  const endangered = new Set(world.glyphlings.filter((g) => g.seat === seat && moves[g.id] > 0 && moves[g.id] <= 2).map((g) => g.id))
  const tangles: Action[] = []
  const rescues: Action[] = []
  if (!prey.length && !endangered.size) return { tangles, rescues }
  for (const a of actions) {
    if (a.type !== 'turn') continue
    const from = world.glyphlings.find((g) => g.id === a.glyphling)!.hex
    // Pretend the turn happened (on the one shared set, put back straight after).
    taken.delete(hexKey(from))
    taken.add(hexKey(a.to))
    if (a.target) taken.add(hexKey(a.target))
    if (prey.some((g) => movesFrom(world, taken, g.hex) === 0)) tangles.push(a)
    else if (endangered.has(a.glyphling) && movesFrom(world, taken, a.to) > moves[a.glyphling]) rescues.push(a)
    if (a.target) taken.delete(hexKey(a.target))
    taken.delete(hexKey(a.to))
    taken.add(hexKey(from))
  }
  return { tangles, rescues }
}

/** Up to `limit` legal moves: every tangle (at most half the limit) and rescue (at most a quarter), then a random
 *  sample of the rest. */
export function candidateMoves(world: GameState, seat: number, limit: number, rng: number): { actions: Action[]; rng: number } {
  const all = legalActions(world, seat)
  if (all.length <= limit) return { actions: all, rng }
  let pos = rng
  const { tangles, rescues } = mustKeep(world, seat, all)
  const t = sample(tangles, Math.floor(limit / 2), pos)
  pos = t.rng
  const r = sample(rescues, Math.floor(limit / 4), pos)
  pos = r.rng
  const kept = new Set<Action>([...t.items, ...r.items])
  const rest = sample(all.filter((a) => !kept.has(a)), limit - kept.size, pos)
  pos = rest.rng
  const chosen = new Set([...kept, ...rest.items])
  return { actions: all.filter((a) => chosen.has(a)), rng: pos } // (in legalActions' order)
}

/** A stable key for any move. */
export function actionKey(action: Action): string {
  if (action.type === 'draft') return `draft ${hexKey(action.hex)}`
  if (action.type === 'refresh') return `refresh ${[...action.setAside].sort().join(',')}`
  return turnKey(action as TurnAction)
}

/** A move in designer notation, e.g. "glyphling 1 → C4-3, cast E at C5-2". */
export function describeAction(action: Action, world: GameState): string {
  const board = getBoard(world.config.boardName)
  if (action.type === 'draft') return `placed a glyphling on ${board.label(action.hex)}`
  const hand = world.hands[world.current] ?? []
  const letter = (id: string) => hand.find((s) => s.id === id)?.letter ?? '?'
  if (action.type === 'refresh') return action.setAside.length ? `refresh: set aside ${action.setAside.map(letter).join(', ')}` : 'refresh: kept all'
  const move = `glyphling ${action.glyphling} → ${board.label(action.to)}`
  return action.seed && action.target ? `${move}, cast ${letter(action.seed)} at ${board.label(action.target)}` : `${move}, no cast`
}

/** Glyphtender's plug for this word list. `beliefNoise` = the skill's (how fuzzy its idea of rivals' Magic is). */
export function glyphtenderPlug(words: WordList, beliefNoise = 0.5): GlyphPlug {
  return {
    // Each goal's big-moment bar comes from content/ai/goals.json (Dev Kit / Obsidian).
    goals: [trapGoal(words), scoreGoal(words), denyGoal(words), escapeGoal(words), buildGoal(words), stealGoal(words), dumpGoal(words)].map((g) => ({
      ...g,
      bigAt: (goalsFile.bigAt as Record<string, number>)[g.id],
    })),
    readings: (view, seat) => readingsFor(view, seat, words, beliefNoise),
    imagine: imagineWorld,
    candidates: candidateMoves,
    key: actionKey,
    describe: describeAction,
    special: (ctx, rng) => specialDecision(ctx, rng, words),
  }
}

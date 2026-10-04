// SPECIAL DECISIONS — the ones Glyphtender's AI makes outside the goal roll (design .planning/design/ai.md):
//   Draft    where to place a glyphling: near the centre with room to move; pulled toward rivals by Aggression,
//            away by Caution; a gentle bot spreads its two glyphlings; random among the best 3 (like a person).
//   Refresh  after a turn that made no Magic: set aside the junk letters; how picky = Pragmatism.
//   Call it  the self-tangle gamble: when it BELIEVES it's ahead by its Nerve (personality extras.nerve, default 10
//            Magic; it waits for more when it's unsure of rivals' Magic) and a move would end the game, it ends it,
//            picking the ending that gives rivals the least tangle bonus. Beliefs are fuzzy, so sometimes it's wrong.
import { getBoard } from '../engine/boards'
import { hexKey, type Hex } from '../engine/hex'
import { legalActions } from '../engine/rules'
import { tangleBonus } from '../engine/tangle'
import type { Action, GameState, WordList } from '../engine/types'
import { randomBetween } from './kit/random'
import type { Special } from './kit/types'
import { beliefsOf, leastConfidence } from './evidence'
import { hexDistance, junkiness, mobilityNow, movesFrom, occupiedHexes, openDirections, outcomeOf, type TurnAction } from './look'
import type { GlyphContext } from './goals/shared'

const trait = (ctx: GlyphContext, name: string) => ctx.traits[name] ?? 50

// ── Draft ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const DRAFT_WEIGHTS = { perMove: 0.5, perHexFromCentre: 1, perHexFromRival: 1.5 }

/** How good a hex is to place a glyphling on, for this bot (higher = better). */
export function draftValue(world: GameState, seat: number, hex: Hex, aggression: number, caution: number): number {
  const board = getBoard(world.config.boardName)
  const centre = { q: board.cells.reduce((s, h) => s + h.q, 0) / board.cells.length, r: board.cells.reduce((s, h) => s + h.r, 0) / board.cells.length }
  const taken = occupiedHexes(world)
  const room = movesFrom(world, taken, hex)
  const rivals = world.glyphlings.filter((g) => g.seat !== seat)
  const nearestRival = rivals.length ? Math.min(...rivals.map((g) => hexDistance(g.hex, hex))) : 0
  const own = world.glyphlings.filter((g) => g.seat === seat)
  const spread = own.length && aggression < 50 ? Math.min(...own.map((g) => hexDistance(g.hex, hex))) * 0.5 : 0
  // (caution − aggression) / 50: −2…+2 → close in on rivals (aggressive) or keep away (cautious): up to 3 per hex.
  return DRAFT_WEIGHTS.perMove * room - DRAFT_WEIGHTS.perHexFromCentre * hexDistance(hex, centre) + DRAFT_WEIGHTS.perHexFromRival * ((caution - aggression) / 50) * nearestRival + spread
}

export function draftDecision(ctx: GlyphContext, rng: number): { special: Special<Action>; rng: number } {
  const options = legalActions(ctx.world, ctx.seat).filter((a): a is Extract<Action, { type: 'draft' }> => a.type === 'draft')
  const aggression = trait(ctx, 'aggression')
  const caution = trait(ctx, 'caution')
  const ranked = options.map((a) => ({ a, value: draftValue(ctx.world, ctx.seat, a.hex, aggression, caution) })).sort((x, y) => y.value - x.value)
  const pick = randomBetween(rng, 0, Math.min(3, ranked.length) - 1)
  const why = aggression > caution ? 'room to move, close to rivals' : 'room to move, away from rivals'
  return { special: { action: ranked[pick.value].a, goal: 'DRAFT', why }, rng: pick.rng }
}

// ── Refresh ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The seeds to set aside: each one whose junkiness reaches the bar. Pragmatism 100 → bar 1 (very picky),
 *  0 → bar 5 (only the worst). */
export function refreshPick(hand: readonly { id: string; letter: string }[], pragmatism: number): string[] {
  const bar = 5 - (4 * pragmatism) / 100
  const letters = hand.map((s) => s.letter)
  return hand.filter((s) => junkiness(s.letter, letters) >= bar).map((s) => s.id)
}

export function refreshDecision(ctx: GlyphContext): { special: Special<Action> } {
  const hand = ctx.world.hands[ctx.seat]
  const setAside = refreshPick(hand, trait(ctx, 'pragmatism'))
  const letters = setAside.map((id) => hand.find((s) => s.id === id)!.letter)
  return { special: { action: { type: 'refresh', setAside }, goal: 'REFRESH', why: letters.length ? `set aside junk ${letters.join(', ')}` : 'kept every seed' } }
}

// ── Call it ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Turns that would end the game right now (enough glyphlings tangled after the move + cast), each with the tangle
 *  bonus it would hand out and the Magic it makes. Only glyphlings that could be tangled are checked (already
 *  tangled, ≤ 2 directions open, or the one moving), so this stays quick. */
export function endingMoves(world: GameState, seat: number, words: WordList): { action: TurnAction; bonus: number[]; magic: number }[] {
  const moves = mobilityNow(world)
  const taken = occupiedHexes(world)
  const atRisk = world.glyphlings.filter((g) => moves[g.id] === 0 || openDirections(world, taken, g.hex) <= 2).map((g) => g.id)
  const need = world.config.rules.tanglesToEnd
  if (atRisk.length + 1 < need) return []
  const out: { action: TurnAction; bonus: number[]; magic: number }[] = []
  for (const a of legalActions(world, seat)) {
    if (a.type !== 'turn') continue
    // The board after: the glyphling moves, the seed lands.
    taken.delete(hexKey(world.glyphlings.find((g) => g.id === a.glyphling)!.hex))
    taken.add(hexKey(a.to))
    if (a.target) taken.add(hexKey(a.target))
    const hexOf = (id: number) => (id === a.glyphling ? a.to : world.glyphlings.find((g) => g.id === id)!.hex)
    const check = [...new Set([...atRisk, a.glyphling])]
    const tangled = check.filter((id) => movesFrom(world, taken, hexOf(id)) === 0)
    if (a.target) taken.delete(hexKey(a.target))
    taken.delete(hexKey(a.to))
    taken.add(hexKey(world.glyphlings.find((g) => g.id === a.glyphling)!.hex))
    if (tangled.length < need) continue
    const result = outcomeOf(world, a, words)
    out.push({ action: a, bonus: tangleBonus(result.after, tangled), magic: result.magic })
  }
  return out
}

export const DEFAULT_NERVE = 10

export function callItDecision(ctx: GlyphContext, words: WordList): { special: Special<Action> } | null {
  const nerve = ctx.personality.extras?.nerve ?? DEFAULT_NERVE
  const beliefs = beliefsOf(ctx.view, ctx.seat, words, ctx.skill.beliefNoise)
  const needed = nerve / leastConfidence(beliefs.rivals) // less sure → it waits for a bigger lead
  if (beliefs.lead < needed - 10) return null // (no ending could make up the gap: skip the search)
  const endings = endingMoves(ctx.world, ctx.seat, words)
  if (!endings.length) return null
  const rivalsGet = (bonus: number[]) => Math.max(0, ...bonus.filter((_, s) => s !== ctx.seat))
  const net = (e: (typeof endings)[number]) => e.bonus[ctx.seat] + e.magic - rivalsGet(e.bonus)
  const best = endings.reduce((a, b) => (net(b) > net(a) || (net(b) === net(a) && rivalsGet(b.bonus) < rivalsGet(a.bonus)) ? b : a))
  const finalLead = beliefs.lead + net(best)
  if (finalLead < needed) return null
  return { special: { action: best.action, goal: 'CALL IT', why: `believes it's ahead by ${Math.round(finalLead)} (nerve ${Math.round(needed)}); rivals get ${rivalsGet(best.bonus)} tangle bonus` } }
}

// ── All of them ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The plug's special(): draft and refresh are always decided here; a play turn only when it calls it. */
export function specialDecision(ctx: GlyphContext, rng: number, words: WordList): { special: Special<Action> | null; rng: number } {
  if (ctx.world.phase === 'draft') return draftDecision(ctx, rng)
  if (ctx.world.phase === 'refresh') return { ...refreshDecision(ctx), rng }
  if (ctx.world.phase === 'play') return { special: callItDecision(ctx, words)?.special ?? null, rng }
  return { special: null, rng }
}

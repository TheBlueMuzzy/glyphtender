// THE NUDGES (F78, design/tutorial.md §4) — "here's what you can do". The plain rules; the layer that shows them is
// helpLayer.tsx. Pure, so they're tested without a screen (nudges.test.ts).
//   IDLE: what you should be doing right now (idleKind) → after a while of nothing, that thing glows (the tutorial
//   game only), then a callout says it. Each kind ≤ idleRepeat times a game (the kit's useNudge counts).
//   WRONG: a refused tap (the "no" shake — store.nope) or a refused drop (store/wrongDrop.ts) or a tap on a Plant
//   button with nothing planned → a callout at once saying what you CAN do. Each kind ≤ wrongRepeat times a game
//   (on the tutorial's rails every time — TutorialLayer shows the step's own callout again instead).
// Words: en.json → tutorial.nudges.idle / .wrong.
import text from '../../content/text/en.json'
import type { GameState } from '../engine/types'
import { colourOf } from '../game/art'
import type { NopeTarget } from '../store/nope'
import { mayMoveOnly, type PlannedCast, type PlannedMove } from '../store/turnPlan'
import type { WrongDropKind } from '../store/wrongDrop'
import { movableGlyphlings } from '../engine/rules'

const words = text.tutorial.nudges

// ─── Idle ───
export type IdleKind = keyof typeof words.idle

/** What you should be doing now: place a glyphling (the draft) · move one · plant a seed · tap Plant (a seed is
 *  aimed) · tap End turn (moved, and no seed fits) · choose what to refresh. null = nothing (the game is over). */
export function idleKind(game: GameState, move: PlannedMove | null, cast: PlannedCast | null): IdleKind | null {
  if (game.phase === 'draft') return 'draft'
  if (game.phase === 'refresh') return 'refresh'
  if (game.phase !== 'play') return null
  if (!move) return 'move'
  if (cast) return 'commit'
  return mayMoveOnly(game, move) ? 'endTurn' : 'plant'
}

/** What the idle callout points at. */
export function idleTarget(kind: IdleKind, game: GameState): string {
  if (kind === 'draft') return '[data-draft="next"]'
  if (kind === 'move') {
    const first = movableGlyphlings(game, game.current)[0]
    return first === undefined ? '.game-tray' : `[data-glyph="${first}"]`
  }
  if (kind === 'plant') return '.game-tray'
  if (kind === 'refresh') return '[data-action="refresh"]'
  return '[data-action="plant"]' // commit · endTurn
}

/** What glows before the words (the whose-turn pulse's breath). 'move': nothing more — your glyphlings already
 *  breathe until you move (store/turnPulse.ts). */
export function idleGlowTargets(kind: IdleKind): string[] {
  if (kind === 'draft') return ['[data-draft="next"]']
  if (kind === 'plant') return ['.game-tray [data-hand]']
  if (kind === 'refresh') return ['[data-action="refresh"]', '[data-action="keep-all"]']
  if (kind === 'move') return []
  return ['[data-action="plant"]']
}

export const idleWords = (kind: IdleKind) => words.idle[kind]

// ─── Wrong action ───
export type WrongKind = keyof typeof words.wrong

/** A wrong action, with what its callout points at. */
export interface Wrong {
  kind: WrongKind
  target: string
  /** The rival's seat (kind 'rival'). */
  seat?: number
}

/** The "no" shake → what you did wrong: a tray seed before the move · a rival's glyphling. (Anything else that shakes
 *  — a tangled glyphling, a planted seed — already says why in the prompt: no nudge.) */
export function wrongFromNope(nope: NopeTarget, game: GameState, move: PlannedMove | null): Wrong | null {
  if (nope.kind === 'hand') return game.phase === 'play' && !move ? { kind: 'seedFirst', target: `[data-hand="${nope.key}"]` } : null
  if (nope.kind === 'glyph') {
    const g = game.glyphlings.find((x) => String(x.id) === nope.key)
    return g && g.seat !== game.current ? { kind: 'rival', target: `[data-glyph="${g.id}"]`, seat: g.seat } : null
  }
  return null
}

/** A held piece let go on a hex it can't go to (store/wrongDrop.ts). */
export function wrongFromDrop(kind: WrongDropKind, piece: string): Wrong {
  return kind === 'glyphlingHex' ? { kind, target: `[data-glyph="${piece}"]` } : { kind, target: `[data-hand="${piece}"]` }
}

/** A tap on the Plant button while it can't be used: before the move, or moved with nothing aimed (and a seed would
 *  fit — else the button is End turn and works). null = not a wrong action (it's busy, or it isn't the play phase). */
export function wrongFromPlantTap(game: GameState, move: PlannedMove | null, cast: PlannedCast | null): Wrong | null {
  if (game.phase !== 'play' || cast) return null
  if (!move) return { kind: 'seedFirst', target: '[data-action="plant"]' }
  return mayMoveOnly(game, move) ? null : { kind: 'plantNothing', target: '[data-action="plant"]' }
}

/** Its words: {player} = the rival's colour name (Blue), {colour} = yours, small (yellow). */
export function wrongWords(wrong: Wrong, game: GameState): string {
  const values: Record<string, string> = {
    player: wrong.seat === undefined ? '' : text.game.players[colourOf(wrong.seat)],
    colour: text.game.players[colourOf(game.current)].toLowerCase(),
  }
  return words.wrong[wrong.kind].replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all)
}

/** May this kind of wrong-action callout show (≤ repeat a game)? Counts it when it may. */
export function takeWrong(counts: Map<string, number>, kind: WrongKind, repeat: number): boolean {
  const used = counts.get(kind) ?? 0
  if (used >= repeat) return false
  counts.set(kind, used + 1)
  return true
}

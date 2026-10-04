// Planning a turn on screen before it's cast — plain functions the game store uses (and tests check).
// Nothing here changes the game: the planned move and cast only become real when Cast sends the action.
import { legalCasts } from '../engine/engine'
import { sameHex, type Hex } from '../engine/hex'
import type { Action, GameState, SeedPiece } from '../engine/types'
import { mayMoveOnly as rulesMayMoveOnly } from '../engine/rules'
import { isMyTurn } from './myTurn'
import type { Seat } from './seats'
import { undoStep, type TurnSteps } from '../table/flow'
import { boardTargets, NEW_GLYPHLING, onHex, refereeFor, type Piece } from './referee'

/** A glyphling moved on screen but not cast yet. */
export interface PlannedMove {
  glyphling: number
  to: Hex
}

/** A seed aimed at a hex but not thrown yet. `seed` is its id (F33). */
export interface PlannedCast {
  seed: string
  target: Hex
}

/** The piece being held: a glyphling on the board or a seed in the tray (by its id). */
export type Selection = { kind: 'glyphling'; id: number } | { kind: 'seed'; id: string } | null

/** Which hexes to light up, and how (the same filled template: move = the player's colour, cast = a lighter shade). */
export interface Highlight {
  hexes: Hex[]
  kind: 'move' | 'cast'
}

/** A step of one turn. */
export type TurnStep = 'move' | 'cast'

/** The steps of a turn, in order (the Table's TurnSteps): move, then cast. Cast sends them as one action. */
export const TURN_STEPS: TurnSteps<TurnStep> = ['move', 'cast']

/** The steps planned so far this turn, in order (e.g. ['move'] once the glyphling has moved). */
export const stepsDone = (move: PlannedMove | null, cast: PlannedCast | null): TurnStep[] =>
  TURN_STEPS.filter((step) => (step === 'move' ? move !== null : cast !== null))

/** What Undo takes back now: the cast, then the move — null at the turn's start (never the turn before: it's played).
 *  The store's undo and the Undo button both ask this. */
export const undoNow = (move: PlannedMove | null, cast: PlannedCast | null): TurnStep | null =>
  undoStep(stepsDone(move, cast))

/** Does this glyphling belong to the player whose turn it is? */
export const isCurrents = (game: GameState, id: number) =>
  game.glyphlings.some((g) => g.id === id && g.seat === game.current)

/** Every hex the planned glyphling could cast from where it now stands. */
export const castOptions = (game: GameState, move: PlannedMove | null): Hex[] =>
  move ? legalCasts(game, move.glyphling, move.to) : []

/** May the planned move end the turn without a cast? The rules answer (empty hand, or nowhere to cast). */
export function mayMoveOnly(game: GameState, move: PlannedMove | null): boolean {
  return move !== null && rulesMayMoveOnly(game, move.glyphling, move.to)
}

/**
 * The piece the glow is about. Draft: a glyphling waiting to be placed. Holding a glyphling: that one. Otherwise,
 * once a move is planned: a seed to cast from there — straight away, before a seed is picked, and still while a seed
 * is held or aimed (GDD §4 feel notes: "cast ranges show right after the move"). An empty hand has nothing to cast.
 */
export function heldPiece(game: GameState, move: PlannedMove | null, selected: Selection): Piece | null {
  if (game.phase === 'draft') return NEW_GLYPHLING
  if (game.phase !== 'play') return null
  if (selected?.kind === 'glyphling') return selected
  const hand = game.hands[game.current]
  if (!move || hand.length === 0) return null
  return selected?.kind === 'seed' ? selected : { kind: 'seed', id: hand[0].id } // (any seed: they all fly the same)
}

/** A move glow for glyphlings, a cast glow (the lighter shade) for seeds. */
const kindOf = (piece: Piece): Highlight['kind'] => (piece.kind === 'seed' ? 'cast' : 'move')

/**
 * The glowing hexes right now: every hex of the board the referee says the held piece may go to (referee.ts) —
 * `mayAct` = may the current seat act at all (left out: yes, the rules alone decide).
 */
export function highlightFor(game: GameState, move: PlannedMove | null, selected: Selection, mayAct: (seat: number) => boolean = () => true): Highlight | null {
  const piece = heldPiece(game, move, selected)
  if (!piece) return null
  const lit = refereeFor({ game, move }, mayAct).targetsFor(game.current, piece, boardTargets(game))
  return { hexes: lit.flatMap((t) => (t.kind === 'hex' ? [t.hex] : [])), kind: kindOf(piece) }
}

/**
 * What the board lights up on THIS device: nothing while a seed flies; in play, only the plan of a player on this
 * device that can still change — online, another player's turn is replayed with its move in the store (the glide),
 * and that move is not something to cast from here (no gold for them); nor is my own once it's gone to the server.
 * In the draft everyone sees where the next glyphling may go. (The glow's own "may act" — TDD D63.)
 */
type LitState = { game: GameState; move: PlannedMove | null; selected: Selection; flying: boolean; waiting: boolean; seats: Seat[] }

export function boardHighlight(s: LitState): Highlight | null {
  const glowNow = !s.flying && (s.game.phase !== 'play' || (!s.waiting && isMyTurn(s)))
  return glowNow ? highlightFor(s.game, s.move, s.selected) : null
}

/**
 * While dragging: if `hex` (under the lifted piece) is a legal drop — the referee says yes — which option it is, else
 * null (no highlight). Only on this device's own turn (online, my waiting glyphling can be dragged in the draft while
 * someone else places), never while my action is at the server or a seed flies.
 */
export function dropKind(s: LitState, hex: Hex | undefined): Highlight['kind'] | null {
  const piece = heldPiece(s.game, s.move, s.selected)
  if (!hex || !piece) return null
  const mayAct = () => !s.flying && !s.waiting && isMyTurn(s)
  return refereeFor(s, mayAct).judge(s.game.current, piece, onHex(hex)).ok ? kindOf(piece) : null
}

/** The engine action for the planned turn (a move-only turn has no seed). */
export function turnAction(move: PlannedMove, cast: PlannedCast | null): Action {
  return {
    type: 'turn',
    glyphling: move.glyphling,
    to: move.to,
    seed: cast ? cast.seed : null,
    target: cast ? cast.target : null,
  }
}

/** Is `hex` in `list`? */
export const hexIn = (list: Hex[], hex: Hex) => list.some((h) => sameHex(h, hex))

/**
 * An empty place in a tray order: a seed was cast or set aside and nothing new has come for it yet. The tray never
 * closes up round it (Muzzy 2026-10-01: "don't resort. it's confusing/jarring") — Table rack.ts refillRack fills it.
 * The tray order maths (move, shuffle, refill) is the framework Table's rack (src/table/rack.ts); this is its GAP.
 */
export { GAP as TRAY_GAP } from '../table/rack'

/** The letter of the seed with this id in a hand, or undefined if it isn't there. */
export const letterIn = (hand: readonly SeedPiece[], id: string) => hand.find((seed) => seed.id === id)?.letter

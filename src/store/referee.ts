// THE DRAG REFEREE — the game's ONE answer to "may this piece go there, now?" (the framework Table's referee, F34).
// The board's glow, the "drop here" light, the "no" shake, picking a piece up and the drop itself all ask it, so they
// can never disagree. It asks, in order (src/table/referee.ts):
//   1. may this seat act now?  — myTurn.ts: it's the turn of a seat on this device, and nothing is playing out
//   2. may this kind of piece go in this kind of place?  — glyphlings go on hexes; seeds go on hexes or tray places
//   3. do the rules allow it right now?  — the live rules: where a glyphling may be placed (the draft) or move, where
//      the planned move can cast from, and the turn's steps in order: a seed only after the move — even just to
//      reorder it in the tray (Muzzy, B008). While choosing seeds to refresh, the tray can be reordered too.
// A few places keep their own "may act now" on purpose (TDD D63) — they pass their own gate to refereeFor.
import { getBoard } from '../engine/boards'
import { legalCasts, legalMoves } from '../engine/engine'
import { hexKey, type Hex } from '../engine/hex'
import { checkFor } from '../engine/rules'
import type { GameState } from '../engine/types'
import { makeReferee, type Referee } from '../table/referee'
import type { GameStore } from './gameStore'
import { canPlayNow } from './myTurn'
import type { PlannedMove } from './turnPlan'

/** What can be picked up: a glyphling on the board, one still waiting to be placed (the draft), or a seed (by its id). */
export type Piece = { kind: 'glyphling'; id: number } | { kind: 'newGlyphling' } | { kind: 'seed'; id: string }

/** Where it can go: a hex on the board, or a place in the tray (its position). */
export type Target = { kind: 'hex'; hex: Hex } | { kind: 'tray'; pos: number }

export const NEW_GLYPHLING: Piece = { kind: 'newGlyphling' }
export const onHex = (hex: Hex): Target => ({ kind: 'hex', hex })

/** Every hex of the board, as targets — what a lifted piece could be aimed at. */
export const boardTargets = (game: GameState): Target[] => getBoard(game.config.boardName).cells.map(onHex)

/** Every place in `seat`'s tray, as targets. */
export const trayTargets = (game: GameState, seat: number): Target[] => game.hands[seat].map((_, pos) => ({ kind: 'tray', pos }))

/** Everywhere a piece could be aimed: the board, and (for a seed) the tray. */
export const targetsOf = (game: GameState, piece: Piece): Target[] =>
  piece.kind === 'seed' ? [...boardTargets(game), ...trayTargets(game, game.current)] : boardTargets(game)

type RefereeState = Pick<GameStore, 'game' | 'move' | 'seats' | 'flying' | 'waiting' | 'handoff'> & Partial<Pick<GameStore, 'refreshFx' | 'scoring'>>

/** The referee for playing: a seat may act when it's its turn on this device and nothing is playing out (canPlayNow). */
export const playReferee = (s: RefereeState): Referee<Piece, Target> =>
  refereeFor(s, (seat) => seat === s.game?.current && canPlayNow(s))

/** A referee for this moment of the game. `mayAct` = may this seat act at all right now. */
export function refereeFor(s: { game: GameState | null; move: PlannedMove | null }, mayAct: (seat: number) => boolean): Referee<Piece, Target> {
  const { game, move } = s
  // The live rules' lists, worked out once per referee (the glow asks about every hex of the board)
  const lists = new Map<string, Set<string>>()
  const listed = (name: string, make: () => Hex[]) => {
    if (!lists.has(name)) lists.set(name, new Set(make().map(hexKey)))
    return lists.get(name)!
  }

  return makeReferee<Piece, Target>({
    mayAct,
    // Glyphlings go on the board; seeds on the board or into the tray
    accepts: (piece, target) => target.kind === 'hex' || piece.kind === 'seed',
    check: (seat, piece, target) => {
      if (!game) return 'There is no game'
      // (placing one is a whole action: the same check the server makes)
      if (piece.kind === 'newGlyphling') return target.kind === 'hex' ? checkFor(game, seat, { type: 'draft', hex: target.hex }) : "That can't go there"
      if (piece.kind === 'glyphling') {
        if (game.phase !== 'play') return 'It is not time to move'
        if (game.glyphlings.find((g) => g.id === piece.id)?.seat !== seat) return 'That glyphling belongs to another player'
        const moves = listed(`move ${piece.id}`, () => legalMoves(game, piece.id))
        return target.kind === 'hex' && moves.has(hexKey(target.hex)) ? null : 'A glyphling moves in a straight line and cannot pass through or land on anything'
      }
      // A seed
      if (!game.hands[seat]?.some((seed) => seed.id === piece.id)) return 'That seed is not in your hand'
      if (target.kind === 'tray' && game.phase === 'refresh') return null // reorder while choosing what to refresh
      if (game.phase !== 'play') return 'It is not time to cast'
      if (!move) return 'Move a glyphling first' // the turn's steps: move, then cast (B008: not even a reorder before it)
      if (target.kind === 'tray') return null
      const casts = listed('cast', () => legalCasts(game, move.glyphling, move.to))
      return casts.has(hexKey(target.hex)) ? null : "A seed flies in a straight line onto an empty hex, over your own pieces but not other players'"
    },
  })
}

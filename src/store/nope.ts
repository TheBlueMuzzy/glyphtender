// THE "NO" SHAKE — tapping (or trying to drag) something you can't move gives it a quick sideways shake
// (GDD §4 feel notes). This decides WHICH taps are refused; the screen shakes the piece (useNopeShake.ts).
// Refused = whatever the drag referee won't let you pick up (referee.ts): another player's glyphling (incl. their draft one) · a tangled one
// (no moves) · any glyphling outside your move step (the draft, a refresh) · a seed already planted on the board · a
// tray seed before you've moved (tapped OR dragged — before the move seeds can't be dragged at all, not even to
// reorder the tray: Muzzy, B008) · anything of yours while it isn't your turn (online). Quiet moments shake nothing:
// a seed in the air, the device being passed on, my move on its way to the server, a refresh playing out on the tray,
// a cast's score playing out, and the finished game (you're just looking).
import { hexKey, type Hex } from '../engine/hex'
import type { GameStore } from './gameStore'
import { isBusy } from './myTurn'
import { NEW_GLYPHLING, playReferee, targetsOf, type Piece } from './referee'

/** What was tapped (or picked up to drag): a board glyphling (id), a tray seed (its id), the draft's next glyphling
 *  in the tray, or a board hex. */
export type Tap = { glyph: number } | { hand: string } | { draft: true } | { hex: Hex }

/** The piece to shake: a glyphling (id), a planted seed (hexKey), a tray seed (its id) or the draft's next glyphling. */
export type NopeTarget = { kind: 'glyph' | 'seed' | 'hand' | 'draft'; key: string }

type NopeState = Pick<GameStore, 'game' | 'move' | 'flying' | 'waiting' | 'handoff' | 'seats'> & Partial<Pick<GameStore, 'refreshFx' | 'scoring'>>

export function nopeFor(s: NopeState, tap: Tap): NopeTarget | null {
  const game = s.game
  if (!game || game.phase === 'over' || isBusy(s)) return null
  // Refused = the referee won't let the seat whose turn it is pick it up now: nowhere it may go
  const refused = (piece: Piece) => !playReferee(s).mayPickUp(game.current, piece, targetsOf(game, piece)).ok
  if ('glyph' in tap) {
    const g = game.glyphlings.find((x) => x.id === tap.glyph)
    if (!g) return null
    return refused({ kind: 'glyphling', id: g.id }) ? { kind: 'glyph', key: String(g.id) } : null
  }
  // The draft's next glyphling in the tray: only the seat placing it may lift it — online, not someone else's
  // (Muzzy 2026-10-08: he could drag the other player's draft glyphling at the right moment)
  if ('draft' in tap) return refused(NEW_GLYPHLING) ? { kind: 'draft', key: 'next' } : null
  if ('hand' in tap) {
    if (game.phase === 'draft') return null // the draft tray holds glyphlings to place, not seeds
    return refused({ kind: 'seed', id: tap.hand }) ? { kind: 'hand', key: tap.hand } : null
  }
  const key = hexKey(tap.hex)
  const planted = game.seeds[key]
  // A planted seed stays put: it's in nobody's hand, so the referee never lets it go anywhere (the aimed one isn't planted yet)
  return planted && refused({ kind: 'seed', id: planted.id }) ? { kind: 'seed', key } : null
}

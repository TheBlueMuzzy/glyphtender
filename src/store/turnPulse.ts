// WHOSE TURN — the glyphlings that pulse gently (GDD §4 feel notes): the current player's glyphlings that can
// move, from the start of their turn until a move is planned. Only when that player is on THIS device (online:
// only on your own turn), never in the draft or a refresh, never while a seed flies, the device is being passed
// on, my move is at the server or a turn is being played out online (its trail is up). A tangled glyphling (no moves) and the one being held don't pulse.
import { movableGlyphlings } from '../engine/rules'
import type { GameStore } from './gameStore'
import { isMyTurn } from './myTurn'

type PulseState = Pick<GameStore, 'game' | 'move' | 'selected' | 'flying' | 'waiting' | 'handoff' | 'seats'> & Partial<Pick<GameStore, 'trail'>>

export function pulsingGlyphlings(s: PulseState): number[] {
  const game = s.game
  if (!game || game.phase !== 'play' || s.move || s.flying || s.waiting || s.handoff || s.trail) return []
  if (!isMyTurn(s)) return []
  const held = s.selected?.kind === 'glyphling' ? s.selected.id : null
  return movableGlyphlings(game, game.current).filter((id) => id !== held) // (the rules: theirs, and not tangled)
}

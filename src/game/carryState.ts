// WHAT IS BEING CARRIED RIGHT NOW (a drag) — so the tray and the board can draw the piece's home the way the drag
// type's carry style says (content/tuning/drag.json; ui-kit drag/carry.ts): solid as usual, a faint ghost, or empty.
// This is NOT "held" (store.selected): a tapped piece is held too, and stays solid with its ring. Carried = in the hand.
// Set when a drag lifts a piece and cleared when its drop (landing or return) has played — twice per drag, never per
// pointer move. Online, a committed drop waits for the server's answer before the home goes back to normal, so the
// piece never flashes back into the tray in between.
import { create } from 'zustand'
import { useGameStore } from '../store/gameStore'

export type Carried = {
  /** What is carried: a tray seed (its id), a board glyphling (its id) or the draft's next glyphling. */
  piece: { kind: 'seed'; id: string } | { kind: 'glyphling'; id: number } | { kind: 'draft' }
  /** What its home shows meanwhile: undefined = itself, as usual (ui-kit originWhileCarried). */
  origin: 'ghost' | 'empty' | undefined
  /** How see-through a ghost at home is (drag.json ghostOpacity, read when the drag started). */
  ghostOpacity: number
}

export const useCarried = create<{ carried: Carried | null }>(() => ({ carried: null }))

export const setCarried = (carried: Carried | null) => useCarried.setState({ carried })

/** Only its home's look changes (e.g. style C's real piece flies out of its home on a drop: the home goes empty). */
export const setOriginLook = (origin: Carried['origin']) => {
  const carried = useCarried.getState().carried
  if (carried) useCarried.setState({ carried: { ...carried, origin } })
}

/** The drop has played out: the home looks normal again — online, once the server has answered. */
export function endCarry() {
  if (!useGameStore.getState().waiting) return setCarried(null)
  const mine = useCarried.getState().carried
  const stop = useGameStore.subscribe((s) => {
    if (s.waiting) return
    stop()
    if (useCarried.getState().carried === mine) setCarried(null) // (unless a new drag has started since)
  })
}

/** Is this tray seed / board glyphling / the draft's next glyphling the carried piece? Its home look, or undefined. */
export const originOf = (carried: Carried | null, piece: Carried['piece']) => {
  if (!carried || carried.piece.kind !== piece.kind) return undefined
  if ('id' in carried.piece && 'id' in piece && carried.piece.id !== piece.id) return undefined
  return carried
}

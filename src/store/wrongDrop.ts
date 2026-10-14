// A WRONG DROP (F78, design/tutorial.md §4) — a held or dragged piece let go on a hex it may not go to (the referee
// said no, so it went back home). The store's tapHex records it here; the tutorial's nudges (src/tutorial/nudges*)
// read it to say what you CAN do. Its own tiny store (no imports) so the store never imports the tutorial.
// (A tap on something that can't be picked up at all is the "no" shake — store.nope, nope.ts — not this.)
import { create } from 'zustand'

export type WrongDropKind = 'glyphlingHex' | 'seedHex'

interface WrongDrop {
  /** The last wrong drop; the count changes every time, so the same kind can be noticed again. */
  last: { kind: WrongDropKind; piece: string; count: number } | null
}

export const useWrongDrop = create<WrongDrop>()(() => ({ last: null }))

/** `piece`: the glyphling's id (as text) or the seed's id. */
export function recordWrongDrop(kind: WrongDropKind, piece: string) {
  useWrongDrop.setState((s) => ({ last: { kind, piece, count: (s.last?.count ?? 0) + 1 } }))
}

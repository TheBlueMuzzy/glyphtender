// THE RAILS LIMIT (F76, design/tutorial.md §2) — while the tutorial game's scripted opening runs, ONE thing may be
// done at a time: one piece onto one hex (or, at the refresh, only the named seeds set aside). The tutorial's director
// (src/tutorial/railsDirector.ts) sets it for each step; the drag referee (referee.ts) asks it first, so the board's
// glow, the "drop here" light, the "no" shake, lifting and the drop itself all follow it — the glow shows only the live
// target. The Refresh / Keep all buttons and the store's refresh follow it too.
// The HOLD: a rails pause (a "Next" / "Got it" callout) is up — nobody may act (canPlayNow is false) and the AIs on
// this device don't start (localBot.ts) until it's released.
// Off the rails both are off (null / false) and nothing in the game changes. (Nothing here imports src/tutorial/.)
import { create } from 'zustand'
import { hexKey, type Hex } from '../engine/hex'
import type { Piece, Target } from './referee'

export interface RailsLimit {
  /** The one piece that may be picked up now (null = none). */
  piece: Piece | null
  /** …and the one hex it may go to. */
  to: Hex | null
  /** The refresh step: the only seeds (ids) that may be set aside — Refresh only once they all are, never Keep all. */
  setAside?: string[]
  /** Why anything else is refused (the step's own callout words). */
  reason: string
}

interface Rails {
  limit: RailsLimit | null
  hold: boolean
}

export const useRails = create<Rails>()(() => ({ limit: null, hold: false }))

export const railsLimit = () => useRails.getState().limit
export const railsHold = () => useRails.getState().hold

const sameLimit = (a: RailsLimit | null, b: RailsLimit | null) => JSON.stringify(a) === JSON.stringify(b)

/** Set the rails' limit and hold (the director, each step). Only a real change reaches the screen. */
export function setRails(limit: RailsLimit | null, hold: boolean) {
  const now = useRails.getState()
  if (sameLimit(now.limit, limit) && now.hold === hold) return
  useRails.setState({ limit: sameLimit(now.limit, limit) ? now.limit : limit, hold })
}

const samePiece = (a: Piece, b: Piece) =>
  a.kind === b.kind && (a.kind === 'newGlyphling' || (a as { id: unknown }).id === (b as { id: unknown }).id)

/** Does the limit refuse this piece going there? Its reason, or null (allowed — or no rails). */
export function railsRefuses(piece: Piece, target: Target, limit: RailsLimit | null = railsLimit()): string | null {
  if (!limit) return null
  if (piece.kind === 'seed' && target.kind === 'tray' && limit.setAside?.includes(piece.id)) return null // (reorder one you may set aside)
  if (limit.piece && limit.to && samePiece(limit.piece, piece) && target.kind === 'hex' && hexKey(target.hex) === hexKey(limit.to)) return null
  return limit.reason
}

/** May this seed be set aside (or put back) now? */
export function railsAllowsSetAside(id: string, limit: RailsLimit | null = railsLimit()): boolean {
  return !limit || (limit.setAside?.includes(id) ?? false)
}

/** May the refresh go now — Keep all (`keepAll`), or Refresh with these seeds set aside? On the rails: only Refresh,
 *  once exactly the named seeds are set aside. */
export function railsAllowsRefresh(keepAll: boolean, setAside: string[], limit: RailsLimit | null = railsLimit()): boolean {
  if (!limit) return true
  const wanted = limit.setAside ?? []
  return !keepAll && wanted.length > 0 && wanted.length === setAside.length && wanted.every((id) => setAside.includes(id))
}

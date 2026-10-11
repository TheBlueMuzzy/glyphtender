// "DROP HERE" — while a piece is dragged, the legal hex under it lights up brighter than the other options
// (the zone reacts, not the piece). Board.tsx draws one hidden mark per option kind ([data-drop-target="move"]
// and [data-drop-target="cast"], in the player's colour) at the board's origin; this moves the right one onto the hex and shows it.
// Plain DOM attributes, set on each pointer move — no React state per frame.
// With the "ghost preview" target look (drag.json targets) the glow is fainter (drag.json ghostGlow): the see-through
// copy of the piece on the hex is the main "here", the glow ring round it just marks the hex.
// THE TRAY (F64): while a seed is dragged onto another seed in the tray, `trayAim` says where it will slide in (the gap
// moveInRack will put it in) and how the tray shows it — an insertion marker or the seeds making room (SeedTray.tsx,
// ui-kit HandView) — or, swapping, which two places swap. It changes only when that changes, never per pointer move.
import { create } from 'zustand'
import { hexToPixel, type Hex } from '../engine/hex'
import { HEX } from './useThrow'

/** Show the mark of `kind` on `hex` (at `strength`: 1 = the full glow), or hide every mark (kind null). */
export function showDropTarget(hex: Hex | undefined, kind: 'move' | 'cast' | null, strength = 1) {
  for (const mark of document.querySelectorAll('[data-drop-target]')) {
    const on = kind !== null && hex !== undefined && mark.getAttribute('data-drop-target') === kind
    mark.setAttribute('visibility', on ? 'visible' : 'hidden')
    if (on) {
      const { x, y } = hexToPixel(hex, HEX)
      mark.setAttribute('transform', `translate(${x} ${y})`)
      mark.setAttribute('opacity', String(strength))
      mark.setAttribute('data-drop-hex', `${hex.q},${hex.r}`) // for the e2e check
    }
  }
}

/** Where a seed dragged in the tray will go: a gap (0 = before the first place, n = after place n-1) and its look. */
export type TrayAim =
  | { gap: number; look: 'marker' | 'room' }
  /** Swap places (Muzzy 2026-10-10): the place under the seed glows; the seed there shows, faint, at the dragged
   *  seed's home — where it will go. A drop swaps the two (Table rack.ts swapInRack). */
  | { look: 'swap'; from: number; to: number }

export const useTrayAim = create<{ aim: TrayAim | null }>(() => ({ aim: null }))

/** Set (or clear) the tray's aim — only when it changed. */
export function setTrayAim(aim: TrayAim | null) {
  const old = useTrayAim.getState().aim
  if (JSON.stringify(old) === JSON.stringify(aim)) return
  useTrayAim.setState({ aim })
}

/** The gap a seed dropped from place `from` onto the seed at place `to` slides into — Table rack.ts moveInRack takes it
 *  out and puts it in at `to`, so dragged rightwards it lands just right of that seed, leftwards just left of it. */
export const insertGap = (from: number, to: number) => (to > from ? to + 1 : to)

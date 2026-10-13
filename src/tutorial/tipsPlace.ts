// WHERE A TUTORIAL CALLOUT GOES FIRST (the rails, the tips, the nudges — one rule, so they all sit the same way).
// A board target: away from the live hex (the one glowing, when it isn't the target itself), else toward the nearer
// of the top bar and the tray (above a target in the board's top half, below one in its bottom half) — so it covers
// as few board rows as it can. Anything else (the tray, the buttons, the reveal): above it, in the prompt's place
// (the prompt hides while a callout is up — useTutorial.calloutUp). The kit's Callout flips it if it doesn't fit.
import { hexKey, type Hex } from '../engine/hex'
import type { CalloutPlacement } from '../ui/kit'

export function calloutPlacement(selector: string, live: Hex | null = null): CalloutPlacement {
  const el = document.querySelector(selector)
  const board = el?.closest('.game-garden')
  if (!el || !board) return 'top'
  const middle = (box: DOMRect) => (box.top + box.bottom) / 2
  const r = el.getBoundingClientRect()
  const liveEl = live && document.querySelector(`.game-garden > polygon[data-hex="${hexKey(live)}"]`)
  if (liveEl && !el.matches(`[data-hex="${hexKey(live)}"]`)) {
    const gap = middle(liveEl.getBoundingClientRect()) - middle(r)
    if (Math.abs(gap) > 1) return gap < 0 ? 'bottom' : 'top'
  }
  return middle(r) < middle(board.getBoundingClientRect()) ? 'top' : 'bottom'
}

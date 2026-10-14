// WHERE A TUTORIAL CALLOUT GOES FIRST (the rails, the tips, the nudges — one rule, so they all sit the same way).
// A board target: away from the live hex (the one glowing, when it isn't the target itself), else toward the nearer
// of the top bar and the tray (above a target in the board's top half, below one in its bottom half — but below when
// there's less than tutorial.json calloutRoom px above it before the turn bar) — so it covers
// as few board rows as it can. Anything else (the tray, the buttons, the reveal): above it, in the prompt's place
// (the prompt hides while a callout is up — useTutorial.calloutUp). The kit's Callout flips it if it doesn't fit.
import { hexKey, type Hex } from '../engine/hex'
import type { CalloutPlacement } from '../ui/kit'
import tutorial from '../../content/tuning/tutorial.json'

/** Room above `r` before the turn bar (when the bar is above it — phones, tall windows), in px. */
function roomAbove(r: DOMRect): number {
  const bar = document.querySelector('.game-turn-bar')?.getBoundingClientRect()
  const reach = tutorial.calloutRoom * 1.5 // (a callout is about this wide either side of its target)
  const barAbove = bar && bar.bottom <= r.top && bar.left < r.right + reach && bar.right > r.left - reach
  return r.top - (barAbove ? bar.bottom : 0)
}

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
  const toward = middle(r) < middle(board.getBoundingClientRect()) ? 'top' : 'bottom'
  // Never over the turn bar / ☰ (a pause near the board's top covered them on a phone — sprint 27)
  return toward === 'top' && roomAbove(r) < tutorial.calloutRoom ? 'bottom' : toward
}

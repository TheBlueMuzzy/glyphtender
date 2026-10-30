// WHERE A TUTORIAL CALLOUT GOES FIRST (the rails, the tips, the nudges, explore — one rule, so they all sit the same way).
// A board target: away from the live hex (the one glowing, when it isn't the target itself), else toward the nearer
// of the top bar and the tray (above a target in the board's top half, below one in its bottom half — but below when
// there's less than tutorial.json calloutRoom px above it before the turn bar) — so it covers
// as few board rows as it can. Anything else (the tray, the buttons, the reveal) — offBoardSide.
// The kit's Callout flips it if it doesn't fit.
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

/**
 * A target that isn't on the board (the tray, a seed, the buttons, the reveal):
 * - the prompt on top (an upright phone, layout.json boardVertical above 0 — GameScreen's data-prompt="top"): BELOW it,
 *   over the tray rows / buttons under it — never over the board, which now sits close above the tray (F91, Muzzy
 *   2026-10-30: "tray-pointing bubbles must not cover the board"). No step needs what's under it then (a rails step
 *   holds every piece but its own; the pauses hold everything). Where there's no room below (the button row) the kit
 *   flips it above — over the tray, which a button step doesn't need.
 * - otherwise (the prompt just above the tray — desktop, boardVertical 0): above it, in the prompt's place (the prompt
 *   hides while a callout is up — useTutorial.calloutUp).
 */
export function offBoardSide(promptOnTop: boolean): CalloutPlacement {
  return promptOnTop ? 'bottom' : 'top'
}

/** Is the prompt above the board right now (GameScreen's data-prompt="top")? */
export const promptOnTop = () => !!document.querySelector('.game[data-prompt="top"]')

/** offBoardSide for the page as it is. */
export const offBoardPlacement = (): CalloutPlacement => offBoardSide(promptOnTop())

export function calloutPlacement(selector: string, live: Hex | null = null): CalloutPlacement {
  const el = document.querySelector(selector)
  if (!el) return offBoardPlacement()
  const board = el.closest('.game-garden')
  if (!board) return offBoardPlacement()
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

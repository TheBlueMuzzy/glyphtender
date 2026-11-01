// MENU HEADER — the one top row every menu card shares (0.10.0): ‹ back on the left, the title, an action on the right.
//   <MenuHeader title="Settings" onBack={() => screens.pop()} />
//   <MenuHeader title="New game" onBack={close} action={<Button onClick={start}>Start</Button>} />
// ‹ only shows when onBack is given (Pause has Resume instead). It's a square icon button that sounds like a Back,
// read out as backLabel ("Back"). Muzzy 2026-10-13: "'main menu' as a button there might feel weird. where a back
// button would do the same with much less space. < = back."
// The title takes the room that's left and wraps onto a second line on a narrow phone; the ‹ and the action keep
// their size. A title that isn't plain words (e.g. "Room ABCD" with a box round the code) can be passed as-is.
// Beside an action (0.27.0, Goops' "UPGRAD / ES" at 360 wide): a plain-words title that won't fit on one line first
// drops a step to the style's heading size (--text-heading), and only then wraps — between words, never inside one.
// A word still too wide (a ‹ and an action on a 360-wide phone) drops one more step, to body size; still too wide
// (a wide pixel font), the action moves under the title instead (fitMenuTitle).
// Without an action (0.35.1, F145: "Reconnecti / ng…" at 200% text on a phone): the title keeps its size and wraps
// between words as before — it only drops the same steps when ONE word is wider than its whole line.
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Button, Text } from '../controls'
import { shown } from '../shown'

type MenuHeaderProps = { title: ReactNode; onBack?: () => void; backLabel?: string; action?: ReactNode }

export function MenuHeader({ title, onBack, backLabel = 'Back', action }: MenuHeaderProps) {
  const titleBox = useRef<HTMLDivElement>(null)
  // beside an action: one line if it can; alone: whole words. The action going away refits it alone: back to the full
  // title size (F108 review). A title that isn't plain words is shown as given.
  useTitleFit(titleBox, typeof title === 'string', Boolean(action), title)
  return (
    <div className="kit-menu-header" data-action={action ? '' : undefined}>
      {onBack && <Button variant="secondary" icon sound="back" aria-label={backLabel} onClick={onBack}>‹</Button>}
      <div ref={titleBox} className="kit-menu-header-title">{typeof title === 'string' ? <Text kind="title">{title}</Text> : title}</div>
      {shown(action) && <div className="kit-menu-header-action">{action}</div>}
    </div>
  )
}

/** Keeps a title's box fitted (fitMenuTitle below) as the box changes size (a turned phone, the text size setting, a
 *  restyle), its words change, or a font arrives (it changes the words' width). on = false: no fit, the title's own size.
 *  Shared by MenuHeader and the end screens' titles (0.35.1, F145), so every title shrinks the same way. */
export function useTitleFit(titleBox: RefObject<HTMLElement | null>, on: boolean, oneLine: boolean, words: ReactNode) {
  useLayoutEffect(() => {
    const box = titleBox.current
    if (!box) return
    if (!on) { box.removeAttribute('data-fit'); return }
    fitMenuTitle(box, oneLine)
    if (typeof ResizeObserver === 'undefined') return // (tests without a browser)
    // (only when its width or its text size changes — the fit's own step changes only its height — and not inside the
    // observer's own turn but at the next frame, 0.37.1 — F161: a refit there moved the parts below the title in the
    // same turn, "ResizeObserver loop completed with undelivered notifications" on Pixel's Lobby and Payslip at 200%)
    const room = () => `${box.clientWidth} ${getComputedStyle(box).fontSize}`
    let fittedFor = room(), frame = 0
    const refit = new ResizeObserver(() => {
      if (room() === fittedFor || frame) return
      frame = requestAnimationFrame(() => { frame = 0; fittedFor = room(); fitMenuTitle(box, oneLine) })
    })
    refit.observe(box)
    // …and when its words change on the page without React (a browser's translate button, the fake language: 0.37.0,
    // F156 — "Reconnecting…" kept the fit of the English word). The fit only sets data-fit, so it never loops.
    const rewritten = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => fitMenuTitle(box, oneLine))
    rewritten?.observe(box, { characterData: true, childList: true, subtree: true })
    let live = true
    void document.fonts?.ready.then(() => { if (live) fitMenuTitle(box, oneLine) })
    return () => { live = false; cancelAnimationFrame(frame); refit.disconnect(); rewritten?.disconnect() }
  }, [titleBox, on, oneLine, words])
}

/** Picks the title's size for the room it has (.kit-menu-header-title → data-fit): "" = title size, it fits on one
 *  line · "small" = a step down (heading size), wrapping between words if it must · "smaller" = body size, when a
 *  word is still too wide at heading size (a ‹ AND an action on a 360-wide phone) · "tight" = last resort, a word too
 *  wide even at body size: heading size again, and the action moves under the title (kit CSS) · "split" = a word wider
 *  than that whole row even so: body size on its own line, and only that word may break (0.38.0). The first check is with
 *  the words on one line (data-fit="measure", kit CSS). Self-contained, so the look tests can run it in a browser.
 *  oneLine = false (no action, 0.35.1): the first check is at title size, wrapping between words — it only steps down
 *  when a word is wider than its line; still too wide at body size → "split" (body size, that word may break). */
export function fitMenuTitle(box: HTMLElement, oneLine = true) {
  const words = box.firstElementChild as HTMLElement | null
  if (!words) return
  box.dataset.fit = oneLine ? 'measure' : '' // title size: all on one line · alone: words wrap, never split (kit CSS)
  if (words.scrollWidth <= box.clientWidth + 1) { box.dataset.fit = ''; return }
  for (const step of ['small', 'smaller']) { // heading size, then body size; wrapping between words
    box.dataset.fit = step
    if (words.scrollWidth <= box.clientWidth + 1) return
  }
  if (!oneLine) { box.dataset.fit = 'split'; return } // one word is too wide even at body size: it may break
  box.dataset.fit = 'tight' // too wide even at body size beside the ‹ and the action: the title gets the row, the action moves under it
  // …and a word wider than that whole row even so (0.38.0, F162: Settings in Pixel at 200% text in the fake language —
  // its "]" ran past the card's side and was cut off): the last step, body size on its own line; only a word wider
  // than the row even then breaks. (In "tight" the box is as wide as its longest word, so it's measured by the row.)
  const row = box.parentElement
  if (row && words.scrollWidth > row.clientWidth + 1) box.dataset.fit = 'split'
}

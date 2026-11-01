// The shared "◀ value ▶" shape behind Selector and Stepper.
// It is ONE focus stop: ← / → (keyboard, or a gamepad d-pad sent as arrow keys) step the value — also after a
// click on ◀ or ▶ (the key reaches the picker from the arrow). ↑ / ↓ move on to the next control (arrowKeys.ts).
// A value word too wide to sit between the arrows (0.35.4, F147: "Accessibil / ity" at 200% text in a wide font — the
// words are body size already, the smallest there is) gets the picker's whole width on its own line, the arrows under
// it at the two ends (fitPicker), instead of breaking in the middle.
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from './Button'

// sizes: every value it can show (Selector: its options). Invisible copies are piled in the value's spot, so the picker
// is as wide as its LONGEST value and never changes width as you step (0.10.4 — Muzzy: "they should all find the
// longest word in them, and be the size that allows for the longest word to fit comfortably").
type ArrowPickerProps = {
  label: string; display: ReactNode; onStep: (direction: -1 | 1) => void
  canPrev: boolean; canNext: boolean; prevIcon: string; nextIcon: string; kind: string; sizes?: ReactNode[]
}

export function ArrowPicker({ label, display, onStep, canPrev, canNext, prevIcon, nextIcon, kind, sizes }: ArrowPickerProps) {
  const picker = useRef<HTMLDivElement>(null)
  // Refit when the picker changes size (a turned phone, the text size setting, a restyle), its words change, or a font
  // arrives (it changes the words' width)
  useLayoutEffect(() => {
    const box = picker.current
    if (!box) return
    if (typeof ResizeObserver === 'undefined') return // (tests without a browser: no layout to measure)
    fitPicker(box)
    // (refit on the next frame, not inside the observer: stacking changes the picker's own size, and doing it right
    // there made the browser say "ResizeObserver loop completed with undelivered notifications")
    let pending = 0
    const refit = new ResizeObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; fitPicker(box) }) })
    refit.observe(box) // (the text size setting: its words grow, so it does)
    if (box.parentElement) refit.observe(box.parentElement) // (its room)
    // (its words changed on the page without React — a browser's translate button, the fake language: 0.37.0, F156.
    // fitPicker only sets data-fit, so this never loops)
    const rewritten = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; fitPicker(box) }) })
    rewritten.observe(box, { characterData: true, childList: true, subtree: true })
    let live = true
    void document.fonts?.ready.then(() => { if (live) fitPicker(box) })
    return () => { live = false; refit.disconnect(); rewritten.disconnect(); cancelAnimationFrame(pending) }
  }, [display, sizes])
  // (At an end the key still belongs to the picker: nothing happens, rather than the page scrolling sideways)
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (e.key === 'ArrowLeft' && canPrev) onStep(-1)
    if (e.key === 'ArrowRight' && canNext) onStep(1)
  }
  return (
    <div ref={picker} className={`kit-picker kit-${kind}`} role="group" aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
      <Button variant="ghost" icon tabIndex={-1} aria-label={`Previous ${label}`} disabled={!canPrev} onClick={() => onStep(-1)}>{prevIcon}</Button>
      {sizes ? (
        <span className="kit-picker-sized">
          {sizes.map((size, i) => <span key={i} className="kit-picker-sizer" aria-hidden="true">{size}</span>)}
          <output className="kit-picker-value" aria-live="polite">{display}</output>
        </span>
      ) : <output className="kit-picker-value" aria-live="polite">{display}</output>}
      <Button variant="ghost" icon tabIndex={-1} aria-label={`Next ${label}`} disabled={!canNext} onClick={() => onStep(1)}>{nextIcon}</Button>
    </div>
  )
}

/** Picks the picker's layout for the room it has (.kit-picker → data-fit): "" = ◀ value ▶ on one line, every value's
 *  words whole · "stack" = a word of some value (the shown one or any it can show) is wider than the room between the
 *  arrows: the value gets its own line, ◀ ▶ under it (kit CSS). Measured with words that never break (data-fit="measure").
 *  Self-contained, so a test can run it in a browser. */
export function fitPicker(picker: HTMLElement) {
  picker.dataset.fit = 'measure'
  // each line of each value as wide as it runs, against the room it has (to the fraction of a pixel: a word 0.4px too
  // wide still broke — scrollWidth rounds that away)
  const range = document.createRange()
  const tooWide = [...picker.querySelectorAll<HTMLElement>('.kit-picker-sizer, .kit-picker-value')].some((el) => {
    range.selectNodeContents(el)
    const s = getComputedStyle(el)
    const room = el.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
    return [...range.getClientRects()].some((line) => line.width > room + 0.01)
  })
  picker.dataset.fit = tooWide ? 'stack' : ''
}

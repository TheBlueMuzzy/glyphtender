// ARROW KEYS — ↑ / ↓ jump from control to control on a menu (keyboard, or a gamepad d-pad sent as arrow keys).
// Only things you can work stop the focus (buttons, ◀ value ▶ pickers, switches, sliders, boxes to type in) —
// never words, and never anything hidden, inert or disabled. In reading order; past the last it WRAPS to the first
// (and ↑ from the first goes to the last), like a console menu. The control comes into view in a scrolling panel.
// ← / → are each control's own (a Selector or Stepper steps its value, a Toggle turns off / on, Tabs and a Carousel
// move), and a box you type in keeps all its arrows for its text caret.
// ScreenStack calls moveFocus for the top open screen (or, with none open, the Panel the focus is in).

// Everything that can take keyboard focus; the checks below drop the ones that can't right now
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]'
// Inputs that are pressed or dragged, not typed in: ↑ / ↓ still move on from these
const NOT_TYPED = ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image']

/** Is this a box you type in (its arrows move the text caret, so never take them)? */
export function typesText(el: Element | null) {
  if (!el) return false
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  return el instanceof HTMLInputElement && !NOT_TYPED.includes(el.type)
}

function canStop(el: HTMLElement) {
  if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) return false // tabIndex -1: a picker's ◀ ▶ (the picker is the stop)
  if (el.closest('[inert], [hidden], [aria-hidden="true"]')) return false
  if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false // display none, visibility hidden
  // A scroll box with controls in it: the controls are the stops (one with only words in it stays one, to read it)
  if (el.classList.contains('kit-scroll') && el.querySelector(FOCUSABLE)) return false
  return true
}

/** The controls ↑ / ↓ stop at inside `scope`, in reading order. */
export function arrowStops(scope: Element) {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(canStop)
}

// A scroll box with only words in it, focused, keeps ↑ / ↓ to scroll — until it reaches that end
function scrollsFurther(el: Element, direction: 1 | -1) {
  if (!el.classList.contains('kit-scroll')) return false
  return direction > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0
}

/** Handles ↑ / ↓ inside `scope`. Returns true if it moved the focus (and stopped the page scrolling). */
export function moveFocus(e: KeyboardEvent, scope: Element) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return false
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
  const active = document.activeElement
  if (typesText(active)) return false
  const direction = e.key === 'ArrowDown' ? 1 : -1
  if (active && scrollsFurther(active, direction)) return false

  const stops = arrowStops(scope)
  if (!stops.length) return false
  // Where the focus is now: the stop that is (or holds) it — e.g. a picker whose ◀ was clicked
  const here = stops.findIndex((stop) => stop === active || stop.contains(active))
  const next = here < 0
    ? (direction > 0 ? 0 : stops.length - 1) // nothing focused in here yet: the first (↓) or last (↑)
    : (here + direction + stops.length) % stops.length // wraps round at both ends
  const target = stops[next]
  e.preventDefault()
  target.focus({ preventScroll: true })
  // Into view inside a scrolling panel: the whole row it sits in, so its label shows too
  const row = target.closest('.kit-listrow') ?? target
  row.scrollIntoView?.({ block: 'nearest' })
  return true
}

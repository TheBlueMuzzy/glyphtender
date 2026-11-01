// SCROLL AREA — a box that scrolls when its contents are too tall.
// max: how tall before it scrolls — s, m or l. Without max it fills its parent.
// No scroll bar shows (0.10.0): drag, swipe, wheel and the arrow keys still scroll it. Instead its top / bottom
// edge fades softly while there's more to see that way (kit.css), so a row cut off at the edge reads as "scroll".
// It marks itself for the CSS:
//   data-more-start — scrolled down a bit: more above      data-more-end — more below
//   data-scrolls    — its contents are taller than it. Only then does it keep swipes to itself — B027: a box that
//                     can't scroll must never catch a swipe meant for what's around it.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

export function ScrollArea({ label, max, children }: { label: string; max?: 's' | 'm' | 'l'; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const watcher = useRef<ResizeObserver | null>(null)

  // Once: check on every scroll, and whenever the box or anything in it changes size
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const check = () => markMore(el)
    check()
    el.addEventListener('scroll', check, { passive: true })
    watcher.current = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { markMore(el); measureContents(el) })
    watcher.current?.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      watcher.current?.disconnect()
      watcher.current = null
    }
  }, [])

  // Every render: the contents may be new (another page, more rows), so watch whatever is inside now and check again
  useEffect(() => {
    const el = box.current
    if (!el) return
    for (const child of Array.from(el.children)) watcher.current?.observe(child)
    markMore(el)
    measureContents(el)
  })

  // tabIndex lets keyboard players focus it and scroll with the arrow keys
  return <div ref={box} className="kit-scroll" role="region" aria-label={label} tabIndex={0} data-max={max}>{children}</div>
}

// Is there more above / below? (1 px of slack: a zoomed page scrolls in fractions)
// --kit-more-start / --kit-more-end = how much more there is that way: the fade is never taller than that (kit.css),
// so it grows in as you scroll away from an end, and a box with only a sliver hidden gets only a sliver of fade.
function markMore(el: HTMLElement) {
  const room = Math.max(0, el.scrollHeight - el.clientHeight) // how far it can scroll
  const above = Math.min(room, Math.max(0, el.scrollTop))
  el.toggleAttribute('data-scrolls', room > 1)
  el.toggleAttribute('data-more-start', room > 1 && above > 1)
  el.toggleAttribute('data-more-end', room > 1 && above < room - 1)
  el.style.setProperty('--kit-more-start', `${Math.round(above)}px`)
  el.style.setProperty('--kit-more-end', `${Math.round(room - above)}px`)
}

// How tall its contents are (0.35.1, F145) → --kit-scroll-contents: in a card it never gives up height below
// --kit-scroll-min (kit.css), but a short list is never held taller than itself. (scrollHeight can't tell: it's never
// less than the box's own height.) Measured on a resize or a render only, never per scroll, and set only when it changes.
export function measureContents(el: HTMLElement) {
  let top = Infinity, bottom = -Infinity
  for (const child of Array.from(el.children)) {
    const r = child.getBoundingClientRect()
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom)
  }
  const s = getComputedStyle(el)
  const pad = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom)
  const contents = bottom > top ? bottom - top + pad : 0
  const tall = `${Math.ceil(contents)}px`
  if (el.style.getPropertyValue('--kit-scroll-contents') !== tall) el.style.setProperty('--kit-scroll-contents', tall)
  // …and its first two rows → --kit-scroll-rows (0.38.0, F162): the floor is two of its own rows, not a guess — at 200%
  // text the Room's player rows are ~156 px, and a 4rem list (128 px) showed under one. Its rows: what's in it, through
  // a lone wrapper (a Stack or Grid); the second row is the first thing that starts below the first (a grid's row of
  // cards counts once). Its own padding isn't added: the rows scroll under it, and two 2rem rows keep today's 4rem.
  // One row only: its contents are the floor.
  let rows = Array.from(el.children)
  while (rows.length === 1) rows = Array.from(rows[0].children)
  const boxes = rows.map((r) => r.getBoundingClientRect()).filter((r) => r.height > 0)
  const second = boxes.find((r) => r.top >= boxes[0].bottom - 1)
  const two = second ? `${Math.ceil(second.bottom - boxes[0].top)}px` : tall
  if (el.style.getPropertyValue('--kit-scroll-rows') !== two) el.style.setProperty('--kit-scroll-rows', two)
}

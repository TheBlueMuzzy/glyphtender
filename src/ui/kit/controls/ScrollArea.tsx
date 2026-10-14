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
    watcher.current = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
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

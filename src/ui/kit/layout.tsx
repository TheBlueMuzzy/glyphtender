// LAYOUT BOXES — Screen, Panel, Stack, Row, Grid.
// They only arrange things. Spacing is always a gap name (xs, s, m, l, xl) — never a size.
import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'

export type Gap = 'xs' | 's' | 'm' | 'l' | 'xl'
type BoxProps = HTMLAttributes<HTMLDivElement> & { gap?: Gap }

// A full-area layer with safe slots (clear of phone notches). HUDs and menus start here.
// Empty space lets taps through to the game underneath; only the slot contents catch taps.
type ScreenProps = {
  topLeft?: ReactNode; top?: ReactNode; topRight?: ReactNode
  bottomLeft?: ReactNode; bottom?: ReactNode; bottomRight?: ReactNode
  children?: ReactNode // goes in the centre
  label?: string // what a screen reader calls this screen
  dialog?: boolean // dims what's underneath; for a small question on top of another screen
  // The whole screen scrolls when its contents are taller than it — drag, wheel or keys, with no scroll bar showing.
  // The centre OPENS in the middle (taller than the window: at the top); after that its top stays put and it only
  // grows or shrinks DOWNWARD, so a control just tapped (+ / −, Person ▶ AI) stays under the finger (Muzzy 2026-10-10:
  // "it should start in the center and only expand downwards"). It's placed again only when the window changes size
  // (resize, rotate). No ScrollArea inside: the panel's own buttons (Start, Save) scroll with it, always reachable.
  scroll?: boolean
}
export function Screen({ children, label, dialog, scroll, ...slots }: ScreenProps) {
  const slotNames = { topLeft: 'top-left', top: 'top', topRight: 'top-right', bottomLeft: 'bottom-left', bottom: 'bottom', bottomRight: 'bottom-right' }
  const centre = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => (scroll && centre.current ? keepCentredOnOpen(centre.current) : undefined), [scroll])
  return (
    <section className="kit-screen" aria-label={label} data-dialog={dialog || undefined} data-scroll={scroll || undefined}
      role={dialog ? 'dialog' : undefined} aria-modal={dialog || undefined}>
      {Object.entries(slotNames).map(([prop, slot]) => {
        const content = slots[prop as keyof typeof slots]
        return content ? <div key={slot} data-slot={slot}>{content}</div> : null
      })}
      {children && <div data-slot="center" ref={centre}>{children}</div>}
    </section>
  )
}

// <Screen scroll>: the centre sits at the top of its row (kit.css), pushed down by a top margin that puts it in the
// middle at the size it OPENS with. Measured before the first paint (no jump): where would it be if centred? That gap
// becomes its top margin, and stays — the content growing or shrinking afterwards moves only its bottom edge.
// Placed again only when the screen's own size changes (window resize, phone rotated) or once the fonts have loaded.
function keepCentredOnOpen(box: HTMLDivElement) {
  const screen = box.parentElement
  if (!screen) return
  let measuredFor = ''
  function place(always = false) {
    const size = `${screen!.clientWidth}x${screen!.clientHeight}`
    if (size === measuredFor && !always) return // (only the content changed: leave it where it is)
    measuredFor = size
    box.style.marginBlockStart = '0'
    box.style.alignSelf = 'center'
    const centredTop = box.offsetTop
    box.style.alignSelf = ''
    box.style.marginBlockStart = `${Math.max(0, centredTop - box.offsetTop)}px` // taller than the window: 0, at the top
  }
  place(true)
  let open = true
  document.fonts?.ready.then(() => { if (open) place(true) }) // (already loaded: straight away, before any tap)
  const onResize = () => place()
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
  if (observer) observer.observe(screen)
  else window.addEventListener('resize', onResize)
  return () => {
    open = false
    observer?.disconnect()
    window.removeEventListener('resize', onResize)
  }
}

// A raised surface that groups things (menu box, settings card, dialog body).
export function Panel({ gap = 'm', depth = 1, className = '', ...rest }: BoxProps & { depth?: 0 | 1 | 2 }) {
  return <div className={`kit-panel ${className}`} data-gap={gap} data-depth={depth} {...rest} />
}

// Things top to bottom.
export function Stack({ gap = 'm', className = '', ...rest }: BoxProps) {
  return <div className={`kit-stack ${className}`} data-gap={gap} {...rest} />
}

// Things side by side; wraps onto a new line when there's no room.
// justify: "start" | "center" | "end" | "between" (push to both ends)
export function Row({ gap = 'm', justify = 'start', className = '', ...rest }: BoxProps & { justify?: 'start' | 'center' | 'end' | 'between' }) {
  return <div className={`kit-row ${className}`} data-gap={gap} data-justify={justify} {...rest} />
}

// Equal tiles that fit as many per line as there's room for. min = smallest tile: s, m or l.
export function Grid({ gap = 'm', min = 'm', className = '', ...rest }: BoxProps & { min?: 's' | 'm' | 'l' }) {
  return <div className={`kit-grid ${className}`} data-gap={gap} data-min={min} {...rest} />
}

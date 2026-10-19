// LAYOUT BOXES — Screen, Panel, Stack, Row, Grid.
// They only arrange things. Spacing is always a gap name (xs, s, m, l, xl) — never a size.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react'
import { reduceMotion } from './blocks/motion'

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
  // grow="down" (0.10.0 — every kit menu card uses it): the screen itself never scrolls; the centre card OPENS in the
  // middle, then its top stays put and it only grows or shrinks DOWNWARD (same rule as scroll above). It never runs
  // off the bottom: there it stops, and the card's ScrollArea body scrolls inside instead.
  grow?: 'down'
  // backdrop (0.11.0): a picture behind the whole screen (the game's own background art). It keeps its shape:
  // 'cover' (default) fills the screen and crops what spills over; 'contain' shows all of it on the style's background.
  backdrop?: string
  backdropFit?: 'cover' | 'contain'
  // column (0.12.0): a phone-shaped game on a wide window — the slots sit in a centred column as wide as a phone held
  // upright (--kit-column-w, default: 9:16 of the window's height, at least 22.5rem), while the backdrop still covers
  // the whole window. Short windows (a phone on its side) use the whole width, and the bottom-centre slot moves to the
  // left of the centre (like a main menu's title), so the centre keeps the height.
  column?: boolean
  // swipe (0.12.0): a swipe anywhere on the screen (finger, mouse or pen; at least 3rem, mostly in one direction) calls
  // that direction's function — e.g. { up: backToMenu } (Goops: "swipe up to end the day"). A swipe that scrolls
  // something on the screen is left to scroll. Taps still work as before.
  swipe?: Swipes
  // slide (0.12.0): the whole screen slides in from `slideEdge` ('in') or out to it ('out') over the style's normal
  // motion time, then onSlideEnd — e.g. the console sliding away to show the game under it. Reduce motion: no slide,
  // onSlideEnd straight away.
  slide?: 'in' | 'out'
  slideEdge?: 'top' | 'bottom' | 'left' | 'right'
  onSlideEnd?: () => void
}
export function Screen({ children, label, dialog, scroll, grow, backdrop, backdropFit = 'cover', column, swipe, slide, slideEdge = 'bottom', onSlideEnd, ...slots }: ScreenProps) {
  const slotNames = { topLeft: 'top-left', top: 'top', topRight: 'top-right', bottomLeft: 'bottom-left', bottom: 'bottom', bottomRight: 'bottom-right' }
  const centre = useRef<HTMLDivElement>(null)
  const self = useRef<HTMLElement>(null)
  const keepTop = scroll ? 'margin' : grow === 'down' ? 'variable' : null // (scroll wins if both are given)
  useLayoutEffect(() => (keepTop && centre.current ? keepCentredOnOpen(centre.current, keepTop) : undefined), [keepTop])
  useSwipe(self, swipe)
  const slideDone = useRef(onSlideEnd)
  useEffect(() => { slideDone.current = onSlideEnd })
  const slideFired = useRef(false) // once per slide, whether the animation ends or reduce motion skips it
  const endSlide = () => { if (!slideFired.current) { slideFired.current = true; slideDone.current?.() } }
  useEffect(() => {
    slideFired.current = false
    const el = self.current
    if (!slide || !el) return
    if (reduceMotion()) { endSlide(); return }
    const onEnd = (e: AnimationEvent) => { if (e.target === el) endSlide() } // (the screen's own slide, not a panel's entrance)
    el.addEventListener('animationend', onEnd)
    return () => el.removeEventListener('animationend', onEnd)
  }, [slide])
  return (
    <section className="kit-screen" ref={self} aria-label={label} data-dialog={dialog || undefined} data-scroll={scroll || undefined}
      data-grow={!scroll && grow ? grow : undefined} role={dialog ? 'dialog' : undefined} aria-modal={dialog || undefined}
      data-backdrop={backdrop ? backdropFit : undefined} data-column={column || undefined} data-swipe={swipe ? '' : undefined}
      data-slide={slide} data-slide-edge={slide ? slideEdge : undefined}
      style={{ '--kit-backdrop': backdrop ? `url("${encodeURI(backdrop)}")` : undefined } as CSSProperties}>
      {Object.entries(slotNames).map(([prop, slot]) => {
        const content = slots[prop as keyof typeof slots]
        return content ? <div key={slot} data-slot={slot}>{content}</div> : null
      })}
      {children && <div data-slot="center" ref={centre}>{children}</div>}
    </section>
  )
}

// SWIPES — a quick drag in one direction calls that direction's function. Mouse and pen use pointer events; a finger
// uses touch events, which still arrive when the browser claims the gesture (a pointer would be cancelled there).
// A swipe that something on the screen can scroll with (e.g. a long report) is left to scroll instead.
export type Swipes = Partial<Record<'up' | 'down' | 'left' | 'right', () => void>>
const SWIPE_MIN = 3 // rem

export function useSwipe(target: RefObject<HTMLElement | null>, swipes: Swipes | undefined) {
  const live = useRef(swipes)
  useEffect(() => { live.current = swipes })
  const on = !!swipes
  useEffect(() => {
    const el = target.current
    if (!el || !on) return
    let from: { x: number; y: number; target: EventTarget | null } | null = null
    const begin = (x: number, y: number, t: EventTarget | null) => { from = { x, y, target: t } }
    const end = (x: number, y: number) => {
      if (!from) return
      const dx = x - from.x, dy = y - from.y, start = from.target
      from = null
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN * rem) return
      const dir = Math.abs(dy) >= Math.abs(dx) * 1.5 ? (dy < 0 ? 'up' : 'down') : Math.abs(dx) >= Math.abs(dy) * 1.5 ? (dx < 0 ? 'left' : 'right') : null
      if (!dir || (start instanceof Element && scrollsWith(start, el, dir))) return
      live.current?.[dir]?.()
    }
    const down = (e: PointerEvent) => { if (e.pointerType !== 'touch' && e.button === 0) begin(e.clientX, e.clientY, e.target) }
    const up = (e: PointerEvent) => { if (e.pointerType !== 'touch') end(e.clientX, e.clientY) }
    const touchStart = (e: TouchEvent) => { const t = e.touches[0]; if (e.touches.length === 1 && t) begin(t.clientX, t.clientY, e.target) }
    const touchEnd = (e: TouchEvent) => { const t = e.changedTouches[0]; if (t) end(t.clientX, t.clientY) }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    el.addEventListener('touchstart', touchStart, { passive: true })
    el.addEventListener('touchend', touchEnd, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('touchstart', touchStart)
      el.removeEventListener('touchend', touchEnd)
    }
  }, [target, on])
}

// Could a swipe this way scroll something between where it started and the screen? (Swiping UP scrolls DOWN.)
function scrollsWith(start: Element, screen: Element, dir: 'up' | 'down' | 'left' | 'right') {
  for (let el: Element | null = start; el && el !== screen; el = el.parentElement) {
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = el
    if (dir === 'up' && scrollTop + clientHeight < scrollHeight - 1) return true
    if (dir === 'down' && scrollTop > 0) return true
    if (dir === 'left' && scrollLeft + clientWidth < scrollWidth - 1) return true
    if (dir === 'right' && scrollLeft > 0) return true
  }
  return false
}

// <Screen scroll>: the centre sits at the top of its row (kit.css), pushed down by a top margin that puts it in the
// middle at the size it OPENS with. Measured before the first paint (no jump): where would it be if centred? That gap
// becomes its top margin, and stays — the content growing or shrinking afterwards moves only its bottom edge.
// Placed again only when the screen's own size changes (window resize, phone rotated) or once the fonts have loaded.
// <Screen grow="down"> does the same, but writes the gap into --kit-grow-top: kit.css uses it as the top margin AND
// takes it off the centre's height limit, so a card pinned lower down still stops at the screen's bottom edge.
function keepCentredOnOpen(box: HTMLDivElement, keep: 'margin' | 'variable') {
  const screen = box.parentElement
  if (!screen) return
  let measuredFor = ''
  function place(always = false) {
    const size = `${screen!.clientWidth}x${screen!.clientHeight}`
    if (size === measuredFor && !always) return // (only the content changed: leave it where it is)
    measuredFor = size
    if (keep === 'margin') box.style.marginBlockStart = '0'
    else box.style.removeProperty('--kit-grow-top')
    box.style.alignSelf = 'center'
    const centredTop = box.offsetTop
    box.style.alignSelf = ''
    const gap = `${Math.max(0, centredTop - box.offsetTop)}px` // taller than the window: 0, at the top
    if (keep === 'margin') box.style.marginBlockStart = gap
    else box.style.setProperty('--kit-grow-top', gap)
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
// frame (0.11.0): the game's own frame picture around it instead of the style's box — see PanelFrame.
export function Panel({ gap = 'm', depth = 1, frame, className = '', style, ...rest }: BoxProps & { depth?: 0 | 1 | 2; frame?: PanelFrame }) {
  return <div className={`kit-panel ${className}`} data-gap={gap} data-depth={depth} data-frame={frame ? '' : undefined}
    style={{ ...style, ...(frame && frameVariables(frame)) }} {...rest} />
}

// A FRAME PICTURE (0.11.0) — a panel drawn inside the game's own frame art (a monitor, a scroll, a wooden sign).
// The picture is cut nine ways (CSS border-image): its four corners are drawn at their own shape, never stretched;
// only the plain strips between them (and the middle) grow with the panel's contents, so any frame with plain edges
// fits any amount of words. src = the picture (an SVG needs width + height on its <svg>, or the cut lines are guessed);
// slice = [top, right, bottom, left] — how far in from each edge the corners reach, in the picture's own units
// (an SVG's viewBox units); scale = how many rem one picture unit takes on screen (default 0.0625: 16 units = 1rem;
// on a short window, 30rem tall or less, the frame is drawn at 60% of that so the contents keep their room).
// The panel's contents sit inside the cut lines, so they never touch the frame.
// ink = which style colour the words inside take, to read on the frame's own window: 'on-surface' (default, like any
// panel), 'on-bg' or 'on-game' (light words over a dark game in most styles).
export type PanelFrame = { src: string; slice: [number, number, number, number]; scale?: number; ink?: 'on-surface' | 'on-bg' | 'on-game' }
export function frameVariables({ src, slice, scale = 0.0625, ink = 'on-surface' }: PanelFrame): CSSProperties {
  return {
    '--kit-art-frame-ink': `var(--${ink})`,
    '--kit-art-frame': `url("${encodeURI(src)}")`,
    '--kit-art-frame-slice': slice.join(' '),
    '--kit-art-frame-width': slice.map((n) => `${+(n * scale).toFixed(4)}rem`).join(' '),
    // short windows (a phone on its side): the frame drawn at 60%, so the report keeps the room
    '--kit-art-frame-width-short': slice.map((n) => `${+(n * scale * 0.6).toFixed(4)}rem`).join(' '),
  } as CSSProperties
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

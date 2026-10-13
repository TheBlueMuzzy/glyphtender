// TEACH — the parts a tutorial is built from: Callout (a speech bubble pointing at something; its maths in
// callout.ts) and the tips memory (tips.ts: which one-time tips a player has seen, and the Tips on / off switch).
// They know nothing about any game: the game decides WHEN a callout shows and what it says.
//
// <Callout target="#plant" text="Happy? Tap Plant." onDismiss={hide} />
//   target     an Element, a CSS selector (looked up every frame, so it can appear later) or a screen point { x, y }
//   placement  'auto' (default: above, else below, right, left) or a side to try first — it flips / shifts to fit
//   title      a bold line above the text · action  a button label ("Got it") — then only the button closes it
//   dim        darkens everything but the target (a cut-out spotlight; taps still reach the target through the hole)
//   pulse      the target glows · dimAmount  how dark the dim is, 0–1 (default 0.65)
//   onDismiss  a tap on the callout (no action button) or on the action button
//   onOutsideTap  a tap on the dim around the target (default: onDismiss when there's no action button)
// It sits above everything (a popover in the top layer), inside the window — or the game picture when the game
// sets --kit-frame-w / --kit-frame-h — with the kit's edge room, and never covers its target.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Row, Stack } from '../layout'
import { Button, Text } from '../controls'
import { calloutWords, placeCallout, type CalloutPlacement, type CalloutTarget } from './callout'

type Box = { left: number; top: number; right: number; bottom: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)))

// The target's rectangle on screen right now, or null when it isn't there (not on the page, or hidden)
function targetBox(target: CalloutTarget): Box | null {
  if (!target) return null
  if (typeof target === 'object' && 'x' in target && !(target instanceof Element)) return { left: target.x, top: target.y, right: target.x, bottom: target.y }
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null // display: none
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

export type CalloutProps = {
  target: CalloutTarget; text: ReactNode; title?: ReactNode
  action?: string; placement?: CalloutPlacement
  onDismiss?: () => void; onOutsideTap?: () => void
  dim?: boolean; pulse?: boolean; dimAmount?: number
  label?: string // what a screen reader calls it when it has no title (default "Tip")
}

export function Callout({ target, text, title, action, placement = 'auto', onDismiss, onOutsideTap, dim, pulse, dimAmount, label }: CalloutProps) {
  const layer = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  // The latest props for the frame loop, without restarting it on every render
  const now = useRef({ target, placement })
  useLayoutEffect(() => { now.current = { target, placement } })

  // Show the popover while mounted (above the game and any open screen)
  useEffect(() => {
    const el = layer.current
    if (el?.showPopover && !el.matches(':popover-open')) el.showPopover() // (very old browsers: it just sits in the page)
    return () => { if (el?.hidePopover && el.matches(':popover-open')) el.hidePopover() }
  }, [])

  // A pause (dim + a button) takes the focus, so keys and screen readers land on it
  // (a frame later: a screen opening in the same moment moves the focus into itself first)
  useEffect(() => {
    if (!dim || !action) return
    const frame = schedule(() => bubble.current?.querySelector('button')?.focus({ preventScroll: true, focusVisible: false } as FocusOptions))
    return () => cancel(frame)
  }, [dim, action])

  // Place it every frame while it's up: the target may move, scroll, resize or appear late. Only writes when something changed.
  useLayoutEffect(() => {
    let frame = 0, last = ''
    const place = () => {
      const el = layer.current, box = bubble.current
      if (!el || !box) return
      const room = el.querySelector<HTMLElement>('.kit-callout-frame')
      const tip = box.querySelector<HTMLElement>('.kit-callout-tip')
      const found = targetBox(now.current.target)
      if (!room || !tip || !found) {
        if (last !== 'gone') { el.removeAttribute('data-ready'); last = 'gone' }
        return
      }
      // The room it may use: the frame element (window or game picture) minus its padding (the kit's edge room + safe areas)
      const r = room.getBoundingClientRect(), pad = getComputedStyle(room)
      const frameBox = { left: r.left + parseFloat(pad.paddingLeft), top: r.top + parseFloat(pad.paddingTop),
        right: r.right - parseFloat(pad.paddingRight), bottom: r.bottom - parseFloat(pad.paddingBottom) }
      const space = parseFloat(pad.columnGap) || 0 // the spotlight's room round the target (gap-s)
      const hole = { left: found.left - space, top: found.top - space, right: found.right + space, bottom: found.bottom + space }
      const tipSize = tip.offsetWidth, reach = tipSize * Math.SQRT1_2 // a turned square sticks out half its diagonal
      const size = { width: box.offsetWidth, height: box.offsetHeight }
      // The pointer stays off the rounded corners: the corner's curve, plus half the pointer's width
      const radius = parseFloat(getComputedStyle(box).borderTopLeftRadius) || 0
      const tipInset = Math.min(Math.min(size.width, size.height) / 2, radius + reach)
      const spot = placeCallout(hole, size, frameBox, reach + tipSize * 0.25, now.current.placement, tipInset)
      // The pointer sits inside the bubble's border box; its centre goes on the middle of the border line
      const border = (box.offsetWidth - box.clientWidth) / 2
      const tipX = spot.tipX - border + (spot.side === 'left' ? -border / 2 : spot.side === 'right' ? border / 2 : 0)
      const tipY = spot.tipY - border + (spot.side === 'top' ? -border / 2 : spot.side === 'bottom' ? border / 2 : 0)
      const key = [spot.x, spot.y, tipX, tipY, spot.side, hole.left, hole.top, hole.right, hole.bottom].map((n) => (typeof n === 'number' ? Math.round(n * 2) / 2 : n)).join()
      if (key === last) return
      last = key
      const set = (name: string, px: number) => el.style.setProperty(name, `${px}px`)
      set('--kit-callout-x', spot.x); set('--kit-callout-y', spot.y)
      set('--kit-callout-tip-x', tipX); set('--kit-callout-tip-y', tipY)
      set('--kit-hole-l', hole.left); set('--kit-hole-t', hole.top); set('--kit-hole-r', hole.right); set('--kit-hole-b', hole.bottom)
      el.setAttribute('data-side', spot.side)
      el.setAttribute('data-ready', '')
    }
    const loop = () => { place(); frame = schedule(loop) }
    place()
    frame = schedule(loop)
    return () => cancel(frame)
  }, [])

  const dismissible = !action && !!onDismiss
  const outside = onOutsideTap ?? (action ? undefined : onDismiss)
  const dimShare = dimAmount === undefined ? undefined : `${Math.round(clamp(dimAmount, 0, 1) * 100)}%` // (undefined = the CSS default)
  const titled = title !== undefined && title !== null && title !== ''
  const content = (
    <div ref={layer} {...{ popover: 'manual' }} className="kit-scope kit-callout-layer" data-dim={dim || undefined}
      style={{ '--kit-callout-dim': dimShare } as CSSProperties}>
      <div className="kit-callout-frame" aria-hidden />
      {dim && <div className="kit-callout-dim" aria-hidden onClick={outside} />}
      {pulse && <div className="kit-callout-ring" aria-hidden />}
      <div ref={bubble} className="kit-callout" data-dismissible={dismissible || undefined}
        role={dim && action ? 'dialog' : 'status'} aria-live={dim && action ? undefined : 'polite'}
        aria-label={titled ? undefined : (label ?? calloutWords.label)}
        onClick={dismissible ? onDismiss : undefined}>
        <Stack gap="s" className="kit-callout-body">
          {titled && <Text kind="label">{title}</Text>}
          <Text>{text}</Text>
          {action && <Row justify="end"><Button onClick={onDismiss}>{action}</Button></Row>}
        </Stack>
        <span className="kit-callout-tip" aria-hidden />
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(content, document.body)
}

// One frame later (a timer where there are no animation frames, e.g. tests)
const schedule = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : (setTimeout(fn, 16) as unknown as number))
const cancel = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id))


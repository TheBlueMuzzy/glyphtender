// PULL HANDLE (0.12.0) — a lever, periscope or cord the player drags to make something happen (Goops: pull the
// periscope down to start a shift). Its grip is a real button: a TAP (or Enter / Space, or its own arrow key) pulls it
// all the way by itself, so nobody has to drag. Dragging moves it along `direction` up to `travel` (a share of its own
// length, e.g. 0.5 = half its height); let go past `threshold` (share of the travel) and it finishes the pull, short of
// it and it springs back.
// children = what it looks like (usually the game's picture, filling the handle's box). label = the grip's name, read
// out and found by tests. grip = the share of its length you can grab, at the end it's pulled by (down: the bottom) —
// e.g. a periscope whose long stem hides behind something: only its goggles are the grip (default 1 = all of it).
// pulled: keep it at the end (e.g. while the screen changes); it springs back when this goes false again.
// The drag share is on the handle as --kit-pull (0 → 1), so a game's art can follow it.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { controlSound } from './controlSound'
import { motionTime } from '../blocks/motion'

type PullHandleProps = {
  label: string
  onPull: () => void
  direction?: 'down' | 'up' | 'left' | 'right'
  travel?: number
  threshold?: number
  grip?: number
  pulled?: boolean
  disabled?: boolean
  className?: string
  children?: ReactNode
}

const TAP_SLOP = 0.5 // rem a press may wander and still count as a tap

export function PullHandle({ label, onPull, direction = 'down', travel = 0.5, threshold = 0.6, grip = 1, pulled = false, disabled, className = '', children }: PullHandleProps) {
  const [drag, setDrag] = useState<number | null>(null) // 0 → 1 while a finger holds it
  const [finishing, setFinishing] = useState(false) // let go past the threshold / tapped: gliding to the end
  const [glideMs, setGlideMs] = useState<number | null>(null) // how long that glide takes (only the distance left)
  const self = useRef<HTMLDivElement>(null)
  const start = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const dragged = useRef(false) // the press was a drag, so the click that follows it isn't a tap
  const vertical = direction === 'down' || direction === 'up'
  const sign = direction === 'down' || direction === 'right' ? 1 : -1

  // `from` = how far along it already is (0 = at rest, 1 = at the end)
  const finish = (from = 0) => {
    if (disabled) return
    // glide the rest of the way to the end, then act. The glide takes only the distance left: let go AT the end and it
    // acts straight away (0.15.1 — Goops: a full glide's wait after a full pull felt like lag). No glide with reduce motion.
    const ms = Math.round(motionTime('motion-normal') * (1 - Math.max(0, Math.min(1, from))))
    setGlideMs(ms)
    setFinishing(true)
    controlSound('tap')
    const done = () => { setFinishing(false); setGlideMs(null); onPull() }
    if (ms > 0) window.setTimeout(done, ms)
    else done()
  }
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || pulled || finishing || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    dragged.current = false
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const s = start.current
    if (!s || s.id !== e.pointerId || !self.current) return
    const along = (vertical ? e.clientY - s.y : e.clientX - s.x) * sign
    const across = vertical ? e.clientX - s.x : e.clientY - s.y
    if (!s.moved && Math.hypot(along, across) < TAP_SLOP * remPx()) return
    s.moved = true
    const box = self.current.getBoundingClientRect()
    const length = (vertical ? box.height : box.width) * travel
    setDrag(Math.max(0, Math.min(1, along / Math.max(1, length))))
  }
  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    start.current = null
    if (!s.moved) { setDrag(null); return } // a tap: the click that follows does the pull
    dragged.current = true
    const share = drag ?? 0
    setDrag(null)
    if (share >= threshold) finish(share)
  }
  function onPointerCancel() { start.current = null; setDrag(null) }
  function onClick() {
    if (dragged.current) { dragged.current = false; return }
    if (!pulled && !finishing) finish()
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    // the arrow it's pulled with pulls it too (Enter / Space already click)
    const keys = { down: 'ArrowDown', up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight' }
    if (e.key === keys[direction] && !pulled && !finishing) { e.preventDefault(); finish() }
  }

  const share = pulled || finishing ? 1 : drag ?? 0
  return (
    <div ref={self} className={`kit-pull ${className}`} data-direction={direction}
      data-dragging={drag !== null || undefined} data-pulled={pulled || finishing || undefined}
      style={{ '--kit-pull': share, '--kit-pull-travel': travel, '--kit-pull-grip': grip,
        ...(glideMs !== null && { '--kit-pull-glide': `${glideMs}ms` }) } as CSSProperties}>
      {children && <div className="kit-pull-look" aria-hidden="true">{children}</div>}
      <button type="button" className="kit-pull-grip" aria-label={label} disabled={disabled}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
        onClick={onClick} onKeyDown={onKeyDown} />
    </div>
  )
}

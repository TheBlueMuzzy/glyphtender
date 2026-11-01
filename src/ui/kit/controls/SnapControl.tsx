// SNAP CONTROL (0.13.0) — a knob the player moves between fixed stops by DRAGGING it or TAPPING: a slider with snap
// positions (kind="slide") or a rotary dial with snap angles (kind="turn"). Goops: the console's repair sliders and dial.
// It knows no rules: it says which stop it was moved to (onChange) and shows `value`; the game decides what's right.
//   <SnapControl label="Laser slider 1" stops={3} value={pos} onChange={setPos} knob={0.29}><img src="handle.svg" alt="" /></SnapControl>
//   <SnapControl kind="turn" label="Dial" angles={[310, 50, 140, 220]} value={corner} onChange={setCorner}><img src="dial.svg" alt="" /></SnapControl>
// slide: the control's box is the TRACK (the game's art underneath); the knob (children) is `knob` of its length and
//   sits at stop 0 = left (axis x) / top (axis y) … last stop = the other end. turn: the box is the dial; the knob turns
//   to angles[value] (degrees clockwise from straight up), the shortest way round.
// Drag: the knob follows the finger from where it IS (never jumps to the finger), and on letting go settles at the
//   nearest stop. A dial turns by how far the finger goes round its centre (near the centre it waits — tiny moves there
//   would spin it). Tap (no drag): a slide goes to the stop nearest the tap (tapping the knob itself steps it toward
//   that side); a dial steps to its next stop clockwise. A press that moved is a drag, never also a tap — whatever the
//   game does with it. Keys: arrows step it, Home / End, Enter / Space = a tap. Read out as a slider (aria-valuetext).
// The hit area is the whole box, at least target-min both ways, centred on it — so a thin track is still easy to grab.
// The live position is on the control as --kit-snap (slide: 0 → 1 · turn: degrees), so a game's art can follow it.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { controlSound } from './controlSound'

type SnapControlProps = {
  label: string
  value: number
  onChange: (index: number) => void
  kind?: 'slide' | 'turn'
  stops?: number // slide: how many evenly spaced stops (≥ 2)
  angles?: number[] // turn: the stops, in degrees clockwise from up
  axis?: 'x' | 'y' // slide: along its width or its height
  knob?: number // slide: the knob's share of the track's length
  disabled?: boolean
  valueText?: (index: number) => string
  className?: string
  children?: ReactNode
}

const TAP_SLOP = 0.5 // rem a press may wander and still count as a tap
const DIAL_DEAD = 0.2 // share of the dial's radius round its centre where the finger doesn't turn it

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
// the copy of `angle` (± whole turns) closest to `near` — so a dial always turns the short way round
export const nearestTurn = (angle: number, near: number) => near + wrap180(angle - near)
// the stop nearest a slide position (0 → 1)
export const nearestStop = (pos: number, stops: number) => clamp(Math.round(pos * (stops - 1)), 0, stops - 1)
// the angle stop nearest a dial angle
export const nearestAngle = (angle: number, angles: number[]) =>
  angles.reduce((best, a, i) => (Math.abs(wrap180(a - angle)) < Math.abs(wrap180(angles[best] - angle)) ? i : best), 0)
// the next stop clockwise from stop `i` (by angle, whatever order the list is in)
export const nextClockwise = (i: number, angles: number[], dir: 1 | -1 = 1) => {
  const from = angles[i]
  let best = i, bestGap = Infinity
  angles.forEach((a, j) => {
    if (j === i) return
    const gap = (((a - from) * dir) % 360 + 360) % 360 || 360
    if (gap < bestGap) { bestGap = gap; best = j }
  })
  return best
}

export function SnapControl({ label, value, onChange, kind = 'slide', stops = 3, angles = [0, 90, 180, 270], axis = 'x', knob = 0.3,
  disabled, valueText, className = '', children }: SnapControlProps) {
  const turn = kind === 'turn'
  const count = turn ? angles.length : Math.max(2, stops)
  const at = clamp(Math.round(value), 0, count - 1)
  const [drag, setDrag] = useState<number | null>(null) // live position while a finger holds it
  // a dial's resting angle, unwrapped (so it always turns the short way round), and the stop it's for
  // (state, adjusted while drawing when the stop changes — React's way; refs may not be read while drawing)
  const [rest, setRest] = useState(() => ({ angle: turn ? angles[at] : 0, at }))
  if (turn && rest.at !== at) setRest({ angle: nearestTurn(angles[at], rest.angle), at })
  const self = useRef<HTMLDivElement>(null)
  const press = useRef<{ id: number; x: number; y: number; moved: boolean; from: number; last: number } | null>(null)

  const posOf = (i: number) => i / (count - 1)
  const resting = turn ? rest.angle : posOf(at)
  const shown = drag ?? resting
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const box = () => self.current!.getBoundingClientRect()
  const angleAt = (x: number, y: number) => {
    const r = box(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    return { angle: (Math.atan2(x - cx, cy - y) * 180) / Math.PI, near: Math.hypot(x - cx, y - cy) < (DIAL_DEAD * Math.min(r.width, r.height)) / 2 }
  }
  const go = (i: number) => {
    if (i === at || disabled) return
    controlSound('tap')
    onChange(i)
  }
  // a tap: slide → the stop nearest the tap (on the knob itself: one step toward that side); turn → next clockwise
  const tap = (x: number, y: number) => {
    if (turn) return go(nextClockwise(at, angles))
    const r = box(), len = axis === 'x' ? r.width : r.height, along = (axis === 'x' ? x - r.left : y - r.top) - (len * knob) / 2
    const p = clamp(along / Math.max(1, len * (1 - knob)), 0, 1)
    let j = nearestStop(p, count)
    if (j === at) j = clamp(at + (p > posOf(at) ? 1 : -1), 0, count - 1)
    if (j === at) j = clamp(at + (p > posOf(at) ? -1 : 1), 0, count - 1)
    go(j)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, from: resting, last: turn ? angleAt(e.clientX, e.clientY).angle : 0 }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = press.current
    if (!p || p.id !== e.pointerId || !self.current) return
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < TAP_SLOP * remPx()) return
    p.moved = true
    if (turn) {
      const { angle, near } = angleAt(e.clientX, e.clientY)
      if (near) return
      p.from += wrap180(angle - p.last) // how far round the finger went since last time
      p.last = angle
      setDrag(p.from)
    } else {
      const r = box(), len = axis === 'x' ? r.width : r.height
      const moved = (axis === 'x' ? e.clientX - p.x : e.clientY - p.y) / Math.max(1, len * (1 - knob))
      setDrag(clamp(p.from + moved, 0, 1))
    }
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    if (!p.moved) { setDrag(null); tap(e.clientX, e.clientY); return }
    const end = drag ?? resting
    setDrag(null)
    if (turn) {
      const j = nearestAngle(end, angles)
      // settle from where the finger left it, the short way
      // (a game that refuses the move: `value` stays, and the dial turns back to it)
      setRest({ angle: nearestTurn(angles[j], end), at: j })
      go(j)
    } else go(nearestStop(end, count))
  }
  function onPointerCancel() { press.current = null; setDrag(null) }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const back = turn ? ['ArrowLeft', 'ArrowUp'] : axis === 'x' ? ['ArrowLeft'] : ['ArrowUp']
    const fwd = turn ? ['ArrowRight', 'ArrowDown'] : axis === 'x' ? ['ArrowRight'] : ['ArrowDown']
    let j: number | null = null
    if (back.includes(e.key)) j = turn ? nextClockwise(at, angles, -1) : clamp(at - 1, 0, count - 1)
    else if (fwd.includes(e.key)) j = turn ? nextClockwise(at, angles) : clamp(at + 1, 0, count - 1)
    else if (e.key === 'Home' && !turn) j = 0
    else if (e.key === 'End' && !turn) j = count - 1
    else if (e.key === 'Enter' || e.key === ' ') j = turn ? nextClockwise(at, angles) : at === count - 1 ? count - 2 : at + 1
    if (j === null) return
    e.preventDefault()
    go(j)
  }

  const vars = { '--kit-snap': +shown.toFixed(4), '--kit-snap-knob': knob } as CSSProperties
  return (
    <div ref={self} className={`kit-snap ${className}`} data-kind={kind} data-axis={turn ? undefined : axis}
      data-dragging={drag !== null || undefined} data-disabled={disabled || undefined} style={{ ...vars }}>
      <div className="kit-snap-knob" aria-hidden="true">{children}</div>
      <div className="kit-snap-hit" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled || undefined}
        aria-orientation={turn ? undefined : axis === 'x' ? 'horizontal' : 'vertical'}
        aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={at} aria-valuetext={valueText?.(at)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown} />
    </div>
  )
}

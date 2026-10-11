// The shapes a turn trail is drawn with (TurnTrail.tsx) and the thrown seed's curve (useThrow.ts) — plain maths,
// tested in trailShape.test.ts. (No cast ARC — Muzzy: casts are straight-line shots; a cast is a straight dotted line
// like the move's, glyphling → seed, in the cast shade. The flight is separate.)
import { hexToPixel, type Hex } from '../engine/hex'

type Point = { x: number; y: number }

/** The bezier handle of a throw from a to b (screen points): above the middle, higher for a longer throw. */
export function throwHandle(a: Point, b: Point, arcHeight: number): Point {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - distance * arcHeight * 2 }
}

const n = (v: number) => +v.toFixed(3)

/** A straight line from hex to hex, as an SVG path (the move: glyphlings move along leylines). */
export function movePath(from: Hex, to: Hex, size: number): string {
  const a = hexToPixel(from, size), b = hexToPixel(to, size)
  return `M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}`
}

/**
 * When each part of a replayed trail draws on, as [start, end] shares of trailLead:
 * the from ring → the dotted path → the to ring → the dotted cast line → the target ring. A move-only turn's parts
 * spread over the whole lead.
 */
export function drawSteps(cast: boolean): Record<'from' | 'path' | 'to' | 'castPath' | 'target', [number, number]> {
  return cast
    ? { from: [0, 0.15], path: [0.1, 0.45], to: [0.4, 0.55], castPath: [0.5, 0.85], target: [0.8, 1] }
    : { from: [0, 0.25], path: [0.15, 0.8], to: [0.7, 1], castPath: [1, 1], target: [1, 1] }
}

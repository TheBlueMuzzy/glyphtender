// TARGET FEEDBACK — what the TARGET side shows while a piece is carried (carry.ts is what you hold). Like carry.ts it
// knows nothing about any game or its rules: the Table referee says which spots are valid; this only draws.
// A game picks per drag type ("draft", "plan a seed", "reorder the tray"…) from:
//   highlight        — the valid spots light up (the game's own drawing, as today)
//   ghost preview    — a see-through copy of the piece sits on the spot it would land on   (createPreview)
//   insertion marker — a graphic between two items of a hand, where the piece would go     (insertionIndex + HandView insertAt)
//   make room        — the hand's items slide apart at that gap                             (HandView makeRoomAt)
//   tether           — a line (or gentle curve) with an arrow from the piece's home to the pointer (createTether)
//   magnetic snap    — near a valid spot, the carried piece is pulled toward it            (snapTarget + carrier.move(at, snap))
// Everything moves by direct element changes (never React state per pointer move). Reduce motion → no animation.
import type { CarryFeel, Point } from './carry'

/** The tuning numbers. A game keeps them in content/tuning (next to its CarryFeel) so they can be dialled in. */
export type TargetFeel = {
  makeRoom: number // a hand's items slide apart by this share of a place, in all (0.35) — HandView look.makeRoom
  roomTime: number // seconds the sliding apart (and back) takes (0.15) — HandView motion.roomTime
  snapRadius: number // a valid spot pulls once the pointer is within this share of a piece's size of it (0.6)
  snapPull: number // how strongly it pulls: 0 = not at all, 1 = right onto the spot (0.5)
  tetherBend: number // the tether's curve: 0 = a straight line, 0.15 = bowed by 15% of its length (0.15)
  arrowSize: number // the tether's arrow head, in the svg's units (pixels); 0 = no head (12)
}

export const DEFAULT_TARGET_FEEL: TargetFeel = {
  makeRoom: 0.35, roomTime: 0.15, snapRadius: 0.6, snapPull: 0.5, tetherBend: 0.15, arrowSize: 12,
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// ── INSERTION MARKER ─────────────────────────────────────────────────────────────────────────────────────────
/** Which gap of a hand the pointer is at: 0 = before the first place, n = after the last (n = how many places).
 *  It finds the nearest place, then picks the gap on the pointer's side of it (left or right). (Pure.) */
export function insertionIndex(pointer: Point, placeCentres: readonly Point[]): number {
  if (placeCentres.length === 0) return 0
  let nearest = 0
  placeCentres.forEach((centre, i) => {
    if (distance(pointer, centre) < distance(pointer, placeCentres[nearest])) nearest = i
  })
  return pointer.x < placeCentres[nearest].x ? nearest : nearest + 1
}

// ── MAGNETIC SNAP ────────────────────────────────────────────────────────────────────────────────────────────
/** The nearest candidate (a valid spot) within `radius` pixels of the pointer, or null. A game usually passes
 *  radius = feel.snapRadius × the piece's size. Candidates can carry anything else (an id…) — it is handed back. (Pure.) */
export function snapTarget<T extends Point>(pointer: Point, candidates: readonly T[], radius: number): T | null {
  let best: T | null = null
  for (const candidate of candidates) {
    const d = distance(pointer, candidate)
    if (d <= radius && (best === null || d < distance(pointer, best))) best = candidate
  }
  return best
}

/** What the carrier's move() takes to show a snap: the spot, how strongly it pulls, and how far it reaches. */
export type Snap = { to: Point; pull: number; radius: number }

/** Where the carried piece shows while a spot pulls it: moved a share of the way toward the spot. The share grows
 *  from nothing at the edge of the radius, so the piece never jumps as the pull starts. (Pure.) */
export function pulledToward(at: Point, { to, pull, radius }: Snap): Point {
  const d = distance(at, to)
  if (radius <= 0 || d >= radius) return at
  const share = pull * (1 - d / radius)
  return { x: at.x + (to.x - at.x) * share, y: at.y + (to.y - at.y) * share }
}

// ── GHOST PREVIEW ────────────────────────────────────────────────────────────────────────────────────────────
type Styled = Element & { style: CSSStyleDeclaration }

export type Preview = {
  /** Show the see-through copy with its centre at `at`, `size` px across. Showing it at a new spot just moves it. */
  show: (at: Point, size: number) => void
  hide: () => void
  readonly showing: boolean
}

/** A ghost preview on `el` (the game's copy of the piece, in the same kind of layer as the carrier's). Hidden until
 *  show. Its see-through-ness is CarryFeel.ghostOpacity, read on every show so live tuning applies. It never catches
 *  the pointer (so the game can still find the spot under it). */
export function createPreview(el: Styled, feel: () => Pick<CarryFeel, 'ghostOpacity'>): Preview {
  let showing = false
  el.style.pointerEvents = 'none'
  return {
    get showing() { return showing },
    show(at, size) {
      showing = true
      el.style.transform = `translate(${at.x - size / 2}px, ${at.y - size / 2}px)`
      el.style.opacity = String(feel().ghostOpacity)
      el.style.visibility = 'visible'
    },
    hide() { showing = false; el.style.visibility = 'hidden' },
  }
}

// ── TETHER ───────────────────────────────────────────────────────────────────────────────────────────────────
export type Tether = {
  /** Start drawing from `from` (the piece's home centre) to `to` (the pointer). */
  show: (from: Point, to: Point) => void
  /** Follow the pointer. */
  update: (to: Point) => void
  hide: () => void
  readonly showing: boolean
}

/** The path's `d` for a tether from → to: a straight line or a gentle curve (bend), with an arrow head of `arrow`
 *  units at the pointer's end (0 = none). (Pure.) */
export function tetherPath(from: Point, to: Point, bend: number, arrow: number): string {
  const length = distance(from, to)
  if (length === 0) return ''
  // The curve's control point: the middle, pushed sideways by bend × length
  const nx = -(to.y - from.y) / length
  const ny = (to.x - from.x) / length
  const c = { x: (from.x + to.x) / 2 + nx * bend * length, y: (from.y + to.y) / 2 + ny * bend * length }
  const r = (n: number) => Math.round(n * 10) / 10
  let d = bend === 0 ? `M${r(from.x)} ${r(from.y)} L${r(to.x)} ${r(to.y)}` : `M${r(from.x)} ${r(from.y)} Q${r(c.x)} ${r(c.y)} ${r(to.x)} ${r(to.y)}`
  if (arrow > 0) {
    // The head points along the line's last stretch (from the control point to the tip), two wings 30° to each side
    const back = Math.atan2(c.y - to.y, c.x - to.x)
    const wing = (turn: number) => `${r(to.x + Math.cos(back + turn) * arrow)} ${r(to.y + Math.sin(back + turn) * arrow)}`
    d += ` M${wing(Math.PI / 6)} L${r(to.x)} ${r(to.y)} L${wing(-Math.PI / 6)}`
  }
  return d
}

/** A tether on `path` (an svg <path> the game puts in a layer over the play area, points in that svg's units).
 *  Its colour and width come from the kit's .kit-tether class (var(--primary)) — the game's own CSS can restyle it,
 *  or pass `color` (a colour name like 'var(--accent)'). `arrow: false` = no head. `feel` is read on every update. */
export function createTether(
  path: SVGPathElement,
  { color, arrow = true, feel = () => DEFAULT_TARGET_FEEL }: { color?: string; arrow?: boolean; feel?: () => TargetFeel } = {},
): Tether {
  let from: Point = { x: 0, y: 0 }
  let showing = false
  path.classList.add('kit-tether')
  path.style.pointerEvents = 'none'
  if (color) path.style.stroke = color
  const draw = (to: Point) => {
    const f = feel()
    path.setAttribute('d', tetherPath(from, to, f.tetherBend, arrow ? f.arrowSize : 0))
  }
  return {
    get showing() { return showing },
    show(start, to) { from = start; showing = true; draw(to); path.style.visibility = 'visible' },
    update(to) { if (showing) draw(to) },
    hide() { showing = false; path.style.visibility = 'hidden' },
  }
}

// HAND VIEW — a player's hand drawn as a rack: a row (or two) of places, one SVG. Preset "rack" (a "fan" comes later).
// It knows nothing about any game. It only POSITIONS the places and ANIMATES them; the game draws:
//   renderEmpty(spot)          — an empty place's look. Drawn in EVERY place, under the piece (a free place shows only this).
//   renderPiece(place, spot)   — the piece on a place (its art, and any ring/halo the game wants for held or aimed).
// The order of the places comes from the game (the table module's rack order: table/kit/rack.ts — GAP = an empty place).
//
// Each place (HandPlace) says:
//   key      — a stable name for its drawing (the piece's id, or e.g. "empty-3"), so a piece keeps its element when it moves
//   piece    — whatever the game needs to draw it (an id, a letter…); leave it out for an empty place
//   attrs    — data attributes for the place's group, e.g. { 'data-tray-pos': 3, 'data-hand': 'seed-2' }:
//              the game's input code finds places with them (el.closest('[data-tray-pos]'))
//   held     — lifted a little (look.lift) and marked data-held
//   aimed    — the piece is aimed somewhere else (e.g. on the board): the place is drawn see-through (look.aimedOpacity)
//   waiting  — dimmed (look.waitingOpacity), e.g. "make a move first" or someone else's turn
//   staged   — takes part in the shrink / grow stage below
//   origin   — its piece is being carried (a drag): 'ghost' = a faint mark at home (look.ghostOpacity), 'empty' = only the
//              empty look shows. The place keeps its attributes, so a drop back home still finds it. (drag/carry.ts
//              originWhileCarried(style) gives this from the game's carry style.)
// hidden (whole view) — the device is being passed on: every place shows only its empty look, with no attributes.
//
// SHRINK → GROW (swapping pieces): the game sets `stage` and marks the places taking part `staged`:
//   out   — their pieces shrink away, one place after the next (motion.shrinkTime, motion.stagger)
//   gone  — they stay away (only the empty look shows), e.g. while waiting for the server's new pieces
//   in    — the new pieces grow into those places, with a small overshoot (motion.growTime, motion.overshoot)
//   (none) — done. The game runs the clock (how long each stage lasts); the view only plays the animation.
// The svg says the stage (data-refresh-stage) and each animated piece sits in a group marked data-refresh-slot.
// Web Animations on those groups, never React state per frame. Reduce motion → no animation, it just happens.
//
// TARGET FEEDBACK while a piece is dragged over the hand (drag/target.ts — insertionIndex(pointer, centres) says
// which gap the pointer is at: 0 = before the first place, places.length = after the last):
//   insertAt + renderMarker(gap) — the game's marker graphic (not the piece) drawn at that gap; gap = its centre
//   makeRoomAt                    — the places on each side of that gap (in its row) slide apart by look.makeRoom
//                                   of a place, in all; leaving it out slides them back (motion.roomTime, a CSS
//                                   transition on each place's inner .kit-hand-room group). Reduce motion → no slide.
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { reduceMotion } from '../blocks/motion'
import { DEFAULT_TARGET_FEEL } from '../drag/target'
import { rackLeft, rackPlaceCentre, type RackLayout } from './rackLayout'

export type HandStage = 'out' | 'gone' | 'in'

export type HandPlace<Piece = unknown> = {
  key?: string
  piece?: Piece
  attrs?: Record<`data-${string}`, string | number | undefined>
  held?: boolean
  aimed?: boolean
  waiting?: boolean
  staged?: boolean
  origin?: 'ghost' | 'empty'
}

/** Where a place is drawn: its number (left to right, then the next row), its centre and its size, in pixels. */
export type HandSpot = { index: number; x: number; y: number; tile: number }

/** The look of the states, as shares of a place's size and opacities. The defaults are Glyphtender's seed tray. */
export type HandLook = {
  lift?: number // a held piece rises this share of a place's size (0.08)
  headroom?: number // room above the top row, as a share of a place's size, so a lifted piece isn't cut off (0.1)
  waitingOpacity?: number // (0.55)
  aimedOpacity?: number // (0.8)
  ghostOpacity?: number // a carried piece's faint mark at home (0.45 — the same as drag/carry.ts DEFAULT_CARRY_FEEL)
  makeRoom?: number // makeRoomAt opens the gap by this share of a place, in all (0.35 — drag/target.ts DEFAULT_TARGET_FEEL)
}

/** Shrink / grow timings in seconds, and easings (any CSS easing). */
export type HandMotion = {
  shrinkTime: number
  growTime: number
  stagger: number // the wait between one place and the next
  overshoot: number // how much bigger a new piece grows before settling (0.15 = 15% bigger)
  shrinkEasing?: string // ('ease-in')
  growEasing?: string // ('ease-out')
  roomTime?: number // sliding apart for makeRoomAt, and back (0.15 — drag/target.ts DEFAULT_TARGET_FEEL)
  roomEasing?: string // ('ease-out')
}

export type HandViewProps<Piece = unknown> = {
  /** From rackLayout(): place size, rows and columns. */
  layout: RackLayout
  /** How wide the view's box is; the places sit in its middle (a side panel can be wider than the rack). */
  boxWidth: number
  places: HandPlace<Piece>[]
  renderEmpty: (spot: HandSpot) => ReactNode
  renderPiece?: (place: HandPlace<Piece>, spot: HandSpot) => ReactNode
  hidden?: boolean
  stage?: HandStage
  motion?: HandMotion
  look?: HandLook
  /** Added to the svg's own kit-hand class (e.g. the game's "game-tray"). */
  className?: string
  /** What a screen reader calls the hand ("Seeds"). */
  label?: string
  /** A drag is over the hand: draw renderMarker at this gap (drag/target.ts insertionIndex gives it). */
  insertAt?: number
  /** The insertion marker's look — a graphic the game draws, centred on `gap` (its index = insertAt). */
  renderMarker?: (gap: HandSpot) => ReactNode
  /** Slide the places apart at this gap, making room for the carried piece. */
  makeRoomAt?: number
}

const DEFAULT_MOTION: HandMotion = { shrinkTime: 0.25, growTime: 0.35, stagger: 0.08, overshoot: 0.15 }

export function HandView<Piece>({
  layout, boxWidth, places, renderEmpty, renderPiece, hidden, stage, motion = DEFAULT_MOTION, look = {}, className, label,
  insertAt, renderMarker, makeRoomAt,
}: HandViewProps<Piece>) {
  const svg = useRef<SVGSVGElement>(null)
  const { lift = 0.08, headroom = 0.1, waitingOpacity = 0.55, aimedOpacity = 0.8, ghostOpacity = 0.45 } = look
  const { makeRoom = DEFAULT_TARGET_FEEL.makeRoom } = look
  const { shrinkTime, growTime, stagger, overshoot, shrinkEasing = 'ease-in', growEasing = 'ease-out' } = motion
  const { roomTime = DEFAULT_TARGET_FEEL.roomTime, roomEasing = 'ease-out' } = motion

  // The stage: shrink the staged pieces away ("out"), or grow the new ones in ("in"), place after place
  useLayoutEffect(() => {
    if (!stage || stage === 'gone' || reduceMotion()) return
    const groups = svg.current?.querySelectorAll<SVGGElement>('[data-refresh-slot]') ?? [] // (left to right)
    groups.forEach((group, i) => {
      if (typeof group.animate !== 'function') return // (no Web Animations here, e.g. a test page)
      const delay = i * stagger * 1000
      if (stage === 'out') {
        group.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }],
          { duration: shrinkTime * 1000, delay, easing: shrinkEasing, fill: 'forwards' })
      } else {
        group.animate([{ transform: 'scale(0)' }, { transform: `scale(${1 + overshoot})`, offset: 0.7 }, { transform: 'scale(1)' }],
          { duration: growTime * 1000, delay, easing: growEasing, fill: 'backwards' })
      }
    })
  }, [stage, shrinkTime, growTime, stagger, overshoot, shrinkEasing, growEasing])

  const { tile } = layout
  const spotOf = (index: number): HandSpot => ({ index, tile, ...rackPlaceCentre(layout, boxWidth, index) })
  const rowOf = (index: number) => Math.floor(index / layout.columns)
  const step = layout.columns > 1 ? spotOf(1).x - spotOf(0).x : tile // one place + one gap, sideways

  // A gap (0 = before the first place, places.length = after the last): its centre, and which row it is in.
  // It sits just right of the place before it (so in a 2-row rack the gap after a row's last place ends that row);
  // gap 0 sits just left of the first place.
  const gapOf = (at: number): HandSpot & { row: number } => {
    const gap = Math.max(0, Math.min(places.length, at))
    const beside = gap === 0 ? spotOf(0) : spotOf(gap - 1)
    return { ...beside, index: gap, x: beside.x + (gap === 0 ? -step : step) / 2, row: rowOf(Math.max(0, gap - 1)) }
  }
  // Making room: how far a place slides sideways (places before the gap go left, the rest go right — its row only)
  const room = makeRoomAt === undefined || hidden ? null : gapOf(makeRoomAt)
  const shiftOf = (index: number) =>
    room === null || rowOf(index) !== room.row ? 0 : ((index < room.index ? -1 : 1) * makeRoom * tile) / 2
  const roomTransition = `${reduceMotion() ? 0 : roomTime}s`

  const drawn = places.map((place, index) => {
    const spot = spotOf(index)
    // Passing the device on: nobody sees (or can pick) the pieces
    if (hidden) return <g key={`hidden-${index}`}>{renderEmpty(spot)}</g>
    const gone = place.staged && stage === 'gone'
    let piece: ReactNode = place.piece === undefined || gone || place.origin === 'empty' ? null : renderPiece?.(place, spot)
    // Carried away with a mark left at home: only the piece goes faint, never the empty look under it
    if (piece !== null && place.origin === 'ghost') piece = <g opacity={ghostOpacity} data-carried-from="">{piece}</g>
    // A staged piece sits in its own group, made fresh for each stage, so its animation starts from the beginning
    if (piece !== null && place.staged && stage) {
      piece = <g key={`stage-${stage}`} data-refresh-slot={index} className="kit-hand-staged">{piece}</g>
    }
    const opacity = place.aimed ? aimedOpacity : place.waiting ? waitingOpacity : undefined
    return (
      <g key={place.key ?? `place-${index}`} {...place.attrs} data-held={place.held || undefined}
        data-carried={place.origin}
        transform={place.held ? `translate(0 ${-tile * lift})` : undefined} opacity={opacity}>
        <g className="kit-hand-room"
          style={{ '--kit-hand-shift': `${shiftOf(index)}px`, '--kit-hand-room-time': roomTransition, '--kit-hand-room-ease': roomEasing } as CSSProperties}>
          {renderEmpty(spot)}
          {piece}
        </g>
      </g>
    )
  })

  const width = rackLeft(layout, boxWidth) * 2 + layout.width
  const top = tile * headroom
  return (
    <svg ref={svg} className={className ? `kit-hand ${className}` : 'kit-hand'} data-refresh-stage={stage}
      width={width} height={layout.height + top} viewBox={`0 ${-top} ${width} ${layout.height + top}`}
      role="group" aria-label={label}>
      {drawn}
      {insertAt !== undefined && !hidden && renderMarker && (
        <g className="kit-hand-marker" data-insert-at={gapOf(insertAt).index} pointerEvents="none">{renderMarker(gapOf(insertAt))}</g>
      )}
    </svg>
  )
}

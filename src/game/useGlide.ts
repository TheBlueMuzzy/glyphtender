// THE MOVE GLIDE — whenever a glyphling is drawn on a different hex than last time, it slides there
// instead of jumping. It only looks at "was on A, is now on B", so every source animates the same way:
// planning a move (tap/drop), taking it back (Undo / tap the ghost), the dev hook, and later the other
// players' moves arriving online. Each glyphling's group is [data-glide="id"] in Board.tsx.
// The browser animates it (Web Animations API) — no React state per frame. Reduce motion → instant.
// Sound: glyph.step as the PLANNED move's glide settles (`stepping` = the glyphling in the plan — a person's, an AI's
// or an online replay's). Undo has its own sound, and a jump (no plan) is silent. Reduce motion: at once.
// A glyphling a drag has already SET DOWN on its new hex (a carry style that settles there, usePieceInput) doesn't glide:
// arrivedOn(id, hex) just before the move is planned — it's there already, so it just stays (one motion, never two).
// A PLANNED move glides in the move's carry style (drag.json styles.move; ui-kit travellingLook) — lifted, bigger,
// shadowed on the way, set down at the end — so an AI's or an online rival's move (and a tapped one) looks like a
// person's drag (Muzzy 2026-10-10: "if the player's actions look a specific way, so too should the AI's"). A style
// that flies the real piece (C) glides as itself. Taking a move back (Undo) never lifts.
// And when a person's move drag shows an AIM LINE (drag.json targets.move = tether), a planned move's glide draws the
// same straight line from where it started to the gliding glyphling, gone as it lands (the drag layer's [data-tether]).
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { hexKey, type Hex } from '../engine/hex'
import { playSound } from '../audio'
import { carryStyle, createTether, liftShadowFilter, reduceMotion, travellingLook } from '../ui/kit'
import { dragTuning, targetFeel } from './dragTuning'
import { glideFrames, glideSeconds, offsetBetween, type Offset } from './glide'
import { HEX } from './useThrow'
import type { AnimTuning } from './useTuning'

// Glyphlings set down by a drag, and where (read — and forgotten — by the next change of spots)
let arrivals = new Map<number, string>()

/** A drag has set glyphling `id` down on `hex` itself: its next change of spot to there is instant. */
export const arrivedOn = (id: number, hex: Hex) => { arrivals.set(id, hexKey(hex)) }

/** `aimColour` = the colour of the planned move's aim line (its player's). */
export function useGlide(svgRef: RefObject<SVGSVGElement | null>, spots: { id: number; hex: Hex }[], timing: AnimTuning, stepping: number | null, aimColour?: string) {
  const drawnAt = useRef(new Map<number, Hex>()) // where each glyphling was drawn last time
  const key = spots.map((s) => `${s.id}@${hexKey(s.hex)}`).join(' ')

  useLayoutEffect(() => {
    const before = drawnAt.current
    drawnAt.current = new Map(spots.map((s) => [s.id, s.hex])) // glyphlings that left the board are forgotten
    const svg = svgRef.current
    const setDown = arrivals
    arrivals = new Map()
    for (const { id, hex } of spots) {
      const from = before.get(id)
      if (!from || hexKey(from) === hexKey(hex)) continue
      const still = reduceMotion() || setDown.get(id) === hexKey(hex)
      if (id === stepping) playSound('glyph.step', { at: performance.now() + (still ? 0 : glideSeconds(from, hex, timing) * 1000) })
      if (!svg || still) continue
      const group = svg.querySelector<SVGGElement>(`[data-glide="${id}"]`)
      if (!group) continue
      // Start from where it is on screen right now (it may still be gliding from an earlier change)
      const start = addOffsets(offsetBetween(from, hex, HEX), stillToGo(group))
      group.getAnimations().forEach((a) => a.cancel())
      const frames = glideFrames(start, timing.moveSettle).map((f) => ({
        offset: f.offset, transform: `translate(${f.x}px, ${f.y}px)`, easing: 'ease-in-out',
      }))
      const seconds = glideSeconds(from, hex, timing)
      group.animate(frames, { duration: seconds * 1000 })
      if (id === stepping) {
        liftOnTheWay(group, seconds)
        aimLineOnTheWay(group, seconds, aimColour)
      }
    }
    // Only a change of spots starts a glide (timing is read when it starts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

/** The planned move's glyphling wears the move's carry style while it glides: lifted in its first moment (liftTime),
 *  carried the whole way, set down in its last (landTime) — the same look and times as a person's drag. */
function liftOnTheWay(group: SVGGElement, seconds: number) {
  const lift = group.querySelector<SVGGElement>('[data-lift]')
  const feel = dragTuning.current
  const look = travellingLook(carryStyle(feel.styles.move), feel)
  if (!lift || !look || seconds <= 0) return
  lift.getAnimations().forEach((a) => a.cancel())
  const size = Number(group.querySelector('image')?.getAttribute('width') ?? 0)
  const rest = { transform: 'scale(1)', opacity: 1, filter: 'none' }
  const carried = { transform: `scale(${look.scale})`, opacity: look.opacity, filter: liftShadowFilter(size, look.shadow) }
  const up = Math.min(feel.liftTime / seconds, 0.4), down = Math.max(1 - feel.landTime / seconds, 0.6)
  lift.animate([{ ...rest, offset: 0 }, { ...carried, offset: up }, { ...carried, offset: down }, { ...rest, offset: 1 }],
    { duration: seconds * 1000, easing: 'ease-out' })
}

/** A planned move's aim line, like a person's move drag shows (targets.move = tether): from the glyphling's start to
 *  wherever it is on its way, each frame, until it lands. Drawn on the drag layer's aim line (nobody drags meanwhile). */
function aimLineOnTheWay(group: SVGGElement, seconds: number, colour: string | undefined) {
  const path = document.querySelector<SVGPathElement>('.game-drag-layer [data-tether]')
  const layer = document.querySelector('.game-drag-layer')?.getBoundingClientRect()
  if (dragTuning.current.targets.move !== 'tether' || !path || !layer || seconds <= 0) return
  const image = group.querySelector('image')
  const centre = () => {
    const r = (image ?? group).getBoundingClientRect()
    return { x: r.left + r.width / 2 - layer.left, y: r.top + r.height / 2 - layer.top }
  }
  const line = createTether(path, { color: colour, feel: targetFeel })
  line.show(centre(), centre()) // (the glide has just started: it is at its start)
  const start = performance.now()
  const follow = () => {
    if (performance.now() - start >= seconds * 1000) return line.hide()
    line.update(centre())
    requestAnimationFrame(follow)
  }
  requestAnimationFrame(follow)
}

/** If a glide is still running, how far the group is from where it was heading (else 0, 0). */
function stillToGo(group: SVGGElement): Offset {
  if (group.getAnimations().length === 0) return { x: 0, y: 0 }
  const m = new DOMMatrix(getComputedStyle(group).transform)
  return { x: m.e, y: m.f }
}

const addOffsets = (a: Offset, b: Offset): Offset => ({ x: a.x + b.x, y: a.y + b.y })

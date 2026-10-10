// THE MOVE GLIDE — whenever a glyphling is drawn on a different hex than last time, it slides there
// instead of jumping. It only looks at "was on A, is now on B", so every source animates the same way:
// planning a move (tap/drop), taking it back (Undo / tap the ghost), the dev hook, and later the other
// players' moves arriving online. Each glyphling's group is [data-glide="id"] in Board.tsx.
// The browser animates it (Web Animations API) — no React state per frame. Reduce motion → instant.
// Sound: glyph.step as the PLANNED move's glide settles (`stepping` = the glyphling in the plan — a person's, an AI's
// or an online replay's). Undo has its own sound, and a jump (no plan) is silent. Reduce motion: at once.
// A glyphling a drag has already SET DOWN on its new hex (a carry style that settles there, usePieceInput) doesn't glide:
// arrivedOn(id, hex) just before the move is planned — it's there already, so it just stays (one motion, never two).
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { hexKey, type Hex } from '../engine/hex'
import { playSound } from '../audio'
import { reduceMotion } from '../ui/kit'
import { glideFrames, glideSeconds, offsetBetween, type Offset } from './glide'
import { HEX } from './useThrow'
import type { AnimTuning } from './useTuning'

// Glyphlings set down by a drag, and where (read — and forgotten — by the next change of spots)
let arrivals = new Map<number, string>()

/** A drag has set glyphling `id` down on `hex` itself: its next change of spot to there is instant. */
export const arrivedOn = (id: number, hex: Hex) => { arrivals.set(id, hexKey(hex)) }

export function useGlide(svgRef: RefObject<SVGSVGElement | null>, spots: { id: number; hex: Hex }[], timing: AnimTuning, stepping: number | null) {
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
      group.animate(frames, { duration: glideSeconds(from, hex, timing) * 1000 })
    }
    // Only a change of spots starts a glide (timing is read when it starts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

/** If a glide is still running, how far the group is from where it was heading (else 0, 0). */
function stillToGo(group: SVGGElement): Offset {
  if (group.getAnimations().length === 0) return { x: 0, y: 0 }
  const m = new DOMMatrix(getComputedStyle(group).transform)
  return { x: m.e, y: m.f }
}

const addOffsets = (a: Offset, b: Offset): Offset => ({ x: a.x + b.x, y: a.y + b.y })

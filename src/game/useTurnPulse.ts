// THE TURN PULSE on screen — the glyphlings pulsingGlyphlings() names breathe: a small, slow swell
// (feel.json turnPulse tier → grow; anim.json turnPulseTime). Each one's [data-pulse] group in Board.tsx.
// The browser animates it (Web Animations API, looping) — no React state per frame. Reduce motion → no pulse.
// Sound: turn.yours when the pulse STARTS a turn (it only pulses on this device's own turn — pass-and-play: after
// "Show my seeds"); not again when it restarts in the same turn (a glyphling let go, a move undone). Reduce motion:
// no pulse, the chime still plays. Right after a jump (a load, an online rejoin) it stays quiet (sound.ts appearing).
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useGameStore } from '../store/gameStore'
import { reduceMotion } from '../ui/kit'
import { juiceFor, juiceSound } from './feel'
import { appearing } from './sound'
import type { AnimTuning } from './useTuning'

export function useTurnPulse(svgRef: RefObject<SVGSVGElement | null>, ids: number[], timing: AnimTuning) {
  const key = ids.join(',')
  const chimedFor = useRef<unknown>(null) // the game (one object per change) whose turn already chimed
  useLayoutEffect(() => {
    const game = useGameStore.getState().game
    if (ids.length > 0 && game !== chimedFor.current) {
      chimedFor.current = game
      juiceSound('turnPulse', 'turn.yours', appearing())
    }
    const svg = svgRef.current
    if (!svg) return
    const groups = [...svg.querySelectorAll<SVGGElement>('[data-pulse]')]
    groups.forEach((g) => g.getAnimations().forEach((a) => a.cancel())) // every pulse stops…
    if (reduceMotion() || ids.length === 0) return
    const swell = 1 + juiceFor('turnPulse').grow
    for (const group of groups) { // …and the ones whose turn it is start again, in step
      if (!ids.includes(Number(group.getAttribute('data-pulse')))) continue
      group.animate([{ transform: 'scale(1)' }, { transform: `scale(${swell})` }, { transform: 'scale(1)' }],
        { duration: timing.turnPulseTime * 1000, iterations: Infinity, easing: 'ease-in-out' })
    }
    // Only a change of who pulses restarts it (timing is read when it starts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

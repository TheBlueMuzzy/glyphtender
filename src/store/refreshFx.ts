// THE REFRESH, PLAYED OUT (B011 — Muzzy: "the tiles they selected shrink, and new ones scale into their place.
// THEN it goes to the next player"). Plain maths for it; the store runs the stages, the tray (SeedTray.tsx) draws them:
//   out  — each set-aside seed shrinks away, one slot after the next (anim.json refreshShrinkTime, refreshStagger)
//   gone — online only: shrunk, waiting for the server's new seeds (the slots stay empty)
//   in   — the new seeds grow into those same slots, with a small overshoot (refreshGrowTime; feel.json refreshGrow)
// Only then does play pass on (the handoff). Keep all, or reduce motion → no animation, it just happens.
// Which places refresh, and where the new seeds go, is Table rack.ts: placesOf (the set-aside / drawn seeds' places)
// and refillRack (kept seeds stay put; new ones take the empty places — the tray NEVER re-sorts).
import type { AnimTuning } from '../game/useTuning'
import type { SeedPiece } from '../engine/types'

export interface RefreshFx {
  /** Whose tray is refreshing. */
  seat: number
  /** Tray positions (left to right, top row first) whose seeds go. */
  slots: number[]
  /** Stage "in": the tray positions the new seeds grow into (the set-aside places, and a cast seed's empty place). */
  newSlots?: number[]
  stage: 'out' | 'gone' | 'in'
  /** Pass-and-play, stage "in": the new hand and tray order, shown before the game moves on to the next player. */
  hand?: SeedPiece[]
  order?: string[]
}

/** How long each stage lasts, in ms (the last slot's stagger included; the pause sits after the shrink).
 *  Nothing set aside, or reduce motion → 0 and 0: the refresh just happens. */
export function refreshTimes(slots: number, timing: AnimTuning, reduce: boolean): { shrinkMs: number; growMs: number } {
  if (slots === 0 || reduce) return { shrinkMs: 0, growMs: 0 }
  const stagger = timing.refreshStagger * (slots - 1)
  return {
    shrinkMs: Math.round((timing.refreshShrinkTime + stagger + timing.refreshPause) * 1000),
    growMs: Math.round((timing.refreshGrowTime + stagger) * 1000),
  }
}

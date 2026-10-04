// THE REFRESH, PLAYED OUT (B011 — Muzzy: "the tiles they selected shrink, and new ones scale into their place.
// THEN it goes to the next player"). Plain maths for it; the store runs the stages, the tray (SeedTray.tsx) draws them:
//   out  — each set-aside seed shrinks away, one slot after the next (anim.json refreshShrinkTime, refreshStagger)
//   gone — online only: shrunk, waiting for the server's new seeds (the slots stay empty)
//   in   — the new seeds grow into those same slots, with a small overshoot (refreshGrowTime; feel.json refreshGrow)
// Only then does play pass on (the handoff). Keep all, or reduce motion → no animation, it just happens.
import type { AnimTuning } from '../game/useTuning'
import type { SeedPiece } from '../engine/types'
import { TRAY_GAP } from './turnPlan'

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

/** The tray positions of the set-aside seeds (by id), left to right. */
export function refreshSlots(order: string[], setAside: string[]): number[] {
  return order.flatMap((id, pos) => (setAside.includes(id) ? [pos] : []))
}

/** The tray order after seeds leave the hand — a cast (one seed) or a refresh (the set-aside ones) — and new ones come.
 *  NOTHING SHIFTS: kept seeds stay where they were (the tray follows each seed by its id), and every new seed takes an
 *  empty place, left to right (a removed seed's place, or an older gap); any extra new seed goes on the end. If there
 *  aren't enough new seeds, the places left over stay empty (TRAY_GAP) — they never close up.
 *  `newHand` = the hand after (kept seeds + the drawn ones, in the engine's order: the drawn ones come in that order). */
export function refillInPlace(order: string[], removed: string[], newHand: readonly SeedPiece[]): string[] {
  const inHand = new Set(newHand.map((seed) => seed.id))
  const stays = (id: string) => id !== TRAY_GAP && !removed.includes(id) && inHand.has(id)
  const fresh = newHand.map((seed) => seed.id).filter((id) => !order.some((placed) => placed === id && stays(placed)))
  const next = order.map((id) => (stays(id) ? id : (fresh.shift() ?? TRAY_GAP)))
  next.push(...fresh) // more new seeds than empty places: on the end
  while (next.length > 0 && next[next.length - 1] === TRAY_GAP) next.pop() // an empty place at the end is just a free slot
  return next
}

/** The tray positions holding new seeds: ids that weren't in the hand before (`before` = that hand). */
export function newSeedSlots(order: string[], before: readonly SeedPiece[]): number[] {
  return order.flatMap((id, pos) => (id !== TRAY_GAP && !before.some((seed) => seed.id === id) ? [pos] : []))
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

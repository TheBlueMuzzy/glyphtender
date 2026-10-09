// ONE SHARED ENGINE — so any file can play a sound without passing the engine around.
import type { Tier } from './config.ts'
import type { Audio } from './engine.ts'
import type { Drop, PlayOptions, PlayPlan } from './planner.ts'

let shared: Audio | null = null

/** Make this the engine playSound / playTier use (null = none). */
export function setAudio(audio: Audio | null): void {
  shared = audio
}

/** The shared engine, or null before setAudio */
export const getAudio = (): Audio | null => shared

/** Plays a named sound on the shared engine. Safe before setup (does nothing, returns null) — tests and sandboxes stay silent. */
export function playSound(name: string, options?: PlayOptions): PlayPlan | Drop | null {
  return shared ? shared.play(name, options) : null
}

/** Plays a feel tier's default sound (small / medium / big) — same intention, same sound. */
export function playTier(tier: Tier, options?: PlayOptions): PlayPlan | Drop | null {
  return shared ? shared.playTier(tier, options) : null
}

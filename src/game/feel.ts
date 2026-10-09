// GAME FEEL — how big each bit of "juice" is, by tier (small / medium / big) from content/tuning/feel.json
// (the game-feel way: moments pick a tier, tiers hold the numbers — Muzzy tunes them in the Dev Kit → Tuning).
// Reduce motion is handled where the juice plays: no pulse, no shake, and only the score total.
// SOUND (same intention → same sound): a juiced moment plays its own sound (content/audio.json) — and when that sound
// has no files (yet, or Muzzy took them out), its tier's default sound instead (audio.json tiers). juiceSound().
import feelFile from '../../content/tuning/feel.json'
import { getAudio, type PlayOptions } from '../audio'
import { liveTuning } from '../devkit/tuning/liveTuning'

export type FeelEvent = keyof typeof feelFile.events
export type Juice = { grow: number; shake: number }

const feelTuning = liveTuning('feel', feelFile)

/** The juice for one moment, e.g. juiceFor('seedPop').grow = how far a seed's "+1" swells past full size. */
export function juiceFor(event: FeelEvent): Juice {
  const feel = feelTuning.current // read now, so a Dev Kit change applies to the next one
  return feel.tiers[tierOf(event)]
}

/** The score sequence's sound rules (feel.json sounds): how long a word plays a chord, how many words the flourish. */
export const soundRules = () => feelTuning.current.sounds

/** Which tier a moment uses (a mistyped tier name falls back to small). */
function tierOf(event: FeelEvent): keyof typeof feelFile.tiers {
  const feel = feelTuning.current
  const tier = feel.events[event] as keyof typeof feel.tiers
  return tier in feel.tiers ? tier : 'small'
}

/** A juiced moment's sound: `sound` (its own, e.g. 'score.pop') — or, if that has no files, its feel tier's sound. */
export function juiceSound(event: FeelEvent, sound: string, options?: PlayOptions) {
  const audio = getAudio()
  if (!audio) return null // (tests, the Dev Kit's previews)
  if (audio.config().sounds[sound]?.files.length) return audio.play(sound, options)
  return audio.playTier(tierOf(event), options)
}

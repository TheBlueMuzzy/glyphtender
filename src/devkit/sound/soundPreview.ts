// Hearing a sound from the Sound tab. The engine plays sounds by NAME from its config, so to hear one exact version
// (one file, or the saved sound for A/B) the tab swaps in a config for that one play and puts the live one straight
// back: the voice keeps playing, and the game only ever sees the live config between plays.
import type { RawAudio } from './soundLogic'
import type { SoundBoardAudio } from './soundTypes'

/** How far apart ▶×5's plays are (ms) — close enough to compare, far enough to hear each one */
export const REPEAT_GAP_MS = 350

/** Play `name` once using `temp` (e.g. only one of its files), then put `live` back. Loads the file first if needed. */
export async function playWith(audio: SoundBoardAudio, live: RawAudio, temp: RawAudio, name: string): Promise<void> {
  audio.unlock() // a Dev Kit button press is a tap: audio may start here
  audio.setConfig(temp)
  const loading = audio.preload([name]) // reads the file list now, from `temp`
  audio.setConfig(live)
  await loading
  audio.setConfig(temp)
  audio.play(name)
  audio.setConfig(live)
}

/** ▶ (times = 1) or ▶×5: the sound as the game would play it now, `times` plays REPEAT_GAP_MS apart */
export async function playTimes(audio: SoundBoardAudio, name: string, times: number): Promise<void> {
  audio.unlock()
  await audio.preload([name])
  for (let i = 0; i < times; i++) {
    if (i === 0) audio.play(name)
    else setTimeout(() => audio.play(name), i * REPEAT_GAP_MS)
  }
}

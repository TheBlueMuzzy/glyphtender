// REACT HELPERS — tiny bridges from React screens to the audio engine.
import { useEffect } from 'react'
import type { Audio } from './engine.ts'
import { applyAudioSettings, readAudioSettings, type AudioSettings } from './settings.ts'

/**
 * Keeps the engine in step with the player's Settings → Audio values (the UI kit's standard ids:
 * masterVolume · musicVolume · ambienceVolume · sfxVolume · uiVolume · muteAll · muteInBackground · mono).
 * Pass the whole settings-values object; missing values use the defaults.
 */
export function useAudioSettings(audio: Audio | null | undefined, values: Partial<Record<keyof AudioSettings, unknown>> | null | undefined): void {
  const s = readAudioSettings(values)
  useEffect(() => {
    if (audio) applyAudioSettings(audio, s)
    // One entry per setting, so a new object with the same values does nothing
  }, [audio, s.masterVolume, s.musicVolume, s.ambienceVolume, s.sfxVolume, s.uiVolume, s.muteAll, s.muteInBackground, s.mono])
}

/** While a screen is showing, use a named mix (e.g. "paused" on the Pause screen); back to normal when it closes. */
export function useAudioSnapshot(audio: Audio | null | undefined, name: string | null): void {
  useEffect(() => {
    if (!audio || !name) return
    audio.snapshot(name)
    return () => audio.snapshot(null)
  }, [audio, name])
}

/** While a screen is showing, keep a loop going (music, ambience); it fades out when the screen closes. */
export function useLoop(audio: Audio | null | undefined, name: string | null, fadeMs = 600): void {
  useEffect(() => {
    if (!audio || !name) return
    audio.play(name)
    return () => audio.stop(name, { fadeMs })
  }, [audio, name, fadeMs])
}

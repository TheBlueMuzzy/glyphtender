// REACT HELPERS — tiny bridges from React screens to the audio engine.
import { useEffect } from 'react'
import type { Audio } from './engine.ts'
import { applyAudioSettings, readAudioSettings, type AudioSettingsValues } from './settings.ts'

/**
 * Keeps the engine in step with the player's Settings → Audio values (the UI kit's standard ids:
 * masterVolume · musicVolume · ambienceVolume · sfxVolume · uiVolume · sound · muteInBackground · mono).
 * Pass the whole settings-values object; missing values use the defaults.
 */
export function useAudioSettings(audio: Audio | null | undefined, values: AudioSettingsValues | null | undefined): void {
  const s = readAudioSettings(values)
  useEffect(() => {
    if (audio) applyAudioSettings(audio, s)
    // One entry per setting, so a new object with the same values does nothing
  }, [audio, s.masterVolume, s.musicVolume, s.ambienceVolume, s.sfxVolume, s.uiVolume, s.sound, s.muteInBackground, s.mono])
}

/** While a screen is showing, use a named mix (e.g. "paused" on the Pause screen) ON TOP of whatever mix was on; when it
 *  closes, that mix comes back (Pause during the Reveal → back to the Reveal's mix, not normal). */
export function useAudioSnapshot(audio: Audio | null | undefined, name: string | null): void {
  useEffect(() => {
    if (!audio || !name) return
    audio.pushSnapshot(name)
    return () => audio.popSnapshot(name)
  }, [audio, name])
}

/** While a screen is showing, play a music track (content/audio.json music.tracks); it fades out when the screen closes
 *  (only if it is still the one playing — the next screen's track may already have taken over). */
export function useMusic(audio: Audio | null | undefined, track: string | null, fadeMs?: number): void {
  useEffect(() => {
    if (!audio || !track) return
    audio.playMusic(track)
    return () => audio.stopMusic({ track, fadeMs })
  }, [audio, track, fadeMs])
}

/** While a screen is showing, keep a loop going (music, ambience); it fades out when the screen closes. */
export function useLoop(audio: Audio | null | undefined, name: string | null, fadeMs = 600): void {
  useEffect(() => {
    if (!audio || !name) return
    audio.play(name)
    return () => audio.stop(name, { fadeMs })
  }, [audio, name, fadeMs])
}

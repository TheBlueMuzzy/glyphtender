// THE PLAYER'S AUDIO SETTINGS → the engine. Matches the UI kit's standard Settings → Audio tab
// (ui-kit/kit/blocks/settings.default.json): the same ids, so the kit's Settings values can be passed straight in.

/** The player's choices. Sliders are 0–100 (0 = silent); see sliderToGain in config.ts for the curve. */
export interface AudioSettings {
  masterVolume: number
  musicVolume: number
  ambienceVolume: number
  sfxVolume: number
  uiVolume: number
  muteAll: boolean
  muteInBackground: boolean
  mono: boolean
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 80,
  musicVolume: 50,
  ambienceVolume: 60,
  sfxVolume: 80,
  uiVolume: 70,
  muteAll: false,
  muteInBackground: true,
  mono: false,
}

/** The parts of the engine the settings drive (createAudio's result has all of these). */
export interface AudioSettingsTarget {
  setBusVolume(bus: 'master' | 'music' | 'ambience' | 'sfx' | 'ui', slider: number): void
  setMuted(muted: boolean): void
  setMuteInBackground(mute: boolean): void
  setMono(mono: boolean): void
}

/** Any object (e.g. the UI kit Settings' values) → complete settings; a missing or wrong-type value uses the default. */
export function readAudioSettings(values: Partial<Record<keyof AudioSettings, unknown>> | null | undefined): AudioSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS }
  if (!values) return settings
  for (const key of Object.keys(DEFAULT_AUDIO_SETTINGS) as (keyof AudioSettings)[]) {
    const value = values[key]
    if (typeof value === typeof DEFAULT_AUDIO_SETTINGS[key]) (settings as Record<string, unknown>)[key] = value
  }
  return settings
}

export function applyAudioSettings(audio: AudioSettingsTarget, values: Partial<Record<keyof AudioSettings, unknown>> | null | undefined): void {
  const settings = readAudioSettings(values)
  audio.setBusVolume('master', settings.masterVolume)
  audio.setBusVolume('music', settings.musicVolume)
  audio.setBusVolume('ambience', settings.ambienceVolume)
  audio.setBusVolume('sfx', settings.sfxVolume)
  audio.setBusVolume('ui', settings.uiVolume)
  audio.setMuted(settings.muteAll)
  audio.setMuteInBackground(settings.muteInBackground)
  audio.setMono(settings.mono)
}

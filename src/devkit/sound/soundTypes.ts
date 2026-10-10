// What the Sound tab needs from the game's audio engine (framework/audio — src/audio/ in the game).
// Written out here instead of imported, so the Dev Kit doesn't depend on the audio module being installed:
// the game hands its engine over (soundTab(getAudio, …)) and anything shaped like this works.
export type SoundBus = 'master' | 'music' | 'ambience' | 'sfx' | 'ui'

export type SoundLogEntry = {
  t: number
  id: string
  result: 'played' | 'dropped' | 'music' // music = a music track's moment (audio 0.2.0+)
  event?: string // music: start · play · rest · stop
  reason?: string
  detail?: string
  file?: string
  step?: number
  delayMs?: number
}

/** What the music is doing (audio module 0.2.0+ musicState()) */
export type SoundMusicState = {
  track: string | null
  phase: string // off · waiting · playing · fading · resting
  play: number
  playsBeforeRest: number
  restLeftMs: number
  intensity: number
  layers: { name: string; file: string; gain: number }[]
}

export interface SoundBoardAudio {
  play(name: string, options?: Record<string, unknown>): unknown
  stop(name: string, options?: { fadeMs?: number }): void
  setConfig(raw: unknown): void
  preload(names?: string[]): Promise<void>
  reloadFile(file: string): void
  snapshot(name: string | null): void
  unlock(): void
  state(): string
  /** 0…1, the peak right now (audio module 0.1.2+). Missing → the meters stay empty. */
  level?(bus: SoundBus): number
  /** Music tracks (audio module 0.2.0+). Missing → the Music section says so. */
  playMusic?(name: string, options?: { fadeMs?: number }): void
  stopMusic?(options?: { fadeMs?: number; track?: string }): void
  setMusicIntensity?(intensity: number, options?: { rampMs?: number }): void
  restMusic?(): void
  endMusicRest?(): void
  musicState?(): SoundMusicState
  log: { entries(): SoundLogEntry[]; clear(): void }
  onLog(listener: (entry: SoundLogEntry) => void): () => void
}

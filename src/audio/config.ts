// CONTENT/AUDIO.JSON — the one file a designer tunes. Types, defaults and validation.
// A bad value never crashes the game: it gives ONE clear console warning and a safe default is used instead.
// Design: framework/.planning/design/audio.md

/** The volume groups. Each has its own player slider in Settings. */
export type BusName = 'music' | 'ambience' | 'sfx' | 'ui'
export const BUSES: readonly BusName[] = ['music', 'ambience', 'sfx', 'ui']

/** How a sound with several files picks the next one. */
export type PickMode = 'random' | 'sequence' | 'shuffle'
export const PICK_MODES: readonly PickMode[] = ['random', 'sequence', 'shuffle']

export type Tier = 'small' | 'medium' | 'big'

/** How a sound's file is played: auto (music + ambience stream, effects + menus are decoded) · always (stream) · never (decode).
 *  Streamed = played straight from the file through an <audio> element, so a 3-minute song never sits whole in memory
 *  (decoded it is ~40 MB). The cost: a streamed loop can't jump back sample-exact, so its loop point gets a short crossfade. */
export type StreamMode = 'auto' | 'always' | 'never'
export const STREAM_MODES: readonly StreamMode[] = ['auto', 'always', 'never']

/** One named sound, e.g. "seed.land". Every field has a default, so a sound can be just { "files": [...] }. */
export interface SoundConfig {
  /** Files under public/audio/, e.g. "sfx/seed_land_01.mp3". Several = variants. */
  files: string[]
  /** random (never the same twice) · sequence (in order) · shuffle (each once, then a new order) */
  pick: PickMode
  bus: BusName
  volumeDb: number
  /** Semitones. Pitch and speed are one knob: +12 = an octave higher and twice as fast. */
  pitch: number
  /** ± semitones, picked fresh each play */
  randomPitch: number
  /** ± dB, picked fresh each play */
  randomVolumeDb: number
  delayMs: number
  trimStartMs: number
  trimEndMs: number
  fadeInMs: number
  fadeOutMs: number
  loop: boolean
  /** 0 and 0 = loop the whole file */
  loopStartMs: number
  loopEndMs: number
  /** Copies of THIS sound at once; one more steals the oldest copy. */
  maxVoices: number
  /** A repeat sooner than this after the last one is skipped. */
  cooldownMs: number
  /** Higher = more important. When too many sounds play at once, the least important go first. */
  priority: number
  /** −1 left · 0 middle · 1 right */
  pan: number
  /** 0 = off. Muffle: only frequencies below this pass. */
  lowpassHz: number
  /** 0 = off. Thin: only frequencies above this pass. */
  highpassHz: number
  /** true = each quick repeat steps one note up the ladder */
  ladder: boolean
  /** true = playing it lowers the music for a moment (big moments) */
  duck: boolean
  /** auto (music + ambience stream) · always · never — see StreamMode */
  stream: StreamMode
  /** A streamed loop crossfades this long (ms) where it jumps back, to hide the seam. (Decoded loops are sample-exact: unused.) */
  loopCrossfadeMs: number
}

/** One layer of a music track: a file that plays in sync with the track's other layers, faded in by the intensity. */
export interface MusicLayerConfig {
  /** The file under public/audio/, e.g. "mus/mus_garden_harp_01.mp3". A track's layers should be the same length. */
  file: string
  volumeDb: number
  /** Intensity (0–1) where this layer starts to be heard. Below it: silent. */
  fromIntensity: number
  /** Intensity where it reaches its full volume; between the two it fades in. (from 0 + full 0 = always on) */
  fullAtIntensity: number
}

/** A music track: layers that start together and stay together, played round after round, with rests in between. */
export interface MusicTrackConfig {
  layers: Record<string, MusicLayerConfig>
  /** true = a seamless loop (each time round is one "play") · false = a piece with an ending (one play = to its end) */
  loop: boolean
  /** Where each loop jumps back to (ms). 0 and 0 = the whole file. Applies to every layer. */
  loopStartMs: number
  /** Where each loop ends (ms). Anything after it is the ending, heard before a rest. 0 = the end of the file. */
  loopEndMs: number
  /** The crossfade at the loop point (ms): streamed music can't jump back sample-exact, this hides the seam */
  loopCrossfadeMs: number
  /** How many plays before the music rests (0 = never rests) */
  playsBeforeRest: number
  /** How long a rest is, in seconds: a random time between the two (e.g. [60, 90]) */
  restSeconds: [number, number]
  /** Fade in when it starts and when it comes back after a rest (ms) */
  fadeInMs: number
  /** Fade out at the end of the last play before a rest, and when it is stopped (ms) */
  fadeOutMs: number
}

export interface MusicConfig {
  tracks: Record<string, MusicTrackConfig>
}

export interface LadderConfig {
  scale: ScaleName
  /** The key the ladder's sound files are recorded in (so they sit in the music's key). Shown in the Dev Kit; the module doesn't re-tune for it. */
  root: string
  /** How many notes it climbs before holding the top note */
  steps: number
  /** Quiet this long (ms) → the next one starts at the bottom again */
  resetMs: number
}

/** A named mix: dB per bus (0 = unchanged), optional muffle on the music, and how fast it fades in/out. */
export interface SnapshotConfig {
  music: number
  ambience: number
  sfx: number
  ui: number
  /** 0 = off */
  lowpassHz: number
  fadeMs: number
}

export interface AudioConfig {
  /** dB under master, per bus */
  buses: Record<BusName, number>
  master: { limiterDb: number }
  /** The default sound per feel tier (same intention → same sound) */
  tiers: Record<Tier, string>
  ladder: LadderConfig
  snapshots: Record<string, SnapshotConfig>
  /** Big moments lower the music: by amountDb, down in downMs, back over backMs */
  duck: { amountDb: number; downMs: number; backMs: number }
  /** maxVoices: effect + menu sounds at once (music and ambience don't count) · staleMs: a request older than this is dropped */
  limits: { maxVoices: number; staleMs: number }
  sounds: Record<string, SoundConfig>
  /** Music tracks: layers + intensity + rests (framework F28) */
  music: MusicConfig
}

// ---------- scales for the ladder ----------
export type ScaleName = 'pentatonic' | 'major' | 'minorPentatonic' | 'chromatic'
/** Semitones above the bottom note for one octave of each scale. Pentatonic has no wrong notes. */
export const SCALES: Record<ScaleName, readonly number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minorPentatonic: [0, 3, 5, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

// ---------- every number knob of a sound: [min, max, step] (same ranges the Dev Kit sliders use) ----------
type NumberKnob = { [K in keyof SoundConfig]: SoundConfig[K] extends number ? K : never }[keyof SoundConfig]
export const SOUND_RANGES: Record<NumberKnob, [number, number, number]> = {
  volumeDb: [-40, 6, 0.5],
  pitch: [-12, 12, 0.1],
  randomPitch: [0, 3, 0.1],
  randomVolumeDb: [0, 6, 0.5],
  delayMs: [0, 1000, 5],
  trimStartMs: [0, 5000, 5],
  trimEndMs: [0, 5000, 5],
  fadeInMs: [0, 5000, 5],
  fadeOutMs: [0, 5000, 5],
  loopStartMs: [0, 600000, 10],
  loopEndMs: [0, 600000, 10],
  maxVoices: [1, 8, 1],
  cooldownMs: [0, 500, 5],
  priority: [0, 5, 1],
  pan: [-1, 1, 0.05],
  lowpassHz: [0, 20000, 10],
  highpassHz: [0, 20000, 10],
  loopCrossfadeMs: [0, 5000, 10],
}

/** A music track's number knobs: [min, max, step] (restSeconds: both ends use it) */
export const TRACK_RANGES = {
  loopStartMs: [0, 600000, 10],
  loopEndMs: [0, 600000, 10],
  loopCrossfadeMs: [0, 10000, 10],
  playsBeforeRest: [0, 20, 1],
  restSeconds: [0, 600, 1],
  fadeInMs: [0, 20000, 50],
  fadeOutMs: [0, 20000, 50],
} satisfies Record<string, [number, number, number]>

/** A music layer's number knobs: [min, max, step] */
export const LAYER_RANGES = {
  volumeDb: [-40, 6, 0.5],
  fromIntensity: [0, 1, 0.05],
  fullAtIntensity: [0, 1, 0.05],
} satisfies Record<string, [number, number, number]>

export const DEFAULT_SOUND: SoundConfig = {
  files: [],
  pick: 'random',
  bus: 'sfx',
  volumeDb: 0,
  pitch: 0,
  randomPitch: 0,
  randomVolumeDb: 0,
  delayMs: 0,
  trimStartMs: 0,
  trimEndMs: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
  loop: false,
  loopStartMs: 0,
  loopEndMs: 0,
  maxVoices: 4,
  cooldownMs: 30,
  priority: 2,
  pan: 0,
  lowpassHz: 0,
  highpassHz: 0,
  ladder: false,
  duck: false,
  stream: 'auto',
  loopCrossfadeMs: 100,
}

export const DEFAULT_LAYER: MusicLayerConfig = { file: '', volumeDb: 0, fromIntensity: 0, fullAtIntensity: 0 }

export const DEFAULT_TRACK: MusicTrackConfig = {
  layers: {},
  loop: true,
  loopStartMs: 0,
  loopEndMs: 0,
  loopCrossfadeMs: 100,
  playsBeforeRest: 2,
  restSeconds: [60, 90],
  fadeInMs: 2000,
  fadeOutMs: 3000,
}

const DEFAULT_SNAPSHOT: SnapshotConfig = { music: 0, ambience: 0, sfx: 0, ui: 0, lowpassHz: 0, fadeMs: 250 }

export const DEFAULT_CONFIG: AudioConfig = {
  buses: { music: -8, ambience: -10, sfx: 0, ui: -8 },
  master: { limiterDb: -1 },
  tiers: { small: 'tier.small', medium: 'tier.medium', big: 'tier.big' },
  ladder: { scale: 'pentatonic', root: 'D', steps: 10, resetMs: 1200 },
  snapshots: {
    paused: { ...DEFAULT_SNAPSHOT, music: -10, lowpassHz: 900 },
    reveal: { ...DEFAULT_SNAPSHOT, music: -6, ambience: -8 },
  },
  duck: { amountDb: -7, downMs: 10, backMs: 600 },
  limits: { maxVoices: 14, staleMs: 400 },
  sounds: {},
  music: { tracks: {} },
}

// ---------- validation ----------
export type Warn = (message: string) => void

// Each message is shown once per page load, so a live Dev Kit edit doesn't flood the console.
const alreadyWarned = new Set<string>()
const warnOnce: Warn = (message) => {
  if (alreadyWarned.has(message)) return
  alreadyWarned.add(message)
  console.warn(`[audio] ${message}`)
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A number within [min, max]; anything else warns and gives the fallback (out of range → clamped). */
function readNumber(value: unknown, fallback: number, min: number, max: number, where: string, warn: Warn): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    warn(`${where} should be a number, but it is ${JSON.stringify(value)} — using ${fallback}.`)
    return fallback
  }
  if (value < min || value > max) {
    const clamped = Math.min(max, Math.max(min, value))
    warn(`${where} is ${value}, outside ${min}…${max} — using ${clamped}.`)
    return clamped
  }
  return value
}

function readBoolean(value: unknown, fallback: boolean, where: string, warn: Warn): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    warn(`${where} should be true or false, but it is ${JSON.stringify(value)} — using ${fallback}.`)
    return fallback
  }
  return value
}

function readChoice<T extends string>(value: unknown, fallback: T, choices: readonly T[], where: string, warn: Warn): T {
  if (value === undefined) return fallback
  if (!choices.includes(value as T)) {
    warn(`${where} should be one of ${choices.join(' / ')}, but it is ${JSON.stringify(value)} — using ${fallback}.`)
    return fallback
  }
  return value as T
}

/** Filters: 0 means off, otherwise 20…20000 Hz. */
function readFilter(value: unknown, where: string, warn: Warn): number {
  const hz = readNumber(value, 0, 0, 20000, where, warn)
  if (hz > 0 && hz < 20) {
    warn(`${where} is ${hz} Hz — use 0 (off) or 20…20000. Using 20.`)
    return 20
  }
  return hz
}

/** stream: "auto" / "always" / "never" (true and false are understood as always / never) */
function readStream(value: unknown, where: string, warn: Warn): StreamMode {
  if (value === true) return 'always'
  if (value === false) return 'never'
  return readChoice(value, DEFAULT_SOUND.stream, STREAM_MODES, where, warn)
}

/** One sound's settings, with defaults filled in and bad values replaced. */
export function readSound(name: string, raw: unknown, warn: Warn = warnOnce): SoundConfig {
  const where = (key: string) => `sounds["${name}"].${key}`
  if (!isObject(raw)) {
    warn(`sounds["${name}"] should be an object like { "files": ["sfx/…mp3"] } — it will be silent.`)
    return { ...DEFAULT_SOUND }
  }
  for (const key of Object.keys(raw)) {
    if (!key.startsWith('_') && !(key in DEFAULT_SOUND)) warn(`${where(key)} is not a sound setting — ignored (check the spelling).`)
  }
  let files: string[] = []
  if (raw.files !== undefined) {
    if (Array.isArray(raw.files) && raw.files.every((f) => typeof f === 'string' && f.length > 0)) files = [...raw.files]
    else warn(`${where('files')} should be a list of file names like ["sfx/pop_01.mp3"] — it will be silent.`)
  }
  const sound: SoundConfig = { ...DEFAULT_SOUND, files }
  sound.pick = readChoice(raw.pick, DEFAULT_SOUND.pick, PICK_MODES, where('pick'), warn)
  sound.bus = readChoice(raw.bus, DEFAULT_SOUND.bus, BUSES, where('bus'), warn)
  sound.loop = readBoolean(raw.loop, DEFAULT_SOUND.loop, where('loop'), warn)
  sound.ladder = readBoolean(raw.ladder, DEFAULT_SOUND.ladder, where('ladder'), warn)
  sound.duck = readBoolean(raw.duck, DEFAULT_SOUND.duck, where('duck'), warn)
  sound.stream = readStream(raw.stream, where('stream'), warn)
  for (const key of Object.keys(SOUND_RANGES) as NumberKnob[]) {
    const [min, max] = SOUND_RANGES[key]
    sound[key] = key === 'lowpassHz' || key === 'highpassHz'
      ? readFilter(raw[key], where(key), warn)
      : readNumber(raw[key], DEFAULT_SOUND[key], min, max, where(key), warn)
  }
  sound.maxVoices = Math.round(sound.maxVoices)
  if (sound.loopEndMs > 0 && sound.loopEndMs <= sound.loopStartMs) {
    warn(`${where('loopEndMs')} (${sound.loopEndMs}) must be after loopStartMs (${sound.loopStartMs}) — looping the whole file instead.`)
    sound.loopStartMs = 0
    sound.loopEndMs = 0
  }
  return sound
}

function readLayer(where: string, raw: unknown, warn: Warn): MusicLayerConfig | null {
  if (!isObject(raw)) {
    warn(`${where} should be an object like { "file": "mus/…mp3" } — left out.`)
    return null
  }
  for (const key of Object.keys(raw)) {
    if (!key.startsWith('_') && key !== 'files' && !(key in DEFAULT_LAYER)) warn(`${where}.${key} is not a layer setting — ignored (check the spelling).`)
  }
  // "file": "…" — or "files": ["…"] like a sound. A layer plays ONE file (layers stay in sync; variants wouldn't).
  let file = typeof raw.file === 'string' ? raw.file : ''
  if (!file && Array.isArray(raw.files) && typeof raw.files[0] === 'string') {
    file = raw.files[0]
    if (raw.files.length > 1) warn(`${where}.files has ${raw.files.length} files — a layer plays one file (to stay in sync), using the first.`)
  }
  if (!file) {
    warn(`${where} has no file (e.g. "file": "mus/…mp3") — left out.`)
    return null
  }
  const layer: MusicLayerConfig = { ...DEFAULT_LAYER, file }
  for (const key of Object.keys(LAYER_RANGES) as (keyof typeof LAYER_RANGES)[]) {
    const [min, max] = LAYER_RANGES[key]
    layer[key] = readNumber(raw[key], DEFAULT_LAYER[key], min, max, `${where}.${key}`, warn)
  }
  if (layer.fullAtIntensity < layer.fromIntensity) {
    warn(`${where}.fullAtIntensity (${layer.fullAtIntensity}) is below fromIntensity (${layer.fromIntensity}) — using ${layer.fromIntensity} (it comes in all at once there).`)
    layer.fullAtIntensity = layer.fromIntensity
  }
  return layer
}

function readTrack(name: string, raw: unknown, warn: Warn): MusicTrackConfig {
  const where = `music.tracks["${name}"]`
  const track: MusicTrackConfig = structuredClone(DEFAULT_TRACK)
  if (!isObject(raw)) {
    warn(`${where} should be an object like { "layers": { "main": { "file": "mus/…mp3" } } } — it will be silent.`)
    return track
  }
  for (const key of Object.keys(raw)) {
    if (!key.startsWith('_') && !(key in DEFAULT_TRACK)) warn(`${where}.${key} is not a music track setting — ignored (check the spelling).`)
  }
  if (isObject(raw.layers)) {
    for (const [layerName, value] of Object.entries(raw.layers)) {
      if (layerName.startsWith('_')) continue
      const layer = readLayer(`${where}.layers["${layerName}"]`, value, warn)
      if (layer) track.layers[layerName] = layer
    }
  } else if (raw.layers !== undefined) warn(`${where}.layers should be an object of named layers — it will be silent.`)
  track.loop = readBoolean(raw.loop, DEFAULT_TRACK.loop, `${where}.loop`, warn)
  for (const key of ['loopStartMs', 'loopEndMs', 'loopCrossfadeMs', 'playsBeforeRest', 'fadeInMs', 'fadeOutMs'] as const) {
    const [min, max] = TRACK_RANGES[key]
    track[key] = readNumber(raw[key], DEFAULT_TRACK[key], min, max, `${where}.${key}`, warn)
  }
  track.playsBeforeRest = Math.round(track.playsBeforeRest)
  if (track.loopEndMs > 0 && track.loopEndMs <= track.loopStartMs) {
    warn(`${where}.loopEndMs (${track.loopEndMs}) must be after loopStartMs (${track.loopStartMs}) — looping the whole file instead.`)
    track.loopStartMs = 0
    track.loopEndMs = 0
  }
  if (raw.restSeconds !== undefined) {
    const rest = raw.restSeconds
    const [min, max] = TRACK_RANGES.restSeconds
    if (typeof rest === 'number') {
      const seconds = readNumber(rest, DEFAULT_TRACK.restSeconds[0], min, max, `${where}.restSeconds`, warn)
      track.restSeconds = [seconds, seconds]
    } else if (Array.isArray(rest) && rest.length === 2) {
      const low = readNumber(rest[0], DEFAULT_TRACK.restSeconds[0], min, max, `${where}.restSeconds[0]`, warn)
      const high = readNumber(rest[1], DEFAULT_TRACK.restSeconds[1], min, max, `${where}.restSeconds[1]`, warn)
      track.restSeconds = [Math.min(low, high), Math.max(low, high)]
    } else {
      warn(`${where}.restSeconds should be [shortest, longest] in seconds, like [60, 90] — using [${DEFAULT_TRACK.restSeconds.join(', ')}].`)
    }
  }
  return track
}

/** The "music" section: { "tracks": { "<name>": { layers, loop, rests, fades } } } */
function readMusic(raw: unknown, warn: Warn): MusicConfig {
  const music: MusicConfig = { tracks: {} }
  if (!isObject(raw)) {
    warn('music should be an object like { "tracks": { … } } — no music will play.')
    return music
  }
  if (raw.tracks === undefined) return music
  if (!isObject(raw.tracks)) {
    warn('music.tracks should be an object of named tracks — no music will play.')
    return music
  }
  for (const [name, value] of Object.entries(raw.tracks)) {
    if (!name.startsWith('_')) music.tracks[name] = readTrack(name, value, warn)
  }
  return music
}

function readSnapshot(name: string, raw: unknown, warn: Warn): SnapshotConfig {
  if (!isObject(raw)) {
    warn(`snapshots["${name}"] should be an object like { "music": -10 } — it will change nothing.`)
    return { ...DEFAULT_SNAPSHOT }
  }
  const where = (key: string) => `snapshots["${name}"].${key}`
  const snapshot = { ...DEFAULT_SNAPSHOT }
  for (const bus of BUSES) snapshot[bus] = readNumber(raw[bus], 0, -60, 12, where(bus), warn)
  snapshot.lowpassHz = readFilter(raw.lowpassHz, where('lowpassHz'), warn)
  snapshot.fadeMs = readNumber(raw.fadeMs, DEFAULT_SNAPSHOT.fadeMs, 0, 5000, where('fadeMs'), warn)
  return snapshot
}

/**
 * Turns whatever is in content/audio.json into a complete, safe AudioConfig.
 * Never throws. Missing parts get defaults; bad values warn once and get a safe value.
 * Keys starting with "_" (_help, _labels, _sections, _ranges) are notes for people and the Dev Kit — skipped.
 */
export function readAudioConfig(raw: unknown, warn: Warn = warnOnce): AudioConfig {
  const config: AudioConfig = structuredClone({ ...DEFAULT_CONFIG, sounds: {} })
  if (!isObject(raw)) {
    warn('content/audio.json should be an object — using the default mix with no sounds.')
    return config
  }
  if (isObject(raw.buses)) {
    for (const bus of BUSES) config.buses[bus] = readNumber(raw.buses[bus], DEFAULT_CONFIG.buses[bus], -60, 12, `buses.${bus}`, warn)
  }
  if (isObject(raw.master)) {
    config.master.limiterDb = readNumber(raw.master.limiterDb, DEFAULT_CONFIG.master.limiterDb, -24, 0, 'master.limiterDb', warn)
  }
  if (isObject(raw.tiers)) {
    for (const tier of ['small', 'medium', 'big'] as const) {
      const value = raw.tiers[tier]
      if (value === undefined) continue
      if (typeof value === 'string') config.tiers[tier] = value
      else warn(`tiers.${tier} should be a sound name like "tier.${tier}" — using "${config.tiers[tier]}".`)
    }
  }
  if (isObject(raw.ladder)) {
    const ladder = raw.ladder
    config.ladder.scale = readChoice(ladder.scale, DEFAULT_CONFIG.ladder.scale, Object.keys(SCALES) as ScaleName[], 'ladder.scale', warn)
    if (typeof ladder.root === 'string') config.ladder.root = ladder.root
    config.ladder.steps = Math.round(readNumber(ladder.steps, DEFAULT_CONFIG.ladder.steps, 1, 24, 'ladder.steps', warn))
    config.ladder.resetMs = readNumber(ladder.resetMs, DEFAULT_CONFIG.ladder.resetMs, 0, 10000, 'ladder.resetMs', warn)
  }
  if (isObject(raw.snapshots)) {
    config.snapshots = {}
    for (const [name, value] of Object.entries(raw.snapshots)) {
      if (!name.startsWith('_')) config.snapshots[name] = readSnapshot(name, value, warn)
    }
  }
  if (isObject(raw.duck)) {
    config.duck.amountDb = readNumber(raw.duck.amountDb, DEFAULT_CONFIG.duck.amountDb, -40, 0, 'duck.amountDb', warn)
    config.duck.downMs = readNumber(raw.duck.downMs, DEFAULT_CONFIG.duck.downMs, 0, 2000, 'duck.downMs', warn)
    config.duck.backMs = readNumber(raw.duck.backMs, DEFAULT_CONFIG.duck.backMs, 0, 5000, 'duck.backMs', warn)
  }
  if (isObject(raw.limits)) {
    config.limits.maxVoices = Math.round(readNumber(raw.limits.maxVoices, DEFAULT_CONFIG.limits.maxVoices, 1, 64, 'limits.maxVoices', warn))
    config.limits.staleMs = readNumber(raw.limits.staleMs, DEFAULT_CONFIG.limits.staleMs, 0, 10000, 'limits.staleMs', warn)
  }
  if (raw.sounds !== undefined) {
    if (isObject(raw.sounds)) {
      for (const [name, value] of Object.entries(raw.sounds)) {
        if (!name.startsWith('_')) config.sounds[name] = readSound(name, value, warn)
      }
    } else warn('sounds should be an object of named sounds — no sounds will play.')
  }
  if (raw.music !== undefined) config.music = readMusic(raw.music, warn)
  return config
}

// ---------- the small bits of sound maths, shared by the planner and the engine ----------
/** −6 dB → 0.5 (roughly half the volume), 0 dB → 1 */
export const dbToGain = (db: number): number => 10 ** (db / 20)
/** +12 semitones → 2 (twice as fast, an octave up) */
export const semitonesToRate = (semitones: number): number => 2 ** (semitones / 12)

/**
 * A player's 0–100 slider → volume. Curve: gain = (slider / 100)², so the middle of the slider sounds like the middle.
 * 100 → 0 dB · 80 → −3.9 dB · 50 → −12 dB · 25 → −24 dB · 10 → −40 dB · 0 → silent.
 */
export function sliderToGain(slider: number): number {
  if (!Number.isFinite(slider) || slider <= 0) return 0
  const amount = Math.min(100, slider) / 100
  return amount * amount
}

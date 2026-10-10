// THE PLANNER — pure decisions, no Web Audio. Given a sound's settings, what is playing now, the time and a seeded
// random → a play plan (which file, how loud, how high, when, which filters) or a drop with a plain reason.
// Because it is pure, every rule here is unit-tested without a browser (planner.test.ts).
import { dbToGain, SCALES, semitonesToRate, type AudioConfig, type BusName, type ScaleName, type SoundConfig } from './config.ts'

/** Where the engine is: never unlocked yet (no tap yet) · playing · paused (tab hidden, phone call, lock screen). */
export type EngineState = 'locked' | 'running' | 'suspended'

/** Why a sound didn't play. Each is logged, so "why didn't I hear it?" always has an answer. */
export type DropReason =
  | 'unknown-sound' // no sound with that name in content/audio.json
  | 'no-files' // the sound has no files yet
  | 'catch-up' // replaying the past (reconnect, loading a room): silent by rule
  | 'locked' // audio not unlocked yet (no tap yet)
  | 'suspended' // tab hidden / phone call — dropped, NEVER queued, so nothing bursts out on return
  | 'muted' // Settings → Sound is off
  | 'stale' // asked for too late to be in sync
  | 'cooldown' // the same sound played a moment ago
  | 'already-playing' // a loop that is already playing
  | 'global-limit' // too many sounds at once, and everything playing is more important
  | 'not-loaded' // (engine) the file hasn't finished loading yet

/** What a game can say when it plays a sound. All optional. */
export interface PlayOptions {
  /** When the moment happens, on the same clock as the engine's `now` (performance.now() ms). In the future = scheduled; a little in the past = plays now; more than limits.staleMs in the past = dropped. */
  at?: number
  /** Extra wait (ms) on top of the sound's own delayMs */
  delayMs?: number
  /** Overrides the sound's pan: −1 left … 1 right (e.g. from a piece's x on the board) */
  pan?: number
  /** Added to the sound's volume (dB) */
  volumeDb?: number
  /** Added to the sound's pitch (semitones) */
  pitch?: number
  /** Ladder sounds: play exactly this step (0 = bottom note) instead of climbing on its own */
  step?: number
  /** true = this is a replay of the past (rejoin, loading a room) → silent */
  catchUp?: boolean
}

/** A sound that is playing (or scheduled), as the engine tracks it. */
export interface ActiveVoice {
  id: number
  sound: string
  bus: BusName
  startAt: number
  /** Infinity for loops */
  endAt: number
  gainDb: number
  priority: number
}

/** What the planner remembers about one sound between plays (the engine keeps it). */
export interface SoundMemory {
  lastStartAt: number | null
  lastFile: number | null
  /** shuffle: the files still to play this round */
  bag: number[]
  ladderStep: number
  ladderLastAt: number | null
}

export const freshMemory = (): SoundMemory => ({ lastStartAt: null, lastFile: null, bag: [], ladderStep: 0, ladderLastAt: null })

export interface PlanInput {
  name: string
  config: AudioConfig
  options?: PlayOptions
  voices: readonly ActiveVoice[]
  now: number
  /** Random number 0 ≤ n < 1 — seeded in tests */
  rng: () => number
  engine: EngineState
  muted?: boolean
  memory?: SoundMemory
}

export interface PlayPlan {
  kind: 'play'
  sound: string
  file: string
  fileIndex: number
  bus: BusName
  /** When it starts, on the planner's clock (ms) */
  startAt: number
  /** startAt − now */
  delayMs: number
  gainDb: number
  /** gainDb as a volume multiplier */
  gain: number
  semitones: number
  /** semitones as a speed: 2 = an octave up and twice as fast */
  playbackRate: number
  /** Ladder sounds: which step played (0 = bottom), else null */
  ladderStep: number | null
  trimStartSec: number
  trimEndSec: number
  fadeInSec: number
  fadeOutSec: number
  loop: boolean
  loopStartSec: number
  loopEndSec: number
  /** 0 = off */
  lowpassHz: number
  highpassHz: number
  pan: number
  duck: boolean
  priority: number
  /** true = play it from the file through an <audio> element (music, ambience) instead of a decoded copy */
  stream: boolean
  /** Streamed loops: the crossfade at the loop point */
  loopCrossfadeSec: number
  /** Voices the engine stops first to make room (their ids) */
  steal: number[]
}

export interface Drop {
  kind: 'drop'
  sound: string
  reason: DropReason
  /** Plain-English detail for the log */
  detail: string
}

export interface PlanResult {
  plan: PlayPlan | Drop
  /** The sound's memory after this decision (unchanged on a drop) */
  memory: SoundMemory
}

/** Semitones above the bottom note for a ladder step: pentatonic step 5 = 12 (an octave up). */
export function ladderSemitones(scale: ScaleName, step: number): number {
  const notes = SCALES[scale]
  return notes[step % notes.length] + 12 * Math.floor(step / notes.length)
}

const isLoopBus = (bus: BusName) => bus === 'music' || bus === 'ambience'

/** Does this sound stream from its file (stream: auto → music + ambience do; always; never)? */
export const soundStreams = (sound: SoundConfig): boolean => sound.stream === 'always' || (sound.stream === 'auto' && isLoopBus(sound.bus))
/** ±range, evenly spread */
const spread = (rng: () => number, range: number) => (range > 0 ? (rng() * 2 - 1) * range : 0)

/** Picks the next file index. random = never the same one twice · sequence = in order · shuffle = each once per round. */
function pickFile(sound: SoundConfig, memory: SoundMemory, rng: () => number): { index: number; bag: number[] } {
  const count = sound.files.length
  if (count === 1) return { index: 0, bag: [] }
  const last = memory.lastFile !== null && memory.lastFile < count ? memory.lastFile : null
  if (sound.pick === 'sequence') return { index: last === null ? 0 : (last + 1) % count, bag: [] }
  if (sound.pick === 'shuffle') {
    let bag = memory.bag.filter((i) => i < count)
    if (bag.length === 0) {
      bag = Array.from({ length: count }, (_, i) => i)
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j], bag[i]]
      }
      // A new round never starts with the file that just ended the last one
      if (bag[0] === last) [bag[0], bag[count - 1]] = [bag[count - 1], bag[0]]
    }
    return { index: bag[0], bag: bag.slice(1) }
  }
  // random, never the same twice: pick among the others
  if (last === null) return { index: Math.floor(rng() * count), bag: [] }
  const index = Math.floor(rng() * (count - 1))
  return { index: index >= last ? index + 1 : index, bag: [] }
}

/** Decides one play request. Pure: the same input always gives the same answer, and nothing passed in is changed. */
export function planPlay(input: PlanInput): PlanResult {
  const { name, config, options = {}, now, rng, engine } = input
  const memory = input.memory ?? freshMemory()
  const sound = config.sounds[name]
  const drop = (reason: DropReason, detail: string): PlanResult => ({ plan: { kind: 'drop', sound: name, reason, detail }, memory })

  if (!sound) return drop('unknown-sound', `no sound called "${name}" in content/audio.json`)
  if (sound.files.length === 0) return drop('no-files', `"${name}" has no files yet`)
  if (options.catchUp) return drop('catch-up', 'replaying the past — silent by rule')
  if (engine === 'locked') return drop('locked', 'audio starts on the first tap')
  if (engine === 'suspended') return drop('suspended', 'audio is paused (hidden tab, call or lock screen) — dropped, not queued')
  if (input.muted && !sound.loop) return drop('muted', 'Sound is off (Settings)')

  // When: a moment in the past (within staleMs) plays now; older is dropped; the future is scheduled
  const at = options.at ?? now
  const lateBy = now - at
  if (lateBy > config.limits.staleMs) return drop('stale', `asked for ${Math.round(lateBy)} ms late (limit ${config.limits.staleMs} ms)`)
  const startAt = Math.max(now, at) + sound.delayMs + Math.max(0, options.delayMs ?? 0)

  const playing = input.voices.filter((voice) => voice.endAt > startAt)
  const copies = playing.filter((voice) => voice.sound === name)
  if (sound.loop && copies.length > 0) return drop('already-playing', `"${name}" is already looping`)
  if (memory.lastStartAt !== null && Math.abs(startAt - memory.lastStartAt) < sound.cooldownMs) {
    return drop('cooldown', `played ${Math.round(Math.abs(startAt - memory.lastStartAt))} ms ago (cooldown ${sound.cooldownMs} ms)`)
  }

  // Copies of this sound: one more than maxVoices cuts the oldest copies
  const steal: number[] = []
  if (copies.length >= sound.maxVoices) {
    const oldestFirst = [...copies].sort((a, b) => a.startAt - b.startAt)
    steal.push(...oldestFirst.slice(0, copies.length - sound.maxVoices + 1).map((voice) => voice.id))
  }

  // All effect + menu sounds at once (music and ambience don't count): cut the least important, quietest, oldest
  if (!isLoopBus(sound.bus) && !sound.loop) {
    const counted = playing.filter((voice) => !isLoopBus(voice.bus) && Number.isFinite(voice.endAt) && !steal.includes(voice.id))
    if (counted.length >= config.limits.maxVoices) {
      const victim = counted
        .filter((voice) => voice.priority <= sound.priority)
        .sort((a, b) => a.priority - b.priority || a.gainDb - b.gainDb || a.startAt - b.startAt)[0]
      if (!victim) return drop('global-limit', `${counted.length} sounds already playing, all more important`)
      steal.push(victim.id)
    }
  }

  // Which file, how loud, how high (random numbers are always drawn in this order, so a seed replays exactly)
  const picked = pickFile(sound, memory, rng)
  const gainDb = sound.volumeDb + (options.volumeDb ?? 0) + spread(rng, sound.randomVolumeDb)

  let ladderStep: number | null = null
  let ladderLastAt = memory.ladderLastAt
  let semitones = sound.pitch + (options.pitch ?? 0)
  if (sound.ladder) {
    const top = config.ladder.steps - 1
    const recent = memory.ladderLastAt !== null && Math.abs(startAt - memory.ladderLastAt) <= config.ladder.resetMs
    ladderStep = options.step !== undefined
      ? Math.min(top, Math.max(0, Math.round(options.step)))
      : recent ? Math.min(top, memory.ladderStep + 1) : 0
    ladderLastAt = startAt
    // No random pitch on a ladder: it would knock the notes out of key
    semitones += ladderSemitones(config.ladder.scale, ladderStep)
  } else {
    semitones += spread(rng, sound.randomPitch)
  }

  const plan: PlayPlan = {
    kind: 'play',
    sound: name,
    file: sound.files[picked.index],
    fileIndex: picked.index,
    bus: sound.bus,
    startAt,
    delayMs: startAt - now,
    gainDb,
    gain: dbToGain(gainDb),
    semitones,
    playbackRate: semitonesToRate(semitones),
    ladderStep,
    trimStartSec: sound.trimStartMs / 1000,
    trimEndSec: sound.trimEndMs / 1000,
    fadeInSec: sound.fadeInMs / 1000,
    fadeOutSec: sound.fadeOutMs / 1000,
    loop: sound.loop,
    loopStartSec: sound.loopStartMs / 1000,
    loopEndSec: sound.loopEndMs / 1000,
    lowpassHz: sound.lowpassHz,
    highpassHz: sound.highpassHz,
    pan: Math.min(1, Math.max(-1, options.pan ?? sound.pan)),
    duck: sound.duck,
    priority: sound.priority,
    stream: soundStreams(sound),
    loopCrossfadeSec: sound.loopCrossfadeMs / 1000,
    steal,
  }
  return {
    plan,
    memory: {
      lastStartAt: startAt,
      lastFile: picked.index,
      bag: picked.bag,
      ladderStep: ladderStep ?? memory.ladderStep,
      ladderLastAt,
    },
  }
}

/** A small seeded random (mulberry32): the same seed gives the same numbers — for tests and replays. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

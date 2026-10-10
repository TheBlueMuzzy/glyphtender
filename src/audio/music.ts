// MUSIC — tracks made of layers, that come and go (framework F28; design: framework/.planning/design/audio.md "Music").
//
//   each layer: <audio> stream (stream.ts) → layer volume (its volumeDb × the intensity curve) ─┐
//   track: fade (in / out / rests / switching) → the Music volume group (so ducking + snapshots apply)
//
// - A track's layers start together and stay together (layers should be files of the same length).
// - ONE intensity, 0–1 (setIntensity): each layer fades in between its fromIntensity and fullAtIntensity.
// - One track at a time: playing another one crossfades (the old one fades out while the new one fades in).
// - Rests: after `playsBeforeRest` plays (a loop counts each time round, a piece counts when it ends) the music fades out
//   over fadeOutMs, stays quiet for a random time in restSeconds, then fades back in over fadeInMs. The game's ambience
//   carries the quiet. Rests only count time while audio is running (a hidden tab doesn't use up a rest).
// - Every start / play / rest / stop is logged (log.ts, result "music"), so tests and the Dev Kit can see them.
import { dbToGain, type AudioConfig, type MusicLayerConfig, type MusicTrackConfig } from './config.ts'
import type { LogEntry } from './log.ts'
import type { EngineState } from './planner.ts'
import { createStream, type MakeMediaElement, type Stream, type Timers } from './stream.ts'

/** How loud a layer is at an intensity, 0…1 (before its volumeDb). Silent up to fromIntensity, full from fullAtIntensity,
 *  and in between the same curve as the player's sliders (t²), so halfway sounds like halfway. */
export function layerLevel(layer: Pick<MusicLayerConfig, 'fromIntensity' | 'fullAtIntensity'>, intensity: number): number {
  if (intensity >= layer.fullAtIntensity) return 1
  if (intensity <= layer.fromIntensity) return 0
  const t = (intensity - layer.fromIntensity) / (layer.fullAtIntensity - layer.fromIntensity)
  return t * t
}

/** A rest's length (ms): a random time between restSeconds[0] and restSeconds[1] */
export function restLengthMs(track: Pick<MusicTrackConfig, 'restSeconds'>, rng: () => number): number {
  const [low, high] = track.restSeconds
  return Math.round((low + rng() * (high - low)) * 1000)
}

/** off · waiting (asked for, audio can't play yet) · playing · fading (to a rest) · resting */
export type MusicPhase = 'off' | 'waiting' | 'playing' | 'fading' | 'resting'

export interface MusicState {
  track: string | null
  phase: MusicPhase
  /** Which play of this round (1 = the first after a start or a rest) */
  play: number
  playsBeforeRest: number
  /** While resting: how long until it comes back (ms) */
  restLeftMs: number
  intensity: number
  /** Each layer's volume right now (0…1, its volumeDb × the intensity curve) */
  layers: { name: string; file: string; gain: number }[]
}

export interface MusicDeps {
  /** The AudioContext, or null before the first tap */
  context: () => AudioContext | null
  /** Where tracks play into: the Music volume group's input (null before the first tap) */
  output: () => AudioNode | null
  config: () => AudioConfig
  state: () => EngineState
  url: (file: string) => string
  makeElement: MakeMediaElement
  timers: Timers
  rng: () => number
  now: () => number
  log: (entry: LogEntry) => void
}

export interface Music {
  play(name: string, options?: { fadeMs?: number }): void
  /** Fades the music out. With `track`, only if that track is the one playing. */
  stop(options?: { fadeMs?: number; track?: string }): void
  setIntensity(intensity: number, options?: { rampMs?: number }): void
  /** Dev Kit: fade out and rest now · come back now */
  restNow(): void
  backNow(): void
  state(): MusicState
  /** Advance by dtMs of running time (0 while paused). The engine calls it ~every 50 ms while music is on. */
  tick(dtMs: number): void
  /** Audio can play (true) or is paused (false): pauses / resumes the streams; starts a track that was waiting */
  setRunning(running: boolean): void
  /** content/audio.json changed (Dev Kit): layer volumes follow at once, the rest at the next play */
  configChanged(): void
  /** Inside a tap: start streams the browser refused to start */
  retryBlocked(): void
  /** Is anything playing, resting or fading (does it need ticks)? */
  active(): boolean
  dispose(): void
}

interface Layer {
  name: string
  file: string
  gain: GainNode
  stream: Stream | null
}

interface Playing {
  name: string
  /** The track as it was when it started — used if it is deleted from the file meanwhile */
  startedAs: MusicTrackConfig
  out: GainNode
  layers: Layer[]
  phase: 'playing' | 'fading' | 'resting' | 'stopping'
  play: number
  /** The leader's loops already counted */
  seenLoops: number
  /** The last play's fade-out has started */
  fadingOut: boolean
  /** fading → rest, stopping → gone, resting → back: ms left */
  leftMs: number
}

const LIVE_RAMP_SEC = 0.05

function rampTo(param: AudioParam, value: number, at: number, seconds: number) {
  param.cancelScheduledValues(at)
  param.setValueAtTime(param.value, at)
  if (seconds > 0) param.linearRampToValueAtTime(value, at + seconds)
  else param.setValueAtTime(value, at)
}

export function createMusic(deps: MusicDeps): Music {
  let current: Playing | null = null
  const leaving = new Set<Playing>() // tracks fading out after a switch or a stop
  let wanted: { name: string; fadeMs?: number } | null = null
  let intensity = 0
  let running = false

  const trackOf = (p: Playing): MusicTrackConfig => deps.config().music.tracks[p.name] ?? p.startedAs
  const log = (id: string, event: LogEntry['event'], detail?: string) =>
    deps.log({ t: deps.now(), id, result: 'music', event, ...(detail ? { detail } : {}) })

  function layerGain(p: Playing, layer: Layer): number {
    const config = trackOf(p).layers[layer.name]
    return config ? dbToGain(config.volumeDb) * layerLevel(config, intensity) : 0
  }

  /** Is this play the last one before a rest? */
  const isLastPlay = (p: Playing) => {
    const plays = trackOf(p).playsBeforeRest
    return plays > 0 && p.play >= plays
  }

  /** A loop keeps looping until its last play before a rest; that one plays on into the file's ending */
  function updateLooping(p: Playing) {
    const loop = trackOf(p).loop && !isLastPlay(p)
    for (const layer of p.layers) layer.stream?.setLooping(loop)
  }

  function releaseStreams(p: Playing) {
    for (const layer of p.layers) {
      layer.stream?.release()
      layer.stream = null
    }
  }

  /** Starts every layer's stream from the top, together */
  function startStreams(ctx: AudioContext, p: Playing) {
    releaseStreams(p)
    const track = trackOf(p)
    for (const layer of p.layers) {
      layer.stream = createStream(ctx, {
        url: deps.url(layer.file),
        output: layer.gain,
        rate: 1,
        startSec: 0,
        loop: track.loop,
        loopStartSec: track.loopStartMs / 1000,
        loopEndSec: track.loopEndMs / 1000,
        endTrimSec: 0,
        seamSec: track.loopCrossfadeMs / 1000,
      }, deps.makeElement, deps.timers)
    }
    // Started in one go, after all are made, so they line up as closely as the browser allows
    for (const layer of p.layers) {
      layer.stream?.start()
      if (!running) layer.stream?.pause()
    }
    p.seenLoops = 0
    p.fadingOut = false
    updateLooping(p)
  }

  /** A new round: play 1, fading in */
  function startRound(p: Playing, fadeSec: number, detail: string) {
    const ctx = deps.context()
    if (!ctx) return
    p.phase = 'playing'
    p.play = 1
    p.leftMs = 0
    rampTo(p.out.gain, 1, ctx.currentTime, fadeSec)
    startStreams(ctx, p)
    log(p.name, 'play', `play 1${playsText(p)}${detail}`)
  }
  const playsText = (p: Playing) => (trackOf(p).playsBeforeRest > 0 ? ` of ${trackOf(p).playsBeforeRest}` : '')

  function beginRest(p: Playing) {
    releaseStreams(p)
    p.phase = 'resting'
    p.leftMs = restLengthMs(trackOf(p), deps.rng)
    const ctx = deps.context()
    if (ctx) rampTo(p.out.gain, 0, ctx.currentTime, 0)
    log(p.name, 'rest', `${Math.round(p.leftMs / 1000)} s`)
  }

  function fadeOut(p: Playing, fadeMs: number) {
    const ctx = deps.context()
    if (ctx) rampTo(p.out.gain, 0, ctx.currentTime, fadeMs / 1000)
    p.leftMs = fadeMs
  }

  function start(name: string, fadeMs: number | undefined) {
    const ctx = deps.context()
    const output = deps.output()
    const track = deps.config().music.tracks[name]
    if (!ctx || !output || !track) return
    if (current) {
      const old = current
      old.phase = 'stopping'
      fadeOut(old, fadeMs ?? trackOf(old).fadeOutMs)
      leaving.add(old)
      log(old.name, 'stop', `switching to ${name}`)
    }
    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(output)
    const layers: Layer[] = Object.entries(track.layers).map(([layerName, layer]) => {
      const gain = ctx.createGain()
      gain.connect(out)
      return { name: layerName, file: layer.file, gain, stream: null }
    })
    const p: Playing = { name, startedAs: structuredClone(track), out, layers, phase: 'playing', play: 1, seenLoops: 0, fadingOut: false, leftMs: 0 }
    for (const layer of layers) layer.gain.gain.value = layerGain(p, layer)
    current = p
    log(name, 'start', `${layers.length} ${layers.length === 1 ? 'layer' : 'layers'}`)
    startRound(p, (fadeMs ?? track.fadeInMs) / 1000, '')
  }

  function tickPlaying(p: Playing) {
    const leader = p.layers[0]?.stream
    if (!leader) return
    for (const layer of p.layers) layer.stream?.tick()
    // Each time the leader loops = the next play
    while (p.seenLoops < leader.loopsDone()) {
      p.seenLoops++
      p.play++
      log(p.name, 'play', `play ${p.play}${playsText(p)}`)
      updateLooping(p)
    }
    const track = trackOf(p)
    if (isLastPlay(p) && !p.fadingOut) {
      // The last play before a rest fades out to silence right at its end
      const leftSec = leader.remainingSec()
      if (leftSec * 1000 <= track.fadeOutMs) {
        p.fadingOut = true
        const ctx = deps.context()
        if (ctx) rampTo(p.out.gain, 0, ctx.currentTime, leftSec)
      }
    }
    if (leader.ended()) {
      if (isLastPlay(p)) {
        beginRest(p)
      } else {
        // A piece with an ending, more plays to go: from the top again
        const ctx = deps.context()
        if (!ctx) return
        startStreams(ctx, p)
        p.play++
        log(p.name, 'play', `play ${p.play}${playsText(p)}`)
        updateLooping(p)
      }
    }
  }

  function tickOne(p: Playing, dtMs: number) {
    if (p.phase === 'playing') return tickPlaying(p)
    if (p.phase === 'fading' || p.phase === 'stopping') for (const layer of p.layers) layer.stream?.tick()
    p.leftMs -= dtMs
    if (p.leftMs > 0) return
    if (p.phase === 'fading') beginRest(p)
    else if (p.phase === 'resting') startRound(p, trackOf(p).fadeInMs / 1000, ' — back after a rest')
    else if (p.phase === 'stopping') {
      releaseStreams(p)
      p.out.disconnect()
      leaving.delete(p)
    }
  }

  function applyLayerGains(rampSec: number) {
    const ctx = deps.context()
    if (!ctx || !current) return
    for (const layer of current.layers) rampTo(layer.gain.gain, layerGain(current, layer), ctx.currentTime, rampSec)
  }

  const all = () => [...(current ? [current] : []), ...leaving]

  function stopMusic(options: { fadeMs?: number; track?: string } = {}) {
    if (options.track !== undefined) {
      if (wanted?.name === options.track) wanted = null
      if (current?.name !== options.track) return
    } else wanted = null
    if (!current) return
    const p = current
    current = null
    p.phase = 'stopping'
    fadeOut(p, options.fadeMs ?? trackOf(p).fadeOutMs)
    leaving.add(p)
    log(p.name, 'stop')
  }

  return {
    play(name, options = {}) {
      const track = deps.config().music.tracks[name]
      if (!track) {
        deps.log({ t: deps.now(), id: name, result: 'dropped', reason: 'unknown-sound', detail: `no music track called "${name}" in content/audio.json` })
        return
      }
      if (Object.keys(track.layers).length === 0) {
        deps.log({ t: deps.now(), id: name, result: 'dropped', reason: 'no-files', detail: `music track "${name}" has no layers yet` })
        return
      }
      if (current?.name === name) return // already on (playing, fading or resting) — React effects may ask twice
      const engine = deps.state()
      if (engine !== 'running' || !deps.context()) {
        wanted = { name, fadeMs: options.fadeMs }
        const reason = engine === 'suspended' ? 'suspended' : 'locked'
        deps.log({ t: deps.now(), id: name, result: 'dropped', reason, detail: 'music starts as soon as audio can play' })
        return
      }
      wanted = null
      running = true
      start(name, options.fadeMs)
    },
    stop: stopMusic,
    setIntensity(value, options = {}) {
      intensity = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
      applyLayerGains((options.rampMs ?? 300) / 1000)
    },
    restNow() {
      if (!current || current.phase !== 'playing') return
      current.phase = 'fading'
      fadeOut(current, trackOf(current).fadeOutMs)
    },
    backNow() {
      if (!current || (current.phase !== 'resting' && current.phase !== 'fading')) return
      startRound(current, trackOf(current).fadeInMs / 1000, ' — back now')
    },
    state() {
      const p = current
      const phase: MusicPhase = p ? (p.phase === 'stopping' ? 'off' : p.phase) : wanted ? 'waiting' : 'off'
      const track = p ? trackOf(p) : wanted ? deps.config().music.tracks[wanted.name] : undefined
      return {
        track: p?.name ?? wanted?.name ?? null,
        phase,
        play: p?.play ?? 0,
        playsBeforeRest: track?.playsBeforeRest ?? 0,
        restLeftMs: p?.phase === 'resting' ? Math.max(0, p.leftMs) : 0,
        intensity,
        layers: p ? p.layers.map((layer) => ({ name: layer.name, file: layer.file, gain: layerGain(p, layer) })) : [],
      }
    },
    tick(dtMs) {
      for (const p of all()) tickOne(p, dtMs)
    },
    setRunning(value) {
      running = value
      for (const p of all()) for (const layer of p.layers) {
        if (value) layer.stream?.resume()
        else layer.stream?.pause()
      }
      if (value && wanted && !current) {
        const { name, fadeMs } = wanted
        wanted = null
        start(name, fadeMs)
      }
    },
    configChanged() {
      if (current && !deps.config().music.tracks[current.name]) {
        stopMusic()
        return
      }
      applyLayerGains(LIVE_RAMP_SEC)
      if (current?.phase === 'playing') updateLooping(current)
    },
    retryBlocked() {
      for (const p of all()) for (const layer of p.layers) layer.stream?.retry()
    },
    active: () => current !== null || leaving.size > 0,
    dispose() {
      for (const p of all()) releaseStreams(p)
      current = null
      leaving.clear()
      wanted = null
    },
  }
}

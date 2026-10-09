// THE ENGINE — the browser side. Owns one AudioContext and plays the planner's plans through the mix:
//
//   each sound: source → [thin] → [muffle] → volume → [left/right] ─┐
//   bus (music · ambience · sfx · ui): level (content dB × player slider) → mix (snapshots) ─[music: duck → muffle]─┐
//   master (player slider × mute, mono option) → limiter (nothing above master.limiterDb) → speakers
//
// Phone rules it handles (design: framework/.planning/design/audio.md, "Phones and the web"):
// - The AudioContext is made lazily, inside the first tap/key (pointerup · touchend · keydown, capture phase).
// - iPhone silent switch is respected: navigator.audioSession.type = 'ambient' when the browser has it.
// - Tab hidden / phone call / lock screen → suspended. Sounds asked for meanwhile are DROPPED (logged), never queued,
//   so twenty sounds don't burst out on return. Loops asked for meanwhile start once audio can play again.
// - Back to visible → resume; if the browser refuses without a tap, the next tap resumes (the tap listeners stay on).
import { BUSES, dbToGain, readAudioConfig, sliderToGain, type AudioConfig, type BusName, type Tier } from './config.ts'
import { createLoader, type FetchFile, type Loader } from './loader.ts'
import { createLog, type AudioLog, type LogEntry } from './log.ts'
import { planPlay, type ActiveVoice, type Drop, type EngineState, type PlayOptions, type PlayPlan, type SoundMemory } from './planner.ts'

/** Safari's Audio Session API (not in TypeScript's DOM types yet) */
interface AudioSessionLike {
  type?: string
  state?: string
  addEventListener?: (type: 'statechange', listener: () => void) => void
  removeEventListener?: (type: 'statechange', listener: () => void) => void
}
interface DocumentLike extends EventTarget {
  visibilityState: DocumentVisibilityState | string
}

export interface AudioOptions {
  /** The app's base URL — in Vite pass import.meta.env.BASE_URL. Files load from <baseUrl>audio/<file>. Default "/". */
  baseUrl?: string
  /** How to fetch a file (tests pass a fake). Default: fetch(). */
  fetchFile?: FetchFile
  /** Makes the AudioContext (tests pass a fake). Called once, inside the first tap. Default: new AudioContext(). */
  context?: () => AudioContext
  /** The clock `at` is measured on (ms). Default: performance.now() — the same clock as requestAnimationFrame. */
  now?: () => number
  /** Random 0 ≤ n < 1 for variants and random pitch/volume. Default Math.random. */
  rng?: () => number
  /** Load every effect + menu sound right after the unlock (default true). Otherwise each loads on its first play. */
  preload?: boolean
  /** How many log entries to keep (default 200) */
  logSize?: number
  /** For tests: where taps, visibility and the audio session are watched. Default: the real window / document / navigator. */
  window?: EventTarget
  document?: DocumentLike
  navigator?: { audioSession?: AudioSessionLike }
}

export type BusOrMaster = BusName | 'master'

/** What createAudio gives a game. */
export interface Audio {
  /** Plays a named sound from content/audio.json. Returns the plan, or the drop with its reason. Never throws. */
  play(name: string, options?: PlayOptions): PlayPlan | Drop
  /** Plays the default sound of a feel tier (tiers.small / medium / big in content/audio.json) */
  playTier(tier: Tier, options?: PlayOptions): PlayPlan | Drop
  /** Stops every copy of a sound (e.g. a loop), fading out over fadeMs (default 150) */
  stop(name: string, options?: { fadeMs?: number }): void
  stopAll(options?: { fadeMs?: number }): void
  /** A player slider, 0–100 (0 = silent). Curve: see sliderToGain in config.ts. */
  setBusVolume(bus: BusOrMaster, slider: number): void
  setMuted(muted: boolean): void
  setMuteInBackground(mute: boolean): void
  setMono(mono: boolean): void
  /** Switch to a named mix from content/audio.json (e.g. "paused"), or null for the normal mix. Fades over its fadeMs. */
  snapshot(name: string | null): void
  /** Lowers the music for a moment (duck.amountDb, down in duck.downMs, back over duck.backMs) */
  duck(): void
  /** Call from inside a tap/key handler to start audio. (Happens on its own on the first tap — only needed for custom flows.) */
  unlock(): void
  /** locked (no tap yet) · running · suspended (hidden, call, lock screen) */
  state(): EngineState
  /** Swap in a new content/audio.json (live Dev Kit tuning). Raw JSON is validated; bad values warn and get safe defaults. */
  setConfig(raw: unknown): void
  config(): AudioConfig
  /** Load these sounds' files now (default: every effect + menu sound). */
  preload(names?: string[]): Promise<void>
  /** Forget a loaded file so its next play loads it fresh (Dev Kit dropped in a new file) */
  reloadFile(file: string): void
  /** What is playing or scheduled right now */
  voices(): ActiveVoice[]
  log: AudioLog
  /** Called with every play / drop. Returns a function that stops listening. */
  onLog(listener: (entry: LogEntry) => void): () => void
  /** Removes the tap / visibility listeners and closes the AudioContext */
  dispose(): void
}

interface BusNodes {
  /** content dB × player slider */
  level: GainNode
  /** snapshots */
  mix: GainNode
}

interface Graph {
  master: GainNode
  limiter: DynamicsCompressorNode
  buses: Record<BusName, BusNodes>
  musicDuck: GainNode
  musicMuffle: BiquadFilterNode
}

interface PlayingVoice extends ActiveVoice {
  source: AudioBufferSourceNode
  volume: GainNode
  nodes: AudioNode[]
}

const OFF_HZ = 20000 // a lowpass this high changes nothing
const STEAL_FADE_SEC = 0.015 // short fade so a cut voice doesn't click
const SLIDER_RAMP_SEC = 0.05
const GESTURES = ['pointerup', 'touchend', 'keydown'] as const

/** Moves an AudioParam to a value over `seconds` (a ramp, so it never clicks). */
function rampTo(param: AudioParam, value: number, at: number, seconds: number) {
  param.cancelScheduledValues(at)
  param.setValueAtTime(param.value, at)
  if (seconds > 0) param.linearRampToValueAtTime(value, at + seconds)
  else param.setValueAtTime(value, at)
}

export function createAudio(rawConfig: unknown, options: AudioOptions = {}): Audio {
  let config = readAudioConfig(rawConfig)
  const clock = options.now ?? (() => performance.now())
  const rng = options.rng ?? Math.random
  const makeContext = options.context ?? (() => new AudioContext())
  const win: EventTarget | undefined = options.window ?? (typeof window !== 'undefined' ? window : undefined)
  const doc: DocumentLike | undefined = options.document ?? (typeof document !== 'undefined' ? document : undefined)
  const nav = options.navigator ?? (typeof navigator !== 'undefined' ? (navigator as { audioSession?: AudioSessionLike }) : undefined)
  const log = createLog(options.logSize)

  let ctx: AudioContext | null = null
  let graph: Graph | null = null
  let loader: Loader | null = null
  let unlockedOnce = false
  let disposed = false
  let hidden = doc?.visibilityState === 'hidden'
  let muted = false
  let muteInBackground = true
  let mono = false
  let currentSnapshot: string | null = null
  let nextVoiceId = 1
  const sliders: Record<BusOrMaster, number> = { master: 100, music: 100, ambience: 100, sfx: 100, ui: 100 }
  const voices = new Map<number, PlayingVoice>()
  const memory = new Map<string, SoundMemory>()
  /** Loops asked for while audio couldn't play (locked / suspended / still loading) — started once it can */
  const wantedLoops = new Map<string, PlayOptions>()

  // ---------- state ----------
  function state(): EngineState {
    if (!ctx || !unlockedOnce) return 'locked'
    if (ctx.state !== 'running') return 'suspended' // includes iOS's 'interrupted'
    if (nav?.audioSession?.state === 'interrupted') return 'suspended'
    if (hidden && muteInBackground) return 'suspended'
    return 'running'
  }

  function onStateChange() {
    if (disposed || !ctx) return
    if (ctx.state === 'running' && !unlockedOnce) {
      unlockedOnce = true
      if (options.preload !== false) void preload()
    }
    if (state() === 'running') startWantedLoops()
  }

  // ---------- the context and the mix (made inside the first tap) ----------
  function ensureContext(): AudioContext {
    if (ctx) return ctx
    // iPhone: 'ambient' respects the silent switch and mixes with the player's own music. Set before the context starts.
    try {
      if (nav?.audioSession) nav.audioSession.type = 'ambient'
    } catch { /* not settable here: fine */ }
    const context = makeContext()
    ctx = context
    loader = createLoader({ decode: (data) => context.decodeAudioData(data), baseUrl: options.baseUrl, fetchFile: options.fetchFile })

    const limiter = context.createDynamicsCompressor()
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.25
    limiter.connect(context.destination)
    const master = context.createGain()
    master.connect(limiter)
    const musicDuck = context.createGain()
    const musicMuffle = context.createBiquadFilter()
    musicMuffle.type = 'lowpass'
    musicMuffle.frequency.value = OFF_HZ
    musicDuck.connect(musicMuffle)
    musicMuffle.connect(master)
    const buses = {} as Record<BusName, BusNodes>
    for (const bus of BUSES) {
      const level = context.createGain()
      const mix = context.createGain()
      level.connect(mix)
      mix.connect(bus === 'music' ? musicDuck : master)
      buses[bus] = { level, mix }
    }
    graph = { master, limiter, buses, musicDuck, musicMuffle }
    applyMixNow()
    if (currentSnapshot) applySnapshot(currentSnapshot, 0)

    context.onstatechange = onStateChange
    nav?.audioSession?.addEventListener?.('statechange', onStateChange)
    return context
  }

  /** Levels, limiter and mono from config + player settings, set instantly (used when the mix is first built) */
  function applyMixNow() {
    if (!graph || !ctx) return
    graph.limiter.threshold.value = config.master.limiterDb
    graph.master.gain.value = masterGain()
    for (const bus of BUSES) graph.buses[bus].level.gain.value = busGain(bus)
    applyMono()
  }
  const masterGain = () => (muted ? 0 : sliderToGain(sliders.master))
  const busGain = (bus: BusName) => dbToGain(config.buses[bus]) * sliderToGain(sliders[bus])

  function applyMono() {
    if (!graph) return
    // One channel at the master: the browser folds left + right together ("speakers" mixing), the limiter spreads it to both ears
    graph.master.channelCount = mono ? 1 : 2
    graph.master.channelCountMode = 'explicit'
    graph.master.channelInterpretation = 'speakers'
  }

  // ---------- unlock (first tap) ----------
  function unlock() {
    if (disposed) return
    const context = ensureContext()
    if (context.state === 'running') {
      onStateChange()
      return
    }
    // iOS: resume and a silent sound must start synchronously inside the tap
    context.resume().then(onStateChange, () => { /* refused: the next tap tries again */ })
    try {
      const blip = context.createBufferSource()
      blip.buffer = context.createBuffer(1, 1, context.sampleRate)
      blip.connect(context.destination)
      blip.start(0)
    } catch { /* a fake or closed context: fine */ }
  }
  // The tap listeners stay on: a tap after a phone call or a stuck 'interrupted' state resumes audio too
  const onGesture = () => {
    if (state() !== 'running' && !(hidden && muteInBackground)) unlock()
  }
  for (const type of GESTURES) win?.addEventListener(type, onGesture, { capture: true })

  // ---------- hidden tab ----------
  function onVisibility() {
    hidden = doc?.visibilityState === 'hidden'
    if (!ctx || !unlockedOnce) return
    if (hidden && muteInBackground) {
      ctx.suspend().catch(() => {})
    } else if (ctx.state !== 'running') {
      ctx.resume().then(onStateChange, () => {})
    } else {
      onStateChange()
    }
  }
  doc?.addEventListener('visibilitychange', onVisibility)

  // ---------- playing ----------
  function pruneEnded(now: number) {
    for (const [id, voice] of voices) if (voice.endAt <= now) forgetVoice(id)
  }
  function forgetVoice(id: number) {
    const voice = voices.get(id)
    if (!voice) return
    voices.delete(id)
    for (const node of voice.nodes) node.disconnect()
  }
  function stopVoice(id: number, fadeSec: number) {
    const voice = voices.get(id)
    if (!voice || !ctx) return
    const at = ctx.currentTime
    rampTo(voice.volume.gain, 0, at, fadeSec)
    try {
      voice.source.stop(at + fadeSec)
    } catch { /* already stopped */ }
    voices.delete(id) // gone from the count now; its nodes disconnect when it ends
  }

  function record(entry: LogEntry) {
    log.add(entry)
  }

  function play(name: string, playOptions: PlayOptions = {}): PlayPlan | Drop {
    const now = clock()
    if (disposed) return { kind: 'drop', sound: name, reason: 'suspended', detail: 'audio was shut down' }
    pruneEnded(now)
    const sound = config.sounds[name]
    const result = planPlay({
      name, config, options: playOptions, now, rng, engine: state(), muted,
      voices: [...voices.values()], memory: memory.get(name),
    })
    const { plan } = result
    if (plan.kind === 'drop') {
      // A loop (music, ambience) asked for while audio is locked or paused is remembered and starts when it can
      if (sound?.loop && (plan.reason === 'locked' || plan.reason === 'suspended')) wantedLoops.set(name, { ...playOptions, at: undefined })
      else wantedLoops.delete(name)
      record({ t: now, id: name, result: 'dropped', reason: plan.reason, detail: plan.detail })
      return plan
    }
    const buffer = loader?.get(plan.file)
    if (!ctx || !graph || !buffer) {
      // Not loaded yet: start loading. A loop starts when it arrives; a one-shot is dropped (it would be late).
      if (plan.loop) wantedLoops.set(name, { ...playOptions, at: undefined })
      void loader?.load(plan.file).then((loaded) => {
        if (loaded && wantedLoops.has(name) && state() === 'running') startWantedLoops()
      })
      const drop: Drop = { kind: 'drop', sound: name, reason: 'not-loaded', detail: `${plan.file} is still loading` }
      record({ t: now, id: name, result: 'dropped', reason: drop.reason, detail: drop.detail, file: plan.file })
      return drop
    }
    memory.set(name, result.memory)
    wantedLoops.delete(name)
    for (const id of plan.steal) stopVoice(id, STEAL_FADE_SEC)
    startVoice(plan, buffer, ctx, graph)
    record({ t: now, id: name, result: 'played', file: plan.file, delayMs: plan.delayMs, ...(plan.ladderStep !== null ? { step: plan.ladderStep } : {}) })
    return plan
  }

  function startVoice(plan: PlayPlan, buffer: AudioBuffer, context: AudioContext, mix: Graph) {
    const startTime = context.currentTime + plan.delayMs / 1000
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = plan.playbackRate
    const nodes: AudioNode[] = [source]
    const chain = (node: AudioNode) => {
      nodes[nodes.length - 1].connect(node)
      nodes.push(node)
    }
    if (plan.highpassHz > 0) {
      const thin = context.createBiquadFilter()
      thin.type = 'highpass'
      thin.frequency.value = plan.highpassHz
      chain(thin)
    }
    if (plan.lowpassHz > 0) {
      const muffle = context.createBiquadFilter()
      muffle.type = 'lowpass'
      muffle.frequency.value = plan.lowpassHz
      chain(muffle)
    }
    const volume = context.createGain()
    chain(volume)
    if (plan.pan !== 0) {
      const panner = context.createStereoPanner()
      panner.pan.value = plan.pan
      chain(panner)
    }
    nodes[nodes.length - 1].connect(mix.buses[plan.bus].level)

    const offset = Math.min(plan.trimStartSec, buffer.duration)
    let seconds = Infinity // how long it plays, in real time
    if (plan.loop) {
      source.loop = true
      if (plan.loopEndSec > 0) {
        source.loopStart = plan.loopStartSec
        source.loopEnd = Math.min(plan.loopEndSec, buffer.duration)
      }
      source.start(startTime, offset)
    } else {
      const bufferSeconds = Math.max(0, buffer.duration - offset - plan.trimEndSec)
      seconds = bufferSeconds / plan.playbackRate
      source.start(startTime, offset, bufferSeconds)
    }

    // Volume envelope: fade in, hold, fade out before the end
    if (plan.fadeInSec > 0) {
      volume.gain.setValueAtTime(0, startTime)
      volume.gain.linearRampToValueAtTime(plan.gain, startTime + plan.fadeInSec)
    } else {
      volume.gain.value = plan.gain
    }
    if (plan.fadeOutSec > 0 && Number.isFinite(seconds)) {
      const fade = Math.min(plan.fadeOutSec, seconds)
      volume.gain.setValueAtTime(plan.gain, startTime + seconds - fade)
      volume.gain.linearRampToValueAtTime(0, startTime + seconds)
    }
    if (plan.duck) duckAt(startTime)

    const id = nextVoiceId++
    voices.set(id, {
      id, sound: plan.sound, bus: plan.bus, startAt: plan.startAt,
      endAt: plan.startAt + seconds * 1000, gainDb: plan.gainDb, priority: plan.priority,
      source, volume, nodes,
    })
    source.onended = () => {
      if (voices.get(id)?.source === source) voices.delete(id)
      for (const node of nodes) node.disconnect()
    }
  }

  function startWantedLoops() {
    for (const [name, loopOptions] of [...wantedLoops]) play(name, loopOptions)
  }

  function stop(name: string, stopOptions: { fadeMs?: number } = {}) {
    wantedLoops.delete(name)
    const fade = (stopOptions.fadeMs ?? 150) / 1000
    for (const voice of [...voices.values()]) if (voice.sound === name) stopVoice(voice.id, fade)
  }

  // ---------- mix: sliders, mute, mono, snapshots, duck ----------
  function setBusVolume(bus: BusOrMaster, slider: number) {
    if (!(bus in sliders)) return
    sliders[bus] = Number.isFinite(slider) ? Math.min(100, Math.max(0, slider)) : 100
    if (!graph || !ctx) return
    if (bus === 'master') rampTo(graph.master.gain, masterGain(), ctx.currentTime, SLIDER_RAMP_SEC)
    else rampTo(graph.buses[bus].level.gain, busGain(bus), ctx.currentTime, SLIDER_RAMP_SEC)
  }

  function setMuted(value: boolean) {
    muted = value
    if (graph && ctx) rampTo(graph.master.gain, masterGain(), ctx.currentTime, SLIDER_RAMP_SEC)
  }

  function setMuteInBackground(value: boolean) {
    if (muteInBackground === value) return
    muteInBackground = value
    if (hidden) onVisibility()
  }

  function setMono(value: boolean) {
    mono = value
    applyMono()
  }

  function applySnapshot(name: string | null, fadeSec: number) {
    if (!graph || !ctx) return
    const target = name ? config.snapshots[name] : undefined
    const at = ctx.currentTime
    for (const bus of BUSES) rampTo(graph.buses[bus].mix.gain, dbToGain(target?.[bus] ?? 0), at, fadeSec)
    rampTo(graph.musicMuffle.frequency, target && target.lowpassHz > 0 ? target.lowpassHz : OFF_HZ, at, fadeSec)
  }

  function snapshot(name: string | null) {
    if (name !== null && !config.snapshots[name]) {
      console.warn(`[audio] no snapshot called "${name}" in content/audio.json — the mix is unchanged.`)
      return
    }
    // Fading in uses the new snapshot's time; fading back out uses the one being left
    const fadeMs = config.snapshots[name ?? currentSnapshot ?? '']?.fadeMs ?? 250
    currentSnapshot = name
    applySnapshot(name, fadeMs / 1000)
  }

  function duckAt(at: number) {
    if (!graph) return
    const { amountDb, downMs, backMs } = config.duck
    const gain = graph.musicDuck.gain
    gain.cancelScheduledValues(at)
    gain.setValueAtTime(gain.value, at)
    gain.linearRampToValueAtTime(dbToGain(amountDb), at + downMs / 1000)
    gain.linearRampToValueAtTime(1, at + (downMs + backMs) / 1000)
  }

  // ---------- loading ----------
  function preload(names?: string[]): Promise<void> {
    if (!loader) return Promise.resolve()
    const chosen = names ?? Object.keys(config.sounds).filter((name) => {
      const sound = config.sounds[name]
      return sound.bus === 'sfx' || sound.bus === 'ui'
    })
    return loader.preload(chosen.flatMap((name) => config.sounds[name]?.files ?? []))
  }

  return {
    play,
    playTier: (tier, tierOptions) => play(config.tiers[tier], tierOptions),
    stop,
    stopAll(stopOptions) {
      for (const name of new Set([...voices.values()].map((voice) => voice.sound))) stop(name, stopOptions)
      wantedLoops.clear()
    },
    setBusVolume,
    setMuted,
    setMuteInBackground,
    setMono,
    snapshot,
    duck: () => {
      if (ctx) duckAt(ctx.currentTime)
    },
    unlock,
    state,
    setConfig(raw) {
      config = readAudioConfig(raw)
      if (graph && ctx) {
        const at = ctx.currentTime
        graph.limiter.threshold.value = config.master.limiterDb
        for (const bus of BUSES) rampTo(graph.buses[bus].level.gain, busGain(bus), at, SLIDER_RAMP_SEC)
        if (currentSnapshot && !config.snapshots[currentSnapshot]) currentSnapshot = null
        applySnapshot(currentSnapshot, SLIDER_RAMP_SEC)
      }
    },
    config: () => config,
    preload,
    reloadFile: (file) => loader?.forget(file),
    voices: () => [...voices.values()].map(({ id, sound, bus, startAt, endAt, gainDb, priority }) => ({ id, sound, bus, startAt, endAt, gainDb, priority })),
    log,
    onLog: (listener) => log.subscribe(listener),
    dispose() {
      disposed = true
      for (const type of GESTURES) win?.removeEventListener(type, onGesture, { capture: true })
      doc?.removeEventListener('visibilitychange', onVisibility)
      nav?.audioSession?.removeEventListener?.('statechange', onStateChange)
      voices.clear()
      wantedLoops.clear()
      void ctx?.close().catch(() => {})
    },
  }
}

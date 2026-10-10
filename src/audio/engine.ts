// THE ENGINE — the browser side. Owns one AudioContext and plays the planner's plans through the mix:
//
//   each sound: source → [thin] → [muffle] → volume → [left/right] ─┐
//   bus (music · ambience · sfx · ui): level (content dB × player slider) → mix (snapshots) ─[music: duck → muffle]─┐
//   master (player slider × mute, mono option) → limiter (nothing above master.limiterDb) → speakers
//
// Music + ambience STREAM (stream.ts: an <audio> element → the same chain), effects + menus are decoded (loader.ts).
// Music tracks — layers, intensity, rests — are music.ts, playing into the Music group (so ducking + snapshots apply).
// Snapshots STACK: pushSnapshot('paused') over 'reveal', popSnapshot('paused') → the reveal mix again.
//
// Phone rules it handles (design: framework/.planning/design/audio.md, "Phones and the web"):
// - The AudioContext is made lazily, inside the first tap/key (pointerup · touchend · keydown, capture phase).
// - iPhone silent switch is respected: navigator.audioSession.type = 'ambient' when the browser has it.
// - Tab hidden / phone call / lock screen → suspended. Sounds asked for meanwhile are DROPPED (logged), never queued,
//   so twenty sounds don't burst out on return. Loops asked for meanwhile start once audio can play again.
// - Back to visible → resume; if the browser refuses without a tap, the next tap resumes (the tap listeners stay on).
import { BUSES, dbToGain, readAudioConfig, sliderToGain, type AudioConfig, type BusName, type Tier } from './config.ts'
import { audioUrl, createLoader, type FetchFile, type Loader } from './loader.ts'
import { createLog, type AudioLog, type LogEntry } from './log.ts'
import { createMusic, type MusicState } from './music.ts'
import { planPlay, seededRandom, soundStreams, type ActiveVoice, type Drop, type EngineState, type PlayOptions, type PlayPlan, type SoundMemory } from './planner.ts'
import { createStream, makeAudioElement, realTimers, type MakeMediaElement, type Stream } from './stream.ts'

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
  /** Random 0 ≤ n < 1 for variants and random pitch/volume. Default: its own seeded random, so sound never
   *  uses up the game's Math.random (Glyphtender: a click's sound shifted a frozen-random tray shuffle). */
  rng?: () => number
  /** Load every effect + menu sound right after the unlock (default true). Otherwise each loads on its first play. */
  preload?: boolean
  /** How many log entries to keep (default 200) */
  logSize?: number
  /** Makes the <audio> element a streamed file plays through (tests pass a fake). Default: new Audio(). */
  mediaElement?: MakeMediaElement
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
  /** Switch to a named mix from content/audio.json (e.g. "paused"), or null for the normal mix. Fades over its fadeMs.
   *  Replaces every mix on the stack (see pushSnapshot). */
  snapshot(name: string | null): void
  /** Put a named mix ON TOP of the current one (e.g. "paused" over "reveal"). Fades in over its fadeMs. */
  pushSnapshot(name: string): void
  /** Take a named mix off (wherever it is on the stack). If it was on top, the mix below comes back — fading over the
   *  removed one's fadeMs. Pause over the Reveal → unpause → the Reveal's mix again, not normal. */
  popSnapshot(name: string): void
  /** The mixes on the stack, bottom first (the last one is what you hear) */
  snapshots(): string[]
  /** Plays a music track from content/audio.json "music.tracks" (one at a time: another one crossfades over fadeMs,
   *  default: the old one's fadeOutMs and the new one's fadeInMs). Asked for before the first tap → starts after it. */
  playMusic(name: string, options?: { fadeMs?: number }): void
  /** Fades the music out (default its fadeOutMs). With `track`, only if that track is the one playing. */
  stopMusic(options?: { fadeMs?: number; track?: string }): void
  /** The music's intensity, 0–1: each layer fades in between its fromIntensity and fullAtIntensity (default ramp 300 ms) */
  setMusicIntensity(intensity: number, options?: { rampMs?: number }): void
  /** Dev Kit: the music rests now (fades out over its fadeOutMs) · comes back now */
  restMusic(): void
  endMusicRest(): void
  /** What the music is doing: track, phase (off · waiting · playing · fading · resting), play n of N, rest left, layers */
  musicState(): MusicState
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
  /** How loud a volume group is right now: the peak of the last ~20 ms, 0 (silent) … 1 (full scale). For the Dev Kit's
   *  level meters — the first call adds a small listener (AnalyserNode) to that group. 0 before the first tap. */
  level(bus: BusOrMaster): number
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
  /** A decoded sound's source — or, for a streamed one, its stream */
  source?: AudioBufferSourceNode
  stream?: Stream
  volume: GainNode
  nodes: AudioNode[]
  /** Streamed: its fade-out before the end (s), and whether that fade has started */
  fadeOutSec: number
  fadingOut: boolean
}

const OFF_HZ = 20000 // a lowpass this high changes nothing
const STEAL_FADE_SEC = 0.015 // short fade so a cut voice doesn't click
const SLIDER_RAMP_SEC = 0.05
/** How often streams + music are looked after (loop points, ends, rests) while any are playing */
const TICK_MS = 50
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
  const rng = options.rng ?? seededRandom(Date.now())
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
  /** The named mixes, bottom first: the top one is what you hear (empty = the normal mix) */
  let snapshotStack: string[] = []
  const topSnapshot = (): string | null => snapshotStack.at(-1) ?? null
  let nextVoiceId = 1
  const makeElement = options.mediaElement ?? makeAudioElement
  const fileUrl = (file: string) => audioUrl(options.baseUrl ?? '/', file)
  let ticker: ReturnType<typeof setInterval> | null = null
  let lastTick = 0
  const sliders: Record<BusOrMaster, number> = { master: 100, music: 100, ambience: 100, sfx: 100, ui: 100 }
  const voices = new Map<number, PlayingVoice>()
  /** Level meters (Dev Kit): one listener per volume group, made on the first level() call */
  const meters = new Map<BusOrMaster, { analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> }>()
  const memory = new Map<string, SoundMemory>()
  /** Loops asked for while audio couldn't play (locked / suspended / still loading) — started once it can */
  const wantedLoops = new Map<string, PlayOptions>()

  const music = createMusic({
    context: () => ctx,
    output: () => graph?.buses.music.level ?? null,
    config: () => config,
    state: () => state(),
    url: fileUrl,
    makeElement,
    timers: realTimers,
    rng,
    now: clock,
    log: (entry) => record(entry),
  })

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
    syncStreams()
    if (state() === 'running') startWantedLoops()
  }

  /** Streams (<audio> elements) keep playing on their own when the AudioContext pauses: pause / resume them with it */
  function syncStreams() {
    const running = state() === 'running'
    for (const voice of voices.values()) {
      if (running) voice.stream?.resume()
      else voice.stream?.pause()
    }
    music.setRunning(running)
    if (running) startTicking()
  }

  // ---------- the tick: streams' loop points + ends, music plays + rests ----------
  function startTicking() {
    if (ticker !== null || disposed) return
    lastTick = clock()
    ticker = setInterval(tick, TICK_MS)
  }
  function tick() {
    const now = clock()
    const running = state() === 'running'
    // Rests and fades only count time while audio plays (a hidden tab doesn't use up a rest)
    const dt = running ? Math.max(0, now - lastTick) : 0
    lastTick = now
    let streaming = false
    for (const [id, voice] of voices) {
      if (!voice.stream) continue
      streaming = true
      if (!running) continue
      voice.stream.tick()
      if (voice.stream.ended()) {
        forgetVoice(id)
        continue
      }
      // A streamed one-shot fades out before its end (its length is only known once it plays)
      const left = voice.stream.remainingSec()
      if (!voice.fadingOut && voice.fadeOutSec > 0 && left <= voice.fadeOutSec && ctx) {
        voice.fadingOut = true
        rampTo(voice.volume.gain, 0, ctx.currentTime, left)
      }
    }
    music.tick(dt)
    if (!streaming && !music.active() && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
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
    if (topSnapshot()) applySnapshot(topSnapshot(), 0)

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
    // A phone may refuse to start an <audio> element outside a tap: this tap starts any that were refused
    for (const voice of voices.values()) voice.stream?.retry()
    music.retryBlocked()
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
    voice.stream?.release()
    for (const node of voice.nodes) node.disconnect()
  }
  function stopVoice(id: number, fadeSec: number) {
    const voice = voices.get(id)
    if (!voice || !ctx) return
    const at = ctx.currentTime
    rampTo(voice.volume.gain, 0, at, fadeSec)
    if (voice.stream) {
      const { stream, nodes } = voice
      realTimers.setTimeout(() => {
        stream.release()
        for (const node of nodes) node.disconnect()
      }, fadeSec * 1000 + 20)
    }
    try {
      voice.source?.stop(at + fadeSec)
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
    if (!ctx || !graph) {
      record({ t: now, id: name, result: 'dropped', reason: 'locked', detail: 'audio starts on the first tap' })
      return { kind: 'drop', sound: name, reason: 'locked', detail: 'audio starts on the first tap' }
    }
    // Streamed (music, ambience): nothing to load first — the <audio> element fetches as it plays
    const buffer = plan.stream ? null : loader?.get(plan.file)
    if (!plan.stream && !buffer) {
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
    if (buffer) startVoice(plan, buffer, ctx, graph)
    else startStreamVoice(plan, ctx, graph)
    record({ t: now, id: name, result: 'played', file: plan.file, delayMs: plan.delayMs, ...(plan.ladderStep !== null ? { step: plan.ladderStep } : {}) })
    return plan
  }

  /** A sound's own chain after its source: [thin] → [muffle] → volume → [left/right] → its volume group */
  function voiceChain(plan: PlayPlan, context: AudioContext, mix: Graph) {
    const nodes: AudioNode[] = []
    const chain = (node: AudioNode) => {
      nodes.at(-1)?.connect(node)
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
    return { input: nodes[0], volume, nodes }
  }

  /** Fade in from startTime (or start at full volume) */
  function fadeIn(volume: GainNode, plan: PlayPlan, startTime: number) {
    if (plan.fadeInSec > 0) {
      volume.gain.setValueAtTime(0, startTime)
      volume.gain.linearRampToValueAtTime(plan.gain, startTime + plan.fadeInSec)
    } else {
      volume.gain.value = plan.gain
    }
  }

  function startVoice(plan: PlayPlan, buffer: AudioBuffer, context: AudioContext, mix: Graph) {
    const startTime = context.currentTime + plan.delayMs / 1000
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = plan.playbackRate
    const { input, volume, nodes } = voiceChain(plan, context, mix)
    source.connect(input)
    nodes.unshift(source)

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
    fadeIn(volume, plan, startTime)
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
      source, volume, nodes, fadeOutSec: 0, fadingOut: false,
    })
    source.onended = () => {
      if (voices.get(id)?.source === source) voices.delete(id)
      for (const node of nodes) node.disconnect()
    }
  }

  /** A streamed sound (stream.ts): played from the file through an <audio> element into the same chain.
   *  Its length is only known once it plays, so it counts as playing until the tick sees its end. */
  function startStreamVoice(plan: PlayPlan, context: AudioContext, mix: Graph) {
    const startTime = context.currentTime + plan.delayMs / 1000
    const { input, volume, nodes } = voiceChain(plan, context, mix)
    const stream = createStream(context, {
      url: fileUrl(plan.file),
      output: input,
      rate: plan.playbackRate,
      startSec: plan.trimStartSec,
      loop: plan.loop,
      loopStartSec: plan.loopStartSec,
      loopEndSec: plan.loopEndSec,
      endTrimSec: plan.trimEndSec,
      seamSec: plan.loopCrossfadeSec,
    }, makeElement, realTimers)
    fadeIn(volume, plan, startTime)
    if (plan.delayMs > 0) realTimers.setTimeout(() => stream.start(), plan.delayMs)
    else stream.start()
    if (plan.duck) duckAt(startTime)
    const id = nextVoiceId++
    voices.set(id, {
      id, sound: plan.sound, bus: plan.bus, startAt: plan.startAt, endAt: Infinity, gainDb: plan.gainDb, priority: plan.priority,
      stream, volume, nodes, fadeOutSec: plan.loop ? 0 : plan.fadeOutSec, fadingOut: false,
    })
    startTicking()
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

  // Sound off: new sounds are dropped ('muted') at once, but the master holds its level for master.muteDelayMs before
  // fading to silence — so the sound that just started (the Sound switch's own "off" click) is still heard.
  // Sound on: the master comes straight back (the switch's "on" click plays right after: ui-kit Toggle changes first).
  function setMuted(value: boolean) {
    const changed = muted !== value
    muted = value
    if (!graph || !ctx) return
    const gain = graph.master.gain
    const now = ctx.currentTime
    if (value && changed) {
      const fadeAt = now + config.master.muteDelayMs / 1000
      gain.cancelScheduledValues(now)
      gain.setValueAtTime(gain.value, now)
      gain.setValueAtTime(gain.value, fadeAt) // hold…
      gain.linearRampToValueAtTime(0, fadeAt + SLIDER_RAMP_SEC) // …then fade out
    } else if (!value) rampTo(gain, masterGain(), now, SLIDER_RAMP_SEC)
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

  const knownSnapshot = (name: string) => {
    if (config.snapshots[name]) return true
    console.warn(`[audio] no snapshot called "${name}" in content/audio.json — the mix is unchanged.`)
    return false
  }
  const fadeMsOf = (name: string | null) => (name ? config.snapshots[name]?.fadeMs : undefined) ?? 250

  /** Replace the whole stack: one mix, or null = normal. Fading in uses the new mix's time; back to normal, the one left. */
  function snapshot(name: string | null) {
    if (name !== null && !knownSnapshot(name)) return
    const leaving = topSnapshot()
    snapshotStack = name ? [name] : []
    applySnapshot(name, fadeMsOf(name ?? leaving) / 1000)
  }

  /** A mix on top of the current one (Pause over the Reveal) */
  function pushSnapshot(name: string) {
    if (!knownSnapshot(name)) return
    snapshotStack.push(name)
    applySnapshot(name, fadeMsOf(name) / 1000)
  }

  /** Take a mix off. Only if it was on top does what you hear change: the one below comes back, over the removed one's fade. */
  function popSnapshot(name: string) {
    const index = snapshotStack.lastIndexOf(name)
    if (index < 0) return
    const wasOnTop = index === snapshotStack.length - 1
    snapshotStack.splice(index, 1)
    if (wasOnTop) applySnapshot(topSnapshot(), fadeMsOf(name) / 1000)
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

  // ---------- level meters (Dev Kit) ----------
  function level(bus: BusOrMaster): number {
    if (!ctx || !graph) return 0
    let meter = meters.get(bus)
    if (!meter) {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024 // ~21 ms at 48 kHz
      // A side branch: it listens, it doesn't pass sound on. Master = after the limiter (what the speakers get).
      if (bus === 'master') graph.limiter.connect(analyser)
      else graph.buses[bus].mix.connect(analyser)
      meter = { analyser, samples: new Float32Array(analyser.fftSize) }
      meters.set(bus, meter)
    }
    meter.analyser.getFloatTimeDomainData(meter.samples)
    let peak = 0
    for (const sample of meter.samples) peak = Math.max(peak, Math.abs(sample))
    return Math.min(1, peak)
  }

  // ---------- loading ----------
  function preload(names?: string[]): Promise<void> {
    if (!loader) return Promise.resolve()
    const chosen = names ?? Object.keys(config.sounds).filter((name) => {
      const sound = config.sounds[name]
      return sound.bus === 'sfx' || sound.bus === 'ui'
    })
    // Streamed sounds aren't loaded ahead: the <audio> element fetches as it plays
    const decoded = chosen.filter((name) => config.sounds[name] && !soundStreams(config.sounds[name]))
    return loader.preload(decoded.flatMap((name) => config.sounds[name].files))
  }

  return {
    play,
    playTier: (tier, tierOptions) => play(config.tiers[tier], tierOptions),
    stop,
    stopAll(stopOptions) {
      for (const name of new Set([...voices.values()].map((voice) => voice.sound))) stop(name, stopOptions)
      wantedLoops.clear()
      music.stop(stopOptions)
    },
    setBusVolume,
    setMuted,
    setMuteInBackground,
    setMono,
    snapshot,
    pushSnapshot,
    popSnapshot,
    snapshots: () => [...snapshotStack],
    playMusic(name, musicOptions) {
      music.play(name, musicOptions)
      startTicking()
    },
    stopMusic: (musicOptions) => music.stop(musicOptions),
    setMusicIntensity: (intensity, musicOptions) => music.setIntensity(intensity, musicOptions),
    restMusic: () => music.restNow(),
    endMusicRest: () => music.backNow(),
    musicState: () => music.state(),
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
        snapshotStack = snapshotStack.filter((name) => config.snapshots[name])
        applySnapshot(topSnapshot(), SLIDER_RAMP_SEC)
      }
      music.configChanged()
    },
    config: () => config,
    preload,
    reloadFile: (file) => loader?.forget(file),
    voices: () => [...voices.values()].map(({ id, sound, bus, startAt, endAt, gainDb, priority }) => ({ id, sound, bus, startAt, endAt, gainDb, priority })),
    level,
    log,
    onLog: (listener) => log.subscribe(listener),
    dispose() {
      disposed = true
      for (const type of GESTURES) win?.removeEventListener(type, onGesture, { capture: true })
      doc?.removeEventListener('visibilitychange', onVisibility)
      nav?.audioSession?.removeEventListener?.('statechange', onStateChange)
      if (ticker !== null) clearInterval(ticker)
      ticker = null
      for (const voice of voices.values()) voice.stream?.release()
      voices.clear()
      wantedLoops.clear()
      music.dispose()
      void ctx?.close().catch(() => {})
    },
  }
}

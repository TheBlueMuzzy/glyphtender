// STREAMING — plays ONE file straight from the network through an <audio> element into the mix:
//
//   <audio> → MediaElementAudioSourceNode → copy volume → output (a sound's chain, or a music layer)
//
// so long music and ambience never sit decoded in memory (a decoded 3-minute stereo song is ~40 MB; streamed it is
// a few hundred KB of buffer). Effects + menu sounds stay decoded (loader.ts): they must start instantly.
//
// The trade-off: an <audio> element can't jump back sample-exact, so a streamed LOOP doesn't use the browser's loop.
// Just before the loop point a second element is primed at the loop start; at the loop point it starts and the two
// crossfade over `seamSec` (~100 ms hides the seam and the element's start-up delay), then the old one is let go.
// A sound that needs a sample-exact loop (a short rhythmic loop) sets "stream": "never" and is decoded instead.
//
// The engine calls tick() about every 50 ms: it watches the playing position for the loop point and the end. The seam
// itself is a timer set for the exact moment, so the tick's 50 ms doesn't make it late.

/** The parts of an HTMLAudioElement this uses (tests pass a fake) */
export interface MediaElementLike {
  src: string
  currentTime: number
  /** NaN until the browser knows the file's length */
  readonly duration: number
  readonly ended: boolean
  playbackRate: number
  preservesPitch: boolean
  preload: string
  crossOrigin: string | null
  play(): Promise<void>
  pause(): void
  load(): void
  removeAttribute(name: string): void
}
export type MakeMediaElement = (url: string) => MediaElementLike

/** The real thing: an <audio> element that starts fetching at once */
export const makeAudioElement: MakeMediaElement = (url) => {
  const element = new Audio()
  element.crossOrigin = 'anonymous' // a file from another origin would otherwise play silent through Web Audio
  element.preload = 'auto'
  element.src = url
  return element
}

export interface Timers {
  setTimeout(run: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}
export const realTimers: Timers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}

export interface StreamSettings {
  url: string
  /** Where it plays into */
  output: AudioNode
  /** Speed: 1 = as recorded, 2 = an octave up and twice as fast */
  rate: number
  /** Where the first time round starts (s) — a sound's trim start */
  startSec: number
  loop: boolean
  /** Where each loop jumps back to (s) */
  loopStartSec: number
  /** Where each loop ends (s); 0 = the end of the file */
  loopEndSec: number
  /** Not looping: stop this long before the end of the file (s) — a sound's trim end */
  endTrimSec: number
  /** The crossfade at the loop point (s); 0 = a hard jump */
  seamSec: number
}

export interface Stream {
  /** Starts the first time round */
  start(): void
  /** Watches for the loop point and the end. Call often (the engine does, ~every 50 ms). */
  tick(): void
  /** Seconds (real time) left in this time round: to the loop point, or to the end. Infinity until the length is known. */
  remainingSec(): number
  /** How many times it has jumped back to the loop start */
  loopsDone(): number
  /** Not looping and it reached the end */
  ended(): boolean
  /** Turn looping off (it plays on to the end of the file — its ending) or back on */
  setLooping(loop: boolean): void
  pause(): void
  resume(): void
  /** Stops and lets go of the elements, now */
  release(): void
  /** The browser refused to start it (a phone that wants a tap) — retry() from inside a tap */
  blocked(): boolean
  retry(): void
}

interface Copy {
  element: MediaElementLike
  source: AudioNode
  volume: GainNode
}

/** Plays a file as a Stream (see the top of this file). */
export function createStream(ctx: AudioContext, settings: StreamSettings, makeElement: MakeMediaElement, timers: Timers = realTimers): Stream {
  const { url, output, rate, startSec, loopStartSec, loopEndSec, endTrimSec, seamSec } = settings
  let looping = settings.loop
  let current: Copy | null = null
  let primed: Copy | null = null // the next time round, waiting at the loop start
  let seamTimer: unknown = null
  const fading = new Set<Copy>() // old copies fading out after a seam
  let loops = 0
  let done = false
  let paused = false
  let released = false
  let refused = false

  function makeCopy(atSec: number): Copy {
    const element = makeElement(url)
    element.playbackRate = rate
    element.preservesPitch = false // pitch and speed are one knob, like decoded sounds
    element.currentTime = atSec
    const source = ctx.createMediaElementSource(element as unknown as HTMLMediaElement)
    const volume = ctx.createGain()
    source.connect(volume)
    volume.connect(output)
    return { element, source, volume }
  }

  function playElement(copy: Copy) {
    copy.element.play().then(
      () => {
        if (copy === current) refused = false
      },
      () => {
        if (copy === current) refused = true // e.g. iOS before a tap: retry() on the next one
      },
    )
  }

  function letGo(copy: Copy) {
    copy.element.pause()
    copy.element.removeAttribute('src')
    copy.element.load() // stops the download
    copy.source.disconnect()
    copy.volume.disconnect()
    fading.delete(copy)
  }

  function cancelSeam() {
    if (seamTimer !== null) timers.clearTimeout(seamTimer)
    seamTimer = null
    if (primed) letGo(primed)
    primed = null
  }

  /** The loop point: the primed copy starts and the two crossfade */
  function seam() {
    seamTimer = null
    const old = current
    const next = primed
    primed = null
    if (!old || !next || released || paused) return
    const at = ctx.currentTime
    if (seamSec > 0) {
      next.volume.gain.setValueAtTime(0, at)
      next.volume.gain.linearRampToValueAtTime(1, at + seamSec)
      old.volume.gain.cancelScheduledValues(at)
      old.volume.gain.setValueAtTime(1, at)
      old.volume.gain.linearRampToValueAtTime(0, at + seamSec)
      fading.add(old)
      timers.setTimeout(() => letGo(old), seamSec * 1000 + 50)
    } else {
      letGo(old)
    }
    current = next
    playElement(next)
    loops++
  }

  /** Where this time round ends, in seconds into the file (NaN until the length is known) */
  function endPoint(): number {
    const duration = current?.element.duration ?? NaN
    if (!Number.isFinite(duration)) return NaN
    if (looping) return loopEndSec > 0 ? Math.min(loopEndSec, duration) : duration
    return Math.max(0, duration - endTrimSec)
  }

  function remainingSec(): number {
    if (!current || done) return 0
    const end = endPoint()
    if (!Number.isFinite(end)) return Infinity
    return Math.max(0, (end - current.element.currentTime) / rate)
  }

  return {
    start() {
      if (current || released) return
      current = makeCopy(startSec)
      if (!paused) playElement(current)
    },
    tick() {
      if (!current || done || released || paused) return
      const left = remainingSec()
      if (looping) {
        // It ran off the end without a seam (its length came late, or a play was refused): jump back now
        if (seamTimer === null && current.element.ended) {
          primed = makeCopy(loopStartSec)
          seam()
          return
        }
        // Close to the loop point: prime the next copy and set the seam for the exact moment
        if (seamTimer === null && Number.isFinite(left) && left - seamSec <= 0.25) {
          primed = makeCopy(loopStartSec)
          seamTimer = timers.setTimeout(seam, Math.max(0, (left - seamSec) * 1000))
        }
        return
      }
      if (current.element.ended || left <= 0) {
        done = true
        letGo(current)
      }
    },
    remainingSec,
    loopsDone: () => loops,
    ended: () => done,
    setLooping(loop) {
      if (looping === loop) return
      looping = loop
      if (!loop) cancelSeam()
    },
    pause() {
      if (paused) return
      paused = true
      cancelSeam()
      for (const copy of [...fading]) letGo(copy)
      current?.element.pause()
    },
    resume() {
      if (!paused) return
      paused = false
      if (current && !done && !released) playElement(current)
    },
    release() {
      released = true
      cancelSeam()
      for (const copy of [...fading]) letGo(copy)
      if (current) letGo(current)
      current = null
    },
    blocked: () => refused,
    retry() {
      if (refused && current && !paused && !done && !released) playElement(current)
    },
  }
}

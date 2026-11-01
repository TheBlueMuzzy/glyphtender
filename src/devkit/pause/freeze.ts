// FULL PAUSE, for any game, without the game's help: the page's animation frames are held (queued, released on resume),
// its CSS and Web animations pause, its <audio>/<video> and the AudioContexts made after the Dev Kit started are
// suspended. The Dev Kit's own panel keeps moving: its animations are skipped, and its own frame loops use devkitRaf.
// What it can't stop: the game's plain setTimeout / setInterval (use gameClock's rulesClock.after instead) and time read
// straight from performance.now() — a game that takes its frame time from looksClock resumes without a jump.

/** The browser's own requestAnimationFrame — for the Dev Kit's UI, which must keep running while the game is frozen. */
const hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
export const devkitRaf: (cb: FrameRequestCallback) => number = hasRaf
  ? window.requestAnimationFrame.bind(window)
  : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number
export const devkitCancelRaf: (id: number) => void = hasRaf ? window.cancelAnimationFrame.bind(window) : (id) => clearTimeout(id)

// The Dev Kit's own elements (its animations never pause)
const KIT = '#devkit-root, .devkit, .devkit-preview, .devkit-pause-badge'

let installed = false
let frozen = false
let nextId = 1_000_000_000 // our frame ids (the browser's are small numbers, so a cancel can tell them apart)
let lastTime = 0 // the time the last released frame was given (a one-frame redraw gets the same: no time passes)
const waiting = new Map<number, FrameRequestCallback>() // held while frozen
const scheduled = new Map<number, number>() // our id → the browser's id
const pausedAnimations: Animation[] = []
const pausedMedia: HTMLMediaElement[] = []
const contexts = new Set<AudioContext>()
const suspended: AudioContext[] = []
let sweep: ReturnType<typeof setInterval> | null = null

function schedule(id: number, cb: FrameRequestCallback) {
  scheduled.set(id, devkitRaf((time) => {
    scheduled.delete(id)
    if (frozen) { waiting.set(id, cb); return }
    lastTime = time
    cb(time)
  }))
}

/** Patch the page once (mountDevKit does it). Frames asked for before this can't be held, but the next one is. */
export function installFreeze() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.requestAnimationFrame = (cb) => {
    const id = nextId++
    if (frozen) waiting.set(id, cb)
    else schedule(id, cb)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    if (waiting.delete(id)) return
    const real = scheduled.get(id)
    if (real !== undefined) { devkitCancelRaf(real); scheduled.delete(id) }
    else devkitCancelRaf(id) // one asked for before the patch
  }
  // Track AudioContexts made from now on (a game's audio module can also listen for the devkit:pause event)
  const Ctx = window.AudioContext
  if (Ctx) {
    window.AudioContext = class extends Ctx {
      constructor(options?: AudioContextOptions) {
        super(options)
        contexts.add(this)
      }
    }
  }
}

const inKit = (el: Element | null | undefined) => !!el?.closest?.(KIT)

function pauseAnimations() {
  if (typeof document === 'undefined' || !document.getAnimations) return
  for (const a of document.getAnimations()) {
    const target = (a.effect as KeyframeEffect | null)?.target
    if (a.playState !== 'running' || inKit(target)) continue
    a.pause()
    pausedAnimations.push(a)
  }
}

/** Freeze the game (true) or let it go (false). */
export function setFrozen(on: boolean) {
  if (on === frozen) return
  frozen = on
  if (on) {
    pauseAnimations()
    sweep = setInterval(pauseAnimations, 200) // ones the game starts while frozen (a toast arriving)
    for (const m of document.querySelectorAll<HTMLMediaElement>('audio, video')) {
      if (!m.paused && !inKit(m)) { m.pause(); pausedMedia.push(m) }
    }
    for (const c of contexts) if (c.state === 'running') { void c.suspend(); suspended.push(c) }
    return
  }
  if (sweep) clearInterval(sweep)
  sweep = null
  for (const a of pausedAnimations.splice(0)) if (a.playState === 'paused') a.play()
  for (const m of pausedMedia.splice(0)) void m.play().catch(() => {})
  for (const c of suspended.splice(0)) void c.resume()
  const held = [...waiting]
  waiting.clear()
  for (const [id, cb] of held) schedule(id, cb)
}

export const isFrozen = () => frozen

/** While frozen: draw ONE frame (a live edit arrived), with no time passing — every held frame runs once, given the
 *  time of the last real frame, and asks again (so it's held again). */
export function stepFrozenFrame() {
  if (!frozen) return
  const held = [...waiting]
  waiting.clear()
  for (const [, cb] of held) cb(lastTime)
}

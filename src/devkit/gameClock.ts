// THE GAME'S TWO CLOCKS — safe in every build (no Dev Kit code in here; with the Dev Kit off nothing pauses them).
// Every game runs two clocks:
//   RULES clock — everything that can change what happens: falling, timers, AI moves, physics that decides results.
//   LOOKS clock — everything that's only presentation: blinks, pulses, glows, idle jiggle, goo settling.
//   The test: if the END of an animation changes the game, it's on the rules clock.
// The Dev Kit's ⏸ Full pause stops both; ◐ Half pause stops only the rules clock (the looks keep moving, so you can
// study a moment while it still breathes). The game's own pause menu or slow motion sets rulesClock.scale.
//
//   import { rulesClock, looksClock } from '../devkit/gameClock'
//   engine.tick(dtMs * rulesClock.rate)            // rate = scale, or 0 while the Dev Kit pauses
//   rulesClock.after(1500, () => swap())           // instead of setTimeout, for anything that changes the game
//   const t = looksClock.now() / 1000              // pulses, glows — time that stops only on a full pause
//   rulesClock.scale = menuOpen ? 0 : 1            // the game's own pause / slow motion
// Timers run on the browser's setTimeout, re-timed whenever a clock's rate changes (so they work in node tests too).

export type PauseMode = 'full' | 'half' | null

/** Sent on window when the Dev Kit pauses or resumes (detail = { mode }) — for code that doesn't import this file (audio). */
export const PAUSE_EVENT = 'devkit:pause'

const realNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

type Timer = { at: number; fn: () => void; every: number; handle: ReturnType<typeof setTimeout> | null }

function makeClock(rateNow: () => number) {
  let base = 0
  let since = realNow()
  let rate = rateNow()
  const timers = new Set<Timer>()
  const now = () => base + (realNow() - since) * rate

  const arm = (t: Timer) => {
    if (t.handle !== null) clearTimeout(t.handle)
    t.handle = null
    if (rate <= 0) return // stopped: re-armed when the clock moves again
    t.handle = setTimeout(() => fire(t), Math.max(0, (t.at - now()) / rate))
  }
  const fire = (t: Timer) => {
    t.handle = null
    if (!timers.has(t)) return
    if (now() < t.at - 0.5) return arm(t) // (a rate change raced it) not yet
    if (t.every > 0) {
      t.at += t.every
      arm(t)
    } else timers.delete(t)
    t.fn()
  }
  const add = (ms: number, fn: () => void, every: number) => {
    const t: Timer = { at: now() + Math.max(0, ms), fn, every, handle: null }
    timers.add(t)
    arm(t)
    return () => {
      timers.delete(t)
      if (t.handle !== null) clearTimeout(t.handle)
    }
  }
  return {
    now,
    get rate() { return rate },
    /** The rate may have changed: keep the time where it is, then run on at the new rate. */
    retime() {
      const t = now()
      base = t
      since = realNow()
      rate = rateNow()
      for (const timer of timers) arm(timer)
    },
    after: (ms: number, fn: () => void) => add(ms, fn, 0),
    every: (ms: number, fn: () => void) => add(ms, fn, Math.max(1, ms)),
  }
}

let mode: PauseMode = null
let gameScale = 1
let rulesUsedAt = -Infinity
const listeners = new Set<(mode: PauseMode) => void>()

const rules = makeClock(() => (mode ? 0 : gameScale))
const looks = makeClock(() => (mode === 'full' ? 0 : 1))
const usedRules = () => { rulesUsedAt = realNow() }

/** Time that can change the game. Stops on the game's own pause (scale 0) and on BOTH Dev Kit pauses. */
export const rulesClock = {
  /** The game's own speed: 1 = normal, 0 = its pause menu, 0.25 = slow motion. The Dev Kit never changes this. */
  get scale() { return gameScale },
  set scale(value: number) {
    const next = Number.isFinite(value) && value > 0 ? value : 0
    if (next === gameScale) return
    gameScale = next
    rules.retime()
  },
  /** How fast rules time runs right now: scale, or 0 while the Dev Kit pauses. Multiply your frame's dt by it. */
  get rate() { usedRules(); return rules.rate },
  /** Rules time in ms (only moves while rate > 0). */
  now() { usedRules(); return rules.now() },
  /** Run fn after `ms` of RULES time (paused time doesn't count). Returns "cancel". */
  after(ms: number, fn: () => void) { usedRules(); return rules.after(ms, fn) },
  /** Run fn every `ms` of rules time. Returns "stop". */
  every(ms: number, fn: () => void) { usedRules(); return rules.every(ms, fn) },
}

/** Time for presentation only (pulses, glows, idle motion). Stops only on the Dev Kit's FULL pause. */
export const looksClock = {
  get rate() { return looks.rate },
  now: () => looks.now(),
  after: (ms: number, fn: () => void) => looks.after(ms, fn),
  every: (ms: number, fn: () => void) => looks.every(ms, fn),
}

/** The Dev Kit's pause, if any. */
export const clockPause = (): PauseMode => mode

/** The Dev Kit calls this (games normally don't). */
export function setClockPause(next: PauseMode) {
  if (next === mode) return
  mode = next
  rules.retime()
  looks.retime()
  for (const listener of listeners) listener(mode)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PAUSE_EVENT, { detail: { mode } }))
}

/** Hear the Dev Kit pause and resume. Returns "stop listening". */
export function onClockPause(listener: (mode: PauseMode) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Both clocks' time right now, WITHOUT counting as the game reading rulesClock — for checks (check-framework). */
export const clockTimes = () => ({ rules: rules.now(), looks: looks.now() })

/** Has the game read the rules clock (so ◐ Half pause can work)? */
export const rulesClockInUse = () => rulesUsedAt > -Infinity

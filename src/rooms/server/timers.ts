// TIMERS TABLE — every server timer in one place, by name.  (Server — no React, no browser code.)
//
// Roll Better learned: five loose timer variables = timers left running after a room closed,
// and phases stuck forever. So: ONE table. Starting a name that's already running replaces it,
// stopAll() really stops everything, and a crashing timer is logged instead of killing the room.
//
//   room.timers.start('turn', 30_000, () => { ... })   // the current player's turn clock
//   room.timers.start('phase-limit', 45_000, () => { ... }) // a hard limit nothing can extend
//   room.timers.msLeft('turn')                          // how long is left (0 if not running)
//   room.timers.stop('turn')
//
// Surviving a restart (0.10.0, F100): each timer knows WHEN it ends (endTimes()), the room saves those end times
// with the match, and a Durable Object alarm wakes the room at the earliest one — then runDue() fires whatever
// is due. A timer can't be saved itself (it's a piece of code), so after a restart each one is started again by
// its name: the room's own by the room, the game's by its rules' onRestore.
//
// Held (0.14.0, F99 — bots wait in an empty match): hold(which) stops the chosen timers where they are and keeps how
// long each had left; release() starts them again for exactly that. A timer started while held is held too. A held
// timer still counts as waiting (isRunning, msLeft, names), but never fires and has no end time (endTimes) — so no
// storage alarm is set for it. The room holds the game's timers while nobody is connected.

interface HeldTimer {
  msLeft: number
  whenDone: () => void
}

interface RunningTimer {
  handle: ReturnType<typeof setTimeout>
  endsAt: number
  whenDone: () => void
}

// setTimeout can't wait longer than ~24.8 days (a bigger number fires AT ONCE). A long wait (a 30-day match) is
// waited in steps of this size instead.
const LONGEST_WAIT_MS = 2_147_483_647

export class Timers {
  private running = new Map<string, RunningTimer>()
  /** Timers stopped where they were by hold(): how long each had left. */
  private held = new Map<string, HeldTimer>()
  /** Which timers are held right now (null = none). */
  private holding: ((name: string) => boolean) | null = null
  private log: (message: string) => void
  // Told after any timer fires — the room then saves, so the stored match never keeps a timer that already ran and
  // the storage alarm moves on to the next one (review F100)
  private onFired: () => void

  constructor(log: (message: string) => void = console.log, onFired: () => void = () => {}) {
    this.log = log
    this.onFired = onFired
  }

  /** Run `whenDone` after `ms`. A timer with the same name is replaced (never two of one kind). */
  start(name: string, ms: number, whenDone: () => void): void {
    this.stop(name)
    if (this.holding?.(name)) {
      this.held.set(name, { msLeft: Math.max(0, ms), whenDone })
      return
    }
    const endsAt = Date.now() + Math.max(0, ms)
    this.running.set(name, { handle: this.waitFor(name, endsAt), endsAt, whenDone })
  }

  stop(name: string): void {
    this.held.delete(name)
    const timer = this.running.get(name)
    if (!timer) return
    clearTimeout(timer.handle)
    this.running.delete(name)
  }

  /** Stop every timer whose name starts with `prefix` ("" = all of them). */
  stopAll(prefix = ''): void {
    for (const name of this.names()) {
      if (name.startsWith(prefix)) this.stop(name)
    }
  }

  /** Waiting to fire — running, or held. */
  isRunning(name: string): boolean {
    return this.running.has(name) || this.held.has(name)
  }

  /** Milliseconds until it fires (0 if it isn't running). A held timer: what it has left once released. */
  msLeft(name: string): number {
    const held = this.held.get(name)
    if (held) return held.msLeft
    const timer = this.running.get(name)
    return timer ? Math.max(0, timer.endsAt - Date.now()) : 0
  }

  /** Names of the running and held timers (for logs and tests). */
  names(): string[] {
    return [...this.running.keys(), ...this.held.keys()]
  }

  /** Stop the timers `which` picks where they are (each keeps its time left), and hold any of them started from now on,
   *  until release(). Holding again changes which timers are held. */
  hold(which: (name: string) => boolean): void {
    this.holding = which
    const now = Date.now()
    for (const [name, timer] of [...this.running]) {
      if (!which(name)) continue
      clearTimeout(timer.handle)
      this.running.delete(name)
      this.held.set(name, { msLeft: Math.max(0, timer.endsAt - now), whenDone: timer.whenDone })
    }
  }

  isHolding(): boolean {
    return this.holding !== null
  }

  /** Start every held timer again for the time it had left → their new end times (name → ms since 1970). */
  release(): Record<string, number> {
    this.holding = null
    const ends: Record<string, number> = {}
    for (const [name, timer] of [...this.held]) {
      this.start(name, timer.msLeft, timer.whenDone)
      ends[name] = this.running.get(name)!.endsAt
    }
    return ends
  }

  /** How long each held timer has left (name → ms) — saved with the match, so a held timer stays held after a restart. */
  heldTimes(): Record<string, number> {
    const left: Record<string, number> = {}
    for (const [name, timer] of this.held) left[name] = timer.msLeft
    return left
  }

  /** When each running timer ends (name → time, in ms since 1970) — what the room saves so it can start them again after a restart. Held timers aren't in it (heldTimes). */
  endTimes(): Record<string, number> {
    const ends: Record<string, number> = {}
    for (const [name, timer] of this.running) ends[name] = timer.endsAt
    return ends
  }

  /** Fire every timer that's due now (the room's alarm woke it — don't wait for setTimeout to notice). */
  runDue(): void {
    const now = Date.now()
    for (const [name, timer] of [...this.running]) {
      if (timer.endsAt <= now && this.running.get(name) === timer) this.fire(name, timer)
    }
  }

  // The setTimeout behind a timer — for a wait longer than setTimeout can do, a step, then wait again
  private waitFor(name: string, endsAt: number): ReturnType<typeof setTimeout> {
    const wait = Math.max(0, endsAt - Date.now())
    return setTimeout(() => {
      const timer = this.running.get(name)
      if (!timer) return
      if (Date.now() < timer.endsAt) {
        timer.handle = this.waitFor(name, timer.endsAt) // (only after a long wait's step: not there yet)
        return
      }
      this.fire(name, timer)
    }, Math.min(wait, LONGEST_WAIT_MS))
  }

  private fire(name: string, timer: RunningTimer): void {
    clearTimeout(timer.handle)
    this.running.delete(name)
    try {
      timer.whenDone()
    } catch (error) {
      this.log(`timer "${name}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.onFired()
  }
}

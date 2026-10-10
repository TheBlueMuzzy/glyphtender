// THE SOUND LOG — every play and every drop, with why. Kept as a ring buffer (the newest N), so it never grows.
// Feeds the Dev Kit Sound Board's log, and e2e tests read it as window.__audioLog (see exposeLog in index.ts).
import type { DropReason } from './planner.ts'

export type MusicEvent = 'start' | 'play' | 'rest' | 'stop'

export interface LogEntry {
  /** When it was asked for (the engine's clock, ms) */
  t: number
  /** The sound's name, e.g. "seed.land" — or a music track's name */
  id: string
  /** music = a music track's moment (see event) */
  result: 'played' | 'dropped' | 'music'
  /** Music: start (asked for) · play (a play begins: detail "play 2 of 3") · rest (it goes quiet: detail "74 s") · stop */
  event?: MusicEvent
  reason?: DropReason
  detail?: string
  file?: string
  /** Ladder sounds: which step played */
  step?: number
  /** How long until it starts (ms) */
  delayMs?: number
}

export interface AudioLog {
  add(entry: LogEntry): void
  /** Oldest first */
  entries(): LogEntry[]
  clear(): void
  /** Called with each new entry. Returns a function that stops listening. */
  subscribe(listener: (entry: LogEntry) => void): () => void
}

export function createLog(capacity = 200): AudioLog {
  const ring: LogEntry[] = []
  const listeners = new Set<(entry: LogEntry) => void>()
  return {
    add(entry) {
      ring.push(entry)
      if (ring.length > capacity) ring.splice(0, ring.length - capacity)
      for (const listener of listeners) listener(entry)
    },
    entries: () => [...ring],
    clear: () => {
      ring.length = 0
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Puts a log on window.__audioLog (entries(), clear()) — for e2e tests and poking in the console. Dev/test only: the game decides. */
export function exposeLog(audio: { log: AudioLog }, target: object = globalThis): void {
  ;(target as { __audioLog?: AudioLog }).__audioLog = audio.log
}

// SAVED ROOM — a match being played, packed as plain JSON so the server can keep it in storage.  (Server.)
// (0.10.0, F100.) Before, a room lived only in memory: a server restart — or Cloudflare clearing an empty room
// after a minute or two — lost the match. Now RoomServer packs it after every change (packRoom) and party/worker.ts
// keeps it in the room's Durable Object storage; a restarted room unpacks it (restore) and carries on.
//
// What's kept: seats + host + phase (RoomData), the game's state, the bot-turn counts ("a bot played 3 turns for
// you"), whose move the game waits for, and when each timer ends. Never the live connections — they die with the
// old copy of the server; players come back with a rejoin.
// Only a match being PLAYED is kept. The lobby, a finished game and a cleared room keep nothing (wiped).
// Plain functions on plain data — tested on their own (savedRoom.test.ts).
import type { RoomData } from './seats'

/** Bump when SavedRoom changes shape — an older saved room is then dropped (its match ends) instead of misread. */
export const SAVED_ROOM_VERSION = 1

export interface SavedRoom<State = unknown> {
  version: typeof SAVED_ROOM_VERSION
  /** Seats, host, phase, kicked players. */
  data: RoomData
  /** The game's state — plain JSON (see jsonProblem). */
  game: State
  /** Turns a bot played for each away player (seat id → count). */
  botTurns: Record<string, number>
  /** Seats the game was waiting for (room.onTheClock). */
  onClock: string[]
  /** When each saved timer ends (name → ms since 1970): the room's own ("room:…") and the game's. */
  timersEndAt: Record<string, number>
}

/**
 * Can this be saved as JSON and come back the same? null = yes. Otherwise where the problem is, in plain English
 * ("state.bag is a Map"). Plain JSON = numbers (not NaN / Infinity), text, true/false, null, lists, plain objects.
 * (A missing optional field — `undefined` on an object — is fine: it comes back missing, which reads the same.)
 */
export function jsonProblem(value: unknown, where = 'state'): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${where} is ${value} (JSON can't hold it)`
  if (typeof value !== 'object') return `${where} is ${typeof value === 'undefined' ? 'undefined' : `a ${typeof value}`}`
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) return `${where}[${i}] is undefined (it would come back as null)`
      const problem = jsonProblem(value[i], `${where}[${i}]`)
      if (problem) return problem
    }
    return null
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return `${where} is a ${(value as object).constructor?.name ?? 'class instance'} (only plain objects can be saved)`
  }
  for (const [key, inside] of Object.entries(value)) {
    if (inside === undefined) continue
    const problem = jsonProblem(inside, `${where}.${key}`)
    if (problem) return problem
  }
  return null
}

/** Read what storage gave back (JSON text) → a SavedRoom, or null if it's missing, broken or an older shape. */
export function readSavedRoom(raw: unknown): SavedRoom | null {
  let saved: unknown = raw
  if (typeof raw === 'string') {
    try {
      saved = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isObject(saved) || saved.version !== SAVED_ROOM_VERSION) return null
  const { data, botTurns, onClock, timersEndAt } = saved
  if (!isObject(data) || typeof data.code !== 'string' || !Array.isArray(data.seats) || !Array.isArray(data.kicked)) return null
  if (data.phase !== 'playing' || typeof data.seatsMade !== 'number' || !('game' in saved)) return null
  if (!isObject(botTurns) || !Array.isArray(onClock) || !isObject(timersEndAt)) return null
  if (!Object.values(timersEndAt).every((end) => typeof end === 'number')) return null
  return saved as unknown as SavedRoom
}

/** When the room must wake up next (the earliest timer end), or null if nothing is waiting. For the storage alarm. */
export function wakeUpAt(saved: SavedRoom | null): number | null {
  if (!saved) return null
  const ends = Object.values(saved.timersEndAt)
  return ends.length > 0 ? Math.min(...ends) : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

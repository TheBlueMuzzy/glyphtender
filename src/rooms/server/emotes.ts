// EMOTES ON THE SERVER — the room relays a player's preset phrase to every seat (framework F107). (Server.)
// It never trusts the browser:
//   - the seat is the one the connection owns (roomServer.ts) — never a seat named in the message;
//   - the id must be one of content/emotes.json "phrases" (a browser can't send banter, words or anything else);
//   - its own count per player (roomServer.ts keys it by their persistentId, so a new seat never refills it): up to server.burst in a row, one back every server.refillSeconds, and at most
//     server.perMatch in a match — the browser's own limit is never relied on;
//   - over the limit, or unknown → dropped quietly (logged once per seat, no error sent back: nothing to probe);
//   - nothing is stored: an emote is passed on and forgotten (never in the saved match).
// Bots on the server (F22 Banter) speak with room.emote(seatId, id): the same count; banter ids (banter.<who>.<moment>)
// are allowed there only — the game's own code is trusted, a browser isn't.
// No import of the emotes module (the rooms kit stands alone); the few rules it needs are repeated here, tested.

/** The parts of content/emotes.json the server uses. */
export interface EmoteRoomSettings {
  phrases: string[]
  burst: number
  refillSeconds: number
  perMatch: number
}

const PHRASE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/
const BANTER_ID = /^banter\.[A-Za-z][A-Za-z0-9_-]{0,31}\.[A-Za-z][A-Za-z0-9_-]{0,31}$/
const DEFAULTS: EmoteRoomSettings = { phrases: ['hello', 'wellPlayed', 'thanks', 'wow', 'oops', 'thinking', 'goodGame'], burst: 3, refillSeconds: 4, perMatch: 200 }

/** content/emotes.json → what the server keeps to. Odd values → the defaults (the game's own reader warns about them). */
export function readEmoteRoomSettings(json: unknown): EmoteRoomSettings {
  const file = (json && typeof json === 'object' ? json : {}) as { phrases?: unknown; server?: Record<string, unknown> }
  const server = file.server && typeof file.server === 'object' ? file.server : {}
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback
  const phrases = Array.isArray(file.phrases) ? [...new Set(file.phrases.filter((id): id is string => typeof id === 'string' && PHRASE_ID.test(id)))].slice(0, 12) : []
  return {
    phrases: phrases.length ? phrases : DEFAULTS.phrases,
    burst: Math.round(number(server.burst, 1, 20, DEFAULTS.burst)),
    refillSeconds: number(server.refillSeconds, 0.1, 600, DEFAULTS.refillSeconds),
    perMatch: Math.round(number(server.perMatch, 1, 10_000, DEFAULTS.perMatch)),
  }
}

type Count = { tokens: number; stamp: number; inMatch: number }
/** How much earlier than the device's own count a send may arrive (network delays differ message to message). */
const JITTER_MS = 1000

/** The room's emote gate: one count per key (the room passes one key per player, or per server-bot seat). */
export class EmoteGate {
  readonly settings: EmoteRoomSettings
  private counts = new Map<string, Count>()
  /** Seats already logged as dropped this match (the log says it once, not once per message). */
  private told = new Set<string>()

  constructor(settings: EmoteRoomSettings) {
    this.settings = settings
  }

  /** May this seat say this id now? Takes one from its count when yes. `trusted` = the game's own code (a server bot). */
  allow(seatId: string, id: string, now: number, trusted = false): { ok: true } | { ok: false; why: 'unknown' | 'too_many' | 'match_cap' } {
    const known = this.settings.phrases.includes(id) || (trusted && BANTER_ID.test(id))
    if (!known) return { ok: false, why: 'unknown' }
    let count = this.counts.get(seatId)
    if (!count) this.counts.set(seatId, (count = { tokens: this.settings.burst, stamp: now, inMatch: 0 }))
    if (count.inMatch >= this.settings.perMatch) return { ok: false, why: 'match_cap' }
    if (now > count.stamp) {
      count.tokens = Math.min(this.settings.burst, count.tokens + (now - count.stamp) / (this.settings.refillSeconds * 1000))
      count.stamp = now
    }
    // Network slack: the device keeps the same count, so a fair player pressing the moment their ring fills can reach
    // here a little early after a slow first message. Up to 1 s (at most half a send) early is let through — the count
    // then dips below 0 and pays it back, so the long-run rate never changes.
    const slack = Math.min(0.5, JITTER_MS / (this.settings.refillSeconds * 1000))
    if (count.tokens < 1 - slack - 1e-9) return { ok: false, why: 'too_many' }
    count.tokens -= 1
    count.inMatch += 1
    return { ok: true }
  }

  /** First drop for this seat this match? (then it's logged) */
  firstDrop(seatId: string): boolean {
    if (this.told.has(seatId)) return false
    this.told.add(seatId)
    return true
  }

  /** How many counts are kept (one per player or bot seat that has spoken this match). */
  get size(): number {
    return this.counts.size
  }

  /** Forget the counts (and "said once" marks) of everyone not in `keep` — the room calls it when players coming and
   *  going in the lobby (each with a new id) have piled up too many, so memory never grows without end. (Someone who
   *  left and comes back after that starts a fresh count — no more than a new id would give them anyway.) */
  forgetAllBut(keep: ReadonlySet<string>): void {
    for (const key of [...this.counts.keys()]) if (!keep.has(key)) this.counts.delete(key)
    for (const key of [...this.told]) if (!keep.has(key)) this.told.delete(key)
  }

  /** A new match: every seat's count starts again (its per-match cap too). (A seat that leaves keeps its count until
   *  then, so leaving and joining again never refills it.) */
  newMatch(): void {
    this.counts.clear()
    this.told.clear()
  }
}

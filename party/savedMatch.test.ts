// A MATCH KEPT IN STORAGE (F96) — the online server with a fake Cloudflare that keeps what the room saves, as
// party/worker.ts does (one key + one alarm). A match is saved after each change, loaded back into a NEW server (a
// restart, a redeploy), and carries on: the same game, the same turn, the turn timer and a bot's next move where they
// were. The move record with its secret seed numbers is kept on the server only — it never reaches a view.
// Also counts the storage writes a whole game makes (the Workers free plan's daily allowance — SPRINT F96 Notes).
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomAction } from '../src/engine/sim'
import type { WordList } from '../src/engine/types'
import { parseWordFile, wordListFor, type WordFile } from '../src/engine/words'
import { RoomServer, type PartyConnection, type PartyRoom } from '../src/rooms/server/roomServer'
import { jsonProblem } from '../src/rooms/server/savedRoom'
import type { ServerMessage } from '../src/rooms/protocol'
import settings from '../content/rooms.json'
import pace from '../content/ai/pace.json'
import { makeRules } from './glyphtenderRules'
import type { GameView, OnlineAction, OnlineOptions } from './protocol'
import type { ServerGame } from './serverGame'

type Server = RoomServer<ServerGame, OnlineOptions, OnlineAction, GameView, never>

let wordFile: WordFile
beforeAll(() => { wordFile = parseWordFile(readFileSync('public/words/words.csv', 'utf8')) })
afterEach(() => vi.useRealTimers())
const wordsFor = (extras?: Parameters<typeof wordListFor>[1]): WordList => wordListFor(wordFile, extras)

/** Long enough for any AI pause before a bot seat's action (pace.json: the longest think, at Normal speed). */
const BOT_WAIT = Math.max(...Object.values(pace.thinkSeconds).map((t) => t.max)) * 1000

/** What party/worker.ts keeps in the room's Durable Object storage — one key and one alarm — and how many rows that
 *  writes (Cloudflare counts each put, delete and alarm change as a row written). */
class FakeStorage {
  room: string | null = null // (the JSON text, as storage hands it back to worker.ts onStart → restore)
  alarm: number | null = null
  puts = 0
  deletes = 0
  alarmWrites = 0
  biggest = 0
  get rowsWritten() { return this.puts + this.deletes + this.alarmWrites }
  /** worker.ts keep(): the save, then the alarm only when its time really changes */
  keep(saved: string | null, wakeUpAt: number | null) {
    if (saved === null) { this.room = null; this.deletes++ } else { this.room = saved; this.puts++; this.biggest = Math.max(this.biggest, saved.length) }
    if (wakeUpAt === this.alarm) return
    this.alarm = wakeUpAt
    this.alarmWrites++
  }
}

class FakeParty implements PartyRoom {
  id = 'BAKU'
  live = new Map<string, FakeConnection>()
  storage: FakeStorage
  constructor(storage: FakeStorage) { this.storage = storage }
  getConnection(id: string) { return this.live.get(id) }
  saveRoom(saved: string | null, wakeUpAt: number | null) { this.storage.keep(saved, wakeUpAt) }
}
class FakeConnection implements PartyConnection {
  received: ServerMessage[] = []
  id: string
  constructor(id: string) { this.id = id }
  send(text: string) { this.received.push(JSON.parse(text)) }
  close() {}
  views() { return this.received.filter((m) => m.type === 'view' && m.view).map((m) => (m as { view: GameView }).view) }
  lastView() { return this.views().at(-1) }
  errors() { return this.received.filter((m) => m.type === 'error') }
}

const rules = () => {
  let n = 7
  return makeRules({ words: wordsFor, randomSeed: () => (n = (n * 48271) % 2147483647), plainTurnOrder: true })
}
/** A fresh server copy for the room (a restart = a new one of these on the SAME storage). */
function newServer(storage: FakeStorage) {
  const party = new FakeParty(storage)
  const server: Server = new RoomServer(party, rules(), { ...settings, maxMessagesPerSecond: 0, idleWarnAfterMs: 0, idleTakeoverAfterMs: 0 })
  server.log = () => {} // quiet tests
  return { server, party }
}
/** A player's tab connects and (re)joins with their own persistent id. */
function join(server: Server, party: FakeParty, i: number, create = false, tab = `tab-${i}`) {
  const conn = new FakeConnection(tab)
  party.live.set(conn.id, conn)
  server.onConnect(conn)
  server.onMessage(JSON.stringify({ type: 'join', name: `P${i}`, persistentId: `player-id-${i}`, create }), conn)
  return conn
}
function startRoom(players: number, options: Partial<OnlineOptions> = {}, bots = 0) {
  const storage = new FakeStorage()
  const { server, party } = newServer(storage)
  const conns = Array.from({ length: players }, (_, i) => join(server, party, i, i === 0))
  for (let b = 0; b < bots; b++) server.onMessage(JSON.stringify({ type: 'add_bot', profile: 'Survivor/FirstClass' }), conns[0])
  conns.slice(1).forEach((conn) => server.onMessage(JSON.stringify({ type: 'ready', ready: true }), conn))
  server.onMessage(JSON.stringify({ type: 'start', options }), conns[0])
  return { storage, server, party, conns }
}
const send = (server: Server, conn: FakeConnection, action: unknown) => server.onMessage(JSON.stringify({ type: 'action', action }), conn)
/** The person whose turn it is plays one random legal move from their own view. */
function playOne(server: Server, conns: FakeConnection[], rng: number) {
  const current = server.game!.game.current
  const mine = conns[current].lastView()!
  const pick = randomAction(mine.game, rng)
  send(server, conns[current], { kind: 'play', action: pick.action, version: mine.version })
  return pick.rng
}
const flush = () => new Promise<void>((r) => queueMicrotask(r)) // (the room saves a moment after a change: a microtask)
const SECRET = /"record"|"bagSeed"|"rngSeed"|"botRng"|"paceRng"/

describe('F96 — a match kept in storage', () => {
  it('a whole game: every state can be saved, one save per change, and the stored match is wiped at the end (measured)', async () => {
    for (const [players, turnSeconds] of [[2, 0], [2, 60], [4, 0]]) {
      const { storage, server, conns } = startRoom(players, { turnSeconds })
      await flush()
      let rng = 3, actions = 0, turns = 0
      while (server.game!.game.phase !== 'over' && actions < 3000) {
        expect(jsonProblem(server.game)).toBeNull()
        const kind = server.game!.game.phase
        rng = playOne(server, conns, rng)
        await flush()
        actions++
        if (kind === 'play') turns++
      }
      expect(server.game!.game.phase).toBe('over')
      for (const conn of conns) expect(conn.errors()).toEqual([])
      expect(storage.room).toBeNull() // game over: nothing kept
      expect(storage.alarm).toBeNull()
      // Each action = at most one save + one alarm move (the keepMatchDays end moves with every move)
      expect(storage.puts).toBeLessThanOrEqual(actions + 1)
      expect(storage.rowsWritten).toBeLessThanOrEqual(2 * actions + 4)
      console.log(`[F96 measure] ${players} players, timer ${turnSeconds}s: ${actions} actions (${turns} turns) → ${storage.puts} saves + ${storage.alarmWrites} alarm writes + ${storage.deletes} delete = ${storage.rowsWritten} rows written; biggest saved room ${storage.biggest} bytes`)
    }
  })

  it('save → restore into a new server (a restart): the same game, the same turn; the secret record is kept but never in a view', async () => {
    const { storage, server, conns } = startRoom(2)
    let rng = 5
    for (let i = 0; i < 12; i++) { rng = playOne(server, conns, rng); await flush() }
    const before = server.game!
    expect(storage.room).not.toBeNull()
    expect(storage.room).toContain('"record"') // kept on the server (it replays the game)

    // The server restarts: a new copy, the same storage
    const again = newServer(storage)
    expect(again.server.restore(storage.room!)).toBe(true)
    expect(again.server.game!.gameId).toBe(before.gameId)
    expect(again.server.game!.version).toBe(before.version)
    expect(again.server.game!.game.turnCount).toBe(before.game.turnCount)
    expect(again.server.game!.game.current).toBe(before.game.current)
    expect(again.server.game!.record).toEqual(before.record)
    // Nobody is connected after a restart: both are away until they come back
    expect(again.server.data.seats.every((s) => !s.connected)).toBe(true)

    // Both players come back (their phones reconnect) into the SAME seats, and play on
    const back = [0, 1].map((i) => join(again.server, again.party, i, false, `tab-${i}-new`))
    expect(again.server.data.seats.map((s) => s.kind)).toEqual(['human', 'human'])
    back.forEach((conn, i) => expect(conn.lastView()!.mySeat).toBe(i))
    for (let i = 0; i < 6; i++) { rng = playOne(again.server, back, rng); await flush() }
    expect(again.server.game!.version).toBe(before.version + 6)
    for (const conn of back) {
      expect(conn.errors()).toEqual([])
      for (const view of conn.views()) {
        expect(JSON.stringify(view)).not.toMatch(SECRET)
        expect(view.game.config.seed).toBe(0)
      }
    }
  })

  it('a stored match that can’t be read, or from another room code, is refused (the worker then wipes it)', () => {
    const { storage } = startRoom(2)
    const again = newServer(storage)
    expect(again.server.restore('not json at all')).toBe(false)
    expect(again.server.restore({ version: 999 })).toBe(false)
    const other = newServer(new FakeStorage())
    other.party.id = 'ZZZZ'
    expect(other.server.restore(storage.room!)).toBe(false)
  })

  it('the turn timer comes back with what was left of it; one that ran out while the server was down fires at once', async () => {
    vi.useFakeTimers()
    const { storage, server } = startRoom(2, { turnSeconds: 60 })
    await vi.advanceTimersByTimeAsync(20_000)
    const endsAt = server.game!.turnEndsAt!
    expect(endsAt).toBe(Date.now() + 40_000)

    // Restart 10 s later: 30 s left
    await vi.advanceTimersByTimeAsync(0)
    const saved = storage.room!
    server.timers.stopAll() // (the old copy is gone)
    vi.advanceTimersByTime(10_000)
    const again = newServer(storage)
    expect(again.server.restore(saved)).toBe(true)
    expect(again.server.timers.isRunning('turn')).toBe(true)
    expect(again.server.timers.msLeft('turn')).toBe(30_000)
    join(again.server, again.party, 1, false, 'tab-1-new') // (nobody is connected after a restart: the match waits for the first one back — F99)
    expect(again.server.game!.turnEndsAt).toBe(endsAt) // back at once: every screen still shows the same end time
    vi.advanceTimersByTime(29_000)
    expect(again.server.data.seats[0].kind).toBe('human')
    vi.advanceTimersByTime(1_000) // …and it ran out: a bot takes the seat (F52), as without a restart
    expect(again.server.data.seats[0].kind).toBe('bot')
    again.server.timers.stopAll() // (that copy is gone too — else its bots play on through the wait below)

    // A timer that ran out while the server was down: it fires as soon as the match is loaded back
    const late = newServer(storage)
    vi.advanceTimersByTime(5 * 60_000)
    expect(late.server.restore(saved)).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(late.server.data.seats[0].kind).toBe('human') // nobody back yet: it waits (F99)
    join(late.server, late.party, 1, false, 'tab-1-late')
    vi.advanceTimersByTime(0)
    expect(late.server.data.seats[0].kind).toBe('bot') // the first one back: the timer that ran out fires at once
  })

  it('a bot that was thinking plays its move after the restart, when it would have', async () => {
    vi.useFakeTimers()
    // A person + an AI seat: the person plays, then it's the AI's go (it "thinks" first — pace.json)
    const { storage, server, conns } = startRoom(1, {}, 1)
    expect(server.data.seats.map((s) => s.kind)).toEqual(['human', 'bot'])
    playOne(server, conns, 9)
    await vi.advanceTimersByTimeAsync(0)
    expect(server.game!.game.current).toBe(1)
    expect(server.timers.isRunning('bot')).toBe(true)
    const version = server.game!.version
    const saved = storage.room!
    server.timers.stopAll()

    const again = newServer(storage)
    expect(again.server.restore(saved)).toBe(true)
    expect(again.server.timers.isRunning('bot')).toBe(true)
    vi.advanceTimersByTime(BOT_WAIT)
    expect(again.server.game!.version).toBe(version) // nobody is back yet: the match waits (F99)
    join(again.server, again.party, 0, false, 'tab-0-new')
    vi.advanceTimersByTime(BOT_WAIT)
    expect(again.server.game!.version).toBeGreaterThan(version) // the person is back: the AI played
  })

  it('F99 — bots wait in an empty match: everyone gone → no move and no storage write, even days later; one back → the game goes on, the turn end moved by the wait', async () => {
    vi.useFakeTimers()
    // Two people + an AI seat, the 60 s turn timer: P0 plays, then nobody is connected
    const { storage, server, party, conns } = startRoom(2, { turnSeconds: 60 }, 1)
    let rng = 11
    for (let i = 0; i < 4 && server.game!.game.current !== 2; i++) { rng = playOne(server, conns, rng); await vi.advanceTimersByTimeAsync(0) }
    await vi.advanceTimersByTimeAsync(10_000)
    server.onMessage(JSON.stringify({ type: 'leave' }), conns[1]) // P1 leaves: a bot plays his seat at once…
    server.onClose(conns[0]) // …and P0's tab closes: nobody is connected
    await vi.advanceTimersByTimeAsync(0)
    const version = server.game!.version
    const rows = storage.rowsWritten
    const heldTurn = server.timers.msLeft('turn')
    await vi.advanceTimersByTimeAsync(3 * 24 * 3600_000) // three days
    expect(server.game!.version).toBe(version) // no bot moved
    expect(storage.rowsWritten).toBe(rows) // nothing written
    expect(server.timers.msLeft('turn')).toBe(heldTurn) // (and the turn clock didn't run)

    // P0 comes back: the AIs play on, and P0 gets a turn again
    const back = join(server, party, 0, false, 'tab-0-back')
    if (heldTurn > 0) expect(server.game!.turnEndsAt).toBe(Date.now() + heldTurn) // the end every screen shows moved with the wait
    let played = 0
    for (let i = 0; i < 40 && played < 1 && server.game!.game.phase !== 'over'; i++) {
      await vi.advanceTimersByTimeAsync(BOT_WAIT)
      if (server.game!.game.current === 0 && back.lastView()!.game.current === 0) { rng = playOne(server, [back], rng); played++ }
    }
    expect(server.game!.version).toBeGreaterThan(version + 1)
    expect(back.errors()).toEqual([])
  })

  it('the privacy page says how long a room is kept — the same numbers as content/rooms.json', () => {
    const page = readFileSync('public/privacy.html', 'utf8')
    expect(page).toContain(`after ${settings.keepMatchDays} days without a move`)
    expect(page).toContain(`(${settings.keepUnplayedMatchHours} hours, if nobody has made a move yet`)
    expect(page).toContain(`at most ${settings.keepEmptyRoomMs / 60_000} minutes after everyone has left`)
  })

  it('keepMatchDays (7): a match with no move for 7 days ends, and a stored one that ran out while asleep never comes back', async () => {
    vi.useFakeTimers()
    expect(settings.keepMatchDays).toBe(7)
    const { storage, server, conns } = startRoom(2)
    playOne(server, conns, 4) // (a person moved: the 7 days count, not keepUnplayedMatchHours)
    await vi.advanceTimersByTimeAsync(0)
    const saved = storage.room!
    // While it runs: 7 days without a move → the room is cleared and storage wiped
    await vi.advanceTimersByTimeAsync(7 * 24 * 3600_000)
    expect(server.game).toBeNull()
    expect(storage.room).toBeNull()
    // A copy of the match from before, loaded after its 7 days: refused (the worker deletes it)
    const again = newServer(new FakeStorage())
    expect(again.server.restore(saved)).toBe(false)
  })
})

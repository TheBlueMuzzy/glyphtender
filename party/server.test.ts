// The online server with a fake PartyKit (no live server): whole games played through the real rooms module
// and Glyphtender's rules plug-in. Each fake player plays ONLY from the views it was sent — and after every
// message we check that no view ever held another player's seeds, the bag, the rng, the seed or any Magic
// before the game was over (design/online.md §10).
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { newGame } from '../src/engine/engine'
import { glyphtenderRules } from '../src/engine/rules'
import { replay } from '../src/table/core'
import { randomAction } from '../src/engine/sim'
import { shuffle } from '../src/engine/rng'
import type { Action, GameState } from '../src/engine/types'
import { parseWordList } from '../src/engine/words'
import type { WordList } from '../src/engine/types'
import { RoomServer, type PartyConnection, type PartyRoom } from '../src/rooms/server/roomServer'
import type { ServerMessage } from '../src/rooms/protocol'
import settings from '../content/rooms.json'
import { makeRules } from './glyphtenderRules'
import { HIDDEN, type GameView, type OnlineAction, type OnlineOptions } from './protocol'
import type { ServerGame } from './serverGame'
import { viewOf } from './views'

let words: WordList
beforeAll(() => { words = parseWordList(readFileSync('public/words/words.csv', 'utf8')) })
afterEach(() => vi.useRealTimers())

// ─── A fake PartyKit ────────────────────────────────────────────────
class FakeParty implements PartyRoom {
  id = 'BAKU'
  live = new Map<string, FakeConnection>()
  getConnection(id: string) { return this.live.get(id) }
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

type Server = RoomServer<ServerGame, OnlineOptions, OnlineAction, GameView, never>

/** A room with `players` joined (the first is host), started with `options`. */
function startRoom(players: number, options: Partial<OnlineOptions> = {}, seed: number | 'secret' = 7) {
  let n = seed === 'secret' ? 0 : seed
  const randomSeed = seed === 'secret' ? undefined : () => (n = (n * 48271) % 2147483647) // 'secret' = the real server’s random numbers
  const rules = makeRules({ words: () => words, randomSeed })
  const party = new FakeParty()
  // (no flood limit here: a whole game is played within one real second)
  const server: Server = new RoomServer(party, rules, { ...settings, botTakesOverAfterMs: 0, maxMessagesPerSecond: 0 })
  server.log = () => {} // quiet tests
  const conns = Array.from({ length: players }, (_, i) => {
    const conn = new FakeConnection(`tab-${i}`)
    party.live.set(conn.id, conn)
    server.onConnect(conn)
    server.onMessage(JSON.stringify({ type: 'join', name: `P${i}`, persistentId: `player-id-${i}`, create: i === 0 }), conn)
    return conn
  })
  conns.slice(1).forEach((conn) => server.onMessage(JSON.stringify({ type: 'ready', ready: true }), conn))
  server.onMessage(JSON.stringify({ type: 'start', options }), conns[0])
  return { server, conns }
}

const send = (server: Server, conn: FakeConnection, action: unknown) =>
  server.onMessage(JSON.stringify({ type: 'action', action }), conn)

/** Fails if this view's feed (what happened lately) holds an event this seat may not see: another seat's drawn or
 *  set-aside seeds (ids or letters), or any Magic before the end. (The game itself is checked by expectNoSecrets.) */
function expectFeedForMe(view: GameView) {
  for (const { events } of view.feed) {
    for (const e of events) {
      if (e.type === 'drew' || e.type === 'setAside') expect(e.seat).toBe(view.mySeat) // only your own seeds, ever
      if (e.type === 'drewHidden') expect(e.seat).not.toBe(view.mySeat) // (the count is for everyone else)
      if (e.seen !== 'all') expect(e.seen.seats).toContain(view.mySeat)
      if (e.type === 'gameOver') expect(view.game.phase).toBe('over') // the Magic, only at the end
    }
  }
  if (view.game.phase !== 'over') expect(JSON.stringify(view.feed)).not.toMatch(/"magic"|"tangleMagic"|"winners"/)
  // A seed is named only while you can still see it: in your hand or on the board. One you drew or set aside that went
  // back into the bag is '?' — its id would let you follow it around the bag (the e2e:online frame check, per view)
  const mayKnow = new Set([...(view.game.hands[view.mySeat] ?? []), ...Object.values(view.game.seeds)].map((s) => s.id))
  expect((JSON.stringify(view.feed).match(/seed-\d+/g) ?? []).filter((id) => !mayKnow.has(id))).toEqual([])
}

/** Fails if this view (seen by its own seat) holds anything secret. */
function expectNoSecrets(view: GameView) {
  const { game, mySeat } = view
  expectFeedForMe(view)
  if (game.phase === 'over') return
  game.hands.forEach((hand, seat) => { if (seat !== mySeat) expect(hand.every((s) => s.id === HIDDEN && s.letter === HIDDEN)).toBe(true) })
  expect(game.bag.every((s) => s.id === HIDDEN && s.letter === HIDDEN)).toBe(true)
  expect(game.rng).toBe(0)
  expect(game.config.seed).toBe(0)
  expect([...game.magic, ...game.tangleMagic].every((m) => m === 0)).toBe(true)
  expect(game.winners).toEqual([])
  expect(game.lastTurn?.magic ?? 0).toBe(0)
  expect(game.lastTurn?.words.every((w) => w.magic === 0) ?? true).toBe(true)
  expect(view.results).toBeNull()
  // the game log holds every turn's Magic and the running totals: sent empty until the end (D47)
  expect(game.log ?? { turns: [], end: null }).toEqual({ turns: [], end: null })
  // …and what a rival could have spelled with their hand on a cast's hex (Weed toss): log-only, never sent before the end
  expect(game.pendingLog ?? null).toBeNull()
  expect(JSON.stringify(view)).not.toMatch(/totalsAfter|ownMagic|"tangles"|"blocked"|"mobility"/)
}

/** Every player plays random legal moves from their OWN view until the game ends. */
function playOut(server: Server, conns: FakeConnection[], rngStart: number) {
  let rng = rngStart
  for (let step = 0; step < 3000; step++) {
    const view = conns[0].lastView()!
    if (view.game.phase === 'over') return step
    const mine = conns[view.game.current].lastView()!
    const pick = randomAction(mine.game, rng)
    rng = pick.rng
    send(server, conns[view.game.current], { kind: 'play', action: pick.action, version: mine.version })
  }
  throw new Error('the game never ended')
}

describe('online server — secrets stay secret', () => {
  for (const [players, seed] of [[2, 3], [2, 11], [3, 5], [4, 9]]) {
    it(`${players} players, game ${seed}: no view ever holds another hand, the bag, the rng or Magic before the end`, () => {
      const { server, conns } = startRoom(players, {}, seed)
      playOut(server, conns, seed)
      for (const conn of conns) {
        expect(conn.errors()).toEqual([])
        const views = conn.views()
        views.forEach(expectNoSecrets)
        // At the end: the whole truth + the end table, the same for everyone
        const last = views.at(-1)!
        expect(last.game.phase).toBe('over')
        expect(last.game).toEqual(server.game!.game)
        expect(last.results?.stats).toEqual(server.game!.stats)
        expect(last.game.winners.length).toBeGreaterThan(0)
        // …and the whole game log, for the end screen
        expect(last.game.log!.turns).toHaveLength(server.game!.game.turnCount)
        expect(last.game.log!.end?.totals).toEqual(server.game!.game.magic)
      }
      // Some Magic really was made (so the zeroing above was hiding something real)
      expect(server.game!.game.magic.some((m) => m > 0)).toBe(true)
    })
  }

  it('each view carries the feed: every change numbered by its version, only that seat’s own seeds in it', () => {
    const { server, conns } = startRoom(3, {}, 5)
    playOut(server, conns, 5)
    // The server's feed holds every seat's drawn seeds (so the cutting really hides something)…
    const all = server.game!.feed.flatMap((c) => c.events)
    expect(new Set(all.filter((e) => e.type === 'drew').map((e) => e.seat)).size).toBeGreaterThan(1)
    for (const conn of conns) {
      const views = conn.views()
      for (const view of views) {
        expectFeedForMe(view)
        // …the newest change is the view's own version, and the numbers run on without a gap
        if (view.version > 0) expect(view.feed.at(-1)!.change).toBe(view.version)
        view.feed.forEach((c, i) => i > 0 && expect(c.change).toBe(view.feed[i - 1].change + 1))
        // another seat's drawn letters never appear: no seeds at all in an event about someone else
        for (const { events } of view.feed) for (const e of events) if ('seeds' in e) expect(e.seat).toBe(view.mySeat)
      }
      expect(views.some((v) => v.feed.some((c) => c.events.some((e) => e.type === 'drew')))).toBe(true) // (it saw its own draws)
    }
  })

  it('each player gets their OWN view: their seeds, the others as "?"', () => {
    const { server, conns } = startRoom(2)
    playOut(server, conns.slice(), 1) // (plays to the end) — look at the first view after the deal
    const dealt = conns[1].views().find((v) => v.game.phase === 'play')!
    expect(dealt.mySeat).toBe(1)
    expect(dealt.game.hands[1].every((s) => s.id.startsWith('seed-'))).toBe(true) // your own seeds, with their ids
    expect(dealt.game.hands[0]).toEqual(Array(8).fill({ id: HIDDEN, letter: HIDDEN }))
    expect(dealt.names).toEqual(['P0', 'P1'])
  })

  for (const [players, seed] of [[2, 3], [3, 5], [4, 9]]) {
    it(`${players} players, game ${seed}: no message ever names a seed in the bag or a rival's hand (seed ids, F33)`, () => {
      const { server, conns } = startRoom(players, {}, seed)
      playOut(server, conns, seed)
      for (const conn of conns) {
        // Ids a seat may know: seeds it has held, and seeds planted on the board (public). Any other id = a leak.
        const known = new Set<string>()
        let over = false
        for (const message of conn.received) {
          const view = message.type === 'view' ? (message as { view?: GameView }).view : undefined
          if (view?.game.phase === 'over') over = true // the reveal: the whole truth is fine
          if (over) continue
          if (view) {
            for (const s of view.game.hands[view.mySeat] ?? []) known.add(s.id)
            for (const s of Object.values(view.game.seeds)) known.add(s.id)
          }
          const named = JSON.stringify(message).match(/seed-\d+/g) ?? []
          expect(named.filter((id) => !known.has(id))).toEqual([])
        }
        expect(over).toBe(true)
        expect(known.size).toBeGreaterThan(8) // it really saw ids (its own hand, the board)
      }
      expect(server.game!.game.phase).toBe('over')
    })
  }
})

/** Does this text hold the number n on its own (not as part of a longer number)? */
const holdsNumber = (text: string, n: number) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(text)

describe('online server — the move record (setup with its secret numbers + every move)', () => {
  for (const [players, seed] of [[2, 3], [3, 5], [4, 9]]) {
    it(`${players} players, game ${seed}: replaying the server’s record gives exactly the server’s game`, () => {
      const { server, conns } = startRoom(players, {}, seed)
      playOut(server, conns, seed)
      const { game, record } = server.game!
      expect(game.phase).toBe('over')
      expect(record.moves.length).toBe(server.game!.version)
      expect(record.setup.bagSeed).toEqual(expect.any(Number))
      expect(record.setup.rngSeed).toEqual(expect.any(Number))
      expect(replay(glyphtenderRules(words), record).state).toEqual(game)
    })
  }

  it('a game the server played turns of (a bot took a seat) replays too', () => {
    vi.useFakeTimers()
    const { server, conns } = startRoom(2)
    server.onMessage(JSON.stringify({ type: 'leave' }), conns[1])
    let rng = 3
    for (let i = 0; i < 2000 && server.game!.game.phase !== 'over'; i++) {
      const view = conns[0].lastView()!
      if (view.game.current === 0) {
        const pick = randomAction(view.game, rng)
        rng = pick.rng
        send(server, conns[0], { kind: 'play', action: pick.action, version: view.version })
      } else vi.advanceTimersByTime(settings.botTurnDelayMs)
    }
    expect(server.game!.game.phase).toBe('over')
    expect(server.game!.record.moves.some((m) => m.seat === 1)).toBe(true)
    expect(replay(glyphtenderRules(words), server.game!.record).state).toEqual(server.game!.game)
  })

  for (const [players, seed] of [[2, 11], [4, 9]]) {
    it(`${players} players, game ${seed}: the record and its secret numbers never reach a player — in any message`, () => {
      const { server, conns } = startRoom(players, {}, seed)
      playOut(server, conns, seed)
      const { setup } = server.game!.record
      expect(holdsNumber(JSON.stringify(server.game), setup.bagSeed!)).toBe(true) // (the search does find it where it is)
      for (const conn of conns) {
        expect(conn.received.length).toBeGreaterThan(10)
        for (const message of conn.received) {
          const text = JSON.stringify(message)
          expect(text).not.toMatch(/"record"|"moves"|"bagSeed"|"rngSeed"|"botRng"/)
          expect(holdsNumber(text, setup.bagSeed!)).toBe(false) // the bag's second shuffle: never, not even at the end
          const over = message.type === 'view' && (message as { view?: GameView }).view?.game.phase === 'over'
          if (over) continue // the end reveals the game's seed and rng position (D47) — never the bag's second number
          expect(holdsNumber(text, setup.seed)).toBe(false)
          expect(holdsNumber(text, setup.rngSeed!)).toBe(false)
          expect(holdsNumber(text, setup.seed ^ 0x5eed)).toBe(false) // the server bot's random start (botRng)
        }
      }
    })
  }
})

describe('online server — the bag can’t be worked out', () => {
  it('the bag is not the shuffle of the game’s seed (a PC tries all 2^31 seeds against its own hand in ~30 min)', () => {
    const { server } = startRoom(2)
    const { game } = server.game!
    expect(game.bag).not.toEqual(newGame({ players: 2, seed: game.config.seed }).bag)
  })

  it('the real server’s random numbers are secret ones, not Math.random (its next numbers can be worked out from earlier ones)', () => {
    const mathRandom = vi.spyOn(Math, 'random')
    const { server } = startRoom(2, {}, 'secret')
    expect(server.game).not.toBeNull()
    expect(mathRandom).not.toHaveBeenCalled()
    mathRandom.mockRestore()
  })
})

describe('online server — says no, and changes nothing', () => {
  function afterDraft() {
    const { server, conns } = startRoom(2)
    let rng = 1
    while (conns[0].lastView()!.game.phase === 'draft') {
      const view = conns[conns[0].lastView()!.game.current].lastView()!
      const pick = randomAction(view.game, rng)
      rng = pick.rng
      send(server, conns[view.game.current], { kind: 'play', action: pick.action, version: view.version })
    }
    return { server, conns }
  }
  const refused = (conn: FakeConnection) => conn.errors().at(-1) as { code: string; message: string } | undefined

  it('the wrong player, an old version, a bad shape, an illegal move', () => {
    const { server, conns } = afterDraft()
    const before = JSON.stringify(server.game)
    const view = conns[0].lastView()!
    const legal = randomAction(view.game, 5).action
    send(server, conns[1], { kind: 'play', action: legal, version: view.version })
    expect(refused(conns[1])?.message).toMatch(/not your turn/)
    send(server, conns[0], { kind: 'play', action: legal, version: view.version - 1 })
    expect(refused(conns[0])?.message).toMatch(/moved on/)
    send(server, conns[0], { kind: 'play', action: { type: 'turn', glyphling: 'x' }, version: view.version })
    expect(refused(conns[0])?.code).toBe('bad_action')
    send(server, conns[0], { kind: 'play', action: { type: 'turn', glyphling: 2, to: { q: 0, r: 0 }, seed: null, target: null }, version: view.version })
    expect(refused(conns[0])?.message).toMatch(/another player/)
    send(server, conns[0], { kind: 'play', action: { type: 'refresh', setAside: [1, 1] }, version: view.version })
    expect(refused(conns[0])?.code).toBe('bad_action')
    // Seeds are named by id (F33): an old-style hand position, junk text or a repeat is a bad shape…
    for (const seed of [0, 3, '?', 'seed-', 'E']) {
      send(server, conns[0], { kind: 'play', action: { ...legal, seed }, version: view.version })
      expect(refused(conns[0])?.code).toBe('bad_action')
    }
    send(server, conns[0], { kind: 'play', action: { type: 'refresh', setAside: ['seed-1', 'seed-1'] }, version: view.version })
    expect(refused(conns[0])?.code).toBe('bad_action')
    // …and a real-looking id that isn't in your hand (a rival's, the bag's, made up) is refused by the rules
    const rivalSeed = server.game!.game.hands[1][0].id
    for (const seed of [rivalSeed, server.game!.game.bag[0].id, 'seed-999']) {
      send(server, conns[0], { kind: 'play', action: { ...legal, seed }, version: view.version })
      expect(refused(conns[0])?.message).toMatch(/not in your hand/)
    }
    expect(JSON.stringify(server.game)).toBe(before)
  })

  it('sync sends MY view again (only mine) without changing the game', () => {
    const { server, conns } = afterDraft()
    const before = conns[1].views().length
    const others = conns[0].received.length
    const version = server.game!.version
    send(server, conns[1], { kind: 'sync' })
    expect(conns[1].views().length).toBe(before + 1)
    expect(conns[0].received.length).toBe(others) // one player can't make the server message everyone
    expect(server.game!.version).toBe(version)
  })

  it('B021: each view says which change my OWN last action made (only mine; a turn the server played for me is not one)', () => {
    vi.useFakeTimers()
    const { server, conns } = startRoom(2, { turnSeconds: 60 })
    expect(conns.map((c) => c.lastView()!.myLastAction)).toEqual([0, 0]) // nothing sent yet
    const yellow = conns[0].lastView()!
    send(server, conns[0], { kind: 'play', action: randomAction(yellow.game, 1).action, version: yellow.version })
    expect(conns.map((c) => c.lastView()!.myLastAction)).toEqual([1, 0]) // Yellow's placement made change 1; Blue sent nothing
    vi.advanceTimersByTime(60_000) // Blue's clock runs out: the server places for Blue
    expect(server.game!.version).toBe(2)
    expect(conns.map((c) => c.lastView()!.myLastAction)).toEqual([1, 0]) // not Blue's own action
    const blue = conns[1].lastView()!
    send(server, conns[1], { kind: 'play', action: randomAction(blue.game, 2).action, version: blue.version })
    expect(conns.map((c) => c.lastView()!.myLastAction)).toEqual([1, 3])
    conns.forEach((conn) => conn.views().forEach(expectNoSecrets))
  })

  it('B021: a room started before lastOwnAction existed still takes moves (the server update lands mid-game)', () => {
    const { server, conns } = startRoom(2)
    delete (server.game as Partial<ServerGame>).lastOwnAction // as saved by the old server
    const yellow = conns[0].lastView()!
    expect(yellow.myLastAction).toBe(0)
    send(server, conns[0], { kind: 'play', action: randomAction(yellow.game, 1).action, version: yellow.version })
    expect(conns[0].lastView()!.version).toBe(1) // the move went through
    expect(conns.map((c) => c.lastView()!.myLastAction)).toEqual([1, 0])
  })

  it('bad options are refused at the start', () => {
    const { server } = startRoom(2, { boardName: 'huge' } as Partial<OnlineOptions>)
    expect(server.game).toBeNull()
    const { server: ok } = startRoom(2, { boardName: 'large', minWordLength: 3 })
    expect(ok.game!.game.config.boardName).toBe('large')
    expect(ok.game!.game.config.rules.minWordLength).toBe(3)
    const { server: timer } = startRoom(2, { turnSeconds: 45 })
    expect(timer.game).toBeNull()
    const { server: yes } = startRoom(2, { wordIndicators: 'yes' } as unknown as Partial<OnlineOptions>)
    expect(yes.game).toBeNull()
  })

  it('word indicators: on unless the host turns them off, and every player’s view carries the choice', () => {
    const { conns } = startRoom(2)
    expect(conns.map((c) => c.lastView()!.options.wordIndicators)).toEqual([true, true])
    const { conns: off } = startRoom(2, { wordIndicators: false })
    expect(off.map((c) => c.lastView()!.options.wordIndicators)).toEqual([false, false])
  })
})

describe('online server — the turn timer and idle players', () => {
  it('timer off (the default): nobody is hurried', () => {
    vi.useFakeTimers()
    const { server } = startRoom(2)
    vi.advanceTimersByTime(10 * 60_000)
    expect(server.game!.version).toBe(0)
    expect(server.game!.turnEndsAt).toBeNull()
  })

  it('timer on: when it runs out the server plays a legal move, and after 2 in a row a bot takes the seat', () => {
    vi.useFakeTimers()
    const { server, conns } = startRoom(2, { turnSeconds: 60 })
    expect(conns[0].lastView()!.turnEndsAt).toBeGreaterThan(Date.now())
    vi.advanceTimersByTime(60_000) // Yellow's first draft placement ran out
    expect(server.game!.version).toBe(1)
    expect(server.data.seats[0].missedTurns).toBe(1)
    vi.advanceTimersByTime(60_000) // Blue's
    vi.advanceTimersByTime(60_000) // Blue's again (snake draft)
    expect(server.data.seats[1].kind).toBe('bot')
    // A bot plays at once (after botTurnDelayMs), without waiting for a timer
    vi.advanceTimersByTime(60_000 + settings.botTurnDelayMs * 10)
    expect(server.game!.version).toBeGreaterThan(4)
    conns.forEach((conn) => conn.views().forEach(expectNoSecrets))
  })

  it('dropping out and coming back doesn’t start the turn clock again — for them or for anyone else', () => {
    vi.useFakeTimers()
    const { server, conns } = startRoom(2, { turnSeconds: 60 })
    vi.advanceTimersByTime(50_000) // Yellow's first placement: 10 s left
    conns.forEach((conn, i) => { // Yellow's tab drops and comes straight back; then Blue's does too
      server.onClose(conn)
      server.onMessage(JSON.stringify({ type: 'join', name: `P${i}`, persistentId: `player-id-${i}`, create: false }), new FakeConnection(`tab-${i}-again`))
    })
    vi.advanceTimersByTime(10_000)
    expect(server.game!.version).toBe(1) // her 60 s ran out: the server placed for her
    expect(server.data.seats[0].missedTurns).toBe(1)
  })

  it('a player who leaves mid-game is played by a bot, so the others can finish', () => {
    vi.useFakeTimers()
    const { server, conns } = startRoom(2)
    server.onMessage(JSON.stringify({ type: 'leave' }), conns[1])
    let rng = 3
    for (let i = 0; i < 2000 && server.game!.game.phase !== 'over'; i++) {
      const view = conns[0].lastView()!
      if (view.game.current === 0) {
        const pick = randomAction(view.game, rng)
        rng = pick.rng
        send(server, conns[0], { kind: 'play', action: pick.action, version: view.version })
      } else vi.advanceTimersByTime(settings.botTurnDelayMs)
    }
    expect(server.game!.game.phase).toBe('over')
    conns[0].views().forEach(expectNoSecrets)
  })
})

// ─── Side doors (F36) ───────────────────────────────────────────────
// Not just "is a secret in the message" — could a player WORK OUT something hidden from what they're sent? Hidden
// ORDER is a secret too: the order of a rival's seeds and of the bag. Each test changes only what a seat may not see
// and checks that seat receives exactly the same messages.

/** Plays a game to the end like playOut, writing down every action (seat + action) in order. */
function playAndWriteDown(server: Server, conns: FakeConnection[], rngStart: number): { seat: number; action: Action }[] {
  const played: { seat: number; action: Action }[] = []
  let rng = rngStart
  for (let step = 0; step < 3000 && server.game!.game.phase !== 'over'; step++) {
    const seat = server.game!.game.current
    const mine = conns[seat].lastView()!
    const pick = randomAction(mine.game, rng)
    rng = pick.rng
    played.push({ seat, action: pick.action })
    send(server, conns[seat], { kind: 'play', action: pick.action, version: mine.version })
  }
  expect(server.game!.game.phase).toBe('over')
  return played
}

/** Every message a seat got before the game was over (the reveal shows the whole truth on purpose). */
function beforeTheEnd(conn: FakeConnection): string[] {
  const end = conn.received.findIndex((m) => m.type === 'view' && (m as { view?: GameView }).view?.game.phase === 'over')
  return conn.received.slice(0, end < 0 ? undefined : end).map((m) => JSON.stringify(m))
}

/** The same game with `seat`'s hand in another order (the seeds are the same; only their order changes). */
const withHandReversed = (state: ServerGame, seat: number): ServerGame => ({
  ...state, game: { ...state.game, hands: state.game.hands.map((hand, s) => (s === seat ? [...hand].reverse() : hand)) },
})

describe('online server — side doors: hidden ORDER can’t be worked out', () => {
  for (const [players, seed] of [[2, 3], [3, 5], [4, 9]]) {
    it(`${players} players, game ${seed}: a rival’s seeds in another order → every other seat gets exactly the same messages`, () => {
      // Game A, played and written down
      const a = startRoom(players, {}, seed)
      const played = playAndWriteDown(a.server, a.conns, seed)
      // Game B: the same start and the same actions (seeds are named by id, so they mean the same seeds) — but as
      // soon as the seeds are dealt, seat 1's hand is put in another order
      const b = startRoom(players, {}, seed)
      let reordered = false
      for (const { seat, action } of played) {
        if (!reordered && b.server.game!.game.phase === 'play') {
          const before = b.server.game!.game.hands[1]
          b.server.game = withHandReversed(b.server.game!, 1)
          expect(b.server.game.game.hands[1]).not.toEqual(before) // (the two games really differ)
          reordered = true
        }
        send(b.server, b.conns[seat], { kind: 'play', action, version: b.conns[seat].lastView()!.version })
      }
      expect(reordered).toBe(true)
      expect(b.server.game!.game.phase).toBe('over')
      a.conns.forEach((conn, seat) => {
        if (seat === 1) expect(beforeTheEnd(b.conns[1])).not.toEqual(beforeTheEnd(conn)) // (its owner sees its own order)
        else expect(beforeTheEnd(b.conns[seat])).toEqual(beforeTheEnd(conn))
      })
    })
  }

  it('at every moment of a game, each seat’s view is the same whatever order the bag and the rivals’ seeds are in', () => {
    const { server, conns } = startRoom(3, {}, 5)
    let rng = 5
    let checked = 0
    const shuffled = (state: GameState, mySeat: number, n: number): GameState => ({
      ...state,
      bag: shuffle(n, state.bag).items,
      hands: state.hands.map((hand, s) => (s === mySeat ? hand : shuffle(n + s, hand).items)),
    })
    for (let step = 0; step < 3000 && server.game!.game.phase !== 'over'; step++) {
      const state = server.game!
      state.seatIds.forEach((seatId, seat) => {
        const other = { ...state, game: shuffled(state.game, seat, step + 1) }
        expect(viewOf(other, seatId)).toEqual(viewOf(state, seatId))
        checked++
      })
      const seat = state.game.current
      const mine = conns[seat].lastView()!
      const pick = randomAction(mine.game, rng)
      rng = pick.rng
      send(server, conns[seat], { kind: 'play', action: pick.action, version: mine.version })
    }
    expect(server.game!.game.phase).toBe('over')
    expect(checked).toBeGreaterThan(100)
  })
})

describe('online server — side doors: events, the log, the bot', () => {
  it('nothing but views carries the game (events ride inside views, D64): no room event messages at all', () => {
    const { server, conns } = startRoom(3, {}, 5)
    playOut(server, conns, 5)
    for (const conn of conns) expect(conn.received.filter((m) => m.type === 'event')).toEqual([])
  })

  it('a game a bot finished: the log, its pending facts, the Magic and the bot’s random numbers never reach the others early', () => {
    vi.useFakeTimers()
    const { server, conns } = startRoom(3, {}, 9)
    server.onMessage(JSON.stringify({ type: 'leave' }), conns[2]) // a bot takes seat 2
    let rng = 9
    for (let i = 0; i < 3000 && server.game!.game.phase !== 'over'; i++) {
      const seat = server.game!.game.current
      if (seat === 2) { vi.advanceTimersByTime(settings.botTurnDelayMs); continue }
      const view = conns[seat].lastView()!
      const pick = randomAction(view.game, rng)
      rng = pick.rng
      send(server, conns[seat], { kind: 'play', action: pick.action, version: view.version })
    }
    expect(server.game!.game.phase).toBe('over')
    expect(server.game!.record.moves.filter((m) => m.seat === 2).length).toBeGreaterThan(5) // (the bot really played)
    for (const conn of conns.slice(0, 2)) {
      conn.views().forEach(expectNoSecrets)
      for (const text of beforeTheEnd(conn)) expect(holdsNumber(text, server.game!.botRng)).toBe(false)
    }
  })
})

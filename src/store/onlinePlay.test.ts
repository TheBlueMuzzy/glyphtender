// The store's online path against a fake room: the real server rules in memory, with messages delivered
// only when the test says so (like a network). This device is seat 0 (Yellow); the test plays seat 1 (Blue).
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { legalDraftHexes, legalMoves } from '../engine/engine'
import { randomAction } from '../engine/sim'
import { parseWordList } from '../engine/words'
import type { WordList } from '../engine/types'
import { RoomServer, type PartyConnection, type PartyRoom } from '../rooms/server/roomServer'
import type { ServerMessage } from '../rooms/protocol'
import { makeRules } from '../../party/glyphtenderRules'
import { HIDDEN, type GameView, type OnlineAction, type OnlineOptions } from '../../party/protocol'
import type { ServerGame } from '../../party/serverGame'
import settings from '../../content/rooms.json'
import animJson from '../../content/tuning/anim.json'
import { glideSeconds } from '../game/glide'
import { useGameStore } from './gameStore'
import { actionRefused, connectOnline, receiveView, REPLAY_SEED, roomSeatsChanged, stopOnline } from './onlinePlay'
import { boardHighlight, castOptions, dropKind, TRAY_GAP } from './turnPlan'
import { boardTrail } from './trail'

let words: WordList
beforeAll(() => { words = parseWordList(readFileSync('public/words/words.csv', 'utf8')) })

const store = () => useGameStore.getState()

/** A fake connection: what the server sends waits in `mail` until deliver(). */
class Conn implements PartyConnection {
  mail: ServerMessage[] = []
  seen: GameView[] = []
  id: string
  constructor(id: string) { this.id = id }
  send(text: string) { this.mail.push(JSON.parse(text)) }
  close() {}
}

let server: RoomServer<ServerGame, OnlineOptions, OnlineAction, GameView, never>
let me: Conn, blue: Conn
let sent: OnlineAction[] = []

/** Hands the mail over: my views go to the store (and refusals to actionRefused); Blue's are kept for the test. */
function deliver() {
  for (const message of me.mail.splice(0)) {
    if (message.type === 'view' && message.view) receiveView(message.view as GameView)
    if (message.type === 'error' && message.code === 'action_refused') actionRefused()
  }
  for (const message of blue.mail.splice(0)) if (message.type === 'view' && message.view) blue.seen.push(message.view as GameView)
}
const blueView = () => blue.seen.at(-1)!
const toServer = (conn: Conn, message: unknown) => server.onMessage(JSON.stringify(message), conn)

/** Blue plays one random legal action from its own view. */
function bluePlays(seed = 1) {
  deliver()
  const view = blueView()
  const pick = randomAction(view.game, seed)
  toServer(blue, { type: 'action', action: { kind: 'play', action: pick.action, version: view.version } })
}

/** Yellow (this device) plans a random legal turn through the store, casting if it can, and presses Cast. */
function yellowPlansAndCasts(seed = 1) {
  const game = store().game!
  const pick = randomAction(game, seed).action
  if (pick.type !== 'turn') throw new Error('expected a turn')
  store().tapGlyphling(pick.glyphling)
  store().tapHex(pick.to)
  const targets = castOptions(game, { glyphling: pick.glyphling, to: pick.to })
  if (game.hands[0].length > 0 && targets.length > 0) {
    store().tapSeed(game.hands[0][0].id)
    store().tapHex(targets[0])
  }
  store().startCast()
}

beforeEach(() => {
  vi.useFakeTimers()
  store().leaveGame()
  stopOnline()
  roomSeatsChanged([])
  store().setWords(words)
  let n = 42
  server = new RoomServer({ id: 'BAKU', getConnection: () => undefined } as PartyRoom, makeRules({ words: () => words, randomSeed: () => (n = (n * 48271) % 2147483647) }), settings)
  server.log = () => {}
  me = new Conn('me')
  blue = new Conn('blue')
  sent = []
  connectOnline((message) => {
    sent.push(message)
    toServer(me, { type: 'action', action: message })
    return true
  })
  toServer(me, { type: 'join', name: 'Ada', persistentId: 'persistent-me', create: true })
  toServer(blue, { type: 'join', name: 'Bo', persistentId: 'persistent-blue', create: false })
  toServer(blue, { type: 'ready', ready: true })
  toServer(me, { type: 'start', options: {} })
  deliver()
})
afterEach(() => vi.useRealTimers())

/** Both players place their glyphlings (Yellow through the store's taps). */
function finishDraft() {
  while (store().game!.phase === 'draft') {
    if (store().game!.current === 0) store().tapHex(legalDraftHexes(store().game!)[0])
    else bluePlays()
    deliver()
  }
}

describe('online store — starting and the draft', () => {
  it('the first view starts the game: my seat is local, the others online, no handoff', () => {
    expect(store().game?.phase).toBe('draft')
    expect(store().online?.mySeat).toBe(0)
    expect(store().seats.map((s) => [s.kind, s.where, s.name])).toEqual([['human', 'local', 'Ada'], ['human', 'online', 'Bo']])
    expect(store().options?.hideSeeds).toBe(false)
    expect(store().options?.wordIndicators).toBe(true) // the host's lobby option (on unless turned off)
  })

  it('the seats follow the room message: who is a bot, who is connected (my seat stays a person here)', () => {
    roomSeatsChanged([{ kind: 'human', connected: true }, { kind: 'bot', connected: false }])
    expect(store().seats.map((s) => [s.kind, s.where, s.connected, s.name])).toEqual([['human', 'local', true, 'Ada'], ['bot', 'online', false, 'Bo']])
    roomSeatsChanged([{ kind: 'bot', connected: true }, { kind: 'human', connected: true }]) // (my own seat: always mine to play here)
    expect(store().seats.map((s) => [s.kind, s.where, s.connected])).toEqual([['human', 'local', true], ['human', 'online', true]])
  })

  it('my placement goes to the server and nothing can be touched until its view comes back', () => {
    store().tapHex(legalDraftHexes(store().game!)[0])
    expect(store().waiting).toBe(true)
    expect(store().game!.glyphlings).toHaveLength(0) // not applied locally
    expect(sent.at(-1)).toMatchObject({ kind: 'play', action: { type: 'draft' }, version: 0 })
    deliver()
    expect(store().waiting).toBe(false)
    expect(store().game!.glyphlings).toHaveLength(1)
    expect(store().online!.version).toBe(1)
  })

  it("Blue's placement: dragging my waiting glyphling over a glowing hex is no \"drop here\" (it isn't my turn)", () => {
    store().tapHex(legalDraftHexes(store().game!)[0])
    const glowing = legalDraftHexes(store().game!)[0]
    expect(dropKind({ ...store(), game: store().game! }, glowing)).toBeNull() // my placement is at the server
    deliver()
    expect(store().game!.current).toBe(1)
    expect(dropKind({ ...store(), game: store().game! }, legalDraftHexes(store().game!)[0])).toBeNull()
  })

  it('after the draft: my seeds are real, Blue\'s are "?", and no handoff screen', () => {
    finishDraft()
    const game = store().game!
    expect(game.phase).toBe('play')
    expect(game.hands[0].every((s) => s.id.startsWith('seed-') && s.letter !== HIDDEN)).toBe(true)
    expect(game.hands[1].every((s) => s.id === HIDDEN && s.letter === HIDDEN)).toBe(true)
    expect(store().handoff).toBeNull()
    expect(store().trayOrder[0]).toEqual(game.hands[0].map((s) => s.id))
  })
})

describe('online store — turns', () => {
  it('my Cast: the action leaves at once, the view waits for the seed to land, then it sprouts', () => {
    finishDraft()
    const before = [...store().trayOrder[0]]
    const castId = store().game!.hands[0][0].id // (yellowPlansAndCasts casts the hand's first seed)
    yellowPlansAndCasts()
    expect(store().flying).toBe(true)
    expect(sent.at(-1)).toMatchObject({ kind: 'play', action: { type: 'turn' } })
    deliver() // the server's answer arrives mid-throw
    expect(store().online!.version).toBe(4) // not shown yet
    const landedBefore = store().landed?.count ?? 0
    store().finishCast() // the seed lands
    expect(store().online!.version).toBe(5)
    expect(store().flying).toBe(false)
    expect(store().landed!.count).toBe(landedBefore + 1)
    expect(store().trayOrder[0].filter((i) => i !== TRAY_GAP)).toHaveLength(store().game!.hands[0].length)
    // the tray never re-sorts on a cast: every other seed is where it was (the cast seed's place is refilled or empty)
    const cast = before.indexOf(castId)
    store().trayOrder[0].forEach((id, pos) => {
      if (pos !== cast) expect(id).toBe(before[pos])
    })
  })

  it('side door (F36): a plan never leaves the device — taps, undo, re-aiming, tray moves send nothing; Cast sends ONE whole turn', () => {
    finishDraft()
    const game = store().game!
    const pick = randomAction(game, 1).action
    if (pick.type !== 'turn') throw new Error('expected a turn')
    const sentBefore = sent.length
    store().tapGlyphling(pick.glyphling)
    store().tapHex(pick.to)
    store().undo() // the move goes back
    expect(store().move).toBeNull()
    store().tapGlyphling(pick.glyphling)
    store().tapHex(pick.to)
    const targets = castOptions(game, { glyphling: pick.glyphling, to: pick.to })
    expect(targets.length).toBeGreaterThan(0)
    const seed = game.hands[0][0].id
    store().tapSeed(seed)
    store().tapHex(targets[0])
    store().undo() // the cast goes back
    store().shuffleTray()
    store().tapSeed(seed)
    store().tapHex(targets.at(-1)!)
    expect(sent.length).toBe(sentBefore) // nothing of the plan (or of undoing it) went anywhere
    store().startCast()
    expect(sent.slice(sentBefore)).toEqual([{
      kind: 'play', version: store().online!.version,
      action: { type: 'turn', glyphling: pick.glyphling, to: pick.to, seed, target: targets.at(-1) },
    }])
  })

  it('my seed lands before the answer: it waits, asks again after 3 s, and shows it when it comes', () => {
    finishDraft()
    yellowPlansAndCasts()
    me.mail = [] // the answer got lost
    store().finishCast()
    expect(store().waiting).toBe(true)
    expect(boardHighlight({ ...store(), game: store().game! })).toBeNull() // my move is at the server: no more gold
    vi.advanceTimersByTime(3000)
    expect(sent.at(-1)).toEqual({ kind: 'sync' })
    deliver()
    expect(store().waiting).toBe(false)
    expect(store().online!.version).toBeGreaterThan(4)
  })

  it("Blue's turn is replayed on the old view: their trail, then the glide, the throw, the new view — and then the trail is gone", () => {
    finishDraft()
    yellowPlansAndCasts()
    deliver()
    store().finishCast()
    if (store().game!.phase === 'refresh') { store().refresh(true); deliver() }
    const before = store().game!
    expect(before.current).toBe(1)
    bluePlays(7)
    deliver()
    const turn = blueView().game.lastTurn!
    expect(store().game!.glyphlings).toEqual(before.glyphlings) // still the old view…
    // …first Blue's trail draws on in Blue's colour (from → to → where the seed goes) and holds; nothing moves yet
    const trail = { seat: 1, glyphlingId: turn.glyphlingId, from: turn.from, to: turn.to, target: turn.target }
    expect(store().trail).toEqual(trail)
    expect(boardTrail(store())).toEqual({ mode: 'live', trail })
    expect(store().move).toBeNull()
    vi.advanceTimersByTime((animJson.trailLead + animJson.trailHold) * 1000 - 1)
    expect(store().move).toBeNull()
    vi.advanceTimersByTime(1)
    expect(store().move).toEqual({ glyphling: turn.glyphlingId, to: turn.to }) // …then Blue's glyphling glides
    expect(boardTrail(store())?.mode).toBe('live') // the trail stays on through the glide and the throw
    expect(boardHighlight({ ...store(), game: store().game! })).toBeNull() // no cast rings on my screen for Blue's move
    vi.advanceTimersByTime(glideSeconds(turn.from, turn.to, animJson) * 1000)
    if (turn.letter) {
      expect(store().flying).toBe(true)
      expect(store().game!.hands[1][0]).toEqual({ id: REPLAY_SEED, letter: turn.letter }) // the seed in the air is public now…
      expect(store().cast?.seed).toBe(REPLAY_SEED) // …held by a stand-in id: Blue's real seed ids never reach me
      store().finishCast()
    }
    expect(store().online!.version).toBe(blueView().version)
    expect(store().game!.hands[1].every((s) => s.id === HIDDEN)).toBe(true)
    expect(store().move).toBeNull()
    expect(store().trail).toBeNull()
    expect(boardTrail(store())).toBeNull() // landed: no trail stays on the board
  })

  it("a score sequence holds the queue: Blue's turn waits until the last cast's score has faded, then replays", () => {
    finishDraft()
    yellowPlansAndCasts()
    deliver()
    store().finishCast()
    if (store().game!.phase === 'refresh') { store().refresh(true); deliver() }
    useGameStore.setState({ scoring: 99 }) // (as if Yellow's cast is still scoring on the board)
    const version = store().online!.version
    bluePlays(7)
    deliver()
    expect(store().trail).toBeNull() // nothing of Blue's turn yet — not even the trail
    expect(store().online!.version).toBe(version)
    store().endScoring() // faded: now Blue's turn plays out
    expect(store().scoring).toBeNull()
    expect(store().trail).not.toBeNull()
  })

  it('a sync answered with the same version means my action was lost: the plan comes back to play again', () => {
    finishDraft()
    dropConnection()
    yellowPlansAndCasts() // the server never gets it
    store().finishCast()
    reconnect()
    vi.advanceTimersByTime(3000) // no answer: ask again
    deliver()
    expect(store().waiting).toBe(false)
    expect(store().note).toBe('problem')
  })

  // B021: back after a gap too long for the feed while I was still waiting for my own move's answer
  /** The connection drops: what this device sends never arrives (it thinks it went). */
  const dropConnection = () => connectOnline((message) => { sent.push(message); return true })
  /** …and comes back. */
  const reconnect = () => connectOnline((message) => { sent.push(message); toServer(me, { type: 'action', action: message }); return true })
  /** Blue plays one action from its own view (my mail stays undelivered). */
  function blueActsAlone(seed: number) {
    for (const m of blue.mail.splice(0)) if (m.type === 'view' && m.view) blue.seen.push(m.view as GameView)
    const view = blueView()
    toServer(blue, { type: 'action', action: { kind: 'play', action: randomAction(view.game, seed).action, version: view.version } })
  }
  /** I come back: only the newest view arrives, and the changes before it have left the feed (a jump). */
  function backAfterLongGap() {
    const newest = me.mail.filter((m) => m.type === 'view').at(-1) as { view: GameView }
    me.mail = []
    reconnect()
    receiveView({ ...newest.view, feed: newest.view.feed.slice(-1) })
    return newest.view
  }

  it('B021: a jump while waiting — the server did apply my move: no false "didn\'t go through" note', () => {
    server.game = { ...server.game!, options: { ...server.game!.options, turnSeconds: 60 } } // (the clock plays my refresh if one comes)
    finishDraft()
    yellowPlansAndCasts() // my move reaches the server…
    dropConnection()
    me.mail = [] // …but its answer never comes back
    store().finishCast()
    expect(store().waiting).toBe(true)
    for (let i = 0; i < 70 && server.game!.game.current === 0; i++) vi.advanceTimersByTime(1000) // (my refresh, by the clock)
    blueActsAlone(3) // the game goes on: the newest change is Blue's, not mine
    const view = backAfterLongGap()
    expect(store().online!.version).toBe(view.version)
    expect(store().waiting).toBe(false) // the view says my move was applied
    expect(store().note).toBeNull()
    vi.advanceTimersByTime(3000)
    deliver()
    expect(store().note).toBeNull()
  })

  it('B021: a jump while waiting — my move truly never arrived: the "didn\'t go through" note', () => {
    server.game = { ...server.game!, options: { ...server.game!.options, turnSeconds: 60 } } // (the host's turn timer)
    finishDraft()
    dropConnection()
    yellowPlansAndCasts() // my move never reaches the server
    store().finishCast()
    expect(store().waiting).toBe(true)
    for (let i = 0; i < 70 && server.game!.game.current === 0; i++) vi.advanceTimersByTime(1000) // the clock plays my turn instead
    blueActsAlone(3)
    backAfterLongGap()
    expect(store().waiting).toBe(false)
    expect(store().note).toBe('problem') // play it again
  })

  it('a refused action drops the plan, says "problem" and asks for the true view', () => {
    finishDraft()
    const glyphling = store().game!.glyphlings.find((g) => g.seat === 0)!
    store().tapGlyphling(glyphling.id)
    store().tapHex(legalMoves(store().game!, glyphling.id)[0])
    actionRefused()
    expect(store().move).toBeNull()
    expect(store().note).toBe('problem')
    expect(sent.at(-1)).toEqual({ kind: 'sync' })
  })

  it('B011: my refresh plays out on my tray — shrink (its view waits), then the new seeds grow in', () => {
    finishDraft()
    // play until it's my refresh (a turn of mine that made no Magic)
    for (let i = 0; i < 400 && !(store().game!.current === 0 && store().game!.phase === 'refresh'); i++) {
      const game = store().game!
      if (store().flying) store().finishCast()
      else if (game.phase === 'refresh' && game.current === 1) bluePlays(i + 1)
      else if (game.current === 0 && !store().waiting) yellowPlansAndCasts(i + 1)
      else if (game.current === 1 && !store().move && !store().trail) bluePlays(i + 1)
      deliver()
      vi.advanceTimersByTime(1000)
    }
    expect(store().game!.phase).toBe('refresh')
    const orderBefore = [...store().trayOrder[0]]
    store().tapSeed(orderBefore[1]) // the seed in tray place 1
    store().refresh()
    expect(store().refreshFx).toMatchObject({ seat: 0, slots: [1], stage: 'out' })
    expect(sent.at(-1)).toMatchObject({ kind: 'play', action: { type: 'refresh' } }) // it left at once
    deliver() // the view is here already…
    expect(store().game!.phase).toBe('refresh') // …but waits for the shrink
    vi.advanceTimersByTime(animJson.refreshShrinkTime * 1000 + animJson.refreshPause * 1000)
    const fx = store().refreshFx!
    expect(fx.stage).toBe('in')
    expect(fx.newSlots).toContain(1) // the new seed grows into the set-aside place
    expect(store().game!.current).toBe(1)
    vi.advanceTimersByTime(2000)
    expect(store().refreshFx).toBeNull()
    // kept seeds stayed where they were
    orderBefore.forEach((id, pos) => { if (pos !== 1 && id !== TRAY_GAP) expect(store().trayOrder[0][pos]).toBe(id) }) // (an empty place may fill)
  })

  it('a whole game to the end: the reveal gets the full truth and the end table', () => {
    finishDraft()
    for (let i = 0; i < 3000 && store().game!.phase !== 'over'; i++) {
      const game = store().game!
      if (store().flying) store().finishCast()
      else if (game.current === 0 && game.phase === 'refresh') store().refresh(true)
      else if (game.current === 0 && !store().waiting) yellowPlansAndCasts(i + 1)
      else if (game.current === 1 && !store().move && !store().trail) bluePlays(i + 1)
      deliver()
      vi.advanceTimersByTime(1000)
    }
    const game = store().game!
    expect(game.phase).toBe('over')
    expect(game).toEqual(server.game!.game)
    expect(store().stats).toEqual(server.game!.stats)
    expect(game.magic.some((m) => m > 0)).toBe(true)
  })

  it('a rematch (a new game id) starts over from its first view', () => {
    finishDraft()
    const firstId = store().online!.gameId
    receiveView({ ...blueView(), gameId: firstId + 1, version: 0, mySeat: 0 })
    expect(store().online!.gameId).toBe(firstId + 1)
    expect(store().online!.version).toBe(0)
  })
})

describe('online store — the feed (F31): every change played once, in order', () => {
  // Three players: this device is Yellow (seat 0); Blue and Red play from their own views.
  let red: Conn
  let rivals: Conn[]
  const latest = (conn: Conn) => conn.seen.at(-1)!
  /** My undelivered mail: only the views (the newest last). */
  const myViews = () => me.mail.filter((m) => m.type === 'view' && m.view).map((m) => (m as { view: GameView }).view)
  const keepRivalsPosted = () => {
    for (const conn of rivals) for (const m of conn.mail.splice(0)) if (m.type === 'view' && m.view) conn.seen.push(m.view as GameView)
  }
  /** Watches every trail that draws on (one per replayed turn): the seats, in order. */
  const watchTrails = () => {
    const seats: number[] = []
    const stop = useGameStore.subscribe((now, was) => { if (now.trail && now.trail !== was.trail) seats.push(now.trail.seat) })
    return { seats, stop }
  }

  beforeEach(() => {
    store().leaveGame()
    stopOnline()
    let n = 42
    server = new RoomServer({ id: 'BAKU', getConnection: () => undefined } as PartyRoom, makeRules({ words: () => words, randomSeed: () => (n = (n * 48271) % 2147483647) }), settings)
    server.log = () => {}
    me = new Conn('me')
    blue = new Conn('blue')
    red = new Conn('red')
    rivals = [blue, red]
    toServer(me, { type: 'join', name: 'Ada', persistentId: 'persistent-me', create: true })
    toServer(blue, { type: 'join', name: 'Bo', persistentId: 'persistent-blue', create: false })
    toServer(red, { type: 'join', name: 'Cy', persistentId: 'persistent-red', create: false })
    toServer(blue, { type: 'ready', ready: true })
    toServer(red, { type: 'ready', ready: true })
    toServer(me, { type: 'start', options: {} })
    deliver()
    keepRivalsPosted()
  })

  /** The rivals play (from their own views) until it's my turn again — my mail waits, undelivered. */
  function rivalsPlayUntilMe(seed: number) {
    for (let i = 0; i < 20; i++) {
      keepRivalsPosted()
      const view = latest(rivals[0]) // (any rival's view says whose turn it is)
      if (view.game.current === 0 || view.game.phase === 'over') return
      const conn = rivals[view.game.current - 1]
      const own = latest(conn)
      const pick = randomAction(own.game, seed + i)
      toServer(conn, { type: 'action', action: { kind: 'play', action: pick.action, version: own.version } })
    }
  }
  /** Lets every replay, landing and score sequence play out. */
  function playOut() {
    for (let i = 0; i < 200; i++) {
      if (store().flying) store().finishCast()
      vi.advanceTimersByTime(250)
    }
  }
  /** My first turn after the draft is played (everything delivered); then Blue and Red play — my mail waits. */
  function myTurnThenRivals() {
    for (let i = 0; i < 40 && !(store().game!.phase === 'play' && store().game!.current === 0); i++) {
      const game = store().game!
      if (game.current === 0 && !store().waiting) store().tapHex(legalDraftHexes(game)[0])
      else rivalsPlayUntilMe(i + 1)
      deliver()
      keepRivalsPosted()
      playOut()
    }
    yellowPlansAndCasts(3)
    deliver()
    store().finishCast()
    playOut()
    if (store().game!.phase === 'refresh') { store().refresh(true); deliver(); playOut() }
    expect(store().game!.current).toBe(1)
    const before = store().online!.version
    rivalsPlayUntilMe(11)
    return before
  }

  it('skipped views: only the newest view arrives, and each rival turn in it still plays out once, in order', () => {
    const before = myTurnThenRivals()
    const views = myViews()
    me.mail = []
    expect(views.length).toBeGreaterThan(1) // several views were sent…
    const newest = views.at(-1)!
    const turns = newest.feed.filter((c) => c.change > before && c.events.some((e) => e.type === 'moved'))
    expect(turns.map((c) => c.events.find((e) => e.type === 'moved')!.seat)).toEqual([1, 2])
    const trails = watchTrails()
    receiveView(newest) // …but only the newest arrives
    playOut()
    trails.stop()
    expect(trails.seats).toEqual([1, 2]) // Blue's turn, then Red's — each once
    expect(store().online!.version).toBe(newest.version)
    expect(store().game).toEqual(newest.game) // and the screen ends on the server's view
    expect(store().trail).toBeNull()
  })

  it('a view that comes again (or an older one) plays nothing', () => {
    myTurnThenRivals()
    const views = myViews()
    deliver()
    playOut()
    const shown = store().game
    const happened = store().happened
    const trails = watchTrails()
    for (const view of views) receiveView(view) // every one of them again
    playOut()
    trails.stop()
    expect(trails.seats).toEqual([])
    expect(store().game).toBe(shown)
    expect(store().happened).toBe(happened)
  })

  it('a gap too old for the feed (back after a long time): straight to the view, nothing animated', () => {
    myTurnThenRivals()
    const newest = myViews().at(-1)!
    me.mail = []
    const landedBefore = store().landed
    receiveView({ ...newest, feed: newest.feed.slice(-1) }) // the changes before it have left the feed
    expect(store().trail).toBeNull() // no replay…
    expect(store().flying).toBe(false)
    expect(store().landed).toBe(landedBefore) // …no sprout, no score sequence
    expect(store().scoring).toBeNull()
    expect(store().happened).toBeNull()
    expect(store().game).toEqual(newest.game) // just the view
    expect(store().online!.version).toBe(newest.version)
  })
})

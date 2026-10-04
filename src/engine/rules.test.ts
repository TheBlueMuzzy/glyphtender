/// <reference types="node" />
// Glyphtender's rules contract (rules.ts): the Table's own self-test, plus legalActions' edge cases.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { selfTest } from '../table/selfTest'
import { goldenView } from './golden'
import { legalCasts, legalMoves } from './moves'
import { addMove, eventsFor, replay, type MoveRecord } from '../table/core'
import { glyphtenderRules, legalActions, setupGame, type GameEvent, type GameSetup } from './rules'
import { greedyAction, randomAction } from './sim'
import { hexAt, position } from './testkit'
import { parseWordList } from './words'
import type { Action, GameState } from './types'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const rules = glyphtenderRules(words)
const json = (x: unknown) => JSON.stringify(x)

/** The same game apart from the end screen's bookkeeping (the log, and the turn's log-only facts). */
const sameGame = (a: GameState, b: GameState) => json({ ...goldenView(a), log: null }) === json({ ...goldenView(b), log: null })

/** Plays the sim's random player until `done` (or the game ends). */
function playUntil(setup: GameSetup, done: (s: GameState) => boolean, rngStart = 1): GameState {
  let state = rules.setup(setup)
  let rng = rngStart
  while (!rules.isOver(state) && !done(state)) {
    const pick = randomAction(state, rng)
    rng = pick.rng
    state = rules.apply(state, state.current, pick.action).state
  }
  return state
}

/** An action as legalActions would list it: a cast names the FIRST seed of its letter in hand. */
function asListed(state: GameState, action: Action): Action {
  const hand = state.hands[state.current]
  if (action.type === 'turn' && action.seed !== null) return { ...action, seed: hand.indexOf(hand[action.seed]) }
  if (action.type === 'refresh') {
    const firsts = action.setAside.map((i) => hand[i]).sort()
    // the first n of each letter, smallest index first
    const picked: number[] = []
    for (const letter of firsts) picked.push(hand.findIndex((l, i) => l === letter && !picked.includes(i)))
    return { ...action, setAside: picked.sort((a, b) => a - b) }
  }
  return action
}

describe('the Table self-test (src/table/selfTest.ts)', () => {
  const setups: GameSetup[] = []
  for (const players of [2, 3, 4]) for (const boardName of ['small', 'large']) for (const seed of [3, 41]) setups.push({ players, boardName, seed })
  setups.push({ players: 2, boardName: 'small', seed: 9, bagSeed: 1234, rngSeed: 5678 }) // an online-style setup

  it('2/3/4 players × small/large × 2 seeds (+ an online setup): every promise kept', () => {
    expect(selfTest(rules, setups, { seatCount: (s) => s.config.players, sameGame })).toEqual([])
  }, 120_000)
})

describe('setup', () => {
  it('without the online numbers it is exactly newGame', () => {
    const plain = rules.setup({ players: 3, seed: 77 })
    expect(plain.bag).toEqual(setupGame({ players: 3, seed: 77, boardName: 'large' }).bag)
    expect(plain.config.boardName).toBe('large')
  })

  it('online: the bag is shuffled again and the rng starts where the server says', () => {
    const plain = rules.setup({ players: 2, seed: 5 })
    const online = rules.setup({ players: 2, seed: 5, bagSeed: 99, rngSeed: 4242 })
    expect(online.bag).not.toEqual(plain.bag)
    expect([...online.bag].sort()).toEqual([...plain.bag].sort())
    expect(online.rng).toBe(4242)
  })
})

describe('check — the right seat, then the engine', () => {
  it('another seat may not act, and has no legal actions', () => {
    const s = rules.setup({ players: 2, seed: 1 })
    const action = legalActions(s, 0)[0]
    expect(rules.check(s, 1, action)).toMatch(/not your turn/)
    expect(legalActions(s, 1)).toEqual([])
    expect(() => rules.apply(s, 1, action)).toThrow(/not your turn/)
    expect(rules.check(s, 0, action)).toBeNull()
  })

  it('once it is over nobody may act', () => {
    const over = playUntil({ players: 2, seed: 2 }, () => false)
    expect(rules.isOver(over)).toBe(true)
    expect(rules.toAct(over)).toEqual([])
    expect(legalActions(over, over.current)).toEqual([])
  })
})

describe('legalActions', () => {
  it('draft: one action per legal hex, all accepted', () => {
    const s = rules.setup({ players: 2, seed: 1 })
    const actions = legalActions(s, 0)
    expect(actions.length).toBeGreaterThan(10)
    for (const a of actions) expect(rules.check(s, 0, a)).toBeNull()
  })

  it('play: two E seeds are ONE choice (the first E), and every listed turn is accepted', () => {
    const s = position({
      glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
      hands: [['E', 'A', 'E', 'T'], ['O']],
      bag: ['Z'],
    })
    const actions = legalActions(s, 0)
    for (const a of actions) expect(rules.check(s, 0, a)).toBeNull()
    const seeds = new Set(actions.map((a) => (a.type === 'turn' ? a.seed : -1)))
    expect([...seeds].sort()).toEqual([0, 1, 3]) // E (first), A, T — never the second E
    // exactly: every move × 3 letters × every cast target
    let expected = 0
    for (const id of [0, 1]) for (const to of legalMoves(s, id)) expected += 3 * legalCasts(s, id, to).length
    expect(actions).toHaveLength(expected)
    expect(new Set(actions.map(json)).size).toBe(actions.length)
  })

  it('play: moving without casting is listed only when the hand is empty (or there is nowhere to cast)', () => {
    const full = position({ glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' }, hands: [['A'], ['O']] })
    expect(legalActions(full, 0).some((a) => a.type === 'turn' && a.seed === null)).toBe(false)
    const empty = position({ glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' }, hands: [[], ['O']] })
    const moves = legalActions(empty, 0)
    expect(moves.length).toBeGreaterThan(0)
    for (const a of moves) {
      expect(a.type === 'turn' && a.seed === null && a.target === null).toBe(true)
      expect(rules.check(empty, 0, a)).toBeNull()
    }
  })

  it('refresh: every different set of letters once — [E, A, E] gives 3 × 2 = 6 choices', () => {
    const turned = position({
      glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
      hands: [['B', 'E', 'A', 'E'], ['O']],
      bag: ['V', 'W', 'X', 'Y', 'Z'],
    })
    const s = rules.apply(turned, 0, { type: 'turn', glyphling: 0, to: hexAt('C6-6'), seed: 0, target: hexAt('C6-4') }).state
    expect(s.phase).toBe('refresh')
    expect(s.hands[0]).toEqual(['E', 'A', 'E'])
    const actions = legalActions(s, 0)
    expect(actions.map((a) => (a.type === 'refresh' ? a.setAside : null))).toEqual([[], [1], [0], [0, 1], [0, 2], [0, 1, 2]])
    for (const a of actions) expect(rules.check(s, 0, a)).toBeNull()
  })

  it('every pick the sim players make is listed (random and greedy, a whole game each)', () => {
    for (const greedy of [false, true]) {
      let state = rules.setup({ players: 3, boardName: 'small', seed: 17 })
      let rng = 17
      while (!rules.isOver(state)) {
        const pick = greedy ? greedyAction(state, rng, words) : randomAction(state, rng)
        rng = pick.rng
        const listed = legalActions(state, state.current).map(json)
        expect(listed).toContain(json(asListed(state, pick.action)))
        state = rules.apply(state, state.current, pick.action).state
      }
    }
  }, 60_000)
})

describe('fast mode — the same game without the end screen’s bookkeeping', () => {
  for (const [players, boardName, seed] of [[2, 'small', 3], [3, 'large', 12], [4, 'large', 30]] as const) {
    it(`${players} players on ${boardName}: a whole greedy game plays out the same, with no log written`, () => {
      // Record a game in normal mode, then replay its moves in fast mode
      let state = rules.setup({ players, boardName, seed })
      let record: MoveRecord<GameSetup, Action> = { setup: { players, boardName, seed }, moves: [] }
      let rng: number = seed
      while (!rules.isOver(state)) {
        const pick = greedyAction(state, rng, words)
        rng = pick.rng
        record = addMove(record, state.current, pick.action)
        state = rules.apply(state, state.current, pick.action).state
      }
      const fast = replay(rules, record, { fast: true }).state
      expect(sameGame(state, fast)).toBe(true)
      expect(fast.winners).toEqual(state.winners)
      expect(fast.magic).toEqual(state.magic)
      expect(fast.tangleMagic).toEqual(state.tangleMagic)
      expect(state.log!.turns).toHaveLength(state.turnCount) // normal mode logs every turn…
      expect(fast.log).toEqual({ turns: [], end: null }) // …fast mode none
      expect(fast.pendingLog ?? null).toBeNull()
    })
  }
})

describe('events — what happened, and who may see it', () => {
  /** A whole game by the greedy sim player (it makes words), with every action's events. */
  function playedGame(players: number, seed: number) {
    let state = rules.setup({ players, seed })
    let rng = seed
    const steps: { before: GameState; events: GameEvent[]; after: GameState }[] = []
    while (!rules.isOver(state)) {
      const pick = greedyAction(state, rng, words)
      rng = pick.rng
      const applied = rules.apply(state, state.current, pick.action)
      steps.push({ before: state, events: applied.events, after: applied.state })
      state = applied.state
    }
    return { steps, final: state }
  }
  const sorted = (letters: string[]) => [...letters].sort().join('')

  for (const players of [2, 3, 4]) {
    it(`${players} players: each seat's events rebuild its own hand exactly, and never show another hand`, () => {
      const { steps, final } = playedGame(players, 5 + players)
      for (let seat = 0; seat < players; seat++) {
        const hand: string[] = [] // this seat's hand, from ONLY the events it may see
        for (const { events } of steps) {
          for (const e of eventsFor(events, seat)) {
            if (e.type === 'drew' || e.type === 'setAside') expect(e.seat).toBe(seat) // letters: only ever your own
            if (e.type === 'drew') hand.push(...e.letters)
            if (e.type === 'cast' && e.seat === seat) hand.splice(hand.indexOf(e.letter), 1)
            if (e.type === 'setAside') for (const l of e.letters) hand.splice(hand.indexOf(l), 1)
          }
        }
        expect(sorted(hand)).toBe(sorted(final.hands[seat]))
      }
    })
  }

  it('an event for everyone holds no hand letters, nothing from the bag and no Magic before the end', () => {
    const { steps } = playedGame(3, 21)
    const kinds = new Set<string>()
    for (const { events, after } of steps) {
      for (const e of events) {
        kinds.add(e.type)
        expect(e.seen === 'all' || e.seen.seats.length > 0).toBe(true)
        if (e.seen !== 'all' || e.type === 'gameOver') continue // gameOver: the end, the whole truth
        expect(json(e)).not.toMatch(/"letters"|"magic"|"tangleMagic"|"bag"|"hands?"/)
        if (e.type === 'cast') expect(after.seeds[`${e.target.q},${e.target.r}`]?.letter).toBe(e.letter) // on the board now
      }
    }
    expect([...kinds].sort()).toEqual(['cast', 'drew', 'drewHidden', 'gameOver', 'moved', 'placed', 'refreshed', 'scored', 'setAside', 'tangled', 'turnStarted'])
  })

  it('draws: the letters to that seat only, a count to everyone else', () => {
    const { steps } = playedGame(3, 4)
    for (const { events } of steps) {
      for (const e of events) {
        if (e.type === 'drew' || e.type === 'setAside') expect(e.seen).toEqual({ seats: [e.seat] })
        if (e.type === 'drewHidden') {
          expect(e.seen).toEqual({ seats: [0, 1, 2].filter((s) => s !== e.seat) })
          expect(json(e)).not.toMatch(/letters/)
        }
      }
    }
  })

  it('every action ends with who acts next — or the game over, with the winners', () => {
    const { steps, final } = playedGame(2, 8)
    for (const { events, after } of steps) {
      const last = events.at(-1)!
      if (after.phase === 'over') expect(last).toMatchObject({ type: 'gameOver', winners: after.winners })
      else expect(last).toEqual({ type: 'turnStarted', seen: 'all', seat: after.current, phase: after.phase })
    }
    expect(final.winners.length).toBeGreaterThan(0)
  })
})

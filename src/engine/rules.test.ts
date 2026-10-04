/// <reference types="node" />
// Glyphtender's rules contract (rules.ts): the Table's own self-test, plus legalActions' edge cases.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { selfTest } from '../table/selfTest'
import { goldenView } from './golden'
import { legalCasts, legalMoves } from './moves'
import { glyphtenderRules, legalActions, setupGame, type GameSetup } from './rules'
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

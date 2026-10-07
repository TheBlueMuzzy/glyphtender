import { describe, expect, it } from 'vitest'
import { applyAction } from './engine'
import { applyDraft, legalDraftHexes } from './draft'
import { getBoard } from './boards'
import { isEdge, neighbours, sameHex } from './hex'
import { nextRandom, shuffle } from './rng'
import { fullBag, newGame, pickTurnOrder, seedIdGiver, turnOrderOf } from './setup'
import { endTurn } from './tangle'
import { hexAt, wordsOf } from './testkit'
import type { GameState } from './types'

const words = wordsOf()

/** Runs the whole draft, always picking the first legal hex. */
function draftAll(state: GameState): GameState {
  let s = state
  while (s.phase === 'draft') s = applyAction(s, { type: 'draft', hex: legalDraftHexes(s)[0] }, words)
  return s
}

describe('seeded random', () => {
  it('gives the same numbers from the same seed', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42))
    expect(nextRandom(42).value).not.toBe(nextRandom(43).value)
  })

  it('shuffles without changing the input and keeps every item', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffle(7, items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...out.items].sort()).toEqual(items)
    expect(shuffle(7, items)).toEqual(out)
  })
})

describe('the bag (GDD §4.3)', () => {
  it('holds 120 seeds: one plain Q (no "Qu"), five U, fifteen E (Muzzy, 2026-10-01)', () => {
    const bag = fullBag()
    expect(bag).toHaveLength(120)
    expect(bag.filter((s) => s === 'Q')).toHaveLength(1)
    expect(bag).not.toContain('Qu')
    expect(bag.filter((s) => s === 'U')).toHaveLength(5)
    expect(bag.filter((s) => s === 'E')).toHaveLength(15)
    expect(bag.every((s) => /^[A-Z]$/.test(s))).toBe(true)
  })

  it('is shuffled by the game seed — same seed, same bag', () => {
    const a = newGame({ players: 2, seed: 5 })
    expect(a.bag).toHaveLength(120)
    expect(newGame({ players: 2, seed: 5 }).bag).toEqual(a.bag)
    expect(newGame({ players: 2, seed: 6 }).bag).not.toEqual(a.bag)
  })

  it('every seed has a stable id from the UNSHUFFLED list — and the shuffle is the same as before ids (F33)', () => {
    const box = fullBag()
    const game = newGame({ players: 3, seed: 77 })
    // seed-N is the Nth seed of the box list, whatever its place in the shuffled bag
    for (const seed of game.bag) expect(seed.letter).toBe(box[Number(seed.id.replace('seed-', ''))])
    expect(new Set(game.bag.map((s) => s.id)).size).toBe(120)
    // the same letters in the same order, and the same rng position, as shuffling plain letters
    const plain = shuffle(77, box)
    expect(game.bag.map((s) => s.letter)).toEqual(plain.items)
    expect(game.rng).toBe(plain.rng)
  })
})

describe('seedIdGiver (letters from a test or an old save → ids)', () => {
  it('gives each letter the first unused box id of that letter, and never the same id twice', () => {
    const giveId = seedIdGiver(['seed-0'])
    const first = giveId('A')
    const second = giveId('A')
    expect(first.letter).toBe('A')
    expect(first.id).not.toBe('seed-0') // already taken
    expect(second.id).not.toBe(first.id)
    expect(fullBag()[Number(first.id.replace('seed-', ''))]).toBe('A')
  })

  it('a made-up position with more of a letter than the box holds still gets unique ids', () => {
    const giveId = seedIdGiver()
    const ids = Array.from({ length: 20 }, () => giveId('Z').id) // the box has far fewer Z's
    expect(new Set(ids).size).toBe(20)
  })
})

describe('new game', () => {
  it('starts in the draft with the board for the player count', () => {
    expect(newGame({ players: 2, seed: 1 }).config.boardName).toBe('small')
    expect(newGame({ players: 3, seed: 1 }).config.boardName).toBe('small')
    const g = newGame({ players: 4, seed: 1 })
    expect(g.phase).toBe('draft')
    expect(g.hands).toEqual([[], [], [], []])
    expect(g.config.rules.handSize).toBe(8)
  })

  it('refuses silly player counts and unknown boards', () => {
    expect(() => newGame({ players: 1, seed: 1 })).toThrow(/2–4/)
    expect(() => newGame({ players: 5, seed: 1 })).toThrow(/2–4/)
    expect(() => newGame({ players: 2, seed: 1, boardName: 'tiny' })).toThrow(/Unknown board/)
  })
})

describe('snake draft (GDD §4.2)', () => {
  it('uses 1-2-2-1, 1-2-3-3-2-1 and 1-2-3-4-4-3-2-1', () => {
    const draftOrder = (players: number) => newGame({ players, seed: 1 }).draftOrder
    expect(draftOrder(2)).toEqual([0, 1, 1, 0])
    expect(draftOrder(3)).toEqual([0, 1, 2, 2, 1, 0])
    expect(draftOrder(4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
  })

  it('follows the snake order, placing 2 glyphlings per seat', () => {
    let s = newGame({ players: 3, seed: 1 })
    const seen: number[] = []
    while (s.phase === 'draft') {
      seen.push(s.current)
      s = applyAction(s, { type: 'draft', hex: legalDraftHexes(s)[0] }, words)
    }
    expect(seen).toEqual([0, 1, 2, 2, 1, 0])
    expect(s.glyphlings.map((g) => [g.id, g.seat]).sort((a, b) => a[0] - b[0])).toEqual([
      [0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 2],
    ])
  })

  it('only offers inner, empty hexes that are not next to a glyphling', () => {
    const board = getBoard('small')
    let s = newGame({ players: 2, seed: 1 })
    s = applyAction(s, { type: 'draft', hex: hexAt('C6-5') }, words)
    const legal = legalDraftHexes(s)
    for (const h of legal) expect(isEdge(board, h)).toBe(false)
    expect(legal.some((h) => sameHex(h, hexAt('C6-5')))).toBe(false)
    for (const n of neighbours(board, hexAt('C6-5'))) expect(legal.some((h) => sameHex(h, n))).toBe(false)
  })

  it('refuses an edge hex, an occupied hex and a hex next to a glyphling', () => {
    let s = newGame({ players: 2, seed: 1 })
    expect(() => applyAction(s, { type: 'draft', hex: hexAt('C1-1') }, words)).toThrow(/inner hex/)
    s = applyAction(s, { type: 'draft', hex: hexAt('C6-5') }, words)
    expect(() => applyAction(s, { type: 'draft', hex: hexAt('C6-5') }, words)).toThrow()
    expect(() => applyAction(s, { type: 'draft', hex: hexAt('C6-6') }, words)).toThrow()
  })

  it('deals 8 seeds to everyone after the last placement, then seat 0 plays', () => {
    const before = newGame({ players: 4, seed: 9 })
    const s = draftAll(before)
    expect(s.phase).toBe('play')
    expect(s.current).toBe(0)
    expect(s.hands.map((h) => h.length)).toEqual([8, 8, 8, 8])
    expect(s.bag).toHaveLength(120 - 32)
    expect(s.hands[0]).toEqual(before.bag.slice(0, 8)) // dealt from the front, in seat order
    expect(s.hands[1]).toEqual(before.bag.slice(8, 16))
  })

  it('never changes the state it was given', () => {
    const s = newGame({ players: 2, seed: 3 })
    const copy = JSON.parse(JSON.stringify(s))
    draftAll(s)
    expect(s).toEqual(copy)
  })

  it('refuses draft actions once play has started', () => {
    const s = draftAll(newGame({ players: 2, seed: 3 }))
    expect(() => applyAction(s, { type: 'draft', hex: hexAt('C6-5') }, words)).toThrow(/draft is over/)
  })
})

describe('turn order (GDD §9, F46 — Muzzy: "shuffle the whole order")', () => {
  it('Yellow, Blue, Purple… unless the game is given another order', () => {
    const game = newGame({ players: 3, seed: 5 })
    expect(game.current).toBe(0)
    expect(game.turnOrder).toEqual([0, 1, 2])
    expect(game.draftOrder).toEqual([0, 1, 2, 2, 1, 0])
  })

  it('a shuffled order: the draft snakes through it, the first seat plays first, turns follow it', () => {
    let game = newGame({ players: 3, seed: 5, turnOrder: [2, 0, 1] })
    expect(game.current).toBe(2)
    expect(game.draftOrder).toEqual([2, 0, 1, 1, 0, 2])
    while (game.phase === 'draft') game = applyDraft(game, legalDraftHexes(game)[0])
    expect(game.current).toBe(2)
    // same bag either way: the turn order never changes the shuffle
    expect(game.hands.flat()).toEqual(newGame({ players: 3, seed: 5 }).bag.slice(0, 24))
    // play a few turns (no seed cast) and watch the order: 2 → 0 → 1 → 2
    const seen = [game.current]
    for (let i = 0; i < 3; i++) {
      game = endTurn(game)
      seen.push(game.current)
    }
    expect(seen).toEqual([2, 0, 1, 2])
  })

  it('a seat with every glyphling tangled is skipped — in the turn order', () => {
    let game = newGame({ players: 3, seed: 5, turnOrder: [2, 0, 1] })
    while (game.phase === 'draft') game = applyDraft(game, legalDraftHexes(game)[0])
    const turnOf = (state: GameState) => endTurn(state).current
    // seat 0 can't move (all its glyphlings tangled, faked by tanglesToEnd 99 so the game goes on): 2 → 1
    const stuck = { ...game, config: { ...game.config, rules: { ...game.config.rules, tanglesToEnd: 99 } }, glyphlings: game.glyphlings.map((g) => (g.seat === 0 ? { ...g, hex: { q: 99, r: 99 } } : g)) }
    expect(turnOrderOf(stuck)).toEqual([2, 0, 1])
    expect(turnOf(stuck)).toBe(1)
  })

  it('an order that misses or repeats a seat is refused', () => {
    expect(() => newGame({ players: 3, seed: 1, turnOrder: [0, 1] })).toThrow()
    expect(() => newGame({ players: 3, seed: 1, turnOrder: [0, 1, 1] })).toThrow()
  })

  it('games saved before F46 (no turnOrder) play 0, 1, 2, 3', () => {
    const old: GameState = { ...newGame({ players: 4, seed: 2 }), turnOrder: undefined }
    expect(turnOrderOf(old)).toEqual([0, 1, 2, 3])
  })

  it('pickTurnOrder shuffles every seat in (rules.json randomTurnOrder is on), and orders differ game to game', () => {
    const orders = Array.from({ length: 40 }, (_, i) => pickTurnOrder(4, i * 7919 + 1))
    for (const o of orders) expect([...o].sort()).toEqual([0, 1, 2, 3])
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(10)
    expect(new Set(orders.map((o) => o[0]))).toEqual(new Set([0, 1, 2, 3]))
  })
})

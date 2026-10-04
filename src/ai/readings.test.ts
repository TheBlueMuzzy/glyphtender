// The readings on hand-made positions (testkit, Muzzy's hex labels): each reads 0–10 the way a person would feel it.
import { describe, expect, it } from 'vitest'
import { getBoard } from '../engine/boards'
import { neighbours } from '../engine/hex'
import { viewFor } from '../engine/rules'
import { hexAt, position } from '../engine/testkit'
import { endNear, fill, handQuality, myDanger, readingsFor, rivalDanger, territoryReading, READINGS } from './readings'
import { officialWords } from './testkit'

const words = officialWords()
const board = getBoard('small')
/** Seeds on every neighbour of `centre` except the ones listed. */
const ringExcept = (centre: string, open: string[]) =>
  Object.fromEntries(neighbours(board, hexAt(centre)).map((h) => board.label(h)).filter((l) => !open.includes(l)).map((l) => [l, 'E']))

describe('readings', () => {
  it('handQuality: a balanced hand reads high, a junk hand low, an empty hand 5', () => {
    expect(handQuality(['A', 'E', 'T', 'N', 'R', 'S', 'O', 'L'])).toBeGreaterThanOrEqual(8)
    expect(handQuality(['Q', 'X', 'Z', 'J', 'V', 'V', 'K', 'K'])).toBeLessThanOrEqual(1)
    expect(handQuality(['A', 'E', 'I', 'O', 'U', 'E', 'A', 'I'])).toBeLessThanOrEqual(3)
    expect(handQuality([])).toBe(5)
  })

  it('myDanger / rivalDanger: a glyphling down to one move with a rival close reads 10; open ground reads low', () => {
    const trapped = position({ glyphlings: { 0: 'C6-5', 1: 'C2-3', 2: 'C8-5', 3: 'C10-5' }, seeds: [{}, { ...ringExcept('C6-5', ['C6-6']), 'C6-7': 'S' }] })
    expect(myDanger(viewFor(trapped, 0), 0)).toBe(10)
    expect(rivalDanger(viewFor(trapped, 1), 1)).toBe(10)
    const open = position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-2', 3: 'C10-6' } })
    expect(myDanger(viewFor(open, 0), 0)).toBeLessThanOrEqual(1)
  })

  it('fill: share of the board with seeds, × 10', () => {
    const empty = position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-2', 3: 'C10-6' } })
    expect(fill(viewFor(empty, 0))).toBe(0)
    const some = position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-2', 3: 'C10-6' }, seeds: [Object.fromEntries(board.cells.slice(0, 40).map((h) => [board.label(h), 'E']))] })
    expect(fill(viewFor(some, 0))).toBeCloseTo((40 / board.cells.length) * 10, 1)
  })

  it('territory: 5 when even, high when the rival is walled in', () => {
    // Mirror image: glyphlings placed the same on both sides of the board's middle column.
    const even = position({ glyphlings: { 0: 'C3-4', 1: 'C3-6', 2: 'C9-4', 3: 'C9-6' } })
    expect(territoryReading(viewFor(even, 0), 0)).toBeCloseTo(5, 0)
    // Blue's glyphlings each boxed in to a single hex's line.
    const walled = position({
      glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-3', 3: 'C9-7' },
      seeds: [{ ...ringExcept('C9-3', []), ...ringExcept('C9-7', []) }],
    })
    expect(territoryReading(viewFor(walled, 0), 0)).toBe(10)
    expect(territoryReading(viewFor(walled, 1), 1)).toBe(0)
  })

  it('endNear: tangled glyphlings and glyphlings down to one move, against tanglesToEnd', () => {
    const calm = position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-2', 3: 'C10-6' } })
    expect(endNear(viewFor(calm, 0))).toBe(0)
    const tense = position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-3', 3: 'C10-6' }, seeds: [{ ...ringExcept('C9-3', []), ...ringExcept('C6-5', ['C6-6']), 'C6-7': 'S' }] })
    expect(endNear(viewFor(tense, 0))).toBe(7.5) // one tangled + one on 1 move, of 2 tangles to end
  })

  it('behind / ahead: from the Magic it sees on the board', () => {
    // Blue owns GARDEN on the board; Yellow has nothing. (6 turns played: the beliefs count turn by turn.)
    const game = { ...position({ glyphlings: { 0: 'C3-4', 1: 'C3-6', 2: 'C9-4', 3: 'C9-6' }, seeds: [{}, { 'C6-1': 'G', 'C6-2': 'A', 'C6-3': 'R', 'C6-4': 'D', 'C6-5': 'E', 'C6-6': 'N' }] }), turnCount: 6 }
    const yellow = readingsFor(viewFor(game, 0), 0, words, 0)
    expect(yellow.behind).toBeGreaterThan(3)
    expect(yellow.ahead).toBe(0)
    const blue = readingsFor(viewFor(game, 1), 1, words, 0)
    expect(blue.ahead).toBeGreaterThan(3)
  })

  it('every reading is named as the personalities expect, and stays within 0–10', () => {
    const game = position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-2', 3: 'C10-6' }, hands: [['A', 'Q'], []] })
    const r = readingsFor(viewFor(game, 0), 0, words, 0.5)
    expect(Object.keys(r).sort()).toEqual([...READINGS].sort())
    for (const v of Object.values(r)) expect(v >= 0 && v <= 10).toBe(true)
  })
})

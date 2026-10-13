// The first-time tips' triggers (F77) on hand-made positions.
import { describe, expect, it } from 'vitest'
import { getBoard } from '../engine/boards'
import { DIRECTIONS, addHex, hexKey, type Hex } from '../engine/hex'
import { movesLeft } from '../engine/tangle'
import { hexAt, position, wordsOf } from '../engine/testkit'
import type { GameState, LogTurn } from '../engine/types'
import { dueTip, type TipId } from './tips'

const never = () => false
const seenAre = (...ids: TipId[]) => (id: TipId) => ids.includes(id)
const ask = (game: GameState, extra: Partial<Parameters<typeof dueTip>[0]> = {}) =>
  dueTip({ game, you: 0, words: null, move: null, seen: never, ...extra })

/** Put a seed of `seat` on every given hex. */
function plant(game: GameState, hexes: Hex[], seat: number, letter = 'E'): GameState {
  const seeds = { ...game.seeds }
  hexes.forEach((h, i) => (seeds[hexKey(h)] = { id: `t-${seat}-${hexKey(h)}-${i}`, letter, seat }))
  return { ...game, seeds }
}

/** Glyphling `id`'s neighbours, all walled with `seat`'s seeds except direction `open` (then 1 hex free, then a wall). */
function hemIn(game: GameState, id: number, seat: number, open: number | null): GameState {
  const g = game.glyphlings.find((x) => x.id === id)!
  const board = getBoard(game.config.boardName)
  const onBoard = (h: Hex) => board.cells.some((c) => c.q === h.q && c.r === h.r)
  const walls: Hex[] = []
  DIRECTIONS.forEach((d, i) => {
    const n = addHex(g.hex, d)
    if (i === open) { const beyond = addHex(n, d); if (onBoard(beyond)) walls.push(beyond) } else if (onBoard(n)) walls.push(n)
  })
  return plant(game, walls, seat)
}

const turn = (seat: number, extra: Partial<LogTurn>): LogTurn => ({
  turnNo: 1, round: 1, seat, glyphlingId: seat * 2, from: { q: 0, r: 0 }, to: { q: 0, r: 0 }, letter: null, target: null,
  words: [], magic: 0, refreshed: 0, refresh: false, totalsAfter: [0, 0], tangledAfter: [], newlyTangled: [], freed: [], ...extra,
})
const logWord = (word: string, magic: number) => ({ word, letters: [...word], owners: [...word].map(() => 0), magic, ownMagic: magic })
const withLast = (game: GameState, last: LogTurn): GameState => ({ ...game, log: { turns: [last], end: null } })

const start = () => position({ glyphlings: { 0: 'C3-4', 1: 'C9-4', 2: 'C6-3', 3: 'C6-7' }, hands: [['A', 'B'], ['C']] })

describe('first-time tips (F77)', () => {
  it('a quiet opening: no tip', () => expect(ask(start())).toBeNull())

  it('your glyphling with 1 move left at the start of your turn → yourDanger', () => {
    const game = hemIn(start(), 0, 1, 0)
    expect(movesLeft(game, 0)).toBe(1)
    expect(ask(game)).toMatchObject({ id: 'yourDanger', target: { glyphling: 0 } })
    expect(ask(game, { seen: seenAre('yourDanger') })).toBeNull() // seen → never again
  })

  it("a rival's glyphling with 1 move left → theirDanger (yours first when both)", () => {
    const game = hemIn(start(), 2, 0, 0)
    expect(ask(game)).toMatchObject({ id: 'theirDanger', target: { glyphling: 2 }, values: { seat: 1 } })
  })

  it("a rival's glyphling tangled next to your pieces → tangleCreate with the Magic your pieces created", () => {
    let game = hemIn(start(), 2, 0, null)
    game = { ...game, tangled: [2], current: 1 }
    const t = withLast(game, turn(0, { newlyTangled: [2], tangledAfter: [2] }))
    const tip = ask(t)!
    expect(tip.id).toBe('tangleCreate')
    expect(tip.values?.n).toBeGreaterThan(0)
    expect((tip.values!.n as number) % game.config.rules.tangleBonus).toBe(0)
  })

  it('a glyphling tangled with none of your pieces next to it → tangleNone', () => {
    let game = hemIn(start(), 2, 1, null) // Blue walled in by Blue's own seeds
    game = { ...game, tangled: [2], current: 1 }
    expect(ask(withLast(game, turn(1, { newlyTangled: [2], tangledAfter: [2] })))).toMatchObject({ id: 'tangleNone' })
  })

  it('your turn with one glyphling tangled → oneToGo', () => {
    const game = { ...start(), tangled: [2] }
    expect(ask(game, { seen: seenAre('tangleCreate', 'tangleNone') })).toMatchObject({ id: 'oneToGo', target: { glyphling: 2 } })
  })

  it('your plant made 2 words → twoWords; a dropped shorter word → longestCounts', () => {
    const at = hexAt('C6-5', 'small')
    const two = withLast({ ...start(), current: 1 }, turn(0, { target: at, words: [logWord('AB', 3), logWord('BA', 3)] }))
    expect(ask(two)).toMatchObject({ id: 'twoWords', values: { n: 2 } })
    // GARDENING down column 6: GARDEN and DEN were dropped
    let game = start()
    const hexes = [...'GARDENING'].map((_, i) => hexAt(`C6-${i + 1}`, 'small'))
    game = { ...game, glyphlings: game.glyphlings.filter((g) => g.id !== 2), seeds: Object.fromEntries(hexes.map((h, i) => [hexKey(h), { id: `g${i}`, letter: 'GARDENING'[i], seat: 0 }])) }
    const longest = withLast({ ...game, current: 1 }, turn(0, { target: hexes[4], words: [logWord('GARDENING', 18)] }))
    expect(ask(longest, { words: wordsOf('GARDENING', 'GARDEN', 'DEN') })).toMatchObject({ id: 'longestCounts' })
  })

  it('choosing what to refresh → swapAgain; the game over → reveal', () => {
    expect(ask({ ...start(), phase: 'refresh' })).toMatchObject({ id: 'swapAgain' })
    expect(ask({ ...start(), phase: 'over' })).toMatchObject({ id: 'reveal' })
  })

  it("not your turn: no turn tips (they wait for yours)", () => {
    const game = { ...hemIn(start(), 0, 1, 0), current: 1 }
    expect(ask(game)).toBeNull()
  })
})

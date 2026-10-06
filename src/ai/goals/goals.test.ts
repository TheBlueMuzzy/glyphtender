// Each goal on a hand-made position (testkit positions, Muzzy's hex labels): the move it likes best is the move a
// person playing for that goal would make.
import { describe, expect, it } from 'vitest'
import { getBoard } from '../../engine/boards'
import { neighbours, sameHex } from '../../engine/hex'
import { legalActions } from '../../engine/rules'
import { hexAt, position, type PositionPlan } from '../../engine/testkit'
import type { Action, GameState } from '../../engine/types'
import { hexDistance, mobility, outcomeOf, type TurnAction } from '../look'
import { contextFor, officialWords } from '../testkit'
import { buildGoal } from './build'
import { denyGoal } from './deny'
import { dumpGoal } from './dump'
import { escapeGoal } from './escape'
import { scoreGoal } from './score'
import { stealGoal } from './steal'
import { TRAP_WEIGHTS, trapGoal } from './trap'
import type { GlyphGoal } from './shared'

const words = officialWords()
const board = getBoard('small')
const label = (h: { q: number; r: number }) => board.label(h)

/** Every legal move the goal likes best (ties included), and the why of the first. */
function favourites(goal: GlyphGoal, game: GameState): { actions: TurnAction[]; why: string | undefined } {
  const ctx = contextFor(game)
  const scored = legalActions(game, game.current).map((a: Action) => ({ a: a as TurnAction, s: goal.score(a, ctx) }))
  const top = Math.max(...scored.map((x) => x.s.value))
  const best = scored.filter((x) => x.s.value === top)
  return { actions: best.map((x) => x.a), why: best[0].s.why }
}

/** Seeds on every neighbour of `centre` except the ones listed. */
function ringExcept(centre: string, open: string[], letter = 'E'): Record<string, string> {
  return Object.fromEntries(neighbours(board, hexAt(centre)).map(label).filter((l) => !open.includes(l)).map((l) => [l, letter]))
}

describe('TRAP', () => {
  it('takes the tangle: closes the last way out of a rival glyphling', () => {
    // Blue's glyphling 2 on C6-5, hemmed in by Yellow's seeds except to the south (C6-6, C6-7, C6-8).
    const plan: PositionPlan = { glyphlings: { 0: 'C6-9', 1: 'C2-3', 2: 'C6-5', 3: 'C10-3' }, seeds: [ringExcept('C6-5', ['C6-6'])], hands: [['E', 'A'], ['T']] }
    const game = position(plan)
    const { actions, why } = favourites(trapGoal(words), game)
    for (const a of actions) expect(mobility(outcomeOf(game, a, words).after)[2]).toBe(0)
    expect(why).toBe("tangled Blue's glyphling")
  })
})

describe('TRAP siege', () => {
  it('values its own pieces packed round a cornered rival glyphling (a self-tangle there would pay it)', () => {
    // Blue's glyphling 2 on C6-5, cornered by Yellow's seeds except C6-6 (a Yellow seed on C6-8 stops the slide:
    // 2 moves). Yellow casts into C6-6, right next to it.
    const game = position({ glyphlings: { 0: 'C6-9', 1: 'C2-3', 2: 'C6-5', 3: 'C10-3' }, seeds: [{ ...ringExcept('C6-5', ['C6-6']), 'C6-8': 'S' }], hands: [['E', 'A'], ['T']] })
    expect(mobility(game)[2]).toBeLessThanOrEqual(3)
    const into = legalActions(game, 0).find((a) => a.type === 'turn' && a.target && sameHex(a.target, hexAt('C6-6'))) as TurnAction
    expect(into).toBeDefined()
    const score = () => trapGoal(words).score(into, contextFor(game)).value
    const withSiege = score()
    const saved = TRAP_WEIGHTS.perSiegePiece
    TRAP_WEIGHTS.perSiegePiece = 0
    const without = score()
    TRAP_WEIGHTS.perSiegePiece = saved
    expect(withSiege - without).toBe(saved) // one more Yellow piece next to it
  })
})

describe('ESCAPE', () => {
  it('runs: moves its glyphling that is down to one move', () => {
    // Yellow's glyphling 0 on C6-5, hemmed in by Blue's seeds; its only move is C6-6 (C6-7 has a seed).
    const game = position({ glyphlings: { 0: 'C6-5', 1: 'C2-3', 2: 'C9-3', 3: 'C10-5' }, seeds: [{}, { ...ringExcept('C6-5', ['C6-6']), 'C6-7': 'S' }], hands: [['E', 'A'], ['T']] })
    expect(mobility(game)[0]).toBe(1)
    const { actions, why } = favourites(escapeGoal(words), game)
    for (const a of actions) expect(a.glyphling).toBe(0)
    expect(why).toMatch(/ran from danger: 1 →/)
  })
})

describe('SCORE', () => {
  it('takes the big word', () => {
    const game = position({ glyphlings: { 0: 'C6-9', 1: 'C2-3', 2: 'C9-3', 3: 'C10-5' }, seeds: [{ 'C6-1': 'G', 'C6-2': 'A', 'C6-3': 'R', 'C6-4': 'D', 'C6-5': 'E' }], hands: [['N', 'X', 'O'], ['T']] })
    const { actions, why } = favourites(scoreGoal(words), game)
    for (const a of actions) expect(outcomeOf(game, a, words).made.map((w) => w.word)).toContain('GARDEN')
    expect(why).toMatch(/spelt GARDEN \+12/) // 6 seeds + 5 own + the new one
  })
})

describe('STEAL', () => {
  it("grows a rival's word into its own", () => {
    const game = position({ glyphlings: { 0: 'C6-9', 1: 'C2-3', 2: 'C9-3', 3: 'C10-5' }, seeds: [{}, { 'C6-2': 'C', 'C6-3': 'A', 'C6-4': 'T' }], hands: [['S', 'O'], ['T']] })
    const { actions, why } = favourites(stealGoal(words), game)
    for (const a of actions) expect(outcomeOf(game, a, words).made.some((w) => w.word === 'CATS' || w.word === 'SCAT')).toBe(true)
    expect(why).toMatch(/^stole (CATS|SCAT) off Blue's seeds$/)
  })
})

describe('DENY', () => {
  it("junks the spot where the rival could spell (from the letters it hasn't seen)", () => {
    // Blue owns C, A on C6-2, C6-3 and holds a T: CAT on C6-4 next turn. Yellow can cast there.
    const game = position({ glyphlings: { 0: 'C4-6', 1: 'C2-3', 2: 'C6-9', 3: 'C10-5' }, seeds: [{}, { 'C6-2': 'C', 'C6-3': 'A' }], hands: [['E'], ['T']] })
    const { actions, why } = favourites(denyGoal(words), game)
    expect(actions.length).toBeGreaterThan(0)
    for (const a of actions) expect(label(a.target!)).toBe('C6-4')
    expect(why).toMatch(/^junked Blue's CAT spot \(≈[\d.]+\)$/)
  })
})

describe('DUMP', () => {
  it('sheds the junk letter, out of the way', () => {
    const game = position({ glyphlings: { 0: 'C6-5', 1: 'C2-3', 2: 'C9-3', 3: 'C10-5' }, hands: [['Q', 'E', 'A', 'T', 'R'], ['T']] })
    const { actions, why } = favourites(dumpGoal(words), game)
    for (const a of actions) {
      expect(outcomeOf(game, a, words).letter).toBe('Q')
      const after = outcomeOf(game, a, words).after
      for (const g of after.glyphlings) expect(hexDistance(g.hex, a.target!)).toBeGreaterThanOrEqual(3)
    }
    expect(why).toBe('shed a junk Q out of the way')
  })
})

describe('BUILD', () => {
  it('frames a word from the outside in: B _ G, with vowels in hand that only it holds', () => {
    // Yellow owns B on C6-3; hand G + A + I (rival Blue holds only T). Casting G on C6-5 leaves B_G: A → BAG, I → BIG.
    const game = position({ glyphlings: { 0: 'C6-9', 1: 'C2-3', 2: 'C9-3', 3: 'C10-5' }, seeds: [{ 'C6-3': 'B' }], hands: [['G', 'A', 'I'], ['T']] })
    const { actions, why } = favourites(buildGoal(words), game)
    expect(why).toMatch(/^framed (B_G|G_B) \((A\/I|I\/A)\) for next turn$/)
    // (G two hexes from the B either way: B_G → BAG / BIG, or G_B → GAB / GIB)
    for (const a of actions) expect(hexDistance(a.target!, hexAt('C6-3')) === 2 && outcomeOf(game, a, words).letter === 'G').toBe(true)
    expect(actions.some((a) => sameHex(a.target!, hexAt('C6-5')))).toBe(true)
  })

  it('sets up a word next to its own seed', () => {
    const game = position({ glyphlings: { 0: 'C6-9', 1: 'C2-3', 2: 'C9-3', 3: 'C10-5' }, seeds: [{ 'C6-3': 'C' }], hands: [['A', 'T', 'X'], ['T']] })
    const { actions, why } = favourites(buildGoal(words), game)
    const own = hexAt('C6-3')
    for (const a of actions) expect(hexDistance(a.target!, own)).toBe(1)
    expect(why).toMatch(/^set up \d+ words? for next turn/)
    expect(actions.some((a) => sameHex(a.target!, hexAt('C6-4')) && outcomeOf(game, a, words).letter === 'A')).toBe(true) // CA → CAT
  })
})

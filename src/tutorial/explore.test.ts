// Explore mode's words (F79): yours vs theirs, tangled, danger, seeds, options, parts — and when Explore ends itself.
import { describe, expect, it } from 'vitest'
import text from '../../content/text/en.json'
import { getBoard } from '../engine/boards'
import { addHex, hexKey, neighbours, type Hex } from '../engine/hex'
import { movesLeft } from '../engine/tangle'
import { hexAt, position } from '../engine/testkit'
import type { GameState } from '../engine/types'
import { explain, exploreEnds, type ExploreFacts } from './explore'

const names = ['Yellow', 'Blue']
const name = (seat: number) => names[seat]
const game = () => position({
  glyphlings: { 0: 'C3-4', 1: 'C9-4', 2: 'C6-3', 3: 'C6-7' },
  seeds: [{ 'C5-5': 'A' }, { 'C7-5': 'T' }],
  hands: [['E'], ['R']],
})

/** Seeds on these hexes (Yellow's), so a glyphling next to them is boxed in. */
function walled(state: GameState, hexes: Hex[]): GameState {
  const seeds = { ...state.seeds }
  hexes.forEach((h, i) => { seeds[hexKey(h)] = { id: `wall-${i}`, letter: 'X', seat: 0 } })
  return { ...state, seeds }
}
/** Glyphling 2 boxed in, with `open` of its neighbours left open (each one hex deep). */
function boxed(open: number): GameState {
  const g = game()
  const at = g.glyphlings.find((x) => x.id === 2)!.hex
  const around = neighbours(getBoard(g.config.boardName), at)
  const free = around.slice(0, open)
  const beyond = free.map((n) => addHex(n, { q: n.q - at.q, r: n.r - at.r }))
  return walled(g, [...around.slice(open), ...beyond].filter((h) => !g.glyphlings.some((x) => hexKey(x.hex) === hexKey(h))))
}

describe('Explore: what is this?', () => {
  it('your glyphling vs a rival glyphling — different words, with its moves', () => {
    expect(explain({ kind: 'glyphling', id: 0 }, game(), 0, name)).toMatchObject({ key: 'yourGlyphling', values: { player: 'Yellow' } })
    const theirs = explain({ kind: 'glyphling', id: 2 }, game(), 0, name)
    expect(theirs).toMatchObject({ key: 'theirGlyphling', values: { player: 'Blue' } })
    expect(theirs.values.moves).toBeGreaterThan(1)
  })
  it('the same glyphling is "yours" on the other player\'s screen', () => {
    expect(explain({ kind: 'glyphling', id: 2 }, game(), 1, name).key).toBe('yourGlyphling')
  })
  it('a tangled glyphling (marked tangled, or no move left right now)', () => {
    expect(explain({ kind: 'glyphling', id: 2 }, { ...game(), tangled: [2] }, 0, name).key).toBe('theirGlyphlingTangled')
    const stuck = boxed(0)
    expect(movesLeft(stuck, 2)).toBe(0)
    expect(explain({ kind: 'glyphling', id: 2 }, stuck, 0, name).key).toBe('theirGlyphlingTangled')
    expect(explain({ kind: 'glyphling', id: 2 }, stuck, 1, name).key).toBe('yourGlyphlingTangled')
  })
  it('one move left: the danger words', () => {
    const one = boxed(1)
    expect(movesLeft(one, 2)).toBe(1)
    expect(explain({ kind: 'glyphling', id: 2 }, one, 0, name).key).toBe('theirGlyphlingDanger')
    expect(explain({ kind: 'glyphling', id: 2 }, one, 1, name).key).toBe('yourGlyphlingDanger')
  })
  it('your seed vs their seed, with what each counts (1 + the ownership bonus in its owner\'s words)', () => {
    const bonus = game().config.rules.ownershipBonus
    expect(explain({ kind: 'hex', hex: hexAt('C5-5', 'small') }, game(), 0, name)).toMatchObject({ key: 'yourSeed', values: { letter: 'A', own: 1 + bonus, other: 1 } })
    expect(explain({ kind: 'hex', hex: hexAt('C7-5', 'small') }, game(), 0, name)).toMatchObject({ key: 'theirSeed', values: { player: 'Blue' } })
  })
  it('a planned seed, a glowing option, an empty hex', () => {
    const h = hexAt('C6-5', 'small')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name, { planned: h }).key).toBe('plannedSeed')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name, { moveOptions: [h] }).key).toBe('moveOption')
    expect(explain({ kind: 'hex', hex: h }, { ...game(), phase: 'draft' }, 0, name, { moveOptions: [h] }).key).toBe('draftOption')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name, { plantOptions: [h] }).key).toBe('plantOption')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name).key).toBe('emptyHex')
  })
  it('a tray seed (and while choosing what to refresh), and the screen parts (☰ explains itself, it does not open)', () => {
    const id = game().hands[0][0].id
    expect(explain({ kind: 'traySeed', id }, game(), 0, name)).toMatchObject({ key: 'traySeed', values: { letter: 'E' } })
    expect(explain({ kind: 'traySeed', id }, { ...game(), phase: 'refresh' }, 0, name).key).toBe('traySeedRefresh')
    expect(explain({ kind: 'part', part: 'menu' }, game(), 0, name).key).toBe('part.menu')
    expect(explain({ kind: 'part', part: 'plant' }, game(), 0, name).key).toBe('part.plant')
    expect(explain({ kind: 'part', part: 'plant' }, game(), 0, name, { magic: 5 })).toEqual({ key: 'part.plantMagic', values: { n: 5 } })
  })
  it('every key it can give has its words in en.json (tutorial.explore), 12 words or fewer', () => {
    const lines = text.tutorial.explore as unknown as Record<string, unknown>
    const keys = ['yourGlyphling', 'yourGlyphlingDanger', 'yourGlyphlingTangled', 'theirGlyphling', 'theirGlyphlingDanger',
      'theirGlyphlingTangled', 'yourSeed', 'theirSeed', 'plannedSeed', 'moveOption', 'draftOption', 'plantOption', 'emptyHex',
      'traySeed', 'traySeedRefresh', 'bar', 'barDetail', 'remind',
      ...['plant', 'plantMagic', 'endTurn', 'retry', 'undo', 'shuffle', 'refresh', 'keepAll', 'turnBar', 'menu', 'ghost', 'prompt', 'draft'].map((p) => `part.${p}`)]
    for (const key of keys) {
      const words = key.split('.').reduce<unknown>((at, k) => (at as Record<string, unknown>)?.[k], lines)
      expect(typeof words, key).toBe('string')
      expect((words as string).split(/\s+/).filter((w) => /\w/.test(w)).length, key).toBeLessThanOrEqual(12)
      expect(words as string, key).not.toMatch(/\bgain/i) // Magic is made / created, never gained
    }
  })
})

describe('Explore ends by itself when the game needs you', () => {
  const calm: ExploreFacts = { inGame: true, phase: 'play', handoff: false, screens: 0, online: null }
  const online = (o: Partial<NonNullable<ExploreFacts['online']>>): ExploreFacts =>
    ({ ...calm, online: { status: 'open', idleWarning: false, botPlaysForMe: false, roomPhase: 'playing', ...o } })
  it('stays on in a calm game, local or online', () => {
    expect(exploreEnds(calm)).toBeNull()
    expect(exploreEnds({ ...calm, phase: 'refresh' })).toBeNull()
    expect(exploreEnds(online({}))).toBeNull()
  })
  it('any game: left, the reveal starts, the handoff, a screen opens', () => {
    expect(exploreEnds({ ...calm, inGame: false })).toBe('left')
    expect(exploreEnds({ ...calm, phase: 'over' })).toBe('gameOver')
    expect(exploreEnds({ ...calm, handoff: true })).toBe('handoff')
    expect(exploreEnds({ ...calm, screens: 1 })).toBe('screen')
  })
  it('online: the idle warning, a bot playing for me, the connection, back to the lobby', () => {
    expect(exploreEnds(online({ idleWarning: true }))).toBe('idleWarning')
    expect(exploreEnds(online({ botPlaysForMe: true }))).toBe('botPlaysForMe')
    expect(exploreEnds(online({ status: 'reconnecting' }))).toBe('connection')
    expect(exploreEnds(online({ status: 'closed' }))).toBe('connection')
    expect(exploreEnds(online({ roomPhase: 'lobby' }))).toBe('lobby')
  })
})

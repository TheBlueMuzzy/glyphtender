// Explore mode's words (F79): yours vs theirs, tangled, danger, seeds, options, parts.
import { describe, expect, it } from 'vitest'
import { hexAt, position } from '../engine/testkit'
import { explain } from './explore'

const names = ['Yellow', 'Blue']
const name = (seat: number) => names[seat]
const game = () => position({
  glyphlings: { 0: 'C3-4', 1: 'C9-4', 2: 'C6-3', 3: 'C6-7' },
  seeds: [{ 'C5-5': 'A' }, { 'C7-5': 'T' }],
  hands: [['E'], ['R']],
})

describe('Explore: what is this?', () => {
  it('your glyphling vs a rival glyphling — different words, with its moves', () => {
    expect(explain({ kind: 'glyphling', id: 0 }, game(), 0, name)).toMatchObject({ key: 'yourGlyphling', values: { player: 'Yellow' } })
    const theirs = explain({ kind: 'glyphling', id: 2 }, game(), 0, name)
    expect(theirs).toMatchObject({ key: 'theirGlyphling', values: { player: 'Blue' } })
    expect(theirs.values.moves).toBeGreaterThan(1)
  })
  it('a tangled glyphling', () => {
    expect(explain({ kind: 'glyphling', id: 2 }, { ...game(), tangled: [2] }, 0, name).key).toBe('theirGlyphlingTangled')
  })
  it('your seed vs their seed', () => {
    expect(explain({ kind: 'hex', hex: hexAt('C5-5', 'small') }, game(), 0, name)).toMatchObject({ key: 'yourSeed', values: { letter: 'A' } })
    expect(explain({ kind: 'hex', hex: hexAt('C7-5', 'small') }, game(), 0, name)).toMatchObject({ key: 'theirSeed', values: { player: 'Blue' } })
  })
  it('a planned seed, a glowing option, an empty hex', () => {
    const h = hexAt('C6-5', 'small')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name, { planned: h }).key).toBe('plannedSeed')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name, { moveOptions: [h] }).key).toBe('moveOption')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name, { plantOptions: [h] }).key).toBe('plantOption')
    expect(explain({ kind: 'hex', hex: h }, game(), 0, name).key).toBe('emptyHex')
  })
  it('a tray seed and the screen parts (☰ explains itself, it does not open)', () => {
    const id = game().hands[0][0].id
    expect(explain({ kind: 'traySeed', id }, game(), 0, name)).toMatchObject({ key: 'traySeed', values: { letter: 'E' } })
    expect(explain({ kind: 'part', part: 'menu' }, game(), 0, name).key).toBe('part.menu')
  })
})

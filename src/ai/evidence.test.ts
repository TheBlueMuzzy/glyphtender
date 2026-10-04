// The beliefs' evidence: each seat's Magic as SEEN on the board — never the real totals, never the hidden seeds.
import { describe, expect, it } from 'vitest'
import { viewFor } from '../engine/rules'
import { position } from '../engine/testkit'
import { tangledIds } from '../engine/tangle'
import { beliefsOf, seenEvidence, turnsPlayed, wordsOnBoard } from './evidence'
import { officialWords } from './testkit'

const words = officialWords()
const glyphlings = { 0: 'C3-4', 1: 'C3-6', 2: 'C9-4', 3: 'C9-6' }

describe('evidence', () => {
  it("credits a word on the board to the seat owning most of its seeds", () => {
    // Blue's CAT (3 seeds + 3 own) — and Yellow's TO crossing nothing.
    const game = position({ glyphlings, seeds: [{ 'C2-2': 'T', 'C2-3': 'O' }, { 'C6-2': 'C', 'C6-3': 'A', 'C6-4': 'T' }] })
    const seen = seenEvidence(viewFor(game, 0), words)
    expect(wordsOnBoard(viewFor(game, 0), words).length).toBe(2)
    expect(seen.boardMagic).toEqual([4, 6])
  })

  it('counts the tangle bonus a tangled glyphling would give right now', () => {
    const made = position({ glyphlings: { 0: 'C1-1', 1: 'C3-6', 2: 'C9-4', 3: 'C9-6' }, seeds: [{}, { 'C1-2': 'E', 'C2-2': 'E', 'C2-3': 'E' }] })
    const game = { ...made, tangled: tangledIds(made) }
    const view = viewFor(game, 0)
    expect(view.tangled).toEqual([0])
    expect(seenEvidence(view, words).tangleMagic).toEqual([0, 9])
  })

  it('one history entry per turn each seat played; the last turn it watched is seen exactly', () => {
    const base = position({ glyphlings, seeds: [{ 'C2-2': 'T', 'C2-3': 'O' }, { 'C6-2': 'C', 'C6-3': 'A', 'C6-4': 'T' }] })
    expect(turnsPlayed({ ...base, turnCount: 7 }, 0)).toBe(4)
    expect(turnsPlayed({ ...base, turnCount: 7 }, 1)).toBe(3)
    const game = { ...base, turnCount: 7 }
    const seen = seenEvidence(viewFor(game, 0), words)
    expect(seen.histories[0].length).toBe(4)
    expect(seen.histories[1].length).toBe(3)
    const total = (h: (number | null)[]) => h.reduce<number>((s, x) => s + (x ?? 0), 0)
    expect(total(seen.histories[1])).toBeCloseTo(6, 0)
  })

  it('beliefs: Blue looks ahead to Yellow; the same view always believes the same', () => {
    const game = { ...position({ glyphlings, seeds: [{}, { 'C6-2': 'C', 'C6-3': 'A', 'C6-4': 'T' }] }), turnCount: 6 }
    const a = beliefsOf(viewFor(game, 0), 0, words, 0.5)
    expect(a.lead).toBeLessThan(0)
    expect(a.rivals[0].seat).toBe(1)
    expect(beliefsOf(viewFor(game, 0), 0, words, 0.5)).toEqual(a)
  })

  it('reads only the view: different hidden hands, the same evidence', () => {
    const one = { ...position({ glyphlings, seeds: [{}, { 'C6-2': 'C', 'C6-3': 'A', 'C6-4': 'T' }], hands: [['E'], ['Q', 'Z']], bag: ['A', 'B'] }), turnCount: 4 }
    const two = { ...position({ glyphlings, seeds: [{}, { 'C6-2': 'C', 'C6-3': 'A', 'C6-4': 'T' }], hands: [['E'], ['S', 'S']], bag: ['O', 'N'] }), turnCount: 4, magic: [3, 99] }
    expect(seenEvidence(viewFor(two, 0), words)).toEqual(seenEvidence(viewFor(one, 0), words))
    expect(beliefsOf(viewFor(two, 0), 0, words, 0.3)).toEqual(beliefsOf(viewFor(one, 0), 0, words, 0.3))
  })
})

import { describe, expect, it } from 'vitest'
import { viewFor } from '../engine/rules'
import { position } from '../engine/testkit'
import { chanceToHold, threatsFor } from './threats'
import { officialWords } from './testkit'

const words = officialWords()

describe('threats', () => {
  it('chance to hold a letter: none left → 0; all of the pool → 1; one of 10 in a hand of 1 → 10%', () => {
    expect(chanceToHold(0, 50, 8)).toBe(0)
    expect(chanceToHold(10, 10, 3)).toBe(1)
    expect(chanceToHold(1, 10, 1)).toBeCloseTo(0.1)
    expect(chanceToHold(2, 10, 2)).toBeCloseTo(1 - (8 / 10) * (7 / 9))
  })

  it("finds the rival's likely word spot, and never uses the real hidden seeds", () => {
    // Blue owns C, A on C6-2, C6-3 — CAT / CAB / CAN… on C6-4 next turn, if it holds a finishing letter.
    const plan = { glyphlings: { 0: 'C4-6', 1: 'C2-3', 2: 'C6-9', 3: 'C10-5' }, seeds: [{}, { 'C6-2': 'C', 'C6-3': 'A' }] } as const
    const a = position({ ...plan, hands: [['E'], ['T']] })
    const b = position({ ...plan, hands: [['E'], ['Q']] }) // the same view for Yellow: Blue's one seed is '?' either way
    const threatsA = threatsFor(viewFor(a, 0), a, 0, words)
    const threatsB = threatsFor(viewFor(b, 0), b, 0, words)
    const spot = [...threatsA].find(([, t]) => t.seat === 1)
    expect(spot).toBeDefined()
    expect([...threatsA].map(([k, t]) => [k, t.expected])).toEqual([...threatsB].map(([k, t]) => [k, t.expected]))
  })
})

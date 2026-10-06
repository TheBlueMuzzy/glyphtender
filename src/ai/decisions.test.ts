// The special decisions: draft, refresh and "call it".
import { describe, expect, it } from 'vitest'
import { getBoard } from '../engine/boards'
import { neighbours } from '../engine/hex'
import { checkFor, glyphtenderRules, viewFor } from '../engine/rules'
import { tangledIds } from '../engine/tangle'
import { hexAt, position } from '../engine/testkit'
import type { GameState } from '../engine/types'
import { callItDecision, draftDecision, endingMoves, refreshDecision, refreshPick } from './decisions'
import { hexDistance } from './look'
import { BULLY, FIRST_CLASS, contextFor, officialWords, testPersonality } from './testkit'

const words = officialWords()
const board = getBoard('small')
const ringExcept = (centre: string, open: string[]) =>
  Object.fromEntries(neighbours(board, hexAt(centre)).map((h) => board.label(h)).filter((l) => !open.includes(l)).map((l) => [l, 'E']))

describe('draft', () => {
  it('places on a legal hex; an aggressive bot sits closer to rivals than a cautious one', () => {
    const rules = glyphtenderRules(words)
    let game = rules.setup({ players: 2, boardName: 'small', seed: 3 })
    game = rules.apply(game, 0, { type: 'draft', hex: hexAt('C6-5') }).state // Yellow first, in the middle
    const near: number[] = []
    for (const [aggression, caution] of [[95, 5], [5, 95]]) {
      let total = 0
      for (let rng = 1; rng <= 20; rng++) {
        const ctx = { ...contextFor(game), traits: { aggression, caution } }
        const { special } = draftDecision(ctx, rng)
        expect(checkFor(game, 1, special.action)).toBeNull()
        total += hexDistance((special.action as { hex: { q: number; r: number } }).hex, hexAt('C6-5'))
      }
      near.push(total / 20)
    }
    expect(near[0]).toBeLessThan(near[1])
  })
})

describe('refresh', () => {
  it('sets aside junk; a pragmatic bot is pickier', () => {
    const hand = ['Q', 'E', 'A', 'T', 'X', 'E', 'E', 'R'].map((letter, i) => ({ id: `s${i}`, letter }))
    const picky = refreshPick(hand, 100)
    const relaxed = refreshPick(hand, 0)
    expect(picky).toEqual(expect.arrayContaining(['s0', 's4'])) // Q and X
    expect(picky.length).toBeGreaterThan(relaxed.length)
    expect(relaxed.length).toBeLessThanOrEqual(2)
  })

  it('makes a legal refresh action', () => {
    const game: GameState = { ...position({ glyphlings: { 0: 'C6-5', 1: 'C3-4', 2: 'C9-2', 3: 'C10-6' }, hands: [['Q', 'E', 'A', 'T', 'X'], []], bag: ['A', 'B', 'C'] }), phase: 'refresh' }
    const { special } = refreshDecision({ ...contextFor(game), traits: { pragmatism: 90 } })
    expect(checkFor(game, 0, special.action)).toBeNull()
    expect(special.why).toMatch(/set aside junk/)
  })
})

describe('call it', () => {
  // Blue's glyphling 2 (C1-1) is already tangled; Blue's glyphling 3 on C9-3 has one way out (C9-4) — a Yellow cast
  // there tangles it: 2 tangles end the game.
  const plan = (yellowWords: boolean) => {
    const made = position({
      glyphlings: { 0: 'C9-7', 1: 'C3-6', 2: 'C1-1', 3: 'C9-3' },
      seeds: [
        { ...ringExcept('C9-3', ['C9-4']), ...(yellowWords ? { 'C5-1': 'G', 'C5-2': 'A', 'C5-3': 'R', 'C5-4': 'D', 'C5-5': 'E', 'C5-6': 'N', 'C4-1': 'S', 'C4-2': 'T', 'C4-3': 'O', 'C4-4': 'N', 'C4-5': 'E' } : {}) },
        { 'C1-2': 'E', 'C2-2': 'E', 'C2-3': 'E', ...(yellowWords ? {} : { 'C11-1': 'G', 'C11-2': 'A', 'C11-3': 'S', 'C10-1': 'T', 'C10-2': 'O', 'C10-3': 'E', 'C10-4': 'S' }) },
      ],
      hands: [['A', 'T'], ['E']],
    })
    return { ...made, tangled: tangledIds(made), turnCount: 20 }
  }

  it('finds the moves that end the game', () => {
    const game = plan(true)
    expect(game.tangled).toEqual([2])
    const endings = endingMoves(game, 0, words)
    expect(endings.length).toBeGreaterThan(0)
    const rules = glyphtenderRules(words)
    for (const e of endings.slice(0, 20)) expect(rules.apply(game, 0, e.action).state.phase).toBe('over')
  })

  it('calls it when it believes it is well ahead; not when it is behind', () => {
    const ahead = plan(true)
    const call = callItDecision({ ...contextFor(ahead, BULLY, FIRST_CLASS), view: viewFor(ahead, 0) }, words)
    expect(call?.special.goal).toBe('CALL IT')
    expect(glyphtenderRules(words).apply(ahead, 0, call!.special.action).state.phase).toBe('over')
    const behind = plan(false)
    expect(callItDecision({ ...contextFor(behind, BULLY, FIRST_CLASS), view: viewFor(behind, 0) }, words)).toBeNull()
  })

  it('a bot with more nerve waits for a bigger lead', () => {
    const ahead = plan(true)
    const brave = testPersonality('Brave', [], {}, { nerve: 1000 })
    expect(callItDecision({ ...contextFor(ahead, brave, FIRST_CLASS), view: viewFor(ahead, 0) }, words)).toBeNull()
  })
})

// The plug: candidates are legal, at most the limit, and never lose a tangle or a rescue; keys and notes read well.
import { describe, expect, it } from 'vitest'
import { getBoard } from '../engine/boards'
import { neighbours } from '../engine/hex'
import { checkFor, legalActions } from '../engine/rules'
import { hexAt, position } from '../engine/testkit'
import { makeBrain, personalityProblems } from './kit/brain'
import { mobility, outcomeOf, type TurnAction } from './look'
import { actionKey, candidateMoves, describeAction, glyphtenderPlug, mustKeep } from './plug'
import { BULLY, FIRST_CLASS, officialWords } from './testkit'

const words = officialWords()
const board = getBoard('small')
const ringExcept = (centre: string, open: string[]) =>
  Object.fromEntries(neighbours(board, hexAt(centre)).map((h) => board.label(h)).filter((l) => !open.includes(l)).map((l) => [l, 'E']))

// Blue's glyphling 2 has one way out (C6-6…); Yellow's glyphling 1 (C1-1) is down to one move (C2-3).
const game = position({
  glyphlings: { 0: 'C6-9', 1: 'C1-1', 2: 'C6-5', 3: 'C10-3' },
  seeds: [ringExcept('C6-5', ['C6-6']), { 'C1-2': 'E', 'C2-2': 'E', 'C3-4': 'E' }],
  hands: [['E', 'A', 'T', 'R', 'S', 'O', 'N', 'L'], ['T']],
})

describe('the plug', () => {
  it('fits the brain: 7 goals with the ids and traits the personalities use', () => {
    const plug = glyphtenderPlug(words)
    expect(plug.goals.map((g) => `${g.id}:${g.trait}`)).toEqual(['TRAP:aggression', 'SCORE:greed', 'DENY:spite', 'ESCAPE:caution', 'BUILD:patience', 'STEAL:opportunism', 'DUMP:pragmatism'])
    expect(personalityProblems(BULLY, plug)).toEqual([])
    expect(() => makeBrain(plug, BULLY, FIRST_CLASS)).not.toThrow()
  })

  it('finds every tangle and rescue', () => {
    const all = legalActions(game, 0)
    const { tangles, rescues } = mustKeep(game, 0, all)
    const reallyTangle = all.filter((a) => a.type === 'turn' && mobility(outcomeOf(game, a, words).after)[2] === 0)
    expect(tangles.length).toBe(reallyTangle.length)
    expect(tangles.length).toBeGreaterThan(0)
    expect(rescues.length).toBeGreaterThan(0)
    for (const a of rescues) expect((a as TurnAction).glyphling).toBe(1)
  })

  it('candidates: legal, at most the limit, tangles and rescues kept', () => {
    const all = legalActions(game, 0)
    expect(all.length).toBeGreaterThan(150)
    const { tangles, rescues } = mustKeep(game, 0, all)
    const { actions } = candidateMoves(game, 0, 150, 42)
    expect(actions.length).toBe(150)
    for (const a of actions) expect(checkFor(game, 0, a)).toBeNull()
    const keys = new Set(actions.map(actionKey))
    // Tangles fill up to half the candidates, rescues up to a quarter (sampled when there are more).
    const kept = (some: typeof all) => some.filter((a) => keys.has(actionKey(a))).length
    expect(kept(tangles)).toBeGreaterThanOrEqual(Math.min(tangles.length, 75))
    expect(kept(rescues)).toBeGreaterThanOrEqual(Math.min(rescues.length, 37))
    expect(keys.size).toBe(150) // every key different
  })

  it('names moves in designer notation', () => {
    const a: TurnAction = { type: 'turn', glyphling: 0, to: hexAt('C6-8'), seed: game.hands[0][1].id, target: hexAt('C6-6') }
    expect(describeAction(a, game)).toBe('glyphling 0 → C6-8, cast A at C6-6')
    expect(describeAction({ type: 'draft', hex: hexAt('C6-5') }, game)).toBe('placed a glyphling on C6-5')
    expect(describeAction({ type: 'refresh', setAside: [game.hands[0][0].id] }, game)).toBe('refresh: set aside E')
  })
})

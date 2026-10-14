/// <reference types="node" />
// THE RAILS' STEPS (F76): walking the scripted opening (railsCheck.playRails — every state the real rules door makes),
// the step list says the right step at every moment, each step's limit lets exactly the scripted action through, and
// every callout is short and fully filled in.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hexKey } from '../engine/hex'
import { legalMoves } from '../engine/engine'
import { parseWordList } from '../engine/words'
import type { Action, GameState } from '../engine/types'
import { railsRefuses } from '../store/railsLimit'
import { rails, railsGlyphling, railsHex } from './rails'
import { playRails } from './railsCheck'
import { currentRailsStep, RAILS_STEPS, railsText, type StepState } from './railsSteps'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const played = playRails(words)
const at = (game: GameState, plan: Partial<StepState> = {}): StepState => ({ game, move: null, cast: null, setAside: [], seen: new Set(), ...plan })
const ids = (s: StepState) => {
  const seen = new Set(s.seen)
  const out: string[] = []
  for (let step = currentRailsStep({ ...s, seen }); step; step = currentRailsStep({ ...s, seen })) {
    out.push(step.id)
    if (!step.button) break
    seen.add(step.id)
  }
  return out
}
const turnPlan = (action: Action) => {
  if (action.type !== 'turn') throw new Error('not a turn')
  return { move: { glyphling: action.glyphling, to: action.to }, cast: action.seed && action.target ? { seed: action.seed, target: action.target } : null }
}

describe('the rails steps', () => {
  it('say the right step at every moment of the script, then free play', () => {
    const you = rails.you
    const seen: string[] = []
    for (const p of played) {
      const game = p.before
      if (game.current !== you) {
        expect(ids(at(game))).toEqual(['sprout'])
        continue
      }
      if (p.step === 'draft') seen.push(...ids(at(game)))
      if (p.step === 'turn1' || p.step === 'turn2') {
        const plan = turnPlan(p.action)
        seen.push(...ids(at(game)))
        seen.push(...ids(at(game, { move: plan.move })))
        seen.push(...ids(at(game, plan)))
      }
      if (p.step === 'refresh1' && p.action.type === 'refresh') {
        const [first, second] = p.action.setAside
        seen.push(...ids(at(game)).slice(0, -1)) // (blocks · noWord · then the swap points at the first seed)
        const swapFirst = currentRailsStep(at(game, { seen: new Set(['blocks', 'noWord']) }))!
        expect(swapFirst.target!(at(game))).toBe(`[data-hand="${first}"]`)
        const swapSecond = currentRailsStep(at(game, { setAside: [first], seen: new Set(['blocks', 'noWord']) }))!
        expect(swapSecond.target!(at(game, { setAside: [first] }))).toBe(`[data-hand="${second}"]`)
        seen.push(swapFirst.id)
        seen.push(...ids(at(game, { setAside: [first, second], seen: new Set(['blocks', 'noWord']) })))
      }
    }
    const last = played[played.length - 1].after
    seen.push(...ids(at(last)))
    expect(seen).toEqual([
      'draft1', 'draft2',
      'lines', 'block', 'move1', 'overOwn', 'seed1', 'plant1',
      'blocks', 'noWord', 'swap', 'refresh',
      'move2', 'seed2', 'preview',
      'counts', 'secret', 'handOver',
    ])
    expect(currentRailsStep(at(last, { seen: new Set(['counts', 'secret', 'handOver']) }))).toBeNull() // free play
  })

  it('each of your steps lets exactly the scripted action through — and refuses everything else', () => {
    for (const p of played.filter((x) => x.before.current === rails.you)) {
      const game = p.before
      const a = p.action
      if (a.type === 'draft') {
        const limit = currentRailsStep(at(game))!.limit(at(game))
        expect(railsRefuses({ kind: 'newGlyphling' }, { kind: 'hex', hex: a.hex }, limit)).toBeNull()
      }
      if (a.type === 'turn') {
        const plan = turnPlan(a)
        const moveStep = currentRailsStep(at(game, { seen: new Set(['lines', 'block']) }))!
        const limit = moveStep.limit(at(game))
        expect(railsRefuses({ kind: 'glyphling', id: a.glyphling }, { kind: 'hex', hex: a.to }, limit)).toBeNull()
        // turn 1: only that glyphling; turn 2: either of yours, to the same hex (Muzzy, 2026-10-13)
        const other = game.glyphlings.find((g) => g.seat === rails.you && g.id !== a.glyphling)!
        const otherOk = railsRefuses({ kind: 'glyphling', id: other.id }, { kind: 'hex', hex: a.to }, limit) === null
        expect(otherOk).toBe(game.turnCount > 1)
        const elsewhere = legalMoves(game, a.glyphling).find((h) => hexKey(h) !== hexKey(a.to))!
        expect(railsRefuses({ kind: 'glyphling', id: a.glyphling }, { kind: 'hex', hex: elsewhere }, limit)).not.toBeNull()
        const seedStep = currentRailsStep(at(game, { move: plan.move, seen: new Set(['overOwn']) }))!
        const seedLimit = seedStep.limit(at(game, { move: plan.move }))
        expect(railsRefuses({ kind: 'seed', id: a.seed! }, { kind: 'hex', hex: a.target! }, seedLimit)).toBeNull()
        const otherSeed = game.hands[rails.you].find((s) => s.id !== a.seed)!
        expect(railsRefuses({ kind: 'seed', id: otherSeed.id }, { kind: 'hex', hex: a.target! }, seedLimit)).not.toBeNull()
      }
    }
  })

  it('point at the right pieces (from rails.json)', () => {
    const byId = (id: string) => RAILS_STEPS.find((s) => s.id === id)!
    const game = played[0].before
    expect(byId('block').target!(at(game))).toBe(`[data-glyph="${railsGlyphling(rails.ai.seat, 'first')}"]`) // Sprout's glyphling on blockedAt
    expect(rails.draft.ai[0]).toBe(rails.turn1.blockedAt)
    expect(byId('move1').target!(at(game))).toBe(`.game-garden > polygon[data-hex="${hexKey(railsHex(rails.turn1.to))}"]`)
    expect(byId('blocks').target!(at(game))).toBe(`[data-seed="${hexKey(railsHex(rails.turn1.plant))}"]`)
  })

  it('every callout: 12 words or fewer, every {placeholder} filled, Blue named by its colour', () => {
    for (const step of RAILS_STEPS.filter((s) => s.text)) {
      const words = railsText(step)
      expect(words, step.id).not.toMatch(/[{}]/)
      expect(words.split(/\s+/).filter((w) => /\w/.test(w)).length, `${step.id}: ${words}`).toBeLessThanOrEqual(12)
    }
    expect(railsText(RAILS_STEPS.find((s) => s.id === 'blocks')!)).toContain('Blue')
    expect(railsText(RAILS_STEPS.find((s) => s.id === 'swap')!)).toBe(`Tap ${rails.turn1.refresh[0]} and ${rails.turn1.refresh[1]}, then Refresh.`)
  })
})

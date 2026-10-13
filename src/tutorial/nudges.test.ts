// The nudges' plain rules (F78): which idle nudge fits the moment, wrong action → words, the per-game limit.
import { describe, expect, it } from 'vitest'
import text from '../../content/text/en.json'
import { legalCasts, legalMoves } from '../engine/engine'
import { position } from '../engine/testkit'
import type { GameState } from '../engine/types'
import { idleKind, idleTarget, takeWrong, wrongFromDrop, wrongFromNope, wrongFromPlantTap, wrongWords } from './nudges'

const start = () => position({ glyphlings: { 0: 'C3-4', 1: 'C9-4', 2: 'C6-3', 3: 'C6-7' }, hands: [['A', 'B', 'C'], ['D']] })
const moveOf = (game: GameState) => ({ glyphling: 0, to: legalMoves(game, 0)[0] })
const words = text.tutorial.nudges

describe('idle nudges: what you should be doing now', () => {
  it('draft → place · nothing moved → move · moved → plant · aimed → Plant · refresh → refresh', () => {
    const game = start()
    expect(idleKind({ ...game, phase: 'draft' }, null, null)).toBe('draft')
    expect(idleKind(game, null, null)).toBe('move')
    const move = moveOf(game)
    expect(legalCasts(game, move.glyphling, move.to).length).toBeGreaterThan(0)
    expect(idleKind(game, move, null)).toBe('plant')
    expect(idleKind(game, move, { seed: game.hands[0][0].id, target: legalCasts(game, move.glyphling, move.to)[0] })).toBe('commit')
    expect(idleKind({ ...game, phase: 'refresh' }, null, null)).toBe('refresh')
    expect(idleKind({ ...game, phase: 'over' }, null, null)).toBeNull()
  })

  it('moved with no seeds to plant → End turn', () => {
    const game = { ...start(), hands: [[], []] }
    expect(idleKind(game, moveOf(game), null)).toBe('endTurn')
  })

  it('the move callout points at one of your glyphlings', () => {
    expect(idleTarget('move', start())).toMatch(/^\[data-glyph="[01]"\]$/)
    expect(idleTarget('commit', start())).toBe('[data-action="plant"]')
  })
})

describe('wrong-action nudges', () => {
  it('a tray seed before the move → "Move a glyphling first"', () => {
    const game = start()
    const wrong = wrongFromNope({ kind: 'hand', key: game.hands[0][0].id }, game, null)!
    expect(wrong).toMatchObject({ kind: 'seedFirst', target: `[data-hand="${game.hands[0][0].id}"]` })
    expect(wrongWords(wrong, game)).toBe(words.wrong.seedFirst)
  })

  it("a rival's glyphling → whose it is and your colour", () => {
    const game = start()
    const wrong = wrongFromNope({ kind: 'glyph', key: '2' }, game, null)!
    expect(wrong).toMatchObject({ kind: 'rival', seat: 1, target: '[data-glyph="2"]' })
    expect(wrongWords(wrong, game)).toBe("That's Blue's. Yours are yellow.")
  })

  it('your own glyphling shaking (tangled, out of step) or a planted seed → no nudge (the prompt says why)', () => {
    const game = start()
    expect(wrongFromNope({ kind: 'glyph', key: '0' }, game, null)).toBeNull()
    expect(wrongFromNope({ kind: 'seed', key: '0,0' }, game, null)).toBeNull()
  })

  it('a bad drop → the glyphling / seed words, pointing at the piece back home', () => {
    expect(wrongFromDrop('glyphlingHex', '1')).toEqual({ kind: 'glyphlingHex', target: '[data-glyph="1"]' })
    expect(wrongFromDrop('seedHex', 'seed-4')).toEqual({ kind: 'seedHex', target: '[data-hand="seed-4"]' })
    expect(wrongWords(wrongFromDrop('seedHex', 'x'), start())).toBe(words.wrong.seedHex)
  })

  it('Plant tapped with nothing planned: before the move → move first; moved → plant a seed first; End turn → none', () => {
    const game = start()
    expect(wrongFromPlantTap(game, null, null)?.kind).toBe('seedFirst')
    expect(wrongFromPlantTap(game, moveOf(game), null)?.kind).toBe('plantNothing')
    const empty = { ...game, hands: [[], []] }
    expect(wrongFromPlantTap(empty, moveOf(empty), null)).toBeNull()
    expect(wrongFromPlantTap({ ...game, phase: 'refresh' }, null, null)).toBeNull()
  })

  it('each kind shows at most `repeat` times a game, kinds counted apart', () => {
    const counts = new Map<string, number>()
    expect([1, 2, 3, 4].map(() => takeWrong(counts, 'seedFirst', 3))).toEqual([true, true, true, false])
    expect(takeWrong(counts, 'rival', 3)).toBe(true)
  })

  it('every nudge line is 12 words or fewer', () => {
    for (const line of [...Object.values(words.idle), ...Object.values(words.wrong)]) expect(line.split(/\s+/).length).toBeLessThanOrEqual(12)
  })
})

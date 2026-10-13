// Showing the first-time tips (F77): where they point, their words, pause or not, the per-turn / per-game limits.
import { describe, expect, it } from 'vitest'
import text from '../../content/text/en.json'
import { position } from '../engine/testkit'
import { PAUSE_TIPS } from './tips'
import { countTip, newTipBudget, tipMode, tipRoomThisTurn, tipSelector, tipWords } from './tipsPlay'

const game = position({ glyphlings: { 0: 'C3-4', 1: 'C9-4', 2: 'C6-3', 3: 'C6-7' } })
const words = text.tutorial.tips

describe('first-time tips on screen (F77)', () => {
  it('point at the glyphling, the planted seed or the part of the screen', () => {
    expect(tipSelector({ glyphling: 2 })).toBe('[data-glyph="2"]')
    expect(tipSelector({ hex: { q: 1, r: -2 } })).toBe('[data-seed="1,-2"]')
    expect(tipSelector({ part: 'plant' })).toBe('[data-action="plant"]')
    expect(tipSelector({ part: 'refresh' })).toBe('[data-action="refresh"]')
    expect(tipSelector({ part: 'tray' })).toBe('.game-tray')
    expect(tipSelector({ part: 'reveal' })).toBe('.game-reveal')
  })

  it('fill in whose glyphling, the Magic and the tangle bonus', () => {
    expect(tipWords({ id: 'theirDanger', target: { glyphling: 2 }, values: { seat: 1 } }, game)).toBe("Blue's glyphling has 1 move left. Block it to tangle it.")
    expect(tipWords({ id: 'tangleTheirs', target: { glyphling: 2 }, values: { seat: 1 } }, game)).toBe(`Blue's glyphling is tangled! Your pieces beside it create +${game.config.rules.tangleBonus} Magic each.`)
    expect(tipWords({ id: 'tangleYours', target: { glyphling: 0 } }, game)).toContain(`+${game.config.rules.tangleBonus} Magic`)
    expect(tipWords({ id: 'twoWords', target: { hex: { q: 0, r: 0 } }, values: { n: 2 } }, game)).not.toMatch(/\{/)
  })

  it('one tip a turn (tipsPerTurn), counted by the turn', () => {
    const budget = newTipBudget()
    expect(tipRoomThisTurn(budget, 5, 1)).toBe(true)
    countTip(budget, 5, 'plain')
    expect(tipRoomThisTurn(budget, 5, 1)).toBe(false)
    expect(tipRoomThisTurn(budget, 6, 1)).toBe(true)
  })

  it('the 3 pause tips pause — up to maxPauses a game, never online; the rest never pause', () => {
    const budget = newTipBudget()
    expect(PAUSE_TIPS).toHaveLength(3)
    expect(tipMode('oneToGo', { online: false, budget, maxPauses: 4 })).toBe('pause')
    expect(tipMode('oneToGo', { online: true, budget, maxPauses: 4 })).toBe('plain')
    expect(tipMode('theirDanger', { online: false, budget, maxPauses: 4 })).toBe('plain')
    countTip(budget, 1, 'pause')
    expect(tipMode('tangleYours', { online: false, budget, maxPauses: 1 })).toBe('plain')
  })

  it('every tip is 12 words or fewer, and Magic is never "gained"', () => {
    for (const [id, line] of Object.entries(words)) {
      if (id === '_help') continue
      expect(line.split(/\s+/).length, id).toBeLessThanOrEqual(12)
      expect(line, id).not.toMatch(/\bgain/i)
    }
  })
})

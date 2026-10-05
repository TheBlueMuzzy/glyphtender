// The AI's thinker (F42): without a Web Worker (tests) it thinks right here; a request with one seat's view comes back
// as a legal action, the bot's next random position and a note — the same request, the same answer; after stop(), no
// more answers.
import { describe, expect, it } from 'vitest'
import { glyphtenderRules, viewFor } from '../engine/rules'
import { makeGameThinker } from './thinker'
import { seatThinking } from './seatBrain'
import { officialWords } from './testkit'

const words = officialWords()

describe('the AI thinker', () => {
  it('answers a draft and a turn with a legal action, a new rng and a note — repeatably', async () => {
    const rules = glyphtenderRules(words)
    let game = rules.setup({ players: 2, boardName: 'small', seed: 7 })
    const thinker = makeGameThinker(words)
    for (let i = 0; i < 6; i++) { // the 4 draft placements, then the first turns
      const seat = game.current
      const request = { view: viewFor(game, seat), seat, rng: 100 + i, personalityId: 'Strategist', skillId: 'Apprentice' }
      const answer = await thinker.think(request)
      expect(rules.check(game, seat, answer.action)).toBeNull()
      expect(answer.rng).not.toBe(request.rng)
      expect(answer.note.length).toBeGreaterThan(0)
      expect(seatThinking(words)(request).action).toEqual(answer.action) // same request → same pick
      game = rules.apply(game, seat, answer.action).state
    }
    thinker.stop()
    await expect(thinker.think({ view: viewFor(game, 0), seat: 0, rng: 1, personalityId: 'Strategist', skillId: 'Apprentice' })).rejects.toThrow()
  })

  it('an unknown personality or skill plays as the Survivor at First Class (never crashes)', () => {
    const rules = glyphtenderRules(words)
    const game = rules.setup({ players: 2, boardName: 'small', seed: 3 })
    const answer = seatThinking(words)({ view: viewFor(game, 0), seat: 0, rng: 5, personalityId: 'Nobody', skillId: 'Nope' })
    expect(rules.check(game, 0, answer.action)).toBeNull()
  })
})

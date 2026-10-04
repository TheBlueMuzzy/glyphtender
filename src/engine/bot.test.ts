/// <reference types="node" />
// The bot sees only its seat's view (F36) — and that changes NOTHING about how it plays: at every position of golden
// games (golden/, F29), for the seat to act, the greedy and random players pick exactly the same action and end on the
// same random position from the seat's view as from the whole game. On the greedy golden games the bot also
// re-picks every recorded move (the same game the golden file wrote down).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { greedyBot } from './bot'
import { fromRecorded, toRecorded, type GoldenGame } from './golden'
import { glyphtenderRules, viewFor } from './rules'
import { greedyAction, randomAction } from './sim'
import { parseWordList } from './words'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const GAMES_PER_SET = 8 // a sample: 8 games × 12 sets (every player count, board size and player style)
const SETS = ['2p', '3p', '4p'].flatMap((p) => ['small', 'large'].flatMap((b) => ['random', 'greedy'].map((s) => `${p}-${b}-${s}`)))
const load = (set: string): GoldenGame[] => JSON.parse(readFileSync(new URL(`../../golden/${set}.json`, import.meta.url), 'utf8'))

let positions = 0

describe('a bot picks the same from its view as from the whole game (golden games)', () => {
  for (const set of SETS) {
    it(`${set}: every position of the first ${GAMES_PER_SET} games`, () => {
      const rules = glyphtenderRules(words)
      const bot = greedyBot(words)
      for (const game of load(set).slice(0, GAMES_PER_SET)) {
        let state = rules.setup({ players: game.players, boardName: game.boardName, seed: game.seed })
        let botRng = game.seed ^ 0x5eed // the golden recorder's (and the server's) bot random start
        game.steps.forEach((step, i) => {
          const seat = state.current
          const view = viewFor(state, seat)
          const rng = game.seed * 31 + i // any random position will do: both sides get the same one
          expect(randomAction(view, rng)).toEqual(randomAction(state, rng))
          const fromView = bot(view, seat, botRng)
          expect(fromView).toEqual(greedyAction(state, botRng, words))
          if (game.player === 'greedy') {
            expect(toRecorded(state, fromView.action)).toEqual(step.action) // the very move the golden game made
            botRng = fromView.rng
          }
          positions++
          state = rules.apply(state, seat, fromRecorded(state, step.action)).state
        })
        expect(state.phase).toBe('over')
      }
    })
  }

  it('checked a real number of positions', () => {
    expect(positions).toBeGreaterThan(5000) // (8 games per set = 7,379 positions; set GAMES_PER_SET = 25 for all 300 games = 23,407 — passed 2026-10-04)
  })
})

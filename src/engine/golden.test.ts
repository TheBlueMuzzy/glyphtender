/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { replayGame, type GoldenGame } from './golden'
import { parseWordList } from './words'

// A quick sample of the golden games (golden/, F29): the first 2 games of each of the 12 sets must replay move for
// move. The full 300 run with npm run check:golden (which also notices when the word list / boards / rules changed).
const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const SETS = ['2p', '3p', '4p'].flatMap((p) => ['small', 'large'].flatMap((b) => ['random', 'greedy'].map((s) => `${p}-${b}-${s}`)))

describe('golden games (sample)', () => {
  for (const set of SETS) {
    it(`${set}: the first 2 games replay identically`, () => {
      const games: GoldenGame[] = JSON.parse(readFileSync(new URL(`../../golden/${set}.json`, import.meta.url), 'utf8'))
      for (const game of games.slice(0, 2)) expect(replayGame(game, words)).toBeNull()
    })
  }
})

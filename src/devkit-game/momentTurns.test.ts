// The Dev Kit moments' board positions are real, and do what each moment needs (momentTurns.ts).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { previewTurn } from '../engine/engine'
import { glyphtenderRules } from '../engine/rules'
import { parseWordList } from '../engine/words'
import { momentStart } from './momentTurns'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))

describe('moment positions', () => {
  it.each([['oneWord', 1], ['twoWords', 2], ['noWords', 0]] as const)('%s: a cast that grows %i word(s)', (want, count) => {
    const start = momentStart(words, want)
    expect(start?.turn).toBeTruthy()
    const { game, turn } = start!
    expect(game.phase).toBe('play')
    expect(previewTurn(game, { type: 'turn', ...turn! }, words).words).toHaveLength(count)
  })

  it('tangle: the turn newly tangles a glyphling and the game goes on', () => {
    const { game, turn } = momentStart(words, 'tangle')!
    const after = glyphtenderRules(words).apply(game, game.current, { type: 'turn', ...turn! }).state
    expect(after.tangled.length).toBeGreaterThan(game.tangled.length)
    expect(after.phase).not.toBe('over')
  })

  it('refresh: a player in the refresh step; Keep all passes play on', () => {
    const { game } = momentStart(words, 'refresh')!
    expect(game.phase).toBe('refresh')
    const after = glyphtenderRules(words).apply(game, game.current, { type: 'refresh', setAside: [] }).state
    expect(after.phase).toBe('play')
    expect(after.current).not.toBe(game.current)
  })

  it('is the same every time', () => {
    expect(momentStart(words, 'twoWords')!.turn).toEqual(momentStart(words, 'twoWords')!.turn)
  })
})

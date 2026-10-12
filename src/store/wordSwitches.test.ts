// F71 — Settings → British Spelling / Vulgar Words: a game's word list = the official words + the B / V words its
// config switched on, fixed at game start; an old save (no switches) plays with the plain list.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseWordFile } from '../engine/words'
import { setupGame } from '../engine/rules'
import { useGameStore } from './gameStore'

const store = () => useGameStore.getState()
const file = parseWordFile(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))

beforeEach(() => {
  store().leaveGame()
  useGameStore.setState({ wordFile: file, words: file.plain, wordsStatus: 'ready' })
})

describe('the game’s word list follows the switches it started with (F71)', () => {
  it('both off (the default): today’s list exactly — no COLOUR, no COCK, and no extraWords in the config', () => {
    store().startGame({ players: 2, seed: 1 })
    expect(store().game!.config.extraWords).toBeUndefined()
    expect(store().words).toBe(file.plain)
    expect(store().words!.has('COLOUR')).toBe(false)
    expect(store().words!.has('COCK')).toBe(false)
  })

  it('British on: COLOUR counts, COCK still doesn’t', () => {
    store().startGame({ players: 2, seed: 1, extraWords: { british: true, vulgar: false } })
    expect(store().game!.config.extraWords).toEqual({ british: true })
    expect(store().words!.get('COLOUR')).toBe(4.49)
    expect(store().words!.has('COCK')).toBe(false)
  })

  it('Vulgar on: COCK counts; a new game with both off goes back to the plain list', () => {
    store().startGame({ players: 2, seed: 1, extraWords: { vulgar: true } })
    expect(store().words!.has('COCK')).toBe(true)
    expect(store().words!.has('COLOUR')).toBe(false)
    store().startGame({ players: 2, seed: 2 })
    expect(store().words).toBe(file.plain)
  })

  it('a loaded game keeps its own switches; an old save without them = both off', () => {
    store().loadState(setupGame({ players: 2, seed: 3, extraWords: { british: true, vulgar: true } }))
    expect(store().words!.has('COLOUR') && store().words!.has('COCK')).toBe(true)
    const old = setupGame({ players: 2, seed: 4 })
    expect('extraWords' in old.config).toBe(false)
    store().loadState(old)
    expect(store().words).toBe(file.plain)
  })

  it('the word file arriving after the game started still gives that game its list', () => {
    useGameStore.setState({ wordFile: null, words: null, wordsStatus: 'loading' })
    store().startGame({ players: 2, seed: 1, extraWords: { british: true } })
    expect(store().words).toBeNull()
    useGameStore.setState({ wordFile: file, wordsStatus: 'ready' })
    expect(store().words!.has('COLOUR')).toBe(true)
  })
})

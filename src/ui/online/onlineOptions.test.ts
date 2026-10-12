import { describe, expect, it } from 'vitest'
import { defaultOnlineOptions, loadOnlineOptions, saveOnlineOptions, withHostWordSwitches, wordSwitchesLine } from './onlineOptions'

// A pretend browser storage
const memory = () => {
  const saved = new Map<string, string>()
  return { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => void saved.set(key, value) }
}

describe('the host’s online table options', () => {
  it('first time: the garden picked by player count, the timer off', () => {
    expect(loadOnlineOptions(memory())).toEqual(defaultOnlineOptions())
    expect(defaultOnlineOptions()).toMatchObject({ boardName: 'auto', turnSeconds: 0, wordIndicators: true })
  })

  it('remembers the last choices, and falls back where a saved value no longer fits', () => {
    const storage = memory()
    saveOnlineOptions({ boardName: 'large', minWordLength: 3, turnSeconds: 90, wordIndicators: false, britishWords: false, vulgarWords: false }, storage)
    expect(loadOnlineOptions(storage)).toEqual({ boardName: 'large', minWordLength: 3, turnSeconds: 90, wordIndicators: false, britishWords: false, vulgarWords: false })
    storage.setItem('glyphtender:online-options', JSON.stringify({ boardName: 'huge', minWordLength: 9, turnSeconds: 45, wordIndicators: 'yes' }))
    expect(loadOnlineOptions(storage)).toEqual(defaultOnlineOptions())
    storage.setItem('glyphtender:online-options', 'not json')
    expect(loadOnlineOptions(storage)).toEqual(defaultOnlineOptions())
  })

  it('2-letter words: an old save (from when on was the default) comes back OFF once; a choice saved since sticks', () => {
    const storage = memory()
    storage.setItem('glyphtender:online-options', JSON.stringify({ boardName: 'auto', minWordLength: 2, turnSeconds: 0, wordIndicators: true }))
    expect(loadOnlineOptions(storage).minWordLength).toBe(3)
    saveOnlineOptions({ ...defaultOnlineOptions(), minWordLength: 2 }, storage)
    expect(loadOnlineOptions(storage).minWordLength).toBe(2)
  })
})

describe('F71: the host’s word switches', () => {
  it('go with Start from the host’s Settings (never remembered as a lobby choice)', () => {
    expect(withHostWordSwitches(defaultOnlineOptions(), { british: true })).toMatchObject({ britishWords: true, vulgarWords: false })
    const storage = memory()
    saveOnlineOptions({ ...defaultOnlineOptions(), vulgarWords: true }, storage)
    expect(loadOnlineOptions(storage).vulgarWords).toBe(false)
  })

  it('the lobby / Pause line: nothing when both are off', () => {
    expect(wordSwitchesLine(undefined)).toBeNull()
    expect(wordSwitchesLine({ british: false })).toBeNull()
    expect(wordSwitchesLine({ vulgar: true })).toBe('Vulgar words on')
    expect(wordSwitchesLine({ british: true, vulgar: true })).toBe('British spelling on · Vulgar words on')
  })
})

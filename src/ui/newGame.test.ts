import { describe, expect, it } from 'vitest'
import { SURPRISE, aiSeatsOf, boardNames, defaultChoices, hasPerson, loadChoices, saveChoices, withPlayers, withSeat } from './newGame'

// A pretend browser storage
function memory(start: Record<string, string> = {}) {
  const data = { ...start }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v }, data }
}

describe('new game choices', () => {
  it('the boards come from boards.json', () => {
    expect(boardNames()).toEqual(['small', 'large'])
  })

  it('first time: 2 players on the Small garden, 2-letter words on, seeds NOT hidden (opt in), word indicators on', () => {
    expect(defaultChoices()).toMatchObject({ players: 2, boardName: 'small', twoLetterWords: true, hideSeeds: false, wordIndicators: true })
    expect(defaultChoices().seats.every((seat) => !seat.ai)).toBe(true) // every seat a person
    expect(loadChoices(memory())).toEqual(defaultChoices())
    expect(loadChoices(null)).toEqual(defaultChoices()) // no storage at all
  })

  it('changing the player count picks that count\'s default garden', () => {
    expect(withPlayers(defaultChoices(), 3).boardName).toBe('large')
    expect(withPlayers(defaultChoices(), 2).boardName).toBe('small')
  })

  it('the last choices are remembered', () => {
    const storage = memory()
    const mine = { ...defaultChoices(), players: 3, boardName: 'small', twoLetterWords: false, hideSeeds: false, wordIndicators: false }
    saveChoices(mine, storage)
    expect(loadChoices(storage)).toEqual(mine)
  })

  it('a player who saved "hide seeds" on keeps it (the default is off)', () => {
    const storage = memory()
    saveChoices({ ...defaultChoices(), hideSeeds: true }, storage)
    expect(loadChoices(storage).hideSeeds).toBe(true)
    // an old save from before the option existed falls back to the default: off
    const old = memory({ 'glyphtender:new-game': JSON.stringify({ players: 2, boardName: 'small' }) })
    expect(loadChoices(old).hideSeeds).toBe(false)
  })

  it('odd or broken saved choices fall back to sensible ones', () => {
    const broken = memory({ 'glyphtender:new-game': '{not json' })
    expect(loadChoices(broken)).toEqual(defaultChoices())
    const odd = memory({ 'glyphtender:new-game': JSON.stringify({ players: 9, boardName: 'huge', twoLetterWords: 'yes' }) })
    expect(loadChoices(odd)).toEqual(defaultChoices())
    const refuses = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadChoices(refuses)).toEqual(defaultChoices())
    expect(() => saveChoices(defaultChoices(), refuses)).not.toThrow()
  })
})

describe('AI seats (F42)', () => {
  it('a seat switched to AI starts as "Surprise me" at First Class, and is remembered with its picks', () => {
    const storage = memory()
    const ai = withSeat(withPlayers(defaultChoices(), 3), 1, { ai: true })
    expect(ai.seats[1]).toEqual({ ai: true, personality: SURPRISE, skill: 'FirstClass' })
    const picked = withSeat(ai, 2, { ai: true, personality: 'Strategist', skill: 'Archmage' })
    saveChoices(picked, storage)
    expect(loadChoices(storage)).toEqual(picked)
  })

  it('Start turns the AI seats into bots: "Surprise me" picks a real personality; seats past the player count stay out', () => {
    let choices = withSeat(defaultChoices(), 1, { ai: true }) // you + 1 AI (Surprise me)
    choices = withSeat(choices, 3, { ai: true, personality: 'Strategist' }) // (seat 4, but only 2 players)
    const { bots, ai } = aiSeatsOf(choices, () => 0) // (the "random" pick: the first personality)
    expect(bots).toEqual([1])
    expect(ai).toEqual({ 1: { personality: 'Scholar', skill: 'FirstClass' } }) // the first of content/ai/personalities.json
  })

  it('at least one seat must be a person', () => {
    expect(hasPerson(defaultChoices())).toBe(true)
    const allAi = withSeat(withSeat(defaultChoices(), 0, { ai: true }), 1, { ai: true })
    expect(hasPerson(allAi)).toBe(false)
  })

  it('a saved seat with an unknown personality or skill falls back (a renamed personality, an old save)', () => {
    const odd = memory({ 'glyphtender:new-game': JSON.stringify({ players: 2, seats: [{ ai: false }, { ai: true, personality: 'Gone', skill: 'Wizard' }] }) })
    expect(loadChoices(odd).seats[1]).toEqual({ ai: true, personality: SURPRISE, skill: 'FirstClass' })
    expect(loadChoices(odd).seats[2].ai).toBe(false)
  })

  it('the first seat is always you: an older save with an AI there comes back as a person', () => {
    const old = memory({ 'glyphtender:new-game': JSON.stringify({ players: 2, seats: [{ ai: true, personality: 'Scholar', skill: 'Archmage' }, { ai: true }] }) })
    expect(loadChoices(old).seats[0].ai).toBe(false)
    expect(loadChoices(old).seats[1].ai).toBe(true)
  })
})

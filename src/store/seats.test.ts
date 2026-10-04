import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hexAt, position, wordsOf } from '../engine/testkit'
import { legalDraftHexes } from '../engine/engine'
import { useGameStore } from './gameStore'
import { isLocalHuman, localSeats, needsHandoff, onlineSeats, type Seat } from './seats'

const store = () => useGameStore.getState()
const names = { yellow: 'Yellow', blue: 'Blue', purple: 'Purple', pink: 'Pink' }

describe('seats', () => {
  it('pass-and-play: one person-on-this-device seat per player, in colour order', () => {
    expect(localSeats(3, names)).toEqual([
      { kind: 'human', where: 'local', connected: true, name: 'Yellow', colour: 'yellow' },
      { kind: 'human', where: 'local', connected: true, name: 'Blue', colour: 'blue' },
      { kind: 'human', where: 'local', connected: true, name: 'Purple', colour: 'purple' },
    ])
  })

  it('only a person on this device is a local human (not a bot here, not a person online)', () => {
    const seats: Seat[] = [...localSeats(1, names), { kind: 'bot', where: 'local', connected: true, name: 'Bot', colour: 'blue' },
      { kind: 'human', where: 'online', connected: true, name: 'Bo', colour: 'purple' }]
    expect(isLocalHuman(seats[0])).toBe(true)
    expect(isLocalHuman(seats[1])).toBe(false)
    expect(isLocalHuman(seats[2])).toBe(false)
    expect(isLocalHuman(seats[5])).toBe(false)
  })

  it('online: my seat is a person here; the others are a person or a bot elsewhere, connected as the room says', () => {
    const room = [{ kind: 'human' as const, connected: true }, { kind: 'bot' as const, connected: false }, { kind: 'human' as const, connected: false }]
    expect(onlineSeats(['Ada', 'Bo', 'Cy'], 0, room).map((s) => [s.kind, s.where, s.connected, s.name, s.colour])).toEqual([
      ['human', 'local', true, 'Ada', 'yellow'],
      ['bot', 'online', false, 'Bo', 'blue'],
      ['human', 'online', false, 'Cy', 'purple'],
    ])
    // before the room message arrives: everyone else is a connected person
    expect(onlineSeats(['Ada', 'Bo'], 1).map((s) => [s.kind, s.where, s.connected])).toEqual([['human', 'online', true], ['human', 'local', true]])
  })

  it('the device is passed only between two humans on it, and only when seeds are hidden', () => {
    const two = localSeats(2, names)
    expect(needsHandoff(two, 0, 1, true)).toBe(true)
    expect(needsHandoff(two, 0, 1, false)).toBe(false) // seeds are public: no handoff
    expect(needsHandoff(two, 1, 1, true)).toBe(false) // same player again
    expect(needsHandoff(two, null, 0, true)).toBe(true) // before the first turn
    const vsAi: Seat[] = [two[0], { kind: 'bot', where: 'local', connected: true, name: 'Bot', colour: 'blue' }]
    expect(needsHandoff(vsAi, 1, 0, true)).toBe(false) // one human: nobody to hide from
    expect(needsHandoff(vsAi, 0, 1, true)).toBe(false)
  })
})

// Yellow moves C6-7 → C6-6 and casts onto C6-4 (a T sits at C6-3, so an A there makes "TA").
function yellowToPlay(options: { hideSeeds: boolean; wordIndicators?: boolean }) {
  store().startGame({ players: 2, seed: 3, hideSeeds: options.hideSeeds, wordIndicators: options.wordIndicators })
  store().loadState(position({
    glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
    seeds: [{ 'C6-3': 'T' }],
    hands: [['A', 'B', 'C', 'D', 'F', 'G', 'H', 'J'], ['E']],
    bag: ['V', 'W', 'X', 'Y', 'Z'],
  }))
}
function playYellow(seed: number) {
  store().tapGlyphling(0)
  store().tapHex(hexAt('C6-6'))
  store().tapSeed(store().game!.hands[0][seed].id) // (seed = a hand position)
  store().tapHex(hexAt('C6-4'))
  store().startCast()
  store().finishCast()
}

describe('game store — passing the device (handoff)', () => {
  beforeEach(() => {
    store().leaveGame()
    store().setWords(wordsOf('AT', 'TA'))
  })

  it('after a turn that made Magic, play passes on and the next player must tap to see their seeds', () => {
    yellowToPlay({ hideSeeds: true })
    playYellow(0) // A → "TA"
    expect(store().game?.current).toBe(1)
    expect(store().handoff).toEqual({ seat: 1, afterGrow: true })
    store().tapGlyphling(2) // nothing can be touched until Blue has the device
    expect(store().selected).toBeNull()
    store().showSeeds()
    expect(store().handoff).toBeNull()
    store().endScoring() // (the handoff box only shows once the score sequence has faded — Handoff.tsx waits for it)
    store().tapGlyphling(2)
    expect(store().selected).toEqual({ kind: 'glyphling', id: 2 })
  })

  it('a cast that scores: nothing can be touched until its score sequence has faded, then play goes on (nothing left over)', () => {
    yellowToPlay({ hideSeeds: false })
    playYellow(0) // A → "TA"
    expect(store().game?.current).toBe(1)
    expect(store().scoring).toBe(store().landed!.count)
    store().tapGlyphling(2) // Blue's turn, but Yellow's score is still playing out
    expect(store().selected).toBeNull()
    expect(store().nope).toBeNull() // a quiet moment: nothing shakes "no"
    store().endScoring()
    expect(store().scoring).toBeNull()
    store().tapGlyphling(2)
    expect(store().selected).toEqual({ kind: 'glyphling', id: 2 })
  })

  it('the score sequence ends by itself (its timer), and word indicators off = no sequence at all', () => {
    vi.useFakeTimers()
    try {
      yellowToPlay({ hideSeeds: false })
      playYellow(0)
      expect(store().scoring).not.toBeNull()
      vi.advanceTimersByTime(60_000)
      expect(store().scoring).toBeNull()
      yellowToPlay({ hideSeeds: false, wordIndicators: false })
      playYellow(0)
      expect(store().scoring).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a turn with no Magic: the same player refreshes first, THEN the device is passed', () => {
    yellowToPlay({ hideSeeds: true })
    playYellow(1) // B makes nothing
    expect(store().game?.phase).toBe('refresh')
    expect(store().handoff).toBeNull() // Yellow still has the device to refresh
    store().refresh(true)
    expect(store().handoff).toEqual({ seat: 1, afterGrow: false })
  })

  it('with "hide seeds" off there is never a handoff', () => {
    yellowToPlay({ hideSeeds: false })
    playYellow(0)
    expect(store().game?.current).toBe(1)
    expect(store().handoff).toBeNull()
  })

  it('the device is passed before the first turn after the draft', () => {
    store().startGame({ players: 2, seed: 7, hideSeeds: true })
    for (let i = 0; i < 4; i++) {
      expect(store().handoff).toBeNull() // no seeds dealt during the draft: nothing to hide
      store().tapHex(legalDraftHexes(store().game!)[0])
    }
    expect(store().game?.phase).toBe('play')
    expect(store().handoff).toEqual({ seat: store().game!.current, afterGrow: false })
  })

  it('a new game remembers its table options', () => {
    store().startGame({ players: 3, seed: 1, boardName: 'small', minWordLength: 3, hideSeeds: false })
    expect(store().options).toEqual({ players: 3, boardName: 'small', minWordLength: 3, hideSeeds: false, wordIndicators: true })
    expect(store().game?.config.rules.minWordLength).toBe(3)
    expect(store().seats.map((s) => s.name)).toEqual(['Yellow', 'Blue', 'Purple'])
  })

  it('word indicators are a table option: on unless the new-game screen turned them off', () => {
    store().startGame({ players: 2, seed: 1, wordIndicators: false })
    expect(store().options?.wordIndicators).toBe(false)
  })
})

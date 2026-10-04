/// <reference types="node" />
// A bot seat on this device (localBot.ts — tests and the Dev Kit only): it plays whole pass-and-play games with
// people, from its own seat's view, through the store; the device is never handed to it, and the screen never shows
// its seeds.
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { legalDraftHexes } from '../engine/engine'
import { randomAction } from '../engine/sim'
import { parseWordList } from '../engine/words'
import type { WordList } from '../engine/types'
import { useGameStore } from './gameStore'
import { driveLocalBots, playLocalBot } from './localBot'
import { isBusy } from './myTurn'
import { viewerOf } from './viewer'

let words: WordList
beforeAll(() => { words = parseWordList(readFileSync('public/words/words.csv', 'utf8')) })

const store = () => useGameStore.getState()

/** A person on this device plays one random legal action through the store's taps (and Cast's landing). */
function personPlays(rng: number) {
  const game = store().game!
  if (game.phase === 'draft') return store().tapHex(legalDraftHexes(game)[0])
  if (game.phase === 'refresh') return store().refresh(true)
  const pick = randomAction(game, rng).action
  if (pick.type !== 'turn') throw new Error('expected a turn')
  store().tapGlyphling(pick.glyphling)
  store().tapHex(pick.to)
  if (pick.seed !== null && pick.target) {
    store().tapSeed(pick.seed)
    store().tapHex(pick.target)
  }
  store().startCast()
  if (store().flying) store().finishCast() // (the screen calls this when the seed lands)
}

/** Plays the game to the end: bots play themselves (playLocalBot), people tap, quiet moments run their timers. */
function playToTheEnd(check: () => void) {
  for (let i = 0; i < 5000 && store().game!.phase !== 'over'; i++) {
    check()
    if (playLocalBot()) continue
    if (store().handoff) { store().showSeeds(); continue }
    if (isBusy(store())) { vi.advanceTimersByTime(60_000); continue }
    personPlays(i)
  }
  expect(store().game!.phase).toBe('over')
}

beforeEach(() => {
  vi.useFakeTimers()
  store().leaveGame()
  store().setWords(words)
})
afterEach(() => vi.useRealTimers())

describe('a bot on this device', () => {
  it('1 person + 1 bot: a whole game to the end; no handoff ever, and the screen always shows the person’s seeds', () => {
    store().startGame({ players: 2, seed: 11, hideSeeds: true, bots: [1] })
    expect(store().seats.map((s) => [s.kind, s.where])).toEqual([['human', 'local'], ['bot', 'local']])
    let botTurns = 0
    playToTheEnd(() => {
      expect(store().handoff).toBeNull() // one person here: nobody to hide seeds from
      expect(viewerOf(store())).toBe(0)
      if (store().game!.current === 1 && store().game!.phase === 'play') botTurns++
    })
    expect(botTurns).toBeGreaterThan(5)
    expect(store().game!.log?.turns.some((t) => t.seat === 1)).toBe(true) // (the bot really played turns)
  })

  it('2 people + 1 bot: the device is passed between the people, never to the bot', () => {
    store().startGame({ players: 3, seed: 5, hideSeeds: true, bots: [2] })
    let handoffs = 0
    playToTheEnd(() => {
      const handoff = store().handoff
      if (handoff) handoffs++
      expect(handoff?.seat).not.toBe(2)
      expect(viewerOf(store())).not.toBe(2) // the bot's seeds never show
    })
    expect(handoffs).toBeGreaterThan(0)
  })

  it('a person can’t play the bot’s turn, and the bot doesn’t play a person’s', () => {
    store().startGame({ players: 2, seed: 3, hideSeeds: false, bots: [0] })
    const before = store().game
    store().tapHex(legalDraftHexes(before!)[0]) // the bot is first in the draft: the tap does nothing
    expect(store().game).toBe(before)
    expect(playLocalBot()).toBe(true)
    expect(store().game!.glyphlings).toHaveLength(1)
    expect(store().game!.current).toBe(1)
    expect(playLocalBot()).toBe(false) // a person's turn now
  })

  it('driveLocalBots plays the bot’s turns by itself, a beat after each change', () => {
    store().startGame({ players: 2, seed: 3, hideSeeds: false, bots: [0] })
    const stop = driveLocalBots()
    try {
      expect(store().game!.glyphlings).toHaveLength(0)
      vi.advanceTimersByTime(5_000)
      expect(store().game!.glyphlings).toHaveLength(1) // the bot placed, then waits for the person
      expect(store().game!.current).toBe(1)
    } finally {
      stop()
    }
  })
})

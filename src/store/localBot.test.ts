/// <reference types="node" />
// A bot seat on this device (localBot.ts): the instant greedy bot (playLocalBot, tests) and the AI driver (F42) play with
// people, from its own seat's view, through the store; the device is never handed to it, and the screen never shows
// its seeds.
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { legalDraftHexes } from '../engine/engine'
import { randomAction } from '../engine/sim'
import animFile from '../../content/tuning/anim.json'
import { glideSeconds } from '../game/glide'
import { parseWordList } from '../engine/words'
import type { WordList } from '../engine/types'
import { useGameStore } from './gameStore'
import { driveLocalBots, onAiDecision, playLocalBot, setAiSpeedOverride } from './localBot'
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

})

// The AI (F42): driveLocalBots thinks through the thinker (no Web Worker in tests: right here), waits its moment at
// the AI speed, and plays through the store — a turn glides, then throws (the screen calls finishCast on the landing);
// a draft travels out of the tray first (F50: the screen calls landBotDraft when it arrives).
describe('the AI on this device (driveLocalBots)', () => {
  afterEach(() => setAiSpeedOverride(null))

  /** Lets time pass for the AI: its promise answers, its moment's timer, the glide's timer — and the landing. */
  async function aiTime(ms: number) {
    await vi.advanceTimersByTimeAsync(ms)
    screenLands()
  }
  /** What the screen does when an AI's piece arrives: its draft glyphling reaches its hex, its thrown seed lands. */
  function screenLands() {
    if (store().botDraft) store().landBotDraft()
    if (store().flying && store().seats[store().game!.current].kind === 'bot') store().finishCast()
  }

  it('waits its think time (Normal speed), then places; nothing before that', async () => {
    setAiSpeedOverride('normal')
    store().startGame({ players: 2, seed: 3, hideSeeds: false, bots: [0], ai: { 0: { personality: 'Strategist', skill: 'Apprentice' } } })
    expect(store().seats[0].ai).toEqual({ personality: 'Strategist', skill: 'Apprentice' })
    const stop = driveLocalBots()
    try {
      await vi.advanceTimersByTimeAsync(300) // shorter than any draft think (pace.json draft.min 0.6 s)
      expect(store().game!.glyphlings).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(5_000)
      // F50: it doesn't pop in — its glyphling is on its way from the tray (busy: nothing can be touched) until it arrives
      expect(store().botDraft).not.toBeNull()
      expect(isBusy(store())).toBe(true)
      expect(store().game!.glyphlings).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(5_000) // (no second decision while it travels)
      expect(store().botDraft).not.toBeNull()
      screenLands()
      expect(store().botDraft).toBeNull()
      expect(store().game!.glyphlings).toHaveLength(1) // the AI placed, then waits for the person
      expect(store().game!.current).toBe(1)
    } finally {
      stop()
    }
  })

  it('never freezes: an AI whose thinking fails (a broken personality from the Dev Kit) still plays a legal move', async () => {
    setAiSpeedOverride('instant')
    const broken = { id: 'Broken', traits: {}, goals: ['NAP'], nudge: 0, shifts: [], chattiness: 0 } // not this game's goals
    const skill = { id: 'x', candidates: 10, worlds: 1, spread: 1, topN: 1, wobble: 0, beliefNoise: 0 }
    store().startGame({ players: 2, seed: 3, hideSeeds: false, bots: [0], ai: { 0: { personality: 'Broken', skill: 'x', custom: { personality: broken, skill } } } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stop = driveLocalBots()
    try {
      await aiTime(5_000)
      expect(store().game!.glyphlings).toHaveLength(1) // it placed anyway (the simple fallback move)
      expect(warn).toHaveBeenCalled()
    } finally {
      stop()
      warn.mockRestore()
    }
  })

  it('1 person + 1 AI at Instant: a whole game to the end; every AI decision is heard; no handoff', async () => {
    setAiSpeedOverride('instant')
    store().startGame({ players: 2, seed: 11, hideSeeds: true, bots: [1], ai: { 1: { personality: 'Scholar', skill: 'Apprentice' } } })
    const heard: number[] = []
    const unhear = onAiDecision((seat) => heard.push(seat))
    const stop = driveLocalBots()
    try {
      for (let i = 0; i < 5000 && store().game!.phase !== 'over'; i++) {
        expect(store().handoff).toBeNull()
        const s = store()
        if (s.seats[s.game!.current].kind === 'bot' || isBusy(s)) { await aiTime(2_000); continue }
        personPlays(i)
      }
      expect(store().game!.phase).toBe('over')
      expect(heard.length).toBeGreaterThan(5)
      expect(heard.every((seat) => seat === 1)).toBe(true)
    } finally {
      stop()
      unhear()
    }
  })

  it('an AI draft still on its way when the game is left or restarted is never placed (F50)', async () => {
    setAiSpeedOverride('instant')
    store().startGame({ players: 2, seed: 3, hideSeeds: false, bots: [0] })
    const stop = driveLocalBots()
    try {
      await vi.advanceTimersByTimeAsync(5_000)
      expect(store().botDraft).not.toBeNull()
      store().startGame({ players: 2, seed: 4, hideSeeds: false, bots: [1] }) // now seat 0 is a person
      expect(store().botDraft).toBeNull()
      store().landBotDraft() // (a travel finishing late does nothing)
      expect(store().game!.glyphlings).toHaveLength(0)
    } finally {
      stop()
    }
  })

  it('a shown AI turn glides, holds its aim (the planned seed on its hex), then throws (F50)', () => {
    store().startGame({ players: 2, seed: 7, hideSeeds: false, bots: [0, 1] })
    while (store().game!.phase === 'draft') store().botPlays({ type: 'draft', hex: legalDraftHexes(store().game!)[0] })
    let rng = 1
    let pick = randomAction(store().game!, rng).action
    while (pick.type !== 'turn' || pick.seed === null) pick = randomAction(store().game!, ++rng).action
    const from = store().game!.glyphlings.find((g) => g.id === pick.glyphling)!.hex
    const glideMs = glideSeconds(from, pick.to, animFile) * 1000
    store().botPlays(pick, true, 500)
    expect(store().move).not.toBeNull() // gliding
    expect(store().cast).toBeNull()
    vi.advanceTimersByTime(glideMs + 1)
    expect(store().cast).not.toBeNull() // aimed: the seed sits on its target…
    expect(store().flying).toBe(false) // …and hasn't been thrown yet
    vi.advanceTimersByTime(500)
    expect(store().flying).toBe(true) // thrown
  })

  it('a new game drops the thinking in progress (the old answer is never played)', async () => {
    setAiSpeedOverride('slow')
    store().startGame({ players: 2, seed: 3, hideSeeds: false, bots: [0] })
    const stop = driveLocalBots()
    try {
      await vi.advanceTimersByTimeAsync(100) // thinking / waiting its moment
      store().startGame({ players: 2, seed: 4, hideSeeds: false, bots: [1] }) // now seat 0 is a person
      await vi.advanceTimersByTimeAsync(10_000)
      expect(store().game!.glyphlings).toHaveLength(0) // nothing played into the new game
    } finally {
      stop()
    }
  })
})

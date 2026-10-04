// The screen's one answer to "may this device act now" (myTurn.ts): the rules' turn flow + who sits here + quiet moments.
import { describe, expect, it } from 'vitest'
import { position } from '../engine/testkit'
import type { GameState } from '../engine/types'
import { canPlayNow, isBusy, isMyTurn } from './myTurn'
import type { Seat } from './seats'

/** Yellow (seat 0) to move, Blue (seat 1) waiting. */
const yellowToPlay = (): GameState => position({ glyphlings: { 0: 'C6-7', 1: 'C1-1', 2: 'C11-1', 3: 'C11-4' }, hands: [['T'], ['E']], bag: ['X'] })
const blueToPlay = (): GameState => ({ ...yellowToPlay(), current: 1 })

const seat = (kind: Seat['kind']): Seat => ({ kind, name: kind, colour: 'yellow' })
const passAndPlay = [seat('local'), seat('local')]
const onlineAsYellow = [seat('local'), seat('online')] // onlinePlay.ts: my seat is 'local', the others 'online'
const vsBot = [seat('local'), seat('ai')]
const calm = { flying: false, waiting: false, handoff: null, refreshFx: null, scoring: null }

describe('isMyTurn — the rules say whose turn, the seats say whether they are here', () => {
  it('pass-and-play: whoever’s turn it is plays on this device', () => {
    expect(isMyTurn({ game: yellowToPlay(), seats: passAndPlay })).toBe(true)
    expect(isMyTurn({ game: blueToPlay(), seats: passAndPlay })).toBe(true)
  })

  it('online: only on my own seat’s turn', () => {
    expect(isMyTurn({ game: yellowToPlay(), seats: onlineAsYellow })).toBe(true)
    expect(isMyTurn({ game: blueToPlay(), seats: onlineAsYellow })).toBe(false)
  })

  it('a bot’s turn is never this device’s', () => {
    expect(isMyTurn({ game: yellowToPlay(), seats: vsBot })).toBe(true)
    expect(isMyTurn({ game: blueToPlay(), seats: vsBot })).toBe(false)
  })

  it('nobody once the game is over, and nothing without a game', () => {
    expect(isMyTurn({ game: { ...yellowToPlay(), phase: 'over' }, seats: passAndPlay })).toBe(false)
    expect(isMyTurn({ game: null, seats: passAndPlay })).toBe(false)
  })

  it('the draft and the refresh step follow the same seat', () => {
    expect(isMyTurn({ game: { ...blueToPlay(), phase: 'refresh' }, seats: onlineAsYellow })).toBe(false)
    expect(isMyTurn({ game: { ...yellowToPlay(), phase: 'refresh' }, seats: onlineAsYellow })).toBe(true)
    expect(isMyTurn({ game: { ...yellowToPlay(), phase: 'draft' }, seats: onlineAsYellow })).toBe(true)
  })
})

describe('canPlayNow — my turn, and not a quiet moment', () => {
  it('every quiet moment stops play', () => {
    const s = { game: yellowToPlay(), seats: passAndPlay, ...calm }
    expect(canPlayNow(s)).toBe(true)
    expect(canPlayNow({ ...s, flying: true })).toBe(false)
    expect(canPlayNow({ ...s, waiting: true })).toBe(false)
    expect(canPlayNow({ ...s, handoff: { seat: 1, afterGrow: false } })).toBe(false)
    expect(canPlayNow({ ...s, refreshFx: { seat: 0, slots: [], stage: 'out' } })).toBe(false)
    expect(canPlayNow({ ...s, scoring: 1 })).toBe(false)
    expect(isBusy(calm)).toBe(false)
  })

  it('online, another seat’s turn: no play even when calm', () => {
    expect(canPlayNow({ game: blueToPlay(), seats: onlineAsYellow, ...calm })).toBe(false)
  })
})

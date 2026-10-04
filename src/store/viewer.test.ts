// The viewer seat (viewer.ts): whose eyes the screen shows — the tray's seeds, the end table's "You".
import { beforeEach, describe, expect, it } from 'vitest'
import { hexAt, position, wordsOf } from '../engine/testkit'
import { useGameStore, type OnlineLink } from './gameStore'
import type { Seat } from './seats'
import { viewerOf, youOf } from './viewer'

const store = () => useGameStore.getState()
const viewer = () => viewerOf(store())

// Yellow moves C6-7 → C6-6 and casts A onto C6-4 (a T sits at C6-3: "TA" — Magic, so play passes straight on)
function yellowPlaysTA(hideSeeds: boolean) {
  store().startGame({ players: 2, seed: 3, hideSeeds })
  store().loadState(position({
    glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
    seeds: [{ 'C6-3': 'T' }],
    hands: [['A', 'B'], ['E']],
    bag: ['V', 'W', 'X'],
  }))
  expect(viewer()).toBe(0)
  store().tapGlyphling(0)
  store().tapHex(hexAt('C6-6'))
  store().tapSeed(store().game!.hands[0][0].id)
  store().tapHex(hexAt('C6-4'))
  store().startCast()
  store().finishCast()
  expect(store().game!.current).toBe(1)
}

const seat = (kind: Seat['kind'], where: Seat['where'], colour: Seat['colour']): Seat => ({ kind, where, connected: true, name: colour, colour })

describe('the viewer seat', () => {
  beforeEach(() => {
    store().leaveGame()
    store().setWords(wordsOf('AT', 'TA'))
  })

  it('pass-and-play, seeds hidden: the viewer switches when the handoff is passed, not before', () => {
    yellowPlaysTA(true)
    expect(store().handoff?.seat).toBe(1)
    expect(viewer()).toBe(0) // the device is being handed over: still Yellow's eyes
    store().showSeeds()
    expect(viewer()).toBe(1) // Blue tapped "Show my seeds"
    expect(store().lastViewer).toBe(1)
  })

  it('pass-and-play, seeds public: the viewer is simply the player to move', () => {
    yellowPlaysTA(false)
    expect(store().handoff).toBeNull()
    expect(viewer()).toBe(1)
  })

  it('a bot on this device: the viewer stays with the person while the bot plays', () => {
    yellowPlaysTA(false)
    useGameStore.setState({ seats: [seat('human', 'local', 'yellow'), seat('bot', 'local', 'blue')], lastViewer: 0 })
    expect(store().game!.current).toBe(1) // the bot's turn
    expect(viewer()).toBe(0)
    expect(youOf(store())).toBe(0) // one person here: they're "You" on the end table
  })

  it('online: always my seat, whoever is to move; "You" is my seat', () => {
    yellowPlaysTA(false)
    const nothing = () => {}
    const online: OnlineLink = { mySeat: 0, gameId: 1, version: 1, post: nothing, landed: nothing, resume: nothing }
    useGameStore.setState({ online, seats: [seat('human', 'local', 'yellow'), seat('human', 'online', 'blue')] })
    expect(store().game!.current).toBe(1)
    expect(viewer()).toBe(0)
    expect(youOf(store())).toBe(0)
  })

  it('pass-and-play between several people there is no single "You"', () => {
    yellowPlaysTA(false)
    expect(youOf(store())).toBeNull()
  })
})

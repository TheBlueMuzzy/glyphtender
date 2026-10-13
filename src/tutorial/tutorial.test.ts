// The tutorial shell (F74): who gets the tutorial game, what it deals, and how it unlocks.
import { beforeEach, describe, expect, it } from 'vitest'
import rails from '../../content/tutorial/rails.json'
import { useGameStore } from '../store/gameStore'
import { markTutorialDone, tutorialDoneOn, useTutorial } from './progress'
import { leaveTutorial, showUnlockedToast, startTutorialGame } from './start'

const memory = (entries: Record<string, string> = {}) => {
  const items = new Map(Object.entries(entries))
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) }
}

describe('who has had the tutorial', () => {
  it('a brand-new device has not', () => expect(tutorialDoneOn(memory())).toBe(false))
  it('a device that played before the tutorial existed counts as done (D95)', () =>
    expect(tutorialDoneOn(memory({ 'glyphtender:new-game': '{}' }))).toBe(true))
  it('finishing or leaving is remembered', () => {
    const storage = memory()
    markTutorialDone(storage)
    expect(tutorialDoneOn(storage)).toBe(true)
  })
  it('no storage at all: not done (the tutorial is offered again)', () => expect(tutorialDoneOn(null)).toBe(false))
})

describe('the tutorial game', () => {
  beforeEach(() => {
    useGameStore.getState().leaveGame()
    useTutorial.setState({ done: false, active: false, justUnlocked: false })
  })

  it('deals you (first) against Sprout at Seedling, on the rails setup', () => {
    startTutorialGame()
    const s = useGameStore.getState()
    expect(useTutorial.getState().active).toBe(true)
    expect(s.game?.config.boardName).toBe(rails.boardName)
    expect(s.game?.current).toBe(rails.you)
    expect(s.seats[rails.you].kind).not.toBe('bot')
    expect(s.seats[rails.ai.seat]).toMatchObject({ kind: 'bot', ai: { personality: 'sprout', skill: 'seedling' } })
    expect(s.options?.hideSeeds).toBe(false)
  })

  it('Leave tutorial unlocks everything and ends the game', () => {
    startTutorialGame()
    leaveTutorial()
    expect(useTutorial.getState()).toMatchObject({ done: true, active: false })
    expect(useGameStore.getState().game).toBeNull()
  })

  it('the game ending unlocks everything; the end screen toast shows once', () => {
    startTutorialGame()
    const game = useGameStore.getState().game!
    useGameStore.setState({ game: { ...game, phase: 'over' } })
    expect(useTutorial.getState()).toMatchObject({ done: true, justUnlocked: true })
    showUnlockedToast()
    expect(useTutorial.getState().justUnlocked).toBe(false)
  })
})

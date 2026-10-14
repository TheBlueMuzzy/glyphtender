// STARTING, LEAVING AND REPLAYING THE TUTORIAL GAME (F74, design/tutorial.md §0–1).
// The tutorial game is a normal game (D93): you (Yellow, first) against Sprout, the hidden tutorial AI, on the fixed
// setup in content/tutorial/rails.json. It never touches New Game's remembered choices.
import rails from '../../content/tutorial/rails.json'
import text from '../../content/text/en.json'
import { useGameStore } from '../store/gameStore'
import { askConfirm, screens, toast } from '../ui/kit'
import { closeAllScreens, leaveToMenu } from '../ui/newGame'
import { markTutorialDone, setTutorialActive, useTutorial } from './progress'

/** Main menu → Play on a brand-new device (and Settings → Replay tutorial game): the overview cards first. */
export const openTutorial = () => screens.push('tutorialOverview')

/** The overview's last card (or Skip): deal the tutorial game. */
export function startTutorialGame() {
  closeAllScreens()
  setTutorialActive(true)
  useGameStore.getState().startGame({
    players: 2, boardName: rails.boardName, seed: rails.seed, turnOrder: rails.turnOrder,
    minWordLength: rails.minWordLength, hideSeeds: false, wordIndicators: true,
    extraWords: { british: false, vulgar: false }, stack: rails.stack,
    bots: [rails.ai.seat], ai: { [rails.ai.seat]: { personality: rails.ai.personality, skill: rails.ai.skill } },
  })
}

/** Pause → Leave tutorial (after its confirm): everything unlocks, back to the main menu. */
export function leaveTutorial() {
  markTutorialDone()
  setTutorialActive(false)
  leaveToMenu()
}

/** Settings → Replay tutorial game. Only one game at a time: mid-game, it asks before leaving that game. */
export function replayTutorial() {
  const w = text.tutorial.replay
  const go = () => {
    setTutorialActive(false)
    leaveToMenu()
    openTutorial()
  }
  if (useGameStore.getState().game) askConfirm({ title: w.title, message: w.message, onConfirm: go, words: { yes: w.yes } })
  else go()
}

// The tutorial game ends (win or lose): unlocked at once; the "Everything's unlocked!" toast waits for the end screen
// (showUnlockedToast), so it never talks over the Magic reveal. Leaving the game clears `active`.
useGameStore.subscribe((s, before) => {
  if (!useTutorial.getState().active) return
  if (s.game === null && before.game !== null) return setTutorialActive(false)
  if (s.game?.phase === 'over' && before.game?.phase !== 'over') {
    if (!useTutorial.getState().done) useTutorial.setState({ justUnlocked: true })
    markTutorialDone()
  }
})

/** The end screen opened: if the tutorial game just unlocked everything, say so (once). */
export function showUnlockedToast() {
  if (!useTutorial.getState().justUnlocked) return
  useTutorial.setState({ justUnlocked: false })
  toast(text.tutorial.unlocked)
}

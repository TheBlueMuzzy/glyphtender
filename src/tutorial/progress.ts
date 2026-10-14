// THE TUTORIAL GAME — has this device had it yet, and is it being played right now? (F74, design/tutorial.md §0)
// A brand-new device: Play → the 3 overview cards → the tutorial game (you vs Sprout); Play online is locked
// ("Finish your first game to unlock this") and New Game can't be reached. Finishing the tutorial game (win or lose)
// or leaving it (Pause → Leave tutorial) unlocks everything for good. Settings → Replay tutorial game plays it again.
// A device that has started a game before (it remembers New Game's choices — glyphtender:new-game) counts as done,
// so players from before the tutorial never see a lock (D95).
import { create } from 'zustand'
import tutorialTuning from '../../content/tuning/tutorial.json'
import { setAiPauseScale } from '../store/localBot'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const DONE_KEY = 'glyphtender:tutorial'
const PLAYED_BEFORE_KEY = 'glyphtender:new-game' // src/ui/newGame.ts SAVE_KEY

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** DEV ONLY: the e2e checks (navigator.webdriver) start as a returning device, so their Play → New Game paths still
 *  work; `?tutorial=fresh` in the address makes a check (e2e/tutorial-shell.mjs) start as a brand-new device. */
const e2eSkips = () => import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.webdriver
  && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tutorial') === 'fresh')

/** Has this device had the tutorial game (finished or left it), or played before it existed? */
export function tutorialDoneOn(storage: Storage | null): boolean {
  try {
    if (!storage) return false
    return storage.getItem(DONE_KEY) === 'done' || storage.getItem(PLAYED_BEFORE_KEY) !== null
  } catch {
    return false
  }
}

interface Tutorial {
  /** Everything unlocked: the tutorial game was finished or left (or this device played before it existed). */
  done: boolean
  /** The game being played right now is the tutorial game. */
  active: boolean
  /** The tutorial game just finished for the first time: the end screen says "Everything's unlocked!" (start.ts). */
  justUnlocked: boolean
  /** A rails callout is up: it takes the prompt's place (PromptLine hides its words, keeping their room). */
  calloutUp: boolean
}

export const useTutorial = create<Tutorial>()(() => ({ done: e2eSkips() || tutorialDoneOn(browserStorage()), active: false, justUnlocked: false, calloutUp: false }))

/** Finished or left: unlocked for good on this device (if the browser won't store it, just for this visit). */
export function markTutorialDone(storage: Storage | null = browserStorage()) {
  try {
    storage?.setItem(DONE_KEY, 'done')
  } catch {
    // not remembered — still unlocked until the page is closed
  }
  useTutorial.setState({ done: true })
}

export function setTutorialActive(active: boolean) {
  useTutorial.setState({ active })
  setAiPauseScale(active ? tutorialTuning.sproutSlowdown : 1) // (Sprout takes its time — Muzzy, 2026-10-13: "half the speed")
}

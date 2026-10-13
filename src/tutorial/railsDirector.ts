// THE RAILS' DIRECTOR (F76) — runs the tutorial game's scripted opening (railsSteps.ts) while the game screen is up.
// Whenever the game or the turn being planned changes it works out the current step and, at once (before anything
// else can act on the change), sets that step's limit + hold (store/railsLimit.ts) and keeps Sprout on its script
// (store/localBot.ts setBotScript → rails.ts railsAction). TutorialLayer.tsx shows the step's one callout; its button
// calls ackRailsStep. When no step matches any more (after the hand-over, or a game that has left the script), the
// rails are over for this game: limit off, hold off, no script — normal play vs Sprout.
import { create } from 'zustand'
import { useGameStore } from '../store/gameStore'
import { setBotScript } from '../store/localBot'
import { setRails } from '../store/railsLimit'
import { rails, railsAction } from './rails'
import { currentRailsStep, type RailsStepDef } from './railsSteps'

interface Director {
  /** The step the rails are on (null = none: not started, or over). */
  step: RailsStepDef | null
}
export const useRailsDirector = create<Director>()(() => ({ step: null }))

let seen = new Set<string>()
let over = false
let forGame: object | null = null // (a new game starts the rails afresh)
let update = () => {}

/** Sprout's script: on the rails, the exact action rails.json gives it now (null = think as usual). */
function sproutScript(game: Parameters<typeof railsAction>[0], seat: number) {
  if (seat !== rails.ai.seat) return null
  try {
    return railsAction(game)
  } catch {
    return null // (a game that left the script: Sprout just plays)
  }
}

function end() {
  over = true
  setRails(null, false)
  setBotScript(null)
  if (useRailsDirector.getState().step) useRailsDirector.setState({ step: null })
}

/** Start directing the rails (TutorialLayer, while the tutorial game is on screen). Gives back "stop". */
export function startRails(): () => void {
  update = () => {
    const s = useGameStore.getState()
    const game = s.game
    if (!game) return
    if (game.config !== forGame) { // a new game (the tutorial game dealt again): the rails start over
      forGame = game.config
      seen = new Set()
      over = false
      setBotScript(sproutScript)
    }
    if (over) return
    const input = { game, move: s.move, cast: s.cast, setAside: s.setAside, seen }
    let step: RailsStepDef | null = null
    try {
      step = currentRailsStep(input)
    } catch (error) {
      console.warn('The tutorial rails lost their place — free play from here', error)
    }
    if (!step) return end()
    setRails(step.limit(input), !!step.button)
    if (useRailsDirector.getState().step !== step) useRailsDirector.setState({ step })
  }
  const unsubscribe = useGameStore.subscribe(() => update())
  update()
  return () => {
    unsubscribe()
    update = () => {}
    forGame = null
    setRails(null, false)
    setBotScript(null)
    useRailsDirector.setState({ step: null })
  }
}

/** The current pause's button was tapped ("Next", "Got it", "Play"): on to the next step. */
export function ackRailsStep(id: string) {
  seen.add(id)
  update()
}

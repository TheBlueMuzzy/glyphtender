// THE TUTORIAL LAYER (F76) — mounted on the game screen while the tutorial game is played (useTutorial.active).
// It runs the rails' director (railsDirector.ts) and shows the ONE callout of the current step (railsSteps.ts) with the
// kit's Callout. A callout waits for a quiet moment — never while a piece flies, a draft glyphling travels, the score
// plays or a refresh plays out (myTurn.ts isBusy) — and then content/tuning/tutorial.json railsCalloutDelay more (a
// glide settling). Board targets never get the kit's pulse ring or a dim: the board's own glow (the referee, via the
// rails limit) is the highlight. A board callout goes away from the live hex, else toward the nearer of the top bar /
// the tray, so it covers as few board rows as it can (sprint 26 notes).
import { useEffect, useState } from 'react'
import tutorialFile from '../../content/tuning/tutorial.json'
import { useLiveTuning } from '../devkit/tuning/liveTuning'
import { useGameStore } from '../store/gameStore'
import { isBusy } from '../store/myTurn'
import { useRails } from '../store/railsLimit'
import { hexKey, type Hex } from '../engine/hex'
import { Callout, type CalloutPlacement } from '../ui/kit'
import { ackRailsStep, startRails, useRailsDirector } from './railsDirector'
import { railsButton, railsText, type RailsStepDef } from './railsSteps'

/** Where a step's callout goes first: its own choice, else — for a board target — away from the live hex (the one
 *  glowing, when it isn't the target itself), else toward the nearer of the top bar and the tray (above a target in
 *  the board's top half, below one in its bottom half); else below (the tray, buttons). */
function placementOf(step: RailsStepDef, selector: string, live: Hex | null): CalloutPlacement {
  if (step.placement) return step.placement
  const el = document.querySelector(selector)
  const board = el?.closest('.game-garden')
  if (!el || !board) return 'bottom' // (the tray, the buttons: below them, so the prompt above never peeks out from behind it)
  const middle = (box: DOMRect) => (box.top + box.bottom) / 2
  const r = el.getBoundingClientRect()
  const liveEl = live && document.querySelector(`.game-garden > polygon[data-hex="${hexKey(live)}"]`)
  if (liveEl && !el.matches(`[data-hex="${hexKey(live)}"]`)) {
    const gap = middle(liveEl.getBoundingClientRect()) - middle(r)
    if (Math.abs(gap) > 1) return gap < 0 ? 'bottom' : 'top'
  }
  return middle(r) < middle(board.getBoundingClientRect()) ? 'top' : 'bottom'
}

export function TutorialLayer() {
  useEffect(() => startRails(), [])
  const step = useRailsDirector((s) => s.step)
  const busy = useGameStore(isBusy)
  const tuning = useLiveTuning('tutorial', tutorialFile)
  const game = useGameStore((s) => s.game)
  const move = useGameStore((s) => s.move)
  const cast = useGameStore((s) => s.cast)
  const setAside = useGameStore((s) => s.setAside)

  // The callout shows a moment after the step is up AND the game has gone quiet
  const [shown, setShown] = useState<{ id: string; placement: CalloutPlacement; target: string } | null>(null)
  const target = step?.target && game ? step.target({ game, move, cast, setAside, seen: new Set() }) : null
  useEffect(() => {
    if (!step || !target || busy) return
    const timer = setTimeout(() => setShown({ id: step.id, placement: placementOf(step, target, useRails.getState().limit?.to ?? null), target }), tuning.current.railsCalloutDelay * 1000)
    return () => {
      clearTimeout(timer)
      setShown(null) // (the step, its target or the quiet changed: the next callout waits its own moment)
    }
  }, [step, target, busy, tuning])

  if (!step || busy || !shown || shown.id !== step.id || shown.target !== target) return null
  const button = railsButton(step)
  const dim = step.button === 'gotIt' || step.button === 'play'
  return (
    <Callout key={step.id} target={target} text={railsText(step)} placement={shown.placement}
      action={button} onDismiss={button ? () => ackRailsStep(step.id) : undefined}
      dim={dim} dimAmount={tuning.current.railsDim} label="Tutorial" />
  )
}

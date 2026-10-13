// THE TUTORIAL LAYER (F76) — mounted on the game screen while the tutorial game is played (useTutorial.active).
// It runs the rails' director (railsDirector.ts) and shows the ONE callout of the current step (railsSteps.ts) with the
// kit's Callout. A callout waits for a quiet moment — never while a piece flies, a draft glyphling travels, the score
// plays or a refresh plays out (myTurn.ts isBusy) — and then content/tuning/tutorial.json railsCalloutDelay more (a
// glide settling). Board targets never get the kit's pulse ring or a dim: the board's own glow (the referee, via the
// rails limit) is the highlight. A board callout goes away from the live hex, else toward the nearer of the top bar /
// the tray, so it covers as few board rows as it can (sprint 26 notes; tipsPlace.ts). A wrong tap or drop shows the
// step's callout again (F78). The tips and nudges of free play are HelpLayer.tsx's.
import { useEffect, useState } from 'react'
import tutorialFile from '../../content/tuning/tutorial.json'
import { useLiveTuning } from '../devkit/tuning/liveTuning'
import { useGameStore } from '../store/gameStore'
import { isBusy } from '../store/myTurn'
import { useRails } from '../store/railsLimit'
import type { Hex } from '../engine/hex'
import { useWrongDrop } from '../store/wrongDrop'
import { Callout, type CalloutPlacement } from '../ui/kit'
import { ackRailsStep, startRails, useRailsDirector } from './railsDirector'
import { useTutorial } from './progress'
import { useExplore } from '../store/explore'
import { railsButton, railsText, type RailsStepDef } from './railsSteps'
import { calloutPlacement } from './tipsPlace'

/** Where a step's callout goes first: its own choice, else the tutorial's one rule (tipsPlace.ts). */
function placementOf(step: RailsStepDef, selector: string, live: Hex | null): CalloutPlacement {
  return step.placement ?? calloutPlacement(selector, live)
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

  // A wrong tap or drop on the rails (the "no" shake, a piece sent home): the step's callout shows again — it pops
  // back in from its pointer (F78: on the rails, every time)
  const nopes = useGameStore((s) => s.nope?.count ?? 0)
  const drops = useWrongDrop((s) => s.last?.count ?? 0)
  const again = nopes + drops

  // (never while exploring: Explore's own callout is the one up, and its taps would swallow this one's button — review)
  const exploring = useExplore((e) => e.on)
  const up = !!step && !busy && !exploring && !!shown && shown.id === step.id && shown.target === target
  // The prompt steps aside for the WHOLE step — also while its callout waits for its moment, so the prompt never
  // flashes up first and then vanishes under the callout (Muzzy, 2026-10-13)
  const promptAside = !!step && !!target && !exploring
  useEffect(() => {
    useTutorial.setState({ calloutUp: promptAside })
    return () => useTutorial.setState({ calloutUp: false })
  }, [promptAside])
  if (!up) return null
  const button = railsButton(step)
  const dim = step.button === 'gotIt' || step.button === 'play'
  return (
    <Callout key={`${step.id}-${again}`} target={target} text={railsText(step)} placement={shown.placement}
      action={button} onDismiss={button ? () => ackRailsStep(step.id) : undefined}
      dim={dim} dimAmount={tuning.current.railsDim} label="Tutorial" />
  )
}

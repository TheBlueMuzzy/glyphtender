// The Pause tool's buttons (left of the DEV KIT title) and its badges — see pause.ts.
import { useEffect, useRef, useState } from 'react'
import { useDevKitGame } from '../devkitGame'
import { badgeSpot } from './badgeSpot'
import { canHalfPause, pauseBlocked, setDevPause, usePause, type PauseMode } from './pause'

const LABEL: Record<'full' | 'half', string> = { full: 'PAUSED', half: 'HALF-PAUSED' }

// Whether half pause is possible can change once the game starts reading rulesClock — checked once a second
function useHalfPossible() {
  const game = useDevKitGame()
  const [possible, setPossible] = useState(() => canHalfPause(game))
  useEffect(() => {
    const check = () => setPossible(canHalfPause(game))
    const timer = setInterval(check, 1000)
    return () => clearInterval(timer)
  }, [game])
  return possible
}

/** ⏸ Full pause · ◐ Half pause (only when the game can) — pressing the one that's on resumes. */
export function PauseButtons() {
  const game = useDevKitGame()
  const mode = usePause()
  const half = useHalfPossible()
  const blocked = pauseBlocked(game)
  const button = (which: 'full' | 'half', icon: string, name: string, help: string) => (
    <button type="button" className="devkit-pause-btn" aria-pressed={mode === which} aria-disabled={blocked ? true : undefined}
      aria-label={mode === which ? `Resume (${name.toLowerCase()} is on)` : name} data-pause={which}
      title={blocked || (mode === which ? 'Resume (P)' : `${name} — ${help} (P cycles)`)}
      onClick={() => { if (!blocked) setDevPause(mode === which ? null : which) }}>
      {icon}
    </button>
  )
  return (
    <span className="devkit-pause-btns">
      {button('full', '⏸', 'Full pause', 'everything freezes')}
      {half && button('half', '◐', 'Half pause', 'the rules stop, the looks keep moving')}
    </span>
  )
}

/** "PAUSED" / "HALF-PAUSED" on the panel's title row. */
export function PauseBadge({ mode }: { mode: PauseMode }) {
  if (!mode) return null
  return <span className="devkit-pause-tag" data-mode={mode} role="status">{LABEL[mode]}</span>
}

/** With the panel closed: a small badge stays on screen while paused; tapping it resumes.
 *  Where: content/devkit.json "pauseBadgeSpot" (badgeSpot.ts) — middle of the left edge unless the game says otherwise. */
export function PauseBadgeClosed({ panelOpen }: { panelOpen: boolean }) {
  const mode = usePause()
  const shown = !!mode && !panelOpen
  const ref = useRef<HTMLButtonElement>(null)
  // a popover, like the panel: above the game's own popovers (its toasts)
  useEffect(() => {
    const el = ref.current
    if (shown && el?.showPopover && !el.matches(':popover-open')) el.showPopover()
  }, [shown])
  if (!shown) return null
  return (
    <button ref={ref} {...{ popover: 'manual' }} type="button" className="devkit-pause-badge" data-mode={mode} data-spot={badgeSpot} onClick={() => setDevPause(null)}
      title="Tap to resume" aria-label={`${LABEL[mode]} — tap to resume`}>
      {mode === 'full' ? '⏸' : '◐'} {LABEL[mode]}
    </button>
  )
}

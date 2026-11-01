// THE PAUSE TOOL (0.18.0) — ⏸ Full pause and ◐ Half pause, from the Dev Kit's title row.
//   Full: everything freezes exactly as it is — the generic freeze (freeze.ts) + both clocks (gameClock.ts) + the
//         game's own pause('full') if its adapter has one.
//   Half: only the RULES clock stops; the LOOKS clock (pulses, glows, idle motion) keeps going. Needs the game: it
//         shows when the game reads rulesClock or its adapter lists 'half' in pauseModes.
// Online games (canPause(), else canRestore(), false) can't pause: the buttons grey out and say why.
// Closing the Dev Kit does NOT resume. While frozen, a live edit (Tuning, Moments…) redraws ONE frame with no time
// passing, so the edit shows on the frozen picture.
import { useSyncExternalStore } from 'react'
import { getDevKitGame, type DevKitGame } from '../devkitGame'
import { clockPause, onClockPause, rulesClockInUse, setClockPause, type PauseMode } from '../gameClock'
import { TUNING_EVENT } from '../tuning/liveTuning'
import { isFrozen, setFrozen, stepFrozenFrame } from './freeze'

export type { PauseMode }

/** Why the game can't be paused right now ('' = it can). */
export function pauseBlocked(game: DevKitGame | null): string {
  if (!game) return ''
  let ok = true
  try {
    ok = game.canPause ? game.canPause() : game.canRestore()
  } catch {
    ok = false
  }
  return ok ? '' : 'Pausing is off in an online game — it would stop the game for everyone.'
}

/** Can this game half-pause (stop the rules, keep the looks)? */
export function canHalfPause(game: DevKitGame | null): boolean {
  return rulesClockInUse() || !!game?.pauseModes?.includes('half')
}

/** Pause ('full' / 'half') or resume (null). Switching between the two goes straight across. */
export function setDevPause(next: PauseMode) {
  const was = clockPause()
  if (next === was) return
  const game = getDevKitGame()
  if (next && pauseBlocked(game)) return
  if (next === 'half' && !canHalfPause(game)) return
  try {
    game?.pause?.(next)
  } catch (e) {
    console.warn('[devkit] the game\'s pause() failed:', e)
  }
  setClockPause(next)
  setFrozen(next === 'full')
}

/** P in the panel: off → full → half → off (half skipped when the game can't). */
export function cyclePause() {
  const game = getDevKitGame()
  const now = clockPause()
  const order: PauseMode[] = canHalfPause(game) ? [null, 'full', 'half'] : [null, 'full']
  setDevPause(order[(order.indexOf(now) + 1) % order.length])
}

export const usePause = (): PauseMode => useSyncExternalStore(onClockPause, clockPause)

// A live edit while frozen: draw one frame so it shows (after the game's own listeners have taken the new values)
if (typeof window !== 'undefined') {
  window.addEventListener(TUNING_EVENT, () => { if (isFrozen()) queueMicrotask(stepFrozenFrame) })
}

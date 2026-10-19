// What `npm run check:framework` (check-framework.mjs, conformance.mjs) reads in the page: window.__devkit, set when
// the Dev Kit mounts. Read-only for the game — it's how a check reaches the registered adapter, the Pause buttons and
// the two clocks without knowing anything about the game.
import { getDevKitGame } from './devkitGame'
import { clockPause, clockTimes, type PauseMode } from './gameClock'
import { canHalfPause, pauseBlocked, setDevPause } from './pause/pause'

export type DevKitCheckHandle = {
  game: typeof getDevKitGame
  pause: (mode: PauseMode) => void
  paused: () => PauseMode
  canHalf: () => boolean
  pauseBlocked: () => string
  clocks: typeof clockTimes
}

export function exposeForChecks() {
  const handle: DevKitCheckHandle = {
    game: getDevKitGame,
    pause: setDevPause,
    paused: clockPause,
    canHalf: () => canHalfPause(getDevKitGame()),
    pauseBlocked: () => pauseBlocked(getDevKitGame()),
    clocks: clockTimes,
  }
  ;(window as unknown as { __devkit: DevKitCheckHandle }).__devkit = handle
}

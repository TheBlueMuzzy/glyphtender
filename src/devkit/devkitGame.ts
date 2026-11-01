// HOW A GAME PLUGS INTO THE DEV KIT — for the tools that need the game itself (Snapshots, Bug capture).
// The Dev Kit never imports game code. Instead the game hands it a small adapter, once, from
// src/devkit-game/tabs.ts (that file only loads with the Dev Kit, so the adapter never ships at 1.0):
//
//   import { registerDevKitGame } from '../devkit/devkitGame'
//   registerDevKitGame({
//     name: 'Glyphtender',
//     version: versionLabel,                  // "v0.1.0.12" — from the version module (src/version)
//     getState: () => ({ ... }),              // this exact moment, as plain JSON data
//     setState: (state) => { ... },           // put the game back to a getState() moment
//     canRestore: () => !isOnlineGame,        // false in online games: restoring would change play for others
//     onEvent: (send) => store.subscribe(...) // optional: call send('Blue moved', {...}) as things happen;
//   })                                        //   return the function that stops listening
import { useSyncExternalStore } from 'react'

/** The game's side of the Dev Kit. Keep getState's result JSON-safe: no functions, Maps, Sets or classes. */
export interface DevKitGame {
  /** Shown in snapshots and bug captures, e.g. "Glyphtender". */
  name: string
  /** The game's version, "vX.Y.Z.B" (the version module's versionLabel — the same words as the main menu and Settings),
   *  stamped as given on every snapshot and bug capture. An older "0.1.0.12" still works (shown as v0.1.0.12). */
  version: string
  /** This exact moment of the game, as plain JSON data. */
  getState: () => unknown
  /** Put the game back to a moment getState() gave (maybe from an older build — check it if that can break). */
  setState: (state: unknown) => void
  /** May the Dev Kit restore right now? Must be false in online games (DEVKIT.md: tools that affect play are offline-only). */
  canRestore: () => boolean
  /** Optional: game events for the bug-capture log. Call `send` with a short line as things happen; return "stop listening". */
  onEvent?: (send: (text: string, data?: unknown) => void) => () => void
  /** Optional: one line about a moment, e.g. "turn 12 · Blue to move" — shown next to snapshots and marks. */
  describe?: (state: unknown) => string
  /**
   * Optional (0.18.0): the Pause buttons. The Dev Kit already freezes any game for ⏸ Full pause (frames, animations,
   * sound) and stops gameClock's rulesClock for both. pause() is for machinery the clocks don't reach (a physics
   * engine, an AI worker, a server tick): 'full' = stop everything, 'half' = stop the rules only, null = go on.
   */
  pause?: (mode: 'full' | 'half' | null) => void
  /** Optional: the pauses this game supports. ◐ Half pause shows when this lists 'half' or the game reads rulesClock. */
  pauseModes?: ('full' | 'half')[]
  /** Optional: may the Dev Kit pause right now? Left out = canRestore() (an online game can't stop for everyone). */
  canPause?: () => boolean
  /**
   * Optional (0.19.0): what `npm run check:framework` needs to test the game's promises in a real browser
   * (src/devkit/check-framework.mjs). Without it, the checks that need live play say exactly what to add here.
   */
  conformance?: DevKitConformance
}

/** The game's help for the framework checks. Runs in the page. */
export interface DevKitConformance {
  /** From the page as it first loads (a menu, a title screen) to live play — e.g. click Start and wait until the
   *  first piece falls. Resolve once play is running. */
  startPlay: () => void | Promise<void>
  /** Optional: the address query the checks open the game with — e.g. '?seed=7' for a fixed, replayable game. */
  query?: string
}

let current: DevKitGame | null = null
const listeners = new Set<() => void>()

/** The game calls this once (from src/devkit-game/tabs.ts). Calling it again replaces the adapter; null unplugs it. */
export function registerDevKitGame(game: DevKitGame | null) {
  current = game
  for (const listener of listeners) listener()
}

/** The registered game, or null if the game hasn't plugged in. */
export function getDevKitGame(): DevKitGame | null {
  return current
}

/** For Dev Kit tabs: the registered game, re-rendering if it registers (or changes) later. */
export function useDevKitGame(): DevKitGame | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    getDevKitGame,
  )
}

/** One line about a moment: the game's own describe(), or nothing. Never throws. */
export function describeMoment(game: DevKitGame, state: unknown): string {
  try {
    return game.describe?.(state) ?? ''
  } catch {
    return ''
  }
}

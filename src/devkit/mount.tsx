// Starts the Dev Kit. main.tsx imports this in dev, and in release builds while content/devkit.json "inReleaseBuilds" is true:
//   if (import.meta.env.DEV || __DEVKIT_IN_RELEASE__) import('./devkit/mount').then((m) => m.mountDevKit())
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { exposeForChecks } from './checkHandle'
import { DevKit } from './DevKit'
import { installFreeze } from './pause/freeze'

/** Adds the Dev Kit next to the game, outside #root (so colour-blind previews of the game don't filter it). */
export function mountDevKit() {
  installFreeze() // ⏸ Full pause can hold the game's frames from now on (pause/freeze.ts)
  exposeForChecks() // window.__devkit — how npm run check:framework reaches the adapter, pause and clocks
  const host = document.createElement('div')
  host.id = 'devkit-root'
  document.body.appendChild(host)
  createRoot(host).render(
    <StrictMode>
      <DevKit />
    </StrictMode>,
  )
  keepKeysInside(host)
  console.info('[devkit] Dev Kit ready — press ` (or triple-tap the top-right corner) to open')
}

/** Keys pressed inside the Dev Kit (typing in its search box, its sliders and boxes) stay in the Dev Kit: the game's
 *  own hotkeys never see them (0.17.1 — Goops: typing "curve" in Search swapped the piece on R and rotated on E, and the
 *  game's preventDefault kept those letters out of the box). Added on the host AFTER React's own listener there, so the
 *  panel's React handlers still run; the Dev Kit's ` / Esc listener is on window in the capture phase, so it runs first. */
export function keepKeysInside(host: HTMLElement) {
  for (const type of ['keydown', 'keyup', 'keypress'] as const) host.addEventListener(type, (e) => e.stopPropagation())
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { applyStyle, applyAccessibility, loadSettings } from './ui/kit'
import style from '../content/ui/style.json'
import { settings } from './ui/gameSettings'
import { startFullscreen } from './ui/fullscreen'
import { freezeScreen, frozen } from './game/freeze'
import { startSound } from './game/sound'
import { startWordOutbox } from './ui/online/wordOutbox'
import { setPaceClock } from './ai/kit/pace'
import { rulesClock } from './devkit/gameClock'

// Bots wait on the rules clock, so a pause (Dev Kit ◐ / ⏸) holds a bot mid-think (AI 0.2.0)
setPaceClock(rulesClock)

// Dev only: ?freeze holds the screen still for the before / after screenshots (src/game/freeze.ts)
if (frozen) freezeScreen()

applyStyle(style) // content/ui/style.json → the UI kit's look (Cozy, night colours)
applyAccessibility(loadSettings(settings)) // text size + reduce motion before any screen opens

// Dev Kit → Screens: this page is a PREVIEW sandbox inside the Dev Kit (dev only — never in a release build).
// It shows one screen with sample data (src/devkit-game/previews.tsx); saves, sends and history are blocked.
if (import.meta.env.DEV && location.search.includes('devkit-preview=')) {
  import('./devkit/previews/frame').then((m) => m.startPreviewFrame({ app: <App />, root: document.getElementById('root')! }))
} else {
  startGame()
}

function startGame() {
  // Offline cache: when a new release is out it downloads in the background and the page swaps
  // to it straight away — returning players never see an old version (Roll Better B020).
  registerSW({ immediate: true })

  // Sound (src/game/sound.ts): made now, starts on the first tap; Settings → Audio sets the volumes
  startSound(loadSettings(settings))

  // Full screen: phones go full screen on a tap (Settings → Display → Full screen); src/ui/fullscreen.ts
  startFullscreen(() => loadSettings(settings))

  // Pause → Submit a word: words that couldn't be sent last time (offline) go now, and when the phone is back online
  startWordOutbox()

  // Dev Kit (` key or triple-tap) — always in local dev; in release builds only while content/devkit.json
  // "inReleaseBuilds" is true (until 1.0). When both are false this import is dead code and never ships.
  // A release build loads it only once the first screen is up and the phone is idle (F66: it was 46 KB of the
  // first screen's download and built its whole hidden panel before Play showed). Local dev: at once (e2e opens it early).
  if (import.meta.env.DEV) {
    import('./devkit/mount').then((m) => m.mountDevKit())
  } else if (__DEVKIT_IN_RELEASE__) {
    const mount = () => import('./devkit/mount').then((m) => m.mountDevKit())
    const whenIdle = () => ('requestIdleCallback' in window ? requestIdleCallback(mount, { timeout: 3000 }) : setTimeout(mount, 1000))
    if (document.readyState === 'complete') whenIdle()
    else addEventListener('load', whenIdle, { once: true })
  }

  // Dev only: window.__glyphtender for the e2e check and the console (src/game/devHook.ts)
  if (import.meta.env.DEV) import('./game/devHook').then((m) => m.installDevHook())

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

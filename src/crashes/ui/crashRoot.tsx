// REACT'S ERRORS — hand them to the crash catcher, and show "Something broke" instead of a blank page. In main.tsx:
//   createRoot(document.getElementById('root')!, crashRootOptions()).render(<App />)
// (React 19's root options.) An error an error boundary caught is reported and the game carries on; an error nobody
// caught makes React clear the whole page, so the crash screen goes up in its own place on top.
import type { ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import { reportError } from '../capture'
import { CrashScreen, type CrashScreenProps } from './CrashScreen'

export function crashRootOptions(screen: Omit<CrashScreenProps, 'reported'> = {}) {
  return {
    onUncaughtError(error: unknown, info: ErrorInfo) {
      console.error(error, info.componentStack) // the console still shows it, as React would
      const reported = reportError(error, { kind: 'react' })
      showCrashScreen({ ...screen, reported })
    },
    onCaughtError(error: unknown, info: ErrorInfo) {
      console.error(error, info.componentStack)
      reportError(error, { kind: 'react' })
    },
  }
}

let shown = false

/** Put the crash screen up (once) in a fresh spot on the page — the game's own root is gone by now. */
export function showCrashScreen(props: CrashScreenProps = {}) {
  if (shown) return
  shown = true
  try {
    const place = document.createElement('div')
    place.dataset.crashScreen = ''
    document.body.append(place)
    createRoot(place).render(<CrashScreen {...props} />)
  } catch {
    // the crash screen itself couldn't be drawn — nothing more to do
  }
}

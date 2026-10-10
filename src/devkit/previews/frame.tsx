// THE PREVIEW FRAME — the page inside the Screens tab's overlay. It's the game's own page loaded again with
// ?devkit-preview=<id>, so it gets its own copy of every store and screen. main.tsx sends it here instead of
// starting the game (dev only):
//
//   if (import.meta.env.DEV && location.search.includes('devkit-preview=')) {
//     import('./devkit/previews/frame').then((m) => m.startPreviewFrame({ app: <App />, root: document.getElementById('root')! }))
//   } else { …the normal start: service worker, Dev Kit, render <App /> }
//
// Order: sandbox first (sandbox.ts), then the preview's show() fills the frame's stores, then it draws.
// It tells the overlay how it went (ready / a problem / what the sandbox blocked) with postMessage.
// The overlay tells it: play a Moment (moments/momentTypes.ts — sound is let through from then on), and every
// Dev Kit live edit (devkit:tuning), so the frame's copy of the game follows the sliders too.
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { sendTuning } from '../tuning/liveTuning'
import { loadGameMoments, loadGamePreviews } from './gamePreviews'
import { readPreviewUrl, type PreviewSandbox } from './previewTypes'
import { allowSound, failRequests, installSandbox, sandboxCounts, type SandboxCounts } from './sandbox'

/** What the frame tells the overlay. */
export type FrameMessage =
  | { source: 'devkit-preview'; kind: 'ready' }
  | { source: 'devkit-preview'; kind: 'problem'; text: string }
  | { source: 'devkit-preview'; kind: 'counts'; counts: SandboxCounts }
  | { source: 'devkit-preview'; kind: 'moment-done'; ticket: number; problem?: string }

/** What the overlay tells the frame. */
export type OverlayMessage =
  | { source: 'devkit-overlay'; kind: 'moment'; id: string; round: number; looping: boolean; ticket: number }
  | { source: 'devkit-overlay'; kind: 'tuning'; file: string; data: unknown }

/** For tests and the e2e: window.__devkitPreview in the frame. */
export interface FrameStatus {
  id: string
  variant: string | undefined
  ready: boolean
  problems: string[]
  counts: SandboxCounts
  /** How many times a Moment has played in this frame. */
  played: number
}

function tell(message: FrameMessage) {
  if (window.parent !== window) window.parent.postMessage(message, window.location.origin)
}

export async function startPreviewFrame({ app, root }: { app: ReactNode; root: HTMLElement }) {
  const asked = readPreviewUrl(window.location.href)
  const status: FrameStatus = { id: asked?.id ?? '', variant: asked?.variant, ready: false, problems: [], counts: sandboxCounts, played: 0 }
  ;(window as unknown as { __devkitPreview: FrameStatus }).__devkitPreview = status
  installSandbox(window as Window & typeof globalThis, () => tell({ source: 'devkit-preview', kind: 'counts', counts: { ...sandboxCounts } }))

  const problem = (text: string) => {
    status.problems.push(text)
    tell({ source: 'devkit-preview', kind: 'problem', text })
  }
  // (a ResizeObserver "loop" note is the browser being chatty, not an error in the game)
  window.addEventListener('error', (e) => { if (!/ResizeObserver loop/.test(e.message)) problem(e.message) })
  window.addEventListener('unhandledrejection', (e) => problem(String((e.reason as Error)?.message ?? e.reason)))

  // Moments wait until the screen is up; live edits apply at once (liveTuning keeps them for code that starts later)
  let started = () => {}
  const up = new Promise<void>((done) => { started = done })
  async function playMoment(id: string, round: number, looping: boolean, ticket: number) {
    await up
    try {
      const moment = (await loadGameMoments()).find((m) => m.id === id)
      if (!moment) throw new Error(`no moment called "${id}" in src/devkit-game/previews.tsx`)
      allowSound() // you asked to hear it
      await moment.play({ round, looping, variant: status.variant })
      status.played++
      tell({ source: 'devkit-preview', kind: 'moment-done', ticket })
    } catch (e) {
      const text = `moment "${id}": ${(e as Error)?.message ?? String(e)}`
      problem(text)
      tell({ source: 'devkit-preview', kind: 'moment-done', ticket, problem: text })
    }
  }
  window.addEventListener('message', (e: MessageEvent<OverlayMessage>) => {
    if (e.source !== window.parent || e.data?.source !== 'devkit-overlay') return
    if (e.data.kind === 'tuning') sendTuning(e.data.file, e.data.data)
    if (e.data.kind === 'moment') void playMoment(e.data.id, e.data.round, e.data.looping, e.data.ticket)
  })

  try {
    const preview = (await loadGamePreviews()).find((p) => p.id === asked?.id)
    if (!preview) throw new Error(`no preview called "${asked?.id}" in src/devkit-game/previews.tsx`)
    const variant = asked?.variant ?? preview.variants?.[0]?.id
    status.variant = variant
    const after: (() => void)[] = []
    const sandbox: PreviewSandbox = { variant, failRequests, afterRender: (run) => after.push(run) }
    const tree = await preview.show(sandbox)
    createRoot(root).render(<StrictMode>{tree ?? app}</StrictMode>)
    // Two frames: React has drawn and the browser has laid it out
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    for (const run of after) run()
    status.ready = true
    started()
    tell({ source: 'devkit-preview', kind: 'ready' })
  } catch (e) {
    const text = (e as Error)?.message ?? String(e)
    root.textContent = `This preview couldn't start: ${text}`
    problem(text)
  }
}

// LIVE TUNING — how the GAME hears Dev Kit slider changes while it runs. Safe in every build.
// The game reads its own tuning files as usual (import physics from '../content/tuning/physics.json') and wraps
// them here; the Dev Kit's Tuning tab then sends each edit as a plain browser event. This file never imports the
// Dev Kit, so the game can import it even in a release build with the Dev Kit off — then nothing sends the event,
// and the values are simply the file's.
//
//   Anywhere (plain modules, store code):
//     import physicsFile from '../../content/tuning/physics.json'
//     import { liveTuning } from '../devkit/tuning/liveTuning'
//     const physics = liveTuning('physics', physicsFile)     // 'physics' = the file name, without .json
//     ... physics.current.maxReleaseSpeed                   // read .current at the moment you need the value
//
//   Inside a React component (e.g. an R3F one):
//     const physics = useLiveTuning('physics', physicsFile)
//     useFrame(() => { ... physics.current.maxReleaseSpeed ... })
//   It's a ref, not state: a slider change never re-renders the game (R3F rule — per-frame code reads refs).
//   Copy .current into a variable once at the top of a function, not at the top of the file, or you keep the old value.
import { useEffect, useRef } from 'react'

/** The browser event the Dev Kit sends: detail = { file: 'physics', data: { ...the whole edited file } } */
export const TUNING_EVENT = 'devkit:tuning'

type TuningDetail = { file: string; data: unknown }

// The Dev Kit's latest edit of each file — so code that starts later (a die made next round) gets it too
const latest = new Map<string, unknown>()
const latestOr = <T>(file: string, initial: T) => (latest.has(file) ? (latest.get(file) as T) : initial)
// The event itself is the edit, whoever sends it (sendTuning, a test, an e2e script): remember it first, so live files
// (liveFile) and every listener after this one see the same values
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(TUNING_EVENT, (e) => {
    const detail = (e as CustomEvent<TuningDetail>).detail
    if (typeof detail?.file === 'string') latest.set(detail.file, detail.data)
  })
}

/** Call `onChange` with the new data every time the Dev Kit edits this file. Returns a function that stops listening. */
export function onTuning<T>(file: string, onChange: (data: T) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<TuningDetail>).detail
    if (detail?.file === file) onChange(detail.data as T)
  }
  window.addEventListener(TUNING_EVENT, listener)
  return () => window.removeEventListener(TUNING_EVENT, listener)
}

/** Every file's latest Dev Kit edit so far, as [file, data] (a Screens preview frame gets these when it starts). */
export const latestTuning = (): [string, unknown][] => [...latest]

/** The Dev Kit calls this on every edit (games normally don't). */
export function sendTuning(file: string, data: unknown) {
  latest.set(file, data)
  window.dispatchEvent(new CustomEvent<TuningDetail>(TUNING_EVENT, { detail: { file, data } }))
}

/** A box holding the file's values; .current follows the Dev Kit's edits. For plain (non-React) code. */
// (With the Vite plugin, every content/tuning import is already live — see liveFile below. liveTuning stays for files
// elsewhere, special cases, and code that wants to know WHEN an edit arrives: box.current changes identity then.)
export function liveTuning<T>(file: string, initial: T): { readonly current: T } {
  const box = { current: latestOr(file, initial) }
  onTuning<T>(file, (data) => { box.current = data })
  return box
}

/**
 * LIVE BY DEFAULT (0.18.0): the Dev Kit's Vite plugin turns every `import x from '…/content/tuning/<name>.json'` in the
 * game into `liveFile('<name>', <the file>)`, so the game needs no wrapping at all. The object it hands back reads the
 * Dev Kit's latest edit of the file on EVERY property access (falling back to the file), so `tank.cameraSpeed` read in a
 * frame loop follows the slider. Nested objects come from the current data at the moment of access, so
 * `const R = hud.readout` inside a function is live too.
 * What it can't follow: values COPIED once — `const speed = tank.cameraSpeed` at the top of a file, `{ ...file }` in a
 * constructor. Read where the value is used (liveGuard.ts finds the top-of-file copies).
 * Costs a getter call + one Map lookup per top-level read; hot loops (thousands of reads a frame) copy the object once per frame.
 * Arrays and plain values are returned as they are (not live).
 */
export function liveFile<T>(file: string, data: T): T {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data
  const now = () => (latest.has(file) ? latest.get(file) : data) as Record<string, unknown>
  // One getter per top-level key (not a Proxy: a getter object still works with structuredClone, postMessage to a
  // worker, spread and JSON.stringify — a Proxy throws in the first two). Edits change values, never the keys.
  const live = {} as Record<string, unknown>
  for (const key of Object.keys(data)) {
    Object.defineProperty(live, key, {
      enumerable: true,
      configurable: true,
      get: () => now()[key],
      set: (value) => { now()[key] = value }, // (code that tweaks its tuning in place keeps working)
    })
  }
  return live as T
}

/** Same as liveTuning, for React components: a ref that follows the Dev Kit's edits, without re-rendering. */
export function useLiveTuning<T>(file: string, initial: T): { readonly current: T } {
  const ref = useRef(latestOr(file, initial))
  useEffect(() => {
    ref.current = latestOr(file, initial)
    return onTuning<T>(file, (data) => { ref.current = data })
  }, [file, initial]) // initial = the imported file, which never changes
  return ref
}

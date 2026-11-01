// CATCHING THE GAME'S ERRORS — the game's side of crash reports (design: .planning/design/crashes.md
// "What the game catches" + "On the device"). Once, in main.tsx, before the game starts:
//   import crashesJson from '../content/crashes.json'
//   startCrashes({ config: readCrashesConfig(crashesJson), version: appVersion })   // appVersion: the version module
//   applyCrashSetting(settings)                                                       // the Settings switch (settingsRow.ts)
// Then, where the game knows something:  watchCanvas(gl.domElement) · moment('roundStart', 3) · reportError(e, { kind: 'game' })
//
// What it does:
// - Catches script errors, promises that failed with nobody listening, files that didn't load (images, scripts,
//   sounds), the 3D canvas being dropped (watchCanvas), React errors (ui/crashRoot.tsx) and the game's own reports.
// - Each KIND of error (one fingerprint, fingerprint.ts) is sent once per session; at most perSession kinds
//   (content/crashes.json, 5) are sent; after that they're only counted. Repeats are counted and sent when the page hides.
// - Sends nothing in a dev build (unless sendInDev), when url is "", or when the player switched it off (setOn(false)).
// - Offline: up to 10 reports wait in memory and go when the page hides or the connection comes back.
// - It never throws, never retries in a loop, and never reports its own sending troubles (no feedback loop).
import type { CrashesConfig } from './config'
import { browserName, gpuName, languageOnly, osName, screenText } from './device'
import { cleanTitle, fingerprint, fingerprintText, withoutBuildHash } from './fingerprint'
import { MAX_MOMENT_AGE_S, MAX_MOMENT_NUMBER, MAX_MOMENTS, MAX_REPORT_BYTES, MOMENT_NAME, REPORT_FORMAT, type CrashReport, type Frame, type Moment, type ReportKind } from './report'
import { readStack, safeFile, sitePath } from './stack'

/** How a report leaves the device. address = the server + "/report", body = the report as JSON text,
 *  leaving = the page is hiding or closing. Throwing or a failed promise = not sent: it waits for the next try.
 *  The seam for later native builds (Electron, Capacitor) — and what the tests swap in. */
export type SendReport = (address: string, body: string, leaving: boolean) => unknown

export interface CrashOptions {
  /** readCrashesConfig(content/crashes.json) */
  config: CrashesConfig
  /** The game's version — the version module's appVersion ("0.3.1.12"). */
  version: string
  /** Where this build runs. Default 'web'. */
  platform?: CrashReport['platform']
  /** How reports are sent. Default: fetch with keepalive. */
  send?: SendReport
  /** Is this a dev build? Default import.meta.env.DEV. Dev builds send nothing unless config.client.sendInDev. */
  dev?: boolean
  /** The game's folder on its site ("/GOOPS/alpha/", or "./"). Default Vite's base, import.meta.env.BASE_URL. Files are
   *  named inside it (assets/index-Bx12.js) — how the maps are filed, and the same when the game moves folder. */
  base?: string
}

const MAX_HELD = 10 // unsent reports kept in memory (offline), oldest dropped first

// One kind of error seen this session. waiting = times it happened since it was last sent (sent when the page hides).
interface SeenKind { sent: boolean; report: CrashReport | null; waiting: number }
interface Remembered { at: number; name: string; n?: number[] }

// Everything one start of the crash catcher keeps. Only in this tab's memory — no id, nothing stored.
interface Running {
  options: CrashOptions
  on: boolean
  startedAt: number
  kinds: Map<string, SeenKind>
  sentCount: number
  held: string[]
  moments: Remembered[]
  canvases: HTMLCanvasElement[]
  gpu: string
  queue: Promise<void> // new reports waiting for their fingerprint, in order
  busy: boolean // true while the catcher itself is working or sending: an error now is ignored (no feedback loop)
  undo: (() => void)[] // removes every listener (stop)
}

let running: Running | null = null

const now = () => globalThis.performance?.now() ?? Date.now()
const origin = () => globalThis.location?.origin ?? ''
/** The game's folder as a path ("/GOOPS/alpha/"); "./" is read against the page, as the browser does. */
function basePath(): string {
  try {
    return new URL(running?.options.base ?? import.meta.env.BASE_URL ?? '/', globalThis.location?.href).pathname
  } catch {
    return '/'
  }
}

// --- the public functions ---------------------------------------------------------------------------------

/** Start catching. Call once at start-up; calling it again starts afresh. Returns stop(). */
export function startCrashes(options: CrashOptions): { stop: () => void } {
  stopCrashes()
  const run: Running = {
    options, on: true, startedAt: now(), kinds: new Map(), sentCount: 0, held: [], moments: [], canvases: [], gpu: '',
    queue: Promise.resolve(), busy: false, undo: [],
  }
  running = run
  const listen = (target: EventTarget | undefined, type: string, fn: (event: Event) => void, capture = false) => {
    if (!target) return
    target.addEventListener(type, fn, capture)
    run.undo.push(() => target.removeEventListener(type, fn, capture))
  }
  // capture: true — a file that didn't load doesn't bubble up to window, so only the capture phase sees it
  listen(globalThis.window, 'error', onWindowError, true)
  listen(globalThis.window, 'unhandledrejection', onRejection)
  listen(globalThis.window, 'pagehide', () => sendWaiting(true))
  listen(globalThis.document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') sendWaiting(true) })
  listen(globalThis.window, 'online', () => sendWaiting(false))
  return { stop: stopCrashes }
}

/** Stop catching: every listener is removed and nothing more is sent. */
export function stopCrashes() {
  if (!running) return
  for (const undo of running.undo) undo()
  running = null
}

/** The Settings switch. Off = nothing caught leaves the device, and anything waiting is thrown away. */
export function setOn(on: boolean) {
  if (!running) return
  running.on = on
  if (!on) {
    running.held = []
    for (const kind of running.kinds.values()) kind.waiting = 0
  }
}

/** Report an error the game caught itself (a JSON or GLB file that didn't load…), or one React handed over.
 *  Returns true when this kind of error is (or already was) reported this session. */
export function reportError(error: unknown, { kind = 'game' }: { kind?: ReportKind } = {}): boolean {
  const stack = error instanceof Error || hasStack(error) ? (error as { stack?: string }).stack : undefined
  return catchOne(kind, titleOf(error), stack)
}

/** A game moment: a code name + up to 4 numbers, e.g. moment('roundStart', 3). The last few go with a report so it
 *  shows what led up to the error. A name that isn't a code name (a player's name, chat) is dropped. */
export function moment(name: string, ...numbers: number[]) {
  if (!running || typeof name !== 'string' || !MOMENT_NAME.test(name)) return
  const keep = Math.min(running.options.config.client.moments, MAX_MOMENTS)
  // (a number past ±1e12 — moment('seed', Date.now()) — would make the server refuse the whole report)
  const n = numbers.filter((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= MAX_MOMENT_NUMBER).slice(0, 4)
  running.moments.push(n.length ? { at: now(), name, n } : { at: now(), name })
  while (running.moments.length > keep) running.moments.shift()
}

/** Moments from the Dev Kit adapter's onEvent: only each line's first word, and only when it's a code name that
 *  starts with a small letter ("roundStart · 3 left" → roundStart). "Bob joined" → nothing: a capital first word may
 *  be a player's name, so it's never taken. Returns the adapter's stop function.   momentsFromGame(myAdapter.onEvent) */
export function momentsFromGame(onEvent: ((send: (text: string, data?: unknown) => void) => () => void) | undefined): () => void {
  if (!onEvent) return () => {}
  try {
    return onEvent((text) => {
      const first = String(text).trim().split(/\s+/)[0] ?? ''
      if (/^[a-z]/.test(first)) moment(first)
    })
  } catch {
    return () => {}
  }
}

/** Report it when the graphics card drops this 3D canvas (webglcontextlost). Returns a function that stops watching. */
export function watchCanvas(canvas: HTMLCanvasElement): () => void {
  const run = running
  if (!run) return () => {}
  const lost = () => { catchOne('webgl', 'WebGL context lost', undefined) }
  canvas.addEventListener('webglcontextlost', lost)
  const unwatch = () => canvas.removeEventListener('webglcontextlost', lost)
  run.undo.push(unwatch)
  run.canvases.push(canvas)
  return unwatch
}

// --- what the browser tells us ------------------------------------------------------------------------------

function onWindowError(event: Event) {
  const target = event.target as (Element & { src?: string; href?: unknown; currentSrc?: string }) | null
  if (target && target !== (globalThis.window as unknown) && typeof target.tagName === 'string') {
    assetFailed(target)
    return
  }
  const e = event as ErrorEvent
  const message = typeof e.message === 'string' ? e.message : ''
  if (/^(Uncaught )?Script error\.?$/.test(message) && !e.filename) return // another site's script: no details
  const title = e.error !== undefined && e.error !== null ? titleOf(e.error) : message.replace(/^Uncaught /, '')
  const stack = hasStack(e.error) ? e.error.stack : undefined
  // No stack (old browsers, a thrown string): the event's own file + line is the one frame we have
  const fallback = e.filename ? sitePath(e.filename, origin(), basePath()) : null
  const oneFrame = fallback ? [{ file: fallback, line: e.lineno || 0, col: e.colno || 0 }] : undefined
  catchOne('error', title, stack, oneFrame)
}

function onRejection(event: Event) {
  const reason = (event as PromiseRejectionEvent).reason
  catchOne('rejection', titleOf(reason), hasStack(reason) ? reason.stack : undefined)
}

// An image / script / sound file that didn't load. The title names the file's path only — no address, no ?query.
function assetFailed(el: Element & { src?: string; href?: unknown; currentSrc?: string }) {
  const src = el.currentSrc || (typeof el.src === 'string' ? el.src : '') || (typeof el.href === 'string' ? el.href : '') || el.getAttribute('href') || ''
  let path = '(unknown file)'
  if (src.startsWith('data:')) path = '(inline data)'
  else if (src.startsWith('blob:')) path = '(blob)'
  else if (src) {
    try {
      // the game's own file: its path inside the game (as frames are); another site's: only the site and the file's
      // type — its path can hold a player's id (an avatar's /u/1234567), and nothing that could name a player is kept
      const url = new URL(src, globalThis.location?.href)
      const type = /\.[A-Za-z0-9]{1,8}$/.exec(url.pathname)?.[0] ?? ''
      path = url.origin === origin() ? sitePath(url.href, origin(), basePath()) || url.pathname.replace(/^\/+/, '') || '/' : `${url.hostname}/…${type}`
    } catch { /* keep "(unknown file)" */ }
  }
  catchOne('asset', `${el.tagName.toLowerCase()} didn't load: ${path}`.slice(0, 200), undefined, [], true)
}

// --- the core: is it new, may it be sent, build it, send it ----------------------------------------------------

// asset = the title is a file path: it isn't cleaned of numbers (level-2.json stays level-2.json), only its build
// hash is left out of the fingerprint.
function catchOne(kind: ReportKind, rawTitle: string, stack: string | undefined, givenFrames?: Frame[], asset = false): boolean {
  const run = running
  if (!run || run.busy) return false
  run.busy = true
  try {
    if (!maySend(run)) return false
    if (!asset && /^ResizeObserver loop/.test(rawTitle.replace(/^\w*Error: /, ''))) return false // harmless browser noise
    const read = readStack(stack, origin(), basePath())
    if (read.allExtension) return false // every frame in a browser extension: not the game's problem
    const frames = read.frames.length || !givenFrames ? read.frames : givenFrames
    const title = (asset ? rawTitle : cleanTitle(rawTitle)) || 'Error'
    const key = fingerprintText(kind, asset ? withoutBuildHash(title) : title, frames)

    const seen = run.kinds.get(key)
    if (seen) { seen.waiting++; return seen.sent } // a repeat: only counted
    if (run.sentCount >= run.options.config.client.perSession) {
      run.kinds.set(key, { sent: false, report: null, waiting: 1 }) // over this session's limit: only counted
      return false
    }
    run.sentCount++
    const kindSeen: SeenKind = { sent: true, report: null, waiting: 0 }
    run.kinds.set(key, kindSeen)
    const report = buildReport(run, kind, title, frames)
    // The fingerprint takes a moment; one after the other, so reports leave in the order things happened
    run.queue = run.queue.then(() => fingerprint(key)).then((fp) => {
      if (!fp || running !== run) return // no crypto.subtle (plain http) or stopped meanwhile
      report.fp = fp
      kindSeen.report = report
      deliver(run, fitInSize(report), false)
    }).catch(() => {})
    return true
  } catch {
    return false // the catcher never breaks the game
  } finally {
    run.busy = false
  }
}

function maySend(run: Running): boolean {
  const { url, sendInDev } = run.options.config.client
  const dev = run.options.dev ?? import.meta.env.DEV
  return run.on && url !== '' && (!dev || sendInDev)
}

function buildReport(run: Running, kind: ReportKind, title: string, frames: Frame[]): CrashReport {
  const t = now()
  const nav = globalThis.navigator
  const ua = nav?.userAgent ?? ''
  if (!run.gpu) run.gpu = run.canvases.map(gpuName).find((name) => name) ?? ''
  const moments: Moment[] = run.moments.flatMap((m) => {
    const at = Math.min(0, Math.round((m.at - t) / 100) / 10) || 0 // seconds before the error, 1 decimal (and never -0)
    if (at < -MAX_MOMENT_AGE_S) return [] // a tab left open for days: older moments would make the server refuse it all
    return [m.n ? { at, name: m.name, n: m.n } : { at, name: m.name }]
  })
  return {
    v: REPORT_FORMAT, kind, fp: '', title, frames: frames.filter((f) => safeFile(f.file)),
    version: plainVersion(run.options.version), platform: run.options.platform ?? 'web',
    browser: browserName(ua), os: osName(ua), screen: screenText(), gpu: run.gpu, lang: languageOnly(nav?.language),
    secs: Math.max(0, Math.round((t - run.startedAt) / 1000)), moments, repeats: 0,
  }
}

// "v0.3.1.12" → "0.3.1.12". Anything that isn't digits and dots ("dev") → "0", which the server takes.
function plainVersion(version: string): string {
  const v = String(version).replace(/^v/, '')
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : '0'
}

/** The report as JSON text, at most MAX_REPORT_BYTES: frames go first (from the bottom), then the oldest moments. */
export function fitInSize(report: CrashReport): string {
  const r = { ...report, frames: [...report.frames], moments: [...report.moments] }
  const size = (text: string) => new TextEncoder().encode(text).length
  let body = JSON.stringify(r)
  while (size(body) > MAX_REPORT_BYTES && r.frames.length) { r.frames.pop(); body = JSON.stringify(r) }
  while (size(body) > MAX_REPORT_BYTES && r.moments.length) { r.moments.shift(); body = JSON.stringify(r) }
  return body
}

// Send one report. Any trouble → it waits in memory (at most 10) for the page hiding or the connection coming back.
// Nothing here ever becomes a report itself.
function deliver(run: Running, body: string, leaving: boolean) {
  if (running !== run || !maySend(run)) return
  const send = run.options.send ?? sendByBrowser
  const address = `${run.options.config.client.url}/report`
  run.busy = true
  try {
    const result = send(address, body, leaving) as Promise<unknown> | undefined
    if (result && typeof result.then === 'function') result.then(() => {}, () => hold(run, body))
  } catch {
    hold(run, body)
  } finally {
    run.busy = false
  }
}

function hold(run: Running, body: string) {
  if (running !== run || !run.on) return
  run.held.push(body)
  while (run.held.length > MAX_HELD) run.held.shift()
}

// The page is hiding (or the connection is back): send what's waiting — held reports, then the repeats.
// A repeat report is the kind's own report again; it means 1 + repeats more times (the server adds 1 + repeats).
function sendWaiting(leaving: boolean) {
  const run = running
  if (!run || !maySend(run)) return
  const held = run.held
  run.held = []
  for (const body of held) deliver(run, body, leaving)
  if (!leaving) return // repeats wait for the page hiding, so a long session sends each kind's count once or twice
  for (const kind of run.kinds.values()) {
    if (!kind.report || kind.waiting === 0) continue
    const body = fitInSize({ ...kind.report, repeats: kind.waiting - 1 })
    kind.waiting = 0
    deliver(run, body, leaving)
  }
}

// The browser's way: fetch with keepalive, so it still goes when the page is closing (like sendBeacon, but with
// no Referer header — the page's full address never travels). text/plain = no extra "may I?" request first.
function sendByBrowser(address: string, body: string): Promise<unknown> {
  return fetch(address, { method: 'POST', keepalive: true, body, referrerPolicy: 'no-referrer', headers: { 'content-type': 'text/plain' } })
}

// --- titles ---------------------------------------------------------------------------------------------------

function hasStack(value: unknown): value is { stack: string } {
  return typeof value === 'object' && value !== null && typeof (value as { stack?: unknown }).stack === 'string'
}

/** A sensible title for anything thrown or rejected: an Error, a string, undefined, an object… (never its contents). */
function titleOf(value: unknown): string {
  if (value instanceof Error || (typeof value === 'object' && value !== null && typeof (value as Error).message === 'string')) {
    const e = value as Error
    const name = typeof e.name === 'string' && e.name ? e.name : 'Error'
    return e.message ? `${name}: ${e.message}` : name
  }
  if (typeof value === 'string') return value || 'Empty error text'
  if (value === undefined || value === null) return `Failed with: ${String(value)}`
  if (typeof value === 'object') {
    const name = (value as object).constructor?.name
    return `Failed with: ${typeof name === 'string' && name ? name : 'object'}` // its kind only — its contents never travel
  }
  return `Failed with: ${typeof value}` // a number, a boolean (not its value)
}

// RUN RESUME — a game in progress (a match vs the AI, a dungeon run) that survives the tab closing.
// The game saves it at its break points; the main menu offers Continue only when there is one; it's wiped when the run
// ends, so a finished game never comes back.
//
//   const run = createRun<Match>({
//     key: 'glyphtender:run', version: 1, fresh: emptyMatch(),
//     summary: (m) => `Turn ${m.turn}`,          // the game's own words for "where you were" (the menu adds the time)
//     snapshot: () => (playing ? currentMatch() : null),   // optional: saved when the tab hides or closes
//   })
//   run.autosave(match)            // at each break point: the end of a turn, a wave, a room
//   run.pending()                  // { savedAt, summary, canContinue } | null — for the Continue button (never loads it)
//   const back = run.resume()      // { ok: true, data } | { ok: false, reason, message } — never throws
//   run.end()                      // won, lost or abandoned: every copy is gone, backups too
//
// Why "every copy": the core keeps backups so a broken write never loses progress. For a run, a backup is the
// opposite of safe — a finished game would load again from its backup ("I already won that!").
import { createSave, type Save, type SaveResult, type Upgrade } from './saves'
import type { StorageLike } from './storage'

/** The run's player-facing words — replace any of them (another language, the game's own voice). {n} = a number. */
export const RUN_WORDS = {
  cantContinue: 'This game can\'t be continued — it was saved by a newer version of the game, or the save was damaged. Start a new game.',
  justNow: 'just now',
  minutesAgo: '{n} min ago',
  hourAgo: '1 hour ago',
  hoursAgo: '{n} hours ago',
  yesterday: 'yesterday',
  daysAgo: '{n} days ago',
  /** Between the game's summary and the time: "Turn 7 · 5 min ago". */
  joiner: ' · ',
}

export interface RunOptions<T> {
  /** The storage key — starts with the game's name ("glyphtender:run"). */
  key: string
  /** +1 whenever the run's shape changes (with an upgrade step, like any save). */
  version: number
  /** An empty run — where missing fields get their defaults. */
  fresh: T
  upgrades?: Record<number, Upgrade>
  /** Where the player was, in the game's words ("Turn 7", "Wave 3"). The menu adds how long ago. */
  summary?: (data: T) => string
  /** The game's run right now, or null when it isn't a safe moment (mid-move). Saved when the tab hides or the page
   *  closes, so a phone player switching apps mid-turn loses nothing. Without it, only the break points are saved. */
  snapshot?: () => T | null
  storage?: StorageLike | null
  onProblem?: (message: string) => void
  /** Where the hide / close events come from. Default: the page (document + window). Tests pass EventTargets. */
  page?: { document?: PageDocument; window?: EventTarget } | null
}

type PageDocument = EventTarget & { visibilityState?: string }

/** What the Continue button needs, without loading the run. canContinue false = it's there but can't be used
 *  (a newer build's or damaged) — pressing Continue then says so and wipes it (resume()). */
export interface PendingRun {
  /** When it was last saved (ISO time), or '' when that isn't known. */
  savedAt: string
  /** The game's summary ("Turn 7"), or '' (no summary, or a run that can't be continued). */
  summary: string
  canContinue: boolean
}

export type ResumeResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'none' | 'newer' | 'damaged'; message: string }

export interface Run<T> {
  readonly key: string
  /** Save the run now — call it at each break point. Never throws. */
  autosave(data: T): SaveResult
  /** Is there a run to continue, from when? Never loads it, never throws. */
  pending(): PendingRun | null
  /** The saved run, upgraded and complete — or why it can't be continued (and then it's wiped). Never throws. */
  resume(): ResumeResult<T>
  /** The run is over (won, lost, abandoned): every copy goes, backups and a newer build's too. */
  end(): void
  /** The save underneath (the test kit and save codes use it). */
  readonly save: Save<T>
  /** Be told whenever the run is saved, wiped or ended (the menu's Continue line). Returns "stop telling me". */
  subscribe(tell: () => void): () => void
  /** The same run, kept somewhere else and deaf to the page (tests: memoryStorage()). */
  withStorage(storage: StorageLike | null): Run<T>
}

export function createRun<T>(options: RunOptions<T>): Run<T> {
  const save = createSave<T>({
    key: options.key, kind: 'run', version: options.version, fresh: options.fresh, upgrades: options.upgrades,
    storage: options.storage, onProblem: options.onProblem,
  })
  const page = options.page === undefined
    ? { document: typeof document === 'undefined' ? undefined : document, window: typeof window === 'undefined' ? undefined : window }
    : options.page
  // A run is "going" from its first autosave (or a resume) until end(). Only a going run is saved when the tab hides —
  // so a hide AFTER end() can never write the finished game back.
  let going = false
  // The last break-point save that the browser refused (full storage…): tried again when the tab hides.
  let unsaved: T | null = null

  // Who wants to know the run changed (the menu's Continue line) — so a menu that stays mounted is never stale.
  const listeners = new Set<() => void>()
  const changed = () => { for (const tell of listeners) tell() }

  function write(data: T): SaveResult {
    let result = save.save(data)
    if (!result.ok && result.reason === 'newer') {
      // A newer build's old run is still there (the player started a new game instead of pressing Continue): the core
      // never writes over a newer save, so this run would never be saved. A newer run isn't worth keeping — wipe it,
      // write again (review F93).
      save.clear({ evenNewer: true })
      result = save.save(data)
    }
    unsaved = result.ok ? null : data
    if (result.ok) changed()
    return result
  }

  // The tab hides (app switch, screen off, tab closed) → save what the game has now. pagehide catches the close on
  // browsers that skip the hidden step (old Safari). Saving twice is harmless; a run must never be lost.
  function flush() {
    if (!going) return
    let now: T | null = null
    try { now = options.snapshot ? options.snapshot() : null } catch { now = null }
    const data = now ?? unsaved
    if (data !== null) write(data)
  }
  const onVisibility = () => { if (page?.document?.visibilityState === 'hidden') flush() }
  let listening = false
  function listen(on: boolean) {
    if (on === listening || !page) return
    listening = on
    if (on) {
      page.document?.addEventListener('visibilitychange', onVisibility)
      page.window?.addEventListener('pagehide', flush)
    } else {
      page.document?.removeEventListener('visibilitychange', onVisibility)
      page.window?.removeEventListener('pagehide', flush)
    }
  }

  function start() {
    going = true
    listen(true)
  }

  function pending(): PendingRun | null {
    const found = save.peek()
    if (!found) return null
    if (found.state !== 'good') return { savedAt: found.savedAt, summary: '', canContinue: false }
    let summary = ''
    try { summary = options.summary?.(found.data) ?? '' } catch { summary = '' } // a summary bug never hides Continue
    return { savedAt: found.savedAt, summary, canContinue: true }
  }

  function resume(): ResumeResult<T> {
    const found = save.peek()
    if (!found) return { ok: false, reason: 'none', message: RUN_WORDS.cantContinue }
    if (found.state !== 'good') {
      // A newer build's run (the player opened an older version) or only broken copies: wiped, even the newer one.
      // Unlike progress, a run isn't worth keeping for later — and while a newer copy sits there, this build refuses
      // to write the key at all (saves.ts never writes over a newer save), so no new run could ever be saved.
      save.clear({ evenNewer: true })
      changed()
      return { ok: false, reason: found.state, message: RUN_WORDS.cantContinue }
    }
    const data = save.load()
    start()
    return { ok: true, data }
  }

  function end() {
    going = false
    unsaved = null
    listen(false)
    save.clear({ evenNewer: true }) // backups too: a finished run must never come back (see the top)
    changed()
  }

  return {
    key: options.key, save, pending, resume, end,
    subscribe(tell) {
      listeners.add(tell)
      return () => { listeners.delete(tell) }
    },
    withStorage: (other) => createRun({ ...options, storage: other, page: null }),
    autosave(data) {
      start()
      return write(data)
    },
  }
}

/** The summary line under Continue: "Turn 7 · 5 min ago" (or just the time, or just the summary). */
export function continueLine(run: PendingRun, now = Date.now(), words: Partial<typeof RUN_WORDS> = {}): string {
  const w = { ...RUN_WORDS, ...words }
  const ago = timeAgo(run.savedAt, now, w)
  return [run.summary, ago].filter(Boolean).join(w.joiner)
}

/** "5 min ago" from an ISO time; '' when the time isn't known. */
export function timeAgo(savedAt: string, now = Date.now(), words: Partial<typeof RUN_WORDS> = {}): string {
  const w = { ...RUN_WORDS, ...words }
  const then = Date.parse(savedAt)
  if (!savedAt || Number.isNaN(then)) return ''
  const minutes = Math.floor(Math.max(0, now - then) / 60_000)
  const fill = (text: string, n: number) => text.replace('{n}', String(n))
  if (minutes < 1) return w.justNow
  if (minutes < 60) return fill(w.minutesAgo, minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 2) return w.hourAgo
  if (hours < 24) return fill(w.hoursAgo, hours)
  const days = Math.floor(hours / 24)
  return days < 2 ? w.yesterday : fill(w.daysAgo, days)
}

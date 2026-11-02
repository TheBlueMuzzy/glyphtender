// THE CORE — one named save (the player's settings, their progress, a run in progress, or save slots), kept in the
// browser so that no update, broken write or full storage ever loses it or crashes the game.
//
//   const progress = createSave({
//     key: 'goops-progress',          // starts with the game's name: itch.io games can share one storage
//     kind: 'progress',               // settings · progress · run · slots
//     version: 2,                     // +1 whenever the save's shape (or a default old saves must get) changes
//     fresh: { totalXp: 0, unlocks: [] },
//     upgrades: { 2: (v1) => ({ ...v1, unlocks: [] }) },   // version 1 → 2; one step per version, never a jump
//     fields: { totalXp: 'highest', unlocks: 'collect' },  // progress only: how two devices' copies combine (progress.ts)
//   })
//   const p = progress.load()          // never throws; always a complete save
//   progress.save(p)                   // never throws; { ok } or { ok: false, reason, message }
//
// How a save is kept (one key per copy):  <key> = the newest · <key>~1, <key>~2 = the copies before it (backups).
// Each copy is one whole record: { save: <key>, version, savedAt, data, counts? }.
// Loading tries the newest copy, then each backup: the newest GOOD copy wins (a cut-off write, a wrong-type value or
// an empty save never wipes the player's progress). Then step-by-step upgrades, then missing fields get today's
// defaults (fill.ts), then the game's own clean-up.
// A save from a NEWER build (the player opened an older version, e.g. after a rollback) is kept untouched: the game
// runs on fresh values, never writes over it, and report().note says so in plain words.
import { savesConfig } from './config'
import { copyData, fillMissing, WHOLE_SAVE } from './fill'
import { countDevices, mergeRecords, type FieldRules } from './progress'
import { switchedStorage, readKey, removeKey, writeKey, type StorageLike } from './storage'

/** What is saved: settings (volume, reduce motion) · progress (XP, unlocks, lifetime stats — the precious one) ·
 *  run (a game in progress — made with createRun, run.ts, which wipes it whole when the run ends) · slots (several self-contained saves, see slot()). */
export type SaveKind = 'settings' | 'progress' | 'run' | 'slots'

/** One copy as it sits in storage. */
export interface SaveRecord<T = unknown> {
  /** The save's key — marks this as a saves-module record (and which save it is). */
  save: string
  version: number
  /** When it was written (ISO time). Empty for a save written before the module (oldSave). */
  savedAt: string
  data: T
  /** Add-up progress fields: each device's part of the total (progress.ts), e.g. { gamesPlayed: { k3Fq: 12 } }. */
  counts?: Record<string, Record<string, number>>
}

/** An upgrade step: the data at version N-1 → the data at version N. */
export type Upgrade = (data: any) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any -- an old save's shape is whatever it was back then

export interface SaveOptions<T> {
  /** The storage key. Starts with the game's name ("goops-progress", "glyphtender:new-game"). */
  key: string
  kind: SaveKind
  /** Today's version (1, 2, 3…). */
  version: number
  /** A brand-new player's save. Also where missing fields get their defaults. */
  fresh: T
  /** { 2: v1 → v2, 3: v2 → v3 } — one step for each version after the first. */
  upgrades?: Record<number, Upgrade>
  /** progress only: how each field combines with another device's copy (default: newest). */
  fields?: FieldRules<T>
  /** A save written BEFORE the game used this module (no record around it): which version it is and its data,
   *  or null when it isn't one. raw is the stored value read as JSON — or, when the stored text isn't JSON, that text
   *  itself (a cut-off write arrives this way too, so return null for anything you don't recognise).
   *  e.g. Goops: (raw) => raw?.v === 1 ? { version: 1, data: raw } : null
   *       Glyphtender's tutorial (it kept the word done): (raw) => raw === 'done' ? { version: 1, data: { done: true } } : null */
  oldSave?: (raw: any) => { version: number; data: unknown } | null // eslint-disable-line @typescript-eslint/no-explicit-any -- whatever an old build wrote
  /** The game's own last tidy-up after defaults are filled in (a value out of range → the default, a renamed id…). */
  clean?: (data: T) => T
  /** Where it's kept. Default: the browser's localStorage. Tests pass memoryStorage(). */
  storage?: StorageLike | null
  /** Where problems are told (a skipped broken copy, a newer save). Default: console.warn. */
  onProblem?: (message: string) => void
}

/** What the last load() found, for the game (and the Dev Kit) to show. */
export interface LoadReport {
  /** fresh = nothing usable was saved · save = the newest copy · backup = an older copy (the newer ones were broken) */
  from: 'fresh' | 'save' | 'backup'
  /** Which backup (1 = the newest backup). */
  backup?: number
  /** The version the loaded copy had before it was upgraded to today's. */
  upgradedFrom?: number
  /** A newer build's save is kept untouched (its version) — the game is running on fresh values. */
  newer?: number
  /** Fields that were missing (got today's default) / had a broken value (replaced by the default). */
  added: string[]
  replaced: string[]
  /** What was wrong with each copy that was skipped, in plain words. */
  problems: string[]
  /** One sentence for the player, or null when there's nothing to say. */
  note: string | null
}

/** What peek() found: a usable save (what load() would give, and when it was written), a newer build's (kept), or
 *  only broken copies. savedAt is '' when it isn't known (a save from before the module, a broken copy). */
export type SavePeek<T> =
  | { state: 'good'; savedAt: string; data: T }
  | { state: 'newer'; savedAt: string; version: number }
  | { state: 'damaged'; savedAt: string; problem: string }

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'full' | 'blocked' | 'newer' | 'not-kept' | 'not-data'; message: string }

export interface Save<T> {
  readonly key: string
  readonly kind: SaveKind
  readonly version: number
  /** The newest good copy, upgraded and complete — or fresh. Never throws. */
  load(): T
  /** Write the whole save as one record; the copy it replaces becomes the newest backup. Never throws. */
  save(data: T): SaveResult
  /** Remove every copy (a run that ended, "reset progress"). A newer build's save is kept — unless evenNewer
   *  (only a run uses it: run.ts says why). */
  clear(options?: { evenNewer?: boolean }): void
  /** Is something saved, from when — without loading it: no upgrade report, nothing written (a damaged copy isn't
   *  even set aside). null = nothing saved. The Continue button asks this (run.ts). */
  peek(): SavePeek<T> | null
  /** What the last load() found. */
  report(): LoadReport
  /** The record as load() sees it (today's version) — or a newer build's, untouched. For save codes. null = nothing saved. */
  exportRecord(): SaveRecord | null
  /** Read a record from somewhere else (a save code) without writing anything: usable, newer, or broken — and why. */
  checkRecord(raw: unknown): { ok: true; record: SaveRecord<T> } | { ok: false; newer: boolean; problem: string }
  /** Write a checked record (from checkRecord) as the newest copy, keeping its device counts. */
  restoreRecord(record: SaveRecord<T>): SaveResult
  /** Two copies of this save (this device's and another's) → one, field by field (progress.ts). */
  merge(a: SaveRecord<T>, b: SaveRecord<T>): SaveRecord<T>
  /** The same save, kept somewhere else (tests: memoryStorage()). */
  withStorage(storage: StorageLike | null): Save<T>
}

/** Save slots: several self-contained saves of one shape ("Slot 1", "Player 2"), and a small list of them. */
export interface SlotSaves<T> {
  readonly key: string
  readonly kind: 'slots'
  readonly version: number
  /** One slot's save (key "<key>/<id>"). */
  slot(id: string): Save<T>
  /** Every saved slot, newest first. */
  slots(): { id: string; savedAt: string }[]
  withStorage(storage: StorageLike | null): SlotSaves<T>
}

export const backupKey = (key: string, n: number) => `${key}~${n}`
export const damagedKey = (key: string) => `${key}~damaged`
const MAX_BACKUPS = 5 // config.ts allows 0–5; older copies past the configured count are tidied away

export const NOTES = {
  newer: 'Your save is from a newer version of the game. It is kept safe and untouched — this version starts fresh. Reload the page to get the newest version back.',
  backup: 'Your last save was damaged, so the game loaded the copy saved before it.',
  damaged: 'Your save was damaged and no good copy was left, so the game started fresh.',
}

// What reading one copy can give
type Outcome<T> =
  | { state: 'empty' }
  | { state: 'good'; record: SaveRecord<T>; upgradedFrom?: number; added: string[]; replaced: string[] }
  | { state: 'newer'; version: number }
  | { state: 'damaged'; problem: string }

/** Per-device parts as stored (or pasted in a code) → only real counts: whole objects of numbers ≥ 0.
 *  Anything else ("3" as text, -1, null) is dropped, so a part can never be added as text or go negative. */
function cleanCounts(raw: unknown): SaveRecord['counts'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, Record<string, number>> = {}
  for (const [field, parts] of Object.entries(raw)) {
    if (!parts || typeof parts !== 'object' || Array.isArray(parts)) continue
    // (device names that are built-in object names — __proto__, constructor… — dropped too: security review)
    const good = Object.entries(parts).filter((part): part is [string, number] => !(part[0] in Object.prototype) && typeof part[1] === 'number' && Number.isFinite(part[1]) && part[1] >= 0)
    if (good.length) out[field] = Object.fromEntries(good)
  }
  return Object.keys(out).length ? out : undefined
}

const isRecordShaped = (value: unknown): value is SaveRecord =>
  !!value && typeof value === 'object' && typeof (value as SaveRecord).save === 'string' && 'data' in value

export function createSave<T>(options: SaveOptions<T> & { kind: 'slots' }): SlotSaves<T>
export function createSave<T>(options: SaveOptions<T>): Save<T>
export function createSave<T>(options: SaveOptions<T>): Save<T> | SlotSaves<T> {
  if (options.kind === 'slots') return createSlots(options)
  return makeSave(options, options.key)
}

/** One save at `storageKey` whose records are named `recordName` (the same for every slot of a slots save). */
function makeSave<T>(options: SaveOptions<T>, recordName: string, storageKey = recordName): Save<T> {
  const { kind, version, upgrades = {}, fields, oldSave, clean, onProblem = (m: string) => console.warn(`[saves] ${storageKey}: ${m}`) } = options
  const storage = options.storage === undefined ? switchedStorage : options.storage
  const key = storageKey
  let lastReport: LoadReport = { from: 'fresh', added: [], replaced: [], problems: [], note: null }
  warnAboutKey(options.key, onProblem)

  /** Any parsed value → a usable record at today's version, a newer build's, or broken (and why).
   *  notKnown: the problem when it isn't a record and oldSave doesn't know it either. */
  function interpret(parsed: unknown, notKnown = 'it isn\'t a save this game knows'): Outcome<T> {
    let version0: number
    let data: unknown
    let savedAt = ''
    let counts: SaveRecord['counts']
    if (isRecordShaped(parsed)) {
      if (parsed.save !== recordName) return { state: 'damaged', problem: `it belongs to another save ("${parsed.save}")` }
      version0 = parsed.version
      data = parsed.data
      savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : ''
      counts = cleanCounts(parsed.counts)
    } else {
      let old: { version: number; data: unknown } | null = null
      try { old = oldSave ? oldSave(parsed) : null } catch { old = null }
      if (!old) return { state: 'damaged', problem: notKnown }
      version0 = old.version
      data = old.data
    }
    if (!Number.isInteger(version0) || version0 < 1) return { state: 'damaged', problem: `its version (${JSON.stringify(version0)}) isn't a whole number from 1 up` }
    if (version0 > version) return { state: 'newer', version: version0 }
    for (let v = version0 + 1; v <= version; v++) {
      const step = upgrades[v]
      if (!step) return { state: 'damaged', problem: `there's no upgrade step to version ${v} (it was version ${version0})` }
      try {
        data = step(copyData(data))
      } catch (error) {
        return { state: 'damaged', problem: `the upgrade to version ${v} stopped: ${(error as Error)?.message ?? error}` }
      }
    }
    const filled = fillMissing(data, options.fresh)
    if (filled.replaced.includes(WHOLE_SAVE)) return { state: 'damaged', problem: `its data is the wrong kind (${Array.isArray(data) ? 'a list' : typeof data})` }
    let value = filled.value
    if (clean) {
      try { value = clean(value) } catch (error) { return { state: 'damaged', problem: `the game's clean-up stopped: ${(error as Error)?.message ?? error}` } }
    }
    const record: SaveRecord<T> = { save: recordName, version, savedAt, data: value, ...(counts ? { counts } : {}) }
    return { state: 'good', record, upgradedFrom: version0 < version ? version0 : undefined, added: filled.added, replaced: filled.replaced }
  }

  /** One stored copy (text) → what it is. Text that isn't JSON may still be an old build's plain value (Glyphtender's
   *  tutorial kept the word "done"): oldSave gets the text itself, and it's damaged only if oldSave doesn't know it. */
  function readCopy(text: string | null): Outcome<T> {
    if (text === null || text.trim() === '') return { state: 'empty' }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { return interpret(text, 'it is cut off or isn\'t readable (not JSON)') }
    return interpret(parsed)
  }

  /** Every copy, newest first: the save, then its backups. */
  const copyKeys = () => [key, ...Array.from({ length: MAX_BACKUPS }, (_, i) => backupKey(key, i + 1))]

  /** The newest good copy (or newer / nothing), with the problems of the copies skipped on the way.
   *  setAside: a broken newest copy is kept at <key>~damaged for a look later (peek() writes nothing, so it says no). */
  function newestGood(setAside = true): { outcome: Outcome<T>; index: number; problems: string[] } {
    const problems: string[] = []
    const keys = copyKeys()
    for (let i = 0; i < keys.length; i++) {
      const text = readKey(storage, keys[i])
      const outcome = readCopy(text)
      if (outcome.state === 'good' || outcome.state === 'newer') return { outcome, index: i, problems }
      if (outcome.state === 'damaged') {
        problems.push(`${i === 0 ? 'the save' : `backup ${i}`}: ${outcome.problem}`)
        if (setAside && i === 0 && text !== null && readKey(storage, damagedKey(key)) !== text) writeKey(storage, damagedKey(key), text) // kept for a look later
      }
    }
    return { outcome: { state: 'empty' }, index: -1, problems }
  }

  function load(): T {
    try {
      const { outcome, index, problems } = newestGood()
      problems.forEach((p) => onProblem(`skipped a broken copy — ${p}`))
      if (outcome.state === 'newer') {
        onProblem(`the save is version ${outcome.version}, newer than this build's ${version} — kept untouched, running on fresh values`)
        lastReport = { from: 'fresh', newer: outcome.version, added: [], replaced: [], problems, note: NOTES.newer }
        return copyData(options.fresh)
      }
      if (outcome.state !== 'good') {
        lastReport = { from: 'fresh', added: [], replaced: [], problems, note: problems.length ? NOTES.damaged : null }
        return copyData(options.fresh)
      }
      lastReport = {
        from: index === 0 ? 'save' : 'backup', ...(index > 0 ? { backup: index } : {}),
        ...(outcome.upgradedFrom ? { upgradedFrom: outcome.upgradedFrom } : {}),
        added: outcome.added, replaced: outcome.replaced, problems, note: index > 0 ? NOTES.backup : null,
      }
      return outcome.record.data
    } catch (error) {
      onProblem(`couldn't load (${(error as Error)?.message ?? error}) — running on fresh values`)
      lastReport = { from: 'fresh', added: [], replaced: [], problems: [String(error)], note: null }
      return copyData(options.fresh)
    }
  }

  /** Is ANY copy (the newest or a backup) a newer build's? Then this build never writes: writing would slide that copy
   *  down the backups and, a few saves later, out. (Checked on every write, not remembered: another tab may write.) */
  function newerVersionStored(): number | null {
    for (const k of copyKeys()) {
      const outcome = readCopy(readKey(storage, k))
      if (outcome.state === 'newer') return outcome.version
    }
    return null
  }

  /** The safe write: the old newest copy (if good) slides down into the backups, the new one is written whole,
   *  read back and compared. Storage full → backups OLDER than the newest good copy are dropped to make room (never
   *  the newest good copy itself), then one more try. */
  function writeRecord(record: SaveRecord<T>): SaveResult {
    let text: string
    try { text = JSON.stringify(record) } catch (error) {
      return { ok: false, reason: 'not-data', message: `This save can't be written as JSON (${(error as Error)?.message ?? error}).` }
    }
    const newer = newerVersionStored()
    if (newer !== null) return { ok: false, reason: 'newer', message: NOTES.newer }
    const before = readKey(storage, key)
    const backups = savesConfig().backups
    const slid = before !== null && before !== text && readCopy(before).state === 'good'
    if (slid) {
      // slide: ~(n-1) → ~n … ~1 → ~2, then the newest → ~1 (a broken newest copy never pushes a good backup out)
      for (let n = backups; n >= 2; n--) {
        const older = readKey(storage, backupKey(key, n - 1))
        if (older !== null) writeKey(storage, backupKey(key, n), older)
      }
      if (backups >= 1) writeKey(storage, backupKey(key, 1), before)
    }
    for (let n = backups + 1; n <= MAX_BACKUPS; n++) removeKey(storage, backupKey(key, n)) // fewer backups configured now
    // Which backups may go to make room: if the newest copy was good, it is still in place until this write works,
    // so every backup may go. If not, the newest good copy is a backup (~g) — only the ones older than it may go.
    const newestGoodBackup = slid ? 0 : (Array.from({ length: backups }, (_, i) => i + 1).find((n) => readCopy(readKey(storage, backupKey(key, n))).state === 'good') ?? 0)
    const keepsGoodCopy = slid || newestGoodBackup > 0
    let problem = writeKey(storage, key, text)
    for (let n = backups; problem === 'full' && n > newestGoodBackup; n--) {
      removeKey(storage, backupKey(key, n)) // make room: the oldest copy goes first
      problem = writeKey(storage, key, text)
    }
    if (problem === 'full') {
      return { ok: false, reason: 'full', message: `The browser's storage for this game is full, so this wasn't saved. The game keeps running${keepsGoodCopy ? '; your last good save is still there' : ''}.` }
    }
    if (problem === 'blocked') return { ok: false, reason: 'blocked', message: 'This browser won\'t let the game save (a private window, or storage is blocked). Your progress lasts until you close the page.' }
    if (readKey(storage, key) !== text) {
      // whatever did get written isn't what was meant: the copy before comes back, or (none before) nothing is left
      if (before !== null) writeKey(storage, key, before)
      else removeKey(storage, key)
      return { ok: false, reason: 'not-kept', message: 'The save didn\'t read back the same, so the previous one was kept.' }
    }
    return { ok: true }
  }

  function save(data: T): SaveResult {
    try {
      // the copy load() would use (it may be a backup when the newest is broken) — its per-device parts carry on
      const { outcome: previous } = newestGood()
      const counts = kind === 'progress' && fields
        ? countDevices({ storage, key, fields, data, previous: previous.state === 'good' ? previous.record : null })
        : undefined
      return writeRecord({ save: recordName, version, savedAt: new Date().toISOString(), data, ...(counts ? { counts } : {}) })
    } catch (error) {
      return { ok: false, reason: 'blocked', message: `Couldn't save: ${(error as Error)?.message ?? error}` }
    }
  }

  function clear({ evenNewer = false }: { evenNewer?: boolean } = {}) {
    if (!evenNewer && newerVersionStored() !== null) return
    for (const k of copyKeys()) removeKey(storage, k)
    removeKey(storage, damagedKey(key))
  }

  /** When a stored copy says it was written (its savedAt), or '' when it doesn't say. */
  function savedAtOf(k: string): string {
    try {
      const parsed: unknown = JSON.parse(readKey(storage, k) ?? 'null')
      return isRecordShaped(parsed) && typeof parsed.savedAt === 'string' ? parsed.savedAt : ''
    } catch {
      return ''
    }
  }

  function peek(): SavePeek<T> | null {
    try {
      const { outcome, index, problems } = newestGood(false)
      if (outcome.state === 'good') return { state: 'good', savedAt: outcome.record.savedAt, data: outcome.record.data }
      if (outcome.state === 'newer') return { state: 'newer', savedAt: savedAtOf(copyKeys()[index]), version: outcome.version }
      return problems.length ? { state: 'damaged', savedAt: savedAtOf(key), problem: problems.join('; ') } : null
    } catch (error) {
      return { state: 'damaged', savedAt: '', problem: String(error) }
    }
  }

  function exportRecord(): SaveRecord | null {
    const { outcome, index } = newestGood()
    if (outcome.state === 'good') return outcome.record
    // a newer build's copy, untouched — the one newestGood found (it may be a backup)
    if (outcome.state === 'newer') { try { return JSON.parse(readKey(storage, copyKeys()[index]) ?? 'null') } catch { return null } }
    return null
  }

  function checkRecord(raw: unknown): { ok: true; record: SaveRecord<T> } | { ok: false; newer: boolean; problem: string } {
    try {
      const outcome = interpret(raw)
      if (outcome.state === 'good') return { ok: true, record: outcome.record }
      if (outcome.state === 'newer') return { ok: false, newer: true, problem: `it is from a newer version of the game (save version ${outcome.version}, this one knows up to ${version})` }
      return { ok: false, newer: false, problem: outcome.state === 'damaged' ? outcome.problem : 'it is empty' }
    } catch (error) {
      return { ok: false, newer: false, problem: String(error) }
    }
  }

  function restoreRecord(record: SaveRecord<T>): SaveResult {
    try {
      return writeRecord({ ...record, save: recordName, version, savedAt: record.savedAt || new Date().toISOString() })
    } catch (error) {
      return { ok: false, reason: 'blocked', message: `Couldn't save: ${(error as Error)?.message ?? error}` }
    }
  }

  return {
    key, kind, version, load, save, clear, peek, exportRecord, checkRecord, restoreRecord,
    report: () => lastReport,
    merge: (a, b) => mergeRecords(kind, fields, a, b),
    withStorage: (other) => makeSave({ ...options, storage: other }, recordName, storageKey),
  }
}

function createSlots<T>(options: SaveOptions<T>): SlotSaves<T> {
  const storage = options.storage === undefined ? switchedStorage : options.storage
  // The list of slots is itself a small save: { slots: { "<id>": "<savedAt>" } }
  const list = makeSave<{ slots: Record<string, string> }>({ key: `${options.key}/list`, kind: 'settings', version: 1, fresh: { slots: {} }, storage, onProblem: options.onProblem }, `${options.key}/list`)
  function slot(id: string): Save<T> {
    const inner = makeSave({ ...options, storage }, options.key, `${options.key}/${id}`)
    const listed = (savedAt: string | null) => {
      const current = list.load()
      const slots = { ...current.slots }
      if (savedAt === null) delete slots[id]
      else slots[id] = savedAt
      list.save({ slots })
    }
    return {
      ...inner,
      save(data) {
        const result = inner.save(data)
        if (result.ok) listed(new Date().toISOString())
        return result
      },
      restoreRecord(record) {
        const result = inner.restoreRecord(record)
        if (result.ok) listed(new Date().toISOString())
        return result
      },
      clear() {
        inner.clear()
        listed(null)
      },
    }
  }
  return {
    key: options.key, kind: 'slots', version: options.version, slot,
    slots: () => Object.entries(list.load().slots).map(([id, savedAt]) => ({ id, savedAt })).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    withStorage: (other) => createSlots({ ...options, storage: other }),
  }
}

// itch.io games can share one storage space, so a key must say whose it is ("goops-progress", "glyphtender:new-game").
// "~" is the module's own (backups), so a key can't contain it.
const warned = new Set<string>()
function warnAboutKey(key: string, onProblem: (message: string) => void) {
  if (warned.has(key)) return
  if (!/^[a-z0-9]+[-:_.][^~]+$/i.test(key) || key.includes('~')) {
    warned.add(key)
    onProblem(`the key "${key}" should start with the game's name and a separator (e.g. "mygame:progress") and have no "~" — games on itch.io can share one storage.`)
  }
}

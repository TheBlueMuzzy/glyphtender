// THE TEST KIT — proof that every player's save still loads after an update.
//
// Golden saves: a real save from each version, committed to the game as tests/saves/<key>-v<N>.json (a ":" or other
// odd character in the key becomes "_": glyphtender:new-game → glyphtender_new-game-v2.json). Several for one version
// are fine: <key>-v1-before-the-module.json. Each file:
//   { "about": "what it is and where it came from",
//     "stored": <exactly what was in the browser's storage under the key: JSON as it is, or the text as a string —
//                "done" = the plain text done (a value from before the module that isn't JSON)>,
//     "expect": { "totalXp": 1200 } }      ← optional: values it must load with (fields of the loaded save)
// Get "stored" from the browser: DevTools → Application → Local Storage → the key's value. Or in a test:
// makeGoldenSave(save, data, about).
//
// The game's ready-made test (tests/saves/saves.test.ts, copied once by the installer) runs these checks for every
// save the game lists. Each check returns the problems it found in plain words — an empty list = all good.
// check:framework (conformance.mjs) also fails a save that has no golden copy for a version.
import type { Run } from './run'
import { backupKey, type Save, type SaveRecord, type SlotSaves } from './saves'
import { memoryStorage, type MemoryStorage } from './storage'

export interface GoldenSave {
  about?: string
  stored: unknown
  expect?: Record<string, unknown>
}

/** One save the game's test checks, with a sample of real-looking data (not just fresh) for the round trip. */
export interface SaveUnderTest {
  save: Save<any> | SlotSaves<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- any of the game's saves
  sample?: unknown
}

/** A run the game's test checks (createRun): its save is tested like any other (golden saves, round trip…), and on
 *  top, that a run ended with end() never comes back. */
export interface RunUnderTest {
  run: Run<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- any of the game's runs
  sample?: unknown
}

/** The file name of a golden save: glyphtender:new-game, 2 → "glyphtender_new-game-v2.json". */
export function goldenFileName(key: string, version: number, note?: string): string {
  return `${key.replace(/[^A-Za-z0-9._-]/g, '_')}-v${version}${note ? `-${note}` : ''}.json`
}

/** Which version a file name is a golden save of (for this key), or null when it isn't one of this save's. */
export function goldenVersionOf(key: string, fileName: string): number | null {
  const base = fileName.replace(/^.*[\\/]/, '')
  const prefix = key.replace(/[^A-Za-z0-9._-]/g, '_') + '-v'
  if (!base.startsWith(prefix) || !base.endsWith('.json')) return null
  const match = base.slice(prefix.length).match(/^(\d+)(-.*)?\.json$/)
  return match ? Number(match[1]) : null
}

/** The versions 1…today that have no golden save among these file names. */
export function missingGoldenVersions(key: string, version: number, fileNames: string[]): number[] {
  const have = new Set(fileNames.map((f) => goldenVersionOf(key, f)).filter((v) => v !== null))
  return Array.from({ length: version }, (_, i) => i + 1).filter((v) => !have.has(v))
}

/** The game's files (path → text) that make a save or a run (createSave / createRun outside a comment) — so the game's
 *  test can tell "no saves yet" (skipped) from "saves made but not listed" (fails). The same call check:framework
 *  finds (conformance.mjs findSaves). */
export function savesInCode(files: Record<string, unknown>): string[] {
  const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
  return Object.entries(files)
    .filter(([, text]) => typeof text === 'string' && /\bcreate(Save|Run)\s*(<[^>]*>)?\s*\(/.test(withoutComments(text)))
    .map(([path]) => path)
}

/** This save's golden files out of every file found (e.g. import.meta.glob('./*.json', { eager: true, import: 'default' })). */
export function goldenSavesFor(key: string, files: Record<string, unknown>): { file: string; version: number; golden: GoldenSave }[] {
  return Object.entries(files)
    .map(([file, golden]) => ({ file: file.replace(/^.*[\\/]/, ''), version: goldenVersionOf(key, file), golden: golden as GoldenSave }))
    .filter((g): g is { file: string; version: number; golden: GoldenSave } => g.version !== null)
    .sort((a, b) => a.version - b.version || a.file.localeCompare(b.file))
}

/** The text of a golden save file for `data` saved at today's version. */
export function makeGoldenSave<T>(save: Save<T>, data: T, about: string): string {
  const storage = memoryStorage()
  save.withStorage(storage).save(data)
  const stored = JSON.parse(storage.data[save.key])
  return `${JSON.stringify({ about, stored, expect: data }, null, 2)}\n`
}

// --- the checks ---------------------------------------------------------------------------------------------------

/** A plain save to test: a slots save is tested through one of its slots. */
function testable(save: SaveUnderTest['save'], storage: MemoryStorage): Save<unknown> {
  const placed = save.withStorage(storage)
  return 'slot' in placed ? placed.slot('test') : placed
}

/** Same data? (compared as JSON — what a save really is) */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A golden save loads with today's code: from the save itself (not a fallback), and with its expected values. */
export function checkGoldenSave(save: SaveUnderTest['save'], golden: GoldenSave): string[] {
  const storage = memoryStorage()
  const target = testable(save, storage)
  // a string is the stored text exactly (a plain old value like done, or a record copied from DevTools as text)
  storage.data[target.key] = typeof golden.stored === 'string' ? golden.stored : JSON.stringify(golden.stored)
  const loaded = target.load() as Record<string, unknown>
  const report = target.report()
  const problems: string[] = []
  if (report.newer) problems.push(`it is version ${report.newer}, newer than today's ${save.version} — a golden save from the future?`)
  else if (report.from !== 'save') problems.push(`it didn't load — the game started fresh instead (${report.problems.join('; ') || 'nothing readable'})`)
  for (const [field, value] of Object.entries(golden.expect ?? {})) {
    if (!same(loaded?.[field], value)) problems.push(`"${field}" loaded as ${JSON.stringify(loaded?.[field])}, expected ${JSON.stringify(value)}`)
  }
  return problems
}

/** Save → load gives back exactly what was saved. */
export function checkRoundTrip(save: SaveUnderTest['save'], sample: unknown): string[] {
  const storage = memoryStorage()
  const target = testable(save, storage)
  const data = sample ?? target.load()
  const result = target.save(data)
  if (!result.ok) return [`saving failed: ${result.message}`]
  const loaded = target.load()
  return same(loaded, data) ? [] : [`saved ${JSON.stringify(data)} but loaded ${JSON.stringify(loaded)}`]
}

/** Damaged saves: cut off, the wrong type, empty — each falls back to the backup, never crashes, never wipes it. */
export function checkDamagedSaves(save: SaveUnderTest['save'], sample: unknown): string[] {
  try { return damagedSaveProblems(save, sample) } catch (error) { return [`it threw ${(error as Error)?.message ?? error}`] }
}

function damagedSaveProblems(save: SaveUnderTest['save'], sample: unknown): string[] {
  const problems: string[] = []
  const probe = testable(save, memoryStorage())
  const data = sample ?? probe.load()
  const good = (() => { const s = memoryStorage(); const t = testable(save, s); t.save(data); return s.data[t.key] })()
  const record = JSON.parse(good) as SaveRecord
  const broken: Record<string, string> = {
    'cut off mid-write': good.slice(0, Math.floor(good.length / 2)),
    'empty': '',
    'not JSON': '{{{',
    'the wrong type (a number)': '42',
    'its data the wrong type': JSON.stringify({ ...record, data: 'oops' }),
    'its version the wrong type': JSON.stringify({ ...record, version: 'one' }),
  }
  for (const [what, text] of Object.entries(broken)) {
    const storage = memoryStorage()
    const target = testable(save, storage)
    storage.data[target.key] = text
    storage.data[`${target.key}~1`] = good
    let loaded: unknown
    try { loaded = target.load() } catch (error) { problems.push(`${what}: load() threw ${(error as Error)?.message ?? error}`); continue }
    if (!same(loaded, data)) problems.push(`${what}: didn't fall back to the backup (loaded ${JSON.stringify(loaded)})`)
    if (storage.data[`${target.key}~1`] !== good) problems.push(`${what}: the backup was changed`)
  }
  // every copy broken → fresh, no crash
  const storage = memoryStorage()
  const target = testable(save, storage)
  storage.data[target.key] = '{'
  storage.data[`${target.key}~1`] = '['
  try { target.load() } catch (error) { problems.push(`every copy broken: load() threw ${(error as Error)?.message ?? error}`) }
  return problems
}

/** Full (or blocked) storage: saving says so instead of throwing, the game keeps running on its last save. */
export function checkFullStorage(save: SaveUnderTest['save'], sample: unknown): string[] {
  try { return fullStorageProblems(save, sample) } catch (error) { return [`it threw ${(error as Error)?.message ?? error}`] }
}

function fullStorageProblems(save: SaveUnderTest['save'], sample: unknown): string[] {
  const problems: string[] = []
  const storage = memoryStorage()
  const target = testable(save, storage)
  const data = sample ?? target.load()
  target.save(data)
  storage.full = true
  try {
    const result = target.save(data)
    if (result.ok) problems.push('saving into a full storage said it worked')
    if (!same(target.load(), data)) problems.push('after a failed save, the last save no longer loads')
  } catch (error) {
    problems.push(`full storage: save() threw ${(error as Error)?.message ?? error}`)
  }
  storage.blocked = true
  try {
    target.load()
    target.save(data)
  } catch (error) {
    problems.push(`blocked storage: threw ${(error as Error)?.message ?? error}`)
  }
  return problems
}

/** A run that ended (won, lost, abandoned) never comes back: not as Continue, not from a backup, not after a reload.
 *  Backups are put in place first (as a few more turns would make them), so a plain clear-the-newest is caught. */
export function checkRunEnds(run: Run<any>, sample: unknown): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any -- any of the game's runs
  try {
    const storage = memoryStorage()
    const target = run.withStorage(storage)
    const data = sample ?? target.save.load()
    const result = target.autosave(data)
    if (!result.ok) return [`autosave failed: ${result.message}`]
    // (the same data saved again in the same millisecond is the same text, which the core doesn't copy into a backup)
    storage.data[backupKey(target.key, 1)] = storage.data[target.key]
    storage.data[backupKey(target.key, 2)] = storage.data[target.key]
    if (!target.pending()) return ['after an autosave, pending() found no run — Continue would never show']
    target.end()
    const problems: string[] = []
    const left = Object.keys(storage.data).filter((k) => storage.data[k] !== '')
    if (left.length) problems.push(`end() left copies behind: ${left.join(', ')}`)
    const again = run.withStorage(storage) // a fresh page after a reload
    if (again.pending()) problems.push('after end() and a reload, Continue still shows')
    if (again.resume().ok) problems.push('after end() and a reload, the finished run loads again')
    return problems
  } catch (error) {
    return [`it threw ${(error as Error)?.message ?? error}`]
  }
}

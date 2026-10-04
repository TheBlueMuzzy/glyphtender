// THE AI TAB'S THINKING — plain functions, no screen (tested in aiLogic.test.ts). The tab (AiTab.tsx) uses them to
// edit personalities and skills without ever changing the rest of a content file (_help, _labels, _sections stay).
import { filterSections, readableKey, type Section } from '../search/searchLogic'
import { tuningSections, type TuningItem } from '../tuning/tuningSections'
import type { AiFile, AiPersonality, AiSettingsFile, AiShift, DevKitAi } from './aiTypes'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The list in a content file (personalities / skills). Missing → []. */
export function listOf<Item>(file: AiFile): Item[] {
  const list = file.data[file.listKey]
  return Array.isArray(list) ? (list as Item[]) : []
}

/** The file's data with a new list — every other key (_help, _labels, _sections…) kept as it was. */
export function withList(file: AiFile, items: unknown[]): Record<string, unknown> {
  return { ...file.data, [file.listKey]: items }
}

/** A note the file keeps for a setting path ("traits.aggression"), from "_labels" or "_help". */
function noteOf(file: AiFile, which: '_labels' | '_help', path: string): string | undefined {
  const notes = file.data[which]
  if (!notes || typeof notes !== 'object') return undefined
  const note = (notes as Record<string, unknown>)[path]
  return typeof note === 'string' ? note : undefined
}

/** The readable name of a setting: the file's _labels, else made from the key ("beliefNoise" → "Belief noise"). */
export const labelOf = (file: AiFile, path: string) => noteOf(file, '_labels', path) ?? readableKey(path.split('.').pop() ?? path)
/** Its help line from the file's _help, or nothing. */
export const helpOf = (file: AiFile, path: string) => noteOf(file, '_help', path)

/** Set one trait's range: both ends kept inside 0–100, low end never above the high end (the moved end pushes the other). */
export function withRange(p: AiPersonality, trait: string, min: number, max: number, moved: 'min' | 'max'): AiPersonality {
  let lo = clamp(Math.round(min), 0, 100)
  let hi = clamp(Math.round(max), 0, 100)
  if (lo > hi) {
    if (moved === 'min') hi = lo
    else lo = hi
  }
  return { ...p, traits: { ...p.traits, [trait]: { min: lo, max: hi } } }
}

/** Move one goal in the priority list (drag-and-drop, or ▲ ▼). Out-of-range moves change nothing. */
export function moveGoal(goals: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= goals.length || to >= goals.length) return goals
  const next = [...goals]
  const [goal] = next.splice(from, 1)
  next.splice(to, 0, goal)
  return next
}

/** A name nobody uses yet: "Bully2", "Bully3"… */
export function freeId(base: string, taken: string[]): string {
  const clean = base.replace(/[^A-Za-z0-9_-]/g, '') || 'New'
  if (!taken.includes(clean)) return clean
  for (let n = 2; ; n++) if (!taken.includes(`${clean}${n}`)) return `${clean}${n}`
}

/**
 * Set (or clear) how much every move also tries for one goal: steady[goal] = 0–1. undefined = not set (the key goes);
 * when no goal is left, "steady" itself goes, so the personality is as if it never had one.
 */
export function withSteady(p: AiPersonality, goal: string, weight: number | undefined): AiPersonality {
  const steady = { ...p.steady }
  if (weight === undefined) delete steady[goal]
  else steady[goal] = clamp(weight, 0, 1)
  const next: AiPersonality = { ...p, steady }
  if (Object.keys(steady).length === 0) delete next.steady
  return next
}

/** A steady goal's row name: the file's _labels "steady.<GOAL>" if it has one, else the goal's id ("TRAP"). */
export function steadyLabel(file: AiFile, goal: string): string {
  return noteOf(file, '_labels', `steady.${goal}`) ?? goal
}

/** A full copy (nothing shared with the original) under a new name. */
export function copyPersonality(p: AiPersonality, id: string): AiPersonality {
  return { ...structuredClone(p), id }
}

/** The mood shift added by "+ Add shift": the first reading and trait, a small nudge. */
export function newShift(readings: string[], traits: string[]): AiShift {
  return { reading: readings[0] ?? 'reading', from: 5, full: 10, trait: traits[0] ?? 'trait', by: 10 }
}

/** Read a value at a key path (["ai", "personality", "Bully", "bio"]). Missing → undefined. */
export function getAt(data: unknown, path: string[]): unknown {
  let at: unknown = data
  for (const key of path) {
    if (!at || typeof at !== 'object') return undefined
    at = (at as Record<string, unknown>)[key]
  }
  return at
}

/** A copy of `data` with the value at `path` set, making any missing objects on the way. The original is untouched. */
export function setAt(data: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) return data
  const [key, ...rest] = path
  const inner = data[key]
  const child = inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : {}
  return { ...data, [key]: rest.length ? setAt(child, rest, value) : value }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Every plain value inside, by its path: { traits: { greed: { min: 30 } } } → "traits.greed.min" = 30. */
function flatten(value: unknown, path = '', out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out)
  } else {
    out[path] = Array.isArray(value) ? JSON.stringify(value) : String(value)
  }
  return out
}

/** Plain-English lines for what changed in a list of items (by id): "Bully: traits.greed.min 30 → 40", "new: Bully2". */
export function listChanges(before: { id: string }[], after: { id: string }[]): string[] {
  const lines: string[] = []
  for (const item of after) {
    const old = before.find((b) => b.id === item.id)
    if (!old) {
      lines.push(`new: ${item.id} (a copy — ${JSON.stringify(item)})`)
      continue
    }
    if (same(old, item)) continue
    const a = flatten(old)
    const b = flatten(item)
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] !== b[key]) lines.push(`${item.id}: ${key} ${a[key] ?? '(none)'} → ${b[key] ?? '(none)'}`)
    }
  }
  for (const old of before) if (!after.some((a) => a.id === old.id)) lines.push(`removed: ${old.id}`)
  return lines
}

// ---- Sections + search ----
// The tab's parts sit in the content files' own "_sections" (so they're named and grouped where Muzzy edits them),
// plus the tab's own: the bio, watching a game and the Personality Check.

/** One searchable setting: its key path in the file, readable name and help line. */
export type AiItem = { key: string; label: string; help?: string; file: string }
export type AiSection = Section<AiItem> & {
  file: 'personalities' | 'skills' | 'settings' | 'tab'
  keys: string[]
  /** A settings section's rows (the Tuning tab's FieldRow): file = the settings file's name ("goals"). */
  fields?: TuningItem[]
  /** A settings section's note for the whole file (its _help "_file"), shown at the top. */
  note?: string
}

export const BIO_SECTION = 'AI: bio'
export const WATCH_SECTION = 'AI: watch a game'
export const CHECK_SECTION = 'AI: Personality Check'

/** The sections a file lists in "_sections" (title → keys), + one for any settings they leave out. */
function fileSections(file: AiFile, which: 'personalities' | 'skills', fallbackTitle: string): AiSection[] {
  const fileName = file.path.split('/').pop() ?? file.path
  const notes = [
    ...Object.keys((file.data._labels as object) ?? {}),
    ...Object.keys((file.data._help as object) ?? {}),
  ].filter((k) => k !== '_file')
  const first = listOf<Record<string, unknown>>(file)[0] ?? {}
  const sections = { ...((file.data._sections as Record<string, string[]> | undefined) ?? {}) }
  // Settings no section lists still get one, so nothing is ever hidden ("AI: personality — more")
  const listed = Object.values(sections).flat()
  const left = Object.keys(first).filter((k) => !listed.includes(k))
  if (left.length) sections[listed.length ? `${fallbackTitle} — more` : fallbackTitle] = left
  return Object.entries(sections).map(([title, keys]) => {
    const paths = [...new Set([...keys, ...notes.filter((n) => keys.some((k) => n.startsWith(`${k}.`)))])]
    return {
      id: `ai:${title}`,
      title,
      file: which,
      keys,
      items: paths.map((key) => ({ key, label: labelOf(file, key), help: helpOf(file, key), file: fileName })),
    }
  })
}

/** "content/ai/goals.json" → "goals" — the name a settings file's rows go by (TuningItem.file). */
export const settingsName = (path: string) => (path.split('/').pop() ?? path).replace(/\.json$/, '')

/** The whole-file note of a settings file: _help as one string, or its "_file" line. */
function fileNote(data: Record<string, unknown>): string | undefined {
  const help = data._help
  if (typeof help === 'string') return help
  const line = help && typeof help === 'object' ? (help as Record<string, unknown>)._file : undefined
  return typeof line === 'string' ? line : undefined
}

/** The game's settings files (goals.json, pace.json…) in sections, exactly like the Tuning tab groups its files. */
function settingsSections(files: AiSettingsFile[]): AiSection[] {
  const named = files.map((f) => ({ name: settingsName(f.path), data: f.data }))
  return tuningSections(named).map((s) => {
    const first = named.find((f) => f.name === s.items[0]?.file)
    return {
      id: `ai:${s.title}`,
      title: s.title,
      file: 'settings',
      keys: [],
      fields: s.items,
      note: first && fileNote(first.data),
      items: s.items.map((item) => ({ key: item.path, label: item.label, help: item.help, file: `${item.file}.json` })),
    }
  })
}

/** Every section of the AI tab, in order: the personality's, its bio, the game's AI settings (goals, pace…), the
 *  skill's, then watching and checking. */
export function aiSections(ai: DevKitAi): AiSection[] {
  const tabSection = (title: string, items: [string, string][]): AiSection => ({
    id: `ai:${title}`, title, file: 'tab', keys: [], items: items.map(([key, label]) => ({ key, label, file: 'AI tab' })),
  })
  return [
    ...fileSections(ai.personalities, 'personalities', 'AI: personality'),
    ...(ai.bios ? [tabSection(BIO_SECTION, [['bio', 'Bio (the one line players read)']])] : []),
    ...settingsSections(ai.settings ?? []),
    ...fileSections(ai.skills, 'skills', 'AI: skill'),
    ...(ai.watch ? [tabSection(WATCH_SECTION, [['watch', 'Watch AIs play: notes and beliefs']])] : []),
    ...(ai.runCheck ? [tabSection(CHECK_SECTION, [['check', 'Run the Personality Check (N games, report)']])] : []),
  ]
}

/** The sections (and settings) matching what was typed in the Dev Kit's search box. */
export const searchAi = (sections: AiSection[], query: string) =>
  filterSections<AiItem, AiSection>(sections, query, (item) => [item.key, item.label, item.help, item.file])

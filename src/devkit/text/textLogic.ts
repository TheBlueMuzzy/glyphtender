// The Text tab's thinking, kept apart from its looks so it can be tested (textLogic.test.ts, in the framework).
// Nothing here touches the page or the files.
//
// A text file is content/text/en.json: nested objects of words, lists of pages, and "_help" notes for people.
//   - Every value gets a path: its keys, list items by number — { "tutorial": { "pages": [{ "body": "Hi" }] } }
//     → ["tutorial", "pages", 0, "body"], key "tutorial.pages.0.body".
//   - flattenText lists every value in file order; unflattenText builds the file back from that list — same keys,
//     same order, lists stay lists. So a Save writes back exactly the file it read, with only the edited words new.
//   - Sections: the file's top-level keys; an object inside is a sub-section. Lists (pages) stay inside their
//     section as fields named from there: "pages › 2 › body" (counted from 1, like a person would).
//   - "_help" (any key starting with _) holding text = a grey note under its section, never edited.
//   - Numbers and true/false are shown, not edited.
import type { Change } from '../color/colorLogic'
import { matchesAll, searchTerms } from '../search/searchLogic'

export type Key = string | number // a number = a place in a list
export type TextLeaf = {
  path: Key[]
  key: string // "tutorial.overview.pages.1.body"
  kind: 'text' | 'note' | 'other' // other = a number, true/false, null, or an empty {} / []
  value: unknown
}
export type TextValues = Record<string, string> // key → words, for every 'text' leaf

const isNote = (key: Key) => typeof key === 'string' && key.startsWith('_')
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export const keyOf = (path: Key[]) => path.join('.')

/** Every value in the file, in file order. A "_" key's whole value is one note leaf (text or not), kept as it is. */
export function flattenText(data: unknown, prefix: Key[] = [], underNote = false): TextLeaf[] {
  const leaves: TextLeaf[] = []
  const entries: [Key, unknown][] = Array.isArray(data) ? data.map((v, i) => [i, v]) : Object.entries(data as object)
  for (const [k, value] of entries) {
    const path = [...prefix, k]
    const note = underNote || isNote(k)
    const empty = value !== null && typeof value === 'object' && Object.keys(value).length === 0
    if (value !== null && typeof value === 'object' && !empty && !note) leaves.push(...flattenText(value, path))
    else leaves.push({ path, key: keyOf(path), kind: note ? 'note' : typeof value === 'string' ? 'text' : 'other', value })
  }
  return leaves
}

/** The file back from its leaves: same keys in the same order, lists as lists. */
export function unflattenText(leaves: TextLeaf[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const { path, value } of leaves) {
    let here: Record<Key, unknown> = root
    path.forEach((k, i) => {
      if (i === path.length - 1) here[k] = structuredClone(value)
      else here = (here[k] ??= typeof path[i + 1] === 'number' ? [] : {}) as Record<Key, unknown>
    })
  }
  return root
}

/** The words of every text leaf, by key. */
export const textValues = (leaves: TextLeaf[]): TextValues =>
  Object.fromEntries(leaves.filter((l) => l.kind === 'text').map((l) => [l.key, l.value as string]))

/** The file with these words in it (keys the file doesn't have as text are ignored). */
export const withTexts = (leaves: TextLeaf[], values: TextValues) =>
  unflattenText(leaves.map((l) => (l.kind === 'text' && l.key in values ? { ...l, value: values[l.key] } : l)))

/** The keys whose words differ. */
export const changedKeys = (now: TextValues, before: TextValues) => Object.keys(now).filter((k) => k in before && now[k] !== before[k])

// ---- {placeholders}: the bits of a sentence the game fills in, e.g. "{player}'s turn" ----

/** Every {name} in a text, once each, in order: "{player} — {n} of {total}" → ["player", "n", "total"] */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]
}

/** The {names} the original text had that the edited one lost. */
export const missingPlaceholders = (original: string, edited: string) => {
  const kept = new Set(placeholdersIn(edited))
  return placeholdersIn(original).filter((name) => !kept.has(name))
}

/** The warning under a box that lost one. */
export const missingWarning = (name: string) => `{${name}} is missing — the game fills it in`

/** Every changed text that lost a {placeholder}: key → the missing names. Save waits while there are any. */
export function placeholderProblems(now: TextValues, saved: TextValues): Record<string, string[]> {
  const problems: Record<string, string[]> = {}
  for (const key of changedKeys(now, saved)) {
    const missing = missingPlaceholders(saved[key], now[key])
    if (missing.length) problems[key] = missing
  }
  return problems
}

// ---- Sections ----

export type TextField = { key: string; path: Key[]; label: string; kind: 'text' | 'other'; value: unknown }
export type TextSection = {
  id: string // "text:tutorial.overview" — unique in the Dev Kit (search, chips and open/closed state use it)
  title: string // its own key: "overview"
  path: Key[]
  notes: string[] // its "_help" texts
  fields: TextField[]
  children: TextSection[] // objects inside it
}

/** How a field is named inside its section: ["tutorial","overview","pages",1,"body"] from tutorial.overview → "pages › 2 › body" */
export const friendlyLabel = (path: Key[], from: Key[]) =>
  path.slice(from.length).map((k) => (typeof k === 'number' ? String(k + 1) : k)).join(' › ')

/** The sections of a file: one per top-level object, objects inside as sub-sections. Top-level words → "Other words". */
export function textSections(data: unknown, idPrefix = 'text'): { notes: string[]; sections: TextSection[] } {
  const build = (value: Record<string, unknown>, path: Key[]): TextSection => {
    const section: TextSection = { id: `${idPrefix}:${keyOf(path)}`, title: String(path[path.length - 1]), path, notes: [], fields: [], children: [] }
    for (const [k, v] of Object.entries(value)) {
      if (isNote(k)) {
        if (typeof v === 'string' && v.trim()) section.notes.push(v)
      } else if (isRecord(v) && Object.keys(v).length > 0) section.children.push(build(v, [...path, k]))
      else section.fields.push(...fieldsOf(v, [...path, k], path))
    }
    return section
  }
  const fieldsOf = (value: unknown, path: Key[], from: Key[]): TextField[] =>
    flattenText({ x: value }, []).map((leaf) => {
      const full = [...path, ...leaf.path.slice(1)]
      return { key: keyOf(full), path: full, label: friendlyLabel(full, from), kind: leaf.kind === 'text' ? 'text' : 'other', value: leaf.value }
    })

  const root = build(isRecord(data) ? data : {}, [])
  const loose: TextSection = { ...root, id: `${idPrefix}:`, title: 'Other words', notes: [], children: [] }
  return { notes: root.notes, sections: [...root.children, ...(loose.fields.length ? [loose] : [])] }
}

/** How many words-to-edit a section holds, sub-sections included. */
export const countFields = (s: TextSection): number => s.fields.length + s.children.reduce((n, c) => n + countFields(c), 0)

/** Every field of a section, sub-sections included. */
export const allFields = (s: TextSection): TextField[] => [...s.fields, ...s.children.flatMap(allFields)]

/** The ids of a section and every section above it ("text:a", "text:a.b") — to open them all on the way to it. */
export const sectionIdsTo = (s: TextSection, idPrefix = 'text') => s.path.map((_, i) => `${idPrefix}:${keyOf(s.path.slice(0, i + 1))}`)

// ---- Search ----

/**
 * The texts a search looks through for one field: its key (also split into words), its name, its words now AND as
 * saved — so a box doesn't vanish from the results while you're typing in it.
 */
const fieldTexts = (f: TextField, values: TextValues) => [f.key, f.label, values[f.key], String(f.value)]

/**
 * The sections, keeping only the fields matching every word typed (case doesn't matter, any order), and only
 * sections with a match somewhere inside. Nothing typed → everything.
 */
export function searchText(sections: TextSection[], query: string, values: TextValues): TextSection[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return sections
  const filter = (s: TextSection): TextSection | null => {
    const fields = s.fields.filter((f) => matchesAll(terms, fieldTexts(f, values)))
    const children = s.children.map(filter).filter((c): c is TextSection => c !== null)
    return fields.length || children.length ? { ...s, fields, children } : null
  }
  return sections.map(filter).filter((s): s is TextSection => s !== null)
}

// ---- Copy for Claude ----

/** Every text that differs from the page load: "tutorial.x.body": "old" → "new" (quoted, so line breaks show as \n). */
export const listTextChanges = (before: TextValues, now: TextValues): Change[] =>
  changedKeys(now, before).map((key) => ({ name: key, from: JSON.stringify(before[key]), to: JSON.stringify(now[key]) }))

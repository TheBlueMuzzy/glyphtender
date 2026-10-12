// The Review list tab's thinking, kept apart from its looks so it can be tested (reviewLogic.test.ts, in the framework).
// Nothing here touches the page.
import { matchesAll, searchTerms } from '../search/searchLogic'
import type { ExtraMark, ReviewChange, ReviewItem, ReviewStatus } from './reviewTypes'

/** One click on a row moves it on: Open → Yes → No → Open. A row on an extra mark goes back to Open. */
export function nextStatus(status: ReviewStatus): ReviewStatus {
  if (status === 'open') return 'yes'
  if (status === 'yes') return 'no'
  return 'open'
}

const BASE_NAMES: Record<string, string> = { open: 'Open', yes: 'Yes', no: 'No' }

/** How a status reads on screen (and to a screen reader): Open / Yes / No, or the extra mark's name. */
export function statusName(status: ReviewStatus, extras: ExtraMark[] = []): string {
  return BASE_NAMES[status] ?? extras.find((m) => m.id === status)?.name ?? status
}

/** Sort place: Open, Yes, No, then the extra marks in the game's order; anything unknown last. */
function groupOrder(status: ReviewStatus, extras: ExtraMark[]): number {
  const base = ['open', 'yes', 'no'].indexOf(status)
  if (base >= 0) return base
  const extra = extras.findIndex((m) => m.id === status)
  return extra >= 0 ? 3 + extra : 99
}

/** Open first, then Yes, then No, then the extra marks; A–Z inside each. Returns a new list (the one given is left alone). */
export function sortReview(items: ReviewItem[], extras: ExtraMark[] = []): ReviewItem[] {
  return [...items].sort(
    (a, b) =>
      groupOrder(a.status, extras) - groupOrder(b.status, extras) ||
      a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  )
}

/** Unsaved marks: row id → its new status. A row only has a mark while it differs from what's saved. */
export type Marks = Record<string, ReviewStatus>

/** A row's status as shown right now: its unsaved mark, else what's saved. */
export const shownStatus = (item: ReviewItem, marks: Marks): ReviewStatus => marks[item.id] ?? item.status

/** Show this row as `status` — the mark goes away if that's the saved one. */
function markAs(item: ReviewItem, marks: Marks, status: ReviewStatus): Marks {
  const updated = { ...marks }
  if (status === item.status) delete updated[item.id]
  else updated[item.id] = status
  return updated
}

/** Click a row: its next status (Open → Yes → No → Open). */
export const toggleMark = (item: ReviewItem, marks: Marks): Marks => markAs(item, marks, nextStatus(shownStatus(item, marks)))

/** Press an extra mark's letter: the row takes that mark — or, if it already shows it, goes back to Open. */
export function pickExtra(item: ReviewItem, marks: Marks, extra: string): Marks {
  return markAs(item, marks, shownStatus(item, marks) === extra ? 'open' : extra)
}

/** What Save sends: only the rows that changed, in list order. */
export function listChanges(items: ReviewItem[], marks: Marks): ReviewChange[] {
  return items.filter((item) => item.id in marks).map((item) => ({ id: item.id, status: marks[item.id] }))
}

/** After a good Save: the marks become the saved statuses, and the list sorts again. */
export const applyChanges = (items: ReviewItem[], marks: Marks, extras: ExtraMark[] = []): ReviewItem[] =>
  sortReview(items.map((item) => (item.id in marks ? { ...item, status: marks[item.id] } : item)), extras)

/** "412 open · 6 yes · 502 no · 14 british — 3 unsaved" (counting what's shown, unsaved marks included). */
export function countsLine(items: ReviewItem[], marks: Marks, extras: ExtraMark[] = []): string {
  const counts: Record<string, number> = { open: 0, yes: 0, no: 0 }
  for (const m of extras) counts[m.id] = 0
  for (const item of items) {
    const now = shownStatus(item, marks)
    counts[now] = (counts[now] ?? 0) + 1
  }
  const parts = [`${counts.open} open`, `${counts.yes} yes`, `${counts.no} no`, ...extras.map((m) => `${counts[m.id]} ${m.name.toLowerCase()}`)]
  const unsaved = Object.keys(marks).length
  const line = parts.join(' · ')
  return unsaved > 0 ? `${line} — ${unsaved} unsaved` : line
}

/** The rows matching the Dev Kit search box, by label or detail (case doesn't matter; several words = all must match). */
export function searchReview(items: ReviewItem[], query: string): ReviewItem[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return items
  return items.filter((item) => matchesAll(terms, [item.label, item.detail]))
}

/** Copy for Claude: the unsaved changes in plain words (the live build can't save, so this is how they get kept). */
export function reviewForClaude(game: string, tab: string, items: ReviewItem[], marks: Marks, liveBuild: boolean, extras: ExtraMark[] = []): string {
  const changes = items.filter((item) => item.id in marks)
  if (changes.length === 0) return `No unsaved ${tab} review changes in the Dev Kit (${game}).`
  const status = liveBuild ? 'marked in the live build, NOT saved — please write them in' : 'NOT saved yet'
  const lines = changes.map((item) => `- ${item.label}: ${statusName(item.status, extras)} → ${statusName(marks[item.id], extras)}`)
  return [`${tab} review changes from the Dev Kit (${game}) — ${status}:`, ...lines].join('\n')
}

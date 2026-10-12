// The Review list tab's thinking, kept apart from its looks so it can be tested (reviewLogic.test.ts, in the framework).
// Nothing here touches the page.
import { matchesAll, searchTerms } from '../search/searchLogic'
import type { ReviewChange, ReviewItem, ReviewStatus } from './reviewTypes'

/** One click moves a row on: Open → Yes → No → Open. */
export function nextStatus(status: ReviewStatus): ReviewStatus {
  if (status === 'open') return 'yes'
  if (status === 'yes') return 'no'
  return 'open'
}

/** How each status reads on screen (and to a screen reader). */
export const STATUS_NAMES: Record<ReviewStatus, string> = { open: 'Open', yes: 'Yes', no: 'No' }

const GROUP_ORDER: Record<ReviewStatus, number> = { open: 0, yes: 1, no: 2 }

/** Open first, then Yes, then No; A–Z inside each. Returns a new list (the one given is left alone). */
export function sortReview(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort(
    (a, b) =>
      GROUP_ORDER[a.status] - GROUP_ORDER[b.status] ||
      a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) ||
      a.id.localeCompare(b.id),
  )
}

/** Unsaved marks: row id → its new status. A row only has a mark while it differs from what's saved. */
export type Marks = Record<string, ReviewStatus>

/** A row's status as shown right now: its unsaved mark, else what's saved. */
export const shownStatus = (item: ReviewItem, marks: Marks): ReviewStatus => marks[item.id] ?? item.status

/** Click a row: its next status — and the mark goes away if that lands back on the saved one. */
export function toggleMark(item: ReviewItem, marks: Marks): Marks {
  const next = nextStatus(shownStatus(item, marks))
  const updated = { ...marks }
  if (next === item.status) delete updated[item.id]
  else updated[item.id] = next
  return updated
}

/** What Save sends: only the rows that changed, in list order. */
export function listChanges(items: ReviewItem[], marks: Marks): ReviewChange[] {
  return items.filter((item) => item.id in marks).map((item) => ({ id: item.id, status: marks[item.id] }))
}

/** After a good Save: the marks become the saved statuses, and the list sorts again. */
export const applyChanges = (items: ReviewItem[], marks: Marks): ReviewItem[] =>
  sortReview(items.map((item) => (item.id in marks ? { ...item, status: marks[item.id] } : item)))

/** "412 open · 6 yes · 502 no — 3 unsaved" (counting what's shown, unsaved marks included). */
export function countsLine(items: ReviewItem[], marks: Marks): string {
  const counts = { open: 0, yes: 0, no: 0 }
  for (const item of items) counts[shownStatus(item, marks)]++
  const unsaved = Object.keys(marks).length
  const line = `${counts.open} open · ${counts.yes} yes · ${counts.no} no`
  return unsaved > 0 ? `${line} — ${unsaved} unsaved` : line
}

/** The rows matching the Dev Kit search box, by label or detail (case doesn't matter; several words = all must match). */
export function searchReview(items: ReviewItem[], query: string): ReviewItem[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return items
  return items.filter((item) => matchesAll(terms, [item.label, item.detail]))
}

/** Copy for Claude: the unsaved changes in plain words (the live build can't save, so this is how they get kept). */
export function reviewForClaude(game: string, tab: string, items: ReviewItem[], marks: Marks, liveBuild: boolean): string {
  const changes = items.filter((item) => item.id in marks)
  if (changes.length === 0) return `No unsaved ${tab} review changes in the Dev Kit (${game}).`
  const status = liveBuild ? 'marked in the live build, NOT saved — please write them in' : 'NOT saved yet'
  const lines = changes.map((item) => `- ${item.label}: ${STATUS_NAMES[item.status]} → ${STATUS_NAMES[marks[item.id]]}`)
  return [`${tab} review changes from the Dev Kit (${game}) — ${status}:`, ...lines].join('\n')
}

// THE SUBMITTED WORDS LIST (F69) — every word players sent from Pause → Submit a word, plus every word kept out of the
// official list (content/words/submitted.csv: slurs, swears, abbreviations… — F68), each Open, Yes or No.
// Muzzy reviews the Open ones in the Dev Kit Words tab (F70). Knows nothing about Cloudflare: the rows live wherever
// a WordRows says — the Words Durable Object's SQLite (worker.ts) live, a plain Map in the tests.
// The web addresses (/words/submit, /words/list, /words/review) are in ./wordsRoutes.ts.
import type { WordList } from '../src/engine/types'
import submit from '../content/words/submit.json'

export type WordStatus = 'open' | 'yes' | 'no'
export const STATUSES: readonly WordStatus[] = ['open', 'yes', 'no']

/** One row of the list — the same columns as content/words/submitted.csv. */
export interface SubmittedWord {
  word: string
  status: WordStatus
  /** Why it's here: "player" (a player sent it), or the F68 categories (slur, swear, abbreviation, missing form…). */
  category: string
  /** The day it was added, YYYY-MM-DD. */
  added: string
  note: string
}

/** Where the rows are kept. */
export interface WordRows {
  count(): number
  get(word: string): SubmittedWord | null
  add(row: SubmittedWord): void
  /** Changes a row's status; false if there's no such word. */
  setStatus(word: string, status: WordStatus): boolean
  /** How many player-sent words are still waiting for Muzzy (status open, category player). */
  openPlayerCount(): number
  all(): SubmittedWord[]
}

/** The category of a word a player sent. */
export const PLAYER = 'player'

/** content/words/submitted.csv → rows (header: word,status,category,added,note; the note may hold commas). */
export function parseSubmittedCsv(text: string): SubmittedWord[] {
  const rows: SubmittedWord[] = []
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const [word = '', status = '', category = '', added = '', ...note] = line.split(',')
    if (!/^[A-Z]+$/.test(word) || !STATUSES.includes(status as WordStatus)) continue
    rows.push({ word, status: status as WordStatus, category, added, note: note.join(',') })
  }
  return rows
}

/** The first time the list is used it's empty: fill it from the bundled submitted.csv. */
export function seedIfEmpty(rows: WordRows, csvText: string): void {
  if (rows.count() > 0) return
  for (const row of parseSubmittedCsv(csvText)) if (!rows.get(row.word)) rows.add(row)
}

/** Why a submitted word was refused: too short, or not a word at all (not text, not A–Z, too long). */
export type SubmitRefusal = 'too-short' | 'bad-word'

/**
 * A player sends a word. Refused only when it's too short or not letters; otherwise the answer is always the same
 * "ok", whether it was added or not (Muzzy: "the user doesn't need to know"). Added — as Open, category player —
 * only when it's new: not in the official list, not on this list already (any status), and the Open pile isn't full.
 */
export function submitWord(rows: WordRows, sent: unknown, official: WordList, today: string, numbers = submit): { ok: true } | { ok: false; code: SubmitRefusal } {
  if (typeof sent !== 'string') return { ok: false, code: 'bad-word' }
  const word = sent.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(word) || word.length > numbers.maxLetters) return { ok: false, code: 'bad-word' }
  if (word.length < numbers.minLetters) return { ok: false, code: 'too-short' }
  const known = official.has(word) || rows.get(word) !== null
  const full = rows.openPlayerCount() >= numbers.maxOpenPlayerWords
  if (!known && !full) rows.add({ word, status: 'open', category: PLAYER, added: today, note: '' })
  return { ok: true }
}

/** Muzzy's review (the Dev Kit Words tab): new statuses for words on the list. Odd entries are skipped, not fatal. */
export function reviewWords(rows: WordRows, changes: unknown): { changed: number } {
  let changed = 0
  if (!Array.isArray(changes)) return { changed }
  for (const change of changes) {
    const { word, status } = (change ?? {}) as { word?: unknown; status?: unknown }
    if (typeof word !== 'string' || !STATUSES.includes(status as WordStatus)) continue
    if (rows.setStatus(word.toUpperCase(), status as WordStatus)) changed++
  }
  return { changed }
}

/** The rows in a plain Map — for the tests (and anywhere without a database). */
export function memoryRows(): WordRows {
  const map = new Map<string, SubmittedWord>()
  return {
    count: () => map.size,
    get: (word) => map.get(word) ?? null,
    add: (row) => { map.set(row.word, { ...row }) },
    setStatus: (word, status) => {
      const row = map.get(word)
      if (row) row.status = status
      return !!row
    },
    openPlayerCount: () => [...map.values()].filter((r) => r.status === 'open' && r.category === PLAYER).length,
    all: () => [...map.values()].map((r) => ({ ...r })),
  }
}

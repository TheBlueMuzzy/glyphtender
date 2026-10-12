// THE WORDS TAB (F70) — Muzzy reviews player-submitted words (and the words the F68 clean-up left open) in the
// framework's review list tab: Open → Yes → No → B → V per word. It lists ONLY the open (undecided) words — a checklist
// (Muzzy 2026-10-12); Save moves Yes / B / V words into words.csv (plain / ,B / ,V) and out of submitted.csv, No stays
// there, and the tab reloads (Dev Kit 0.12.2) so decided words leave it (vite-plugins/words/wordsVite.ts).
import type { ExtraMark, ReviewChange, ReviewItem } from '../devkit/review/reviewTypes'

/** Words that are real but kept out until F71's Settings toggles (both off by default) — Muzzy 2026-10-12.
 *  British = UK spellings and UK-only words (COLOUR, MATHS); Vulgar = swears from anywhere (BOLLOCKS is V, not B). */
export const WORD_TOGGLES: ExtraMark[] = [
  { id: 'british', letter: 'B', name: 'British' },
  { id: 'vulgar', letter: 'V', name: 'Vulgar' },
]

async function ask<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `The dev server said ${response.status}`)
  return data
}

export const loadWords = () => ask<ReviewItem[]>('/__words/list')

export const saveWordMarks = async (changes: ReviewChange[]) => {
  await ask('/__words/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes }) })
}

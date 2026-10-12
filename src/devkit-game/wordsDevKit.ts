// THE WORDS TAB (F70) — Muzzy reviews player-submitted words (and the words the F68 clean-up left open) in the
// framework's review list tab: Open → Yes → No → B → V per word. It lists ONLY the open (undecided) words — a checklist
// (Muzzy 2026-10-12); Save moves Yes / B / V words into words.csv (plain / ,B / ,V) and out of submitted.csv, No stays
// there, and the tab reloads (Dev Kit 0.12.2) so decided words leave it (vite-plugins/words/wordsVite.ts).
import type { ExtraMark, ReviewChange, ReviewItem } from '../devkit/review/reviewTypes'
import { CAN_SAVE } from '../devkit/saveContent'

/** Words that are real but kept out unless a game turns on its New Game / lobby option (F71, both off at first) — Muzzy 2026-10-12.
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

// The live build has no dev server to ask (a fetch there 404s into every player's console — v0.9.0): say so instead
export const loadWords = () =>
  CAN_SAVE ? ask<ReviewItem[]>('/__words/list') : Promise.reject(new Error('the Words tab works only on the PC (npm run dev)'))

export const saveWordMarks = async (changes: ReviewChange[]) => {
  await ask('/__words/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes }) })
}

// THE WORD FILES, as plain functions (F70) — used by the Words tab's dev-server endpoints (wordsVite.ts).
//   public/words/words.csv      the official list: WORD,zipf — one per line, sorted; F71: WORD,zipf,B (British spelling)
//                               or WORD,zipf,V (vulgar) = counted only when that Settings switch is on
//   content/words/submitted.csv the check-against list (Muzzy 2026-10-12): word,status,category,added,note — only words
//     still undecided (open) or kept out for good (no, with why). Accepted words (Dev Kit Yes / B / V) move to words.csv.
// Nothing here touches the disk or the network, so it's easy to test (wordLists.test.ts).
import { csvFields } from '../../party/csv'
import { STATUSES, type WordStatus } from '../../party/submittedWords'

export { csvFields }

export type Status = WordStatus
export type SubmittedRow = { word: string; status: Status; category: string; added: string; note: string }
export type Change = { id: string; status: Status }

const isStatus = (value: unknown): value is Status => STATUSES.includes(value as Status)

const csvField = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

export function parseSubmitted(text: string): SubmittedRow[] {
  const rows: SubmittedRow[] = []
  for (const line of text.replace(/\r/g, '').split('\n').slice(1)) {
    if (!line.trim()) continue
    const [word, status, category = '', added = '', note = ''] = csvFields(line)
    if (word && isStatus(status)) rows.push({ word: word.toUpperCase(), status, category, added, note })
  }
  return rows
}

/** Open A–Z, then no A–Z — the order Muzzy asked for (2026-10-11; yes / british / vulgar rows no longer stay in the file). */
export function sortSubmitted(rows: SubmittedRow[]): SubmittedRow[] {
  return [...rows].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
}

export function writeSubmitted(rows: SubmittedRow[]): string {
  const lines = sortSubmitted(rows).map((r) => [r.word, r.status, r.category, r.added, r.note].map(csvField).join(','))
  return ['word,status,category,added,note', ...lines].join('\n') + '\n'
}

/** words.csv → word → the rest of its line: "4.49" (plain) or "4.49,B" / "4.23,V" (tagged, F71). */
export function parseOfficial(text: string): Map<string, string> {
  const words = new Map<string, string>()
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const comma = line.indexOf(',')
    if (comma > 0) words.set(line.slice(0, comma).trim().toUpperCase(), line.slice(comma + 1).trim())
  }
  return words
}

/** words.csv: sorted, one WORD,zipf[,tag] per line. */
export function writeOfficial(words: Map<string, string>): string {
  return [...words.keys()].sort().map((w) => `${w},${words.get(w)}`).join('\n') + '\n'
}

/** The file's rows plus any word players sent that the file doesn't have yet (new submissions start open). A word
 *  already in words.csv (plain, B or V) never comes back: the server still remembers it as yes / british / vulgar. */
export function mergeServerRows(rows: SubmittedRow[], server: unknown[], official: ReadonlyMap<string, string> = new Map()): SubmittedRow[] {
  const known = new Set([...rows.map((r) => r.word), ...official.keys()])
  const merged = [...rows]
  for (const entry of server) {
    const e = entry as Partial<SubmittedRow>
    const word = typeof e.word === 'string' ? e.word.toUpperCase() : ''
    if (!/^[A-Z]{2,15}$/.test(word) || known.has(word)) continue
    known.add(word)
    merged.push({ word, status: isStatus(e.status) ? e.status : 'open', category: e.category || 'player', added: e.added || '', note: e.note || '' })
  }
  return merged
}

/** The marks that ACCEPT a word (Muzzy 2026-10-12): it goes into words.csv — plain, or tagged B / V for the Settings
 *  switches (F71) — and leaves submitted.csv, which keeps only what's still undecided (open) or kept out (no). */
export const ACCEPTED: Partial<Record<Status, '' | 'B' | 'V'>> = { yes: '', british: 'B', vulgar: 'V' }
const isAccepted = (status: Status) => ACCEPTED[status] !== undefined

/** Muzzy's marks → the word files. yes / british / vulgar = into words.csv (plain / ,B / ,V) with its Zipf score, and out
 *  of submitted.csv · no = out of words.csv, stays in submitted.csv as no · open = stays, words.csv left as it is.
 *  Any row still marked yes / british / vulgar in the file (from before 2026-10-12) is folded in the same way, so a save
 *  with no marks tidies the file. A Zipf score already in words.csv is kept; only new words ask wordfreq (zipfOf). */
export function applyChanges(rows: SubmittedRow[], official: Map<string, string>, changes: Change[], zipfOf: (words: string[]) => Record<string, number>) {
  const byWord = new Map(rows.map((r) => [r.word, { ...r }]))
  const valid = changes.filter((c) => byWord.has(c.id) && isStatus(c.status))
  for (const c of valid) byWord.get(c.id)!.status = c.status
  const words = new Map(official)
  const folding = [...byWord.values()].filter((r) => isAccepted(r.status))
  const unscored = folding.map((r) => r.word).filter((w) => !words.has(w))
  const scores = unscored.length ? zipfOf(unscored) : {}
  for (const r of folding) {
    const zipf = words.get(r.word)?.split(',')[0] ?? (scores[r.word] ?? 0).toFixed(2)
    const tag = ACCEPTED[r.status]
    words.set(r.word, tag ? `${zipf},${tag}` : zipf)
    byWord.delete(r.word)
  }
  for (const c of valid) if (c.status === 'no') words.delete(c.id)
  return { rows: [...byWord.values()], official: words, applied: valid }
}

/** Words whose mark on the online server isn't the file's (a save whose marks didn't reach it, or the server's own
 *  seed being older than the file) — every save sends these, so the server catches up. Rows still in submitted.csv
 *  are compared by status; an accepted word has left that file, so it's compared by its words.csv tag instead
 *  (plain = yes, B = british, V = vulgar) — else a Yes whose send failed stays Open on the server for good, and its
 *  Open pile fills up until it stops taking words (review 2026-10-12). */
export function outOfStep(rows: SubmittedRow[], server: unknown[], official: Map<string, string> = new Map()): Change[] {
  const onServer = new Map<string, unknown>()
  for (const entry of server) {
    const e = entry as Partial<SubmittedRow>
    if (typeof e.word === 'string') onServer.set(e.word.toUpperCase(), e.status)
  }
  const fromFile = rows.filter((r) => onServer.has(r.word) && onServer.get(r.word) !== r.status).map((r) => ({ id: r.word, status: r.status }))
  const inFile = new Set(rows.map((r) => r.word))
  const fromList: Change[] = []
  for (const [word, status] of onServer) {
    const line = official.get(word)
    if (inFile.has(word) || line === undefined) continue
    const tag = line.split(',')[1]
    const accepted: Status = tag === 'B' ? 'british' : tag === 'V' ? 'vulgar' : 'yes'
    if (status !== accepted) fromList.push({ id: word, status: accepted })
  }
  return [...fromFile, ...fromList]
}

/** What the Dev Kit's review list shows for a row. */
export const reviewItem = (r: SubmittedRow) => ({ id: r.word, label: r.word, status: r.status, detail: [r.category, r.note].filter(Boolean).join(' · ') })

// THE TWO WORD FILES, as plain functions (F70) — used by the Words tab's dev-server endpoints (wordsVite.ts).
//   public/words/words.csv      the official list: WORD,zipf — one per line, sorted
//   content/words/submitted.csv every word Muzzy has decided on or still has to: word,status,category,added,note
//     status: open (not decided yet) · yes (in the official list) · no (kept out for good)
// Nothing here touches the disk or the network, so it's easy to test (wordLists.test.ts).

export type Status = 'open' | 'yes' | 'no'
export type SubmittedRow = { word: string; status: Status; category: string; added: string; note: string }
export type Change = { id: string; status: Status }

const STATUSES: Status[] = ['open', 'yes', 'no']
const isStatus = (value: unknown): value is Status => STATUSES.includes(value as Status)

/** One CSV line → its fields ("quoted, fields" keep their commas). */
export function csvFields(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { fields.push(field); field = '' }
    else field += c
  }
  fields.push(field)
  return fields
}

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

/** Open A–Z, then yes A–Z, then no A–Z — the order Muzzy asked for (2026-10-11). */
export function sortSubmitted(rows: SubmittedRow[]): SubmittedRow[] {
  return [...rows].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
}

export function writeSubmitted(rows: SubmittedRow[]): string {
  const lines = sortSubmitted(rows).map((r) => [r.word, r.status, r.category, r.added, r.note].map(csvField).join(','))
  return ['word,status,category,added,note', ...lines].join('\n') + '\n'
}

export function parseOfficial(text: string): Map<string, string> {
  const words = new Map<string, string>()
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const [word, zipf] = line.split(',')
    if (word && zipf !== undefined) words.set(word.trim().toUpperCase(), zipf.trim())
  }
  return words
}

export function writeOfficial(words: Map<string, string>): string {
  return [...words.keys()].sort().map((w) => `${w},${words.get(w)}`).join('\n') + '\n'
}

/** The file's rows plus any word players sent that the file doesn't have yet (new submissions start open). */
export function mergeServerRows(rows: SubmittedRow[], server: unknown[]): SubmittedRow[] {
  const known = new Set(rows.map((r) => r.word))
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

/** Muzzy's marks → both files. yes = in the official list (with its Zipf score), no = out of it, open = left as it is. */
export function applyChanges(rows: SubmittedRow[], official: Map<string, string>, changes: Change[], zipfOf: (words: string[]) => Record<string, number>) {
  const byWord = new Map(rows.map((r) => [r.word, { ...r }]))
  const valid = changes.filter((c) => byWord.has(c.id) && isStatus(c.status))
  for (const c of valid) byWord.get(c.id)!.status = c.status
  const words = new Map(official)
  const adding = valid.filter((c) => c.status === 'yes' && !words.has(c.id)).map((c) => c.id)
  const scores = adding.length ? zipfOf(adding) : {}
  for (const w of adding) words.set(w, (scores[w] ?? 0).toFixed(2))
  for (const c of valid) if (c.status === 'no') words.delete(c.id)
  return { rows: [...byWord.values()], official: words, applied: valid }
}

/** What the Dev Kit's review list shows for a row. */
export const reviewItem = (r: SubmittedRow) => ({ id: r.word, label: r.word, status: r.status, detail: [r.category, r.note].filter(Boolean).join(' · ') })

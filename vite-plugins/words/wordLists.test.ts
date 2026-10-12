import { describe, expect, it } from 'vitest'
import { applyChanges, csvFields, mergeServerRows, parseOfficial, parseSubmitted, reviewItem, writeOfficial, writeSubmitted } from './wordLists'

const file = [
  'word,status,category,added,note',
  'COCK,open,swear or word,2026-10-11,rooster',
  'APT,open,short form or word,2026-10-11,fitting',
  'WRY,yes,lost by mistake,2026-10-11,restored 2026-10-11',
  'FUCK,no,swear,2026-10-11,',
].join('\n') + '\n'
const official = 'AA,4.01\nCOCK,3.90\nWRY,2.86\n'
const zipf = (words: string[]) => Object.fromEntries(words.map((w) => [w, 3.456]))

describe('the Words tab’s word files (F70)', () => {
  it('reads and writes submitted.csv the same way, sorted open | yes | no, A–Z in each', () => {
    const rows = parseSubmitted(file)
    expect(rows.map((r) => r.word)).toEqual(['COCK', 'APT', 'WRY', 'FUCK'])
    expect(writeSubmitted(rows).split('\n').slice(1, 5).map((l) => l.split(',')[0])).toEqual(['APT', 'COCK', 'WRY', 'FUCK'])
    expect(parseSubmitted(writeSubmitted(rows))).toEqual(parseSubmitted(writeSubmitted(parseSubmitted(writeSubmitted(rows)))))
  })

  it('keeps commas inside a quoted note', () => {
    expect(csvFields('ASS,open,swear or word,2026-10-11,"donkey, the animal"')).toEqual(['ASS', 'open', 'swear or word', '2026-10-11', 'donkey, the animal'])
    const rows = parseSubmitted('word,status,category,added,note\nASS,open,swear or word,2026-10-11,"donkey, the animal"\n')
    expect(parseSubmitted(writeSubmitted(rows))[0].note).toBe('donkey, the animal')
  })

  it('adds new player words from the server as open, and never doubles a word the file has', () => {
    const merged = mergeServerRows(parseSubmitted(file), [
      { word: 'glimmerous', status: 'open', category: 'player', added: '2026-10-12' },
      { word: 'COCK', status: 'yes' },
      { word: 'x1!' },
    ])
    expect(merged.map((r) => r.word)).toEqual(['COCK', 'APT', 'WRY', 'FUCK', 'GLIMMEROUS'])
    expect(merged.find((r) => r.word === 'COCK')!.status).toBe('open') // the file's mark wins
    expect(merged.at(-1)).toMatchObject({ status: 'open', category: 'player', added: '2026-10-12' })
  })

  it('yes adds a word with its Zipf score, no takes it out, open leaves the list alone', () => {
    const result = applyChanges(parseSubmitted(file), parseOfficial(official), [
      { id: 'APT', status: 'yes' },
      { id: 'COCK', status: 'no' },
      { id: 'WRY', status: 'open' },
      { id: 'NOT-IN-FILE', status: 'yes' },
    ], zipf)
    expect(writeOfficial(result.official)).toBe('AA,4.01\nAPT,3.46\nWRY,2.86\n')
    expect(result.applied.map((c) => c.id)).toEqual(['APT', 'COCK', 'WRY'])
    expect(result.rows.find((r) => r.word === 'COCK')!.status).toBe('no')
  })

  it('shows a row as the review list wants it', () => {
    expect(reviewItem(parseSubmitted(file)[0])).toEqual({ id: 'COCK', label: 'COCK', status: 'open', detail: 'swear or word · rooster' })
    expect(reviewItem(parseSubmitted(file)[3]).detail).toBe('swear')
  })
})

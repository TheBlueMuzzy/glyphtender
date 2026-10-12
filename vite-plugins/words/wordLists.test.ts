import { describe, expect, it } from 'vitest'
import { parseSubmittedCsv } from '../../party/submittedWords'
import { applyChanges, csvFields, mergeServerRows, outOfStep, parseOfficial, parseSubmitted, reviewItem, writeOfficial, writeSubmitted } from './wordLists'

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

  it('F71: a server word already in words.csv (plain, B or V) never comes back as a new open row', () => {
    const inList = parseOfficial('AA,4.01\nCOLOUR,4.49,B\nTITS,3.10,V\n')
    const merged = mergeServerRows([], [
      { word: 'COLOUR', status: 'british' }, { word: 'TITS', status: 'vulgar' }, { word: 'AA', status: 'yes' }, { word: 'GLIMMEROUS', status: 'open' },
    ], inList)
    expect(merged.map((r) => r.word)).toEqual(['GLIMMEROUS'])
  })

  it('yes / B / V move a word into words.csv (plain / ,B / ,V) with its Zipf and out of submitted.csv; no takes it out and stays; open stays', () => {
    const asked: string[][] = []
    const result = applyChanges(parseSubmitted(file + 'COLOUR,open,british spelling,2026-10-12,\nBUM,open,swear or word,2026-10-12,\n'), parseOfficial(official), [
      { id: 'APT', status: 'yes' }, // new → wordfreq is asked
      { id: 'COCK', status: 'vulgar' }, // already in words.csv → keeps its score, gains the V tag
      { id: 'COLOUR', status: 'british' },
      { id: 'BUM', status: 'no' },
      { id: 'NOT-IN-FILE', status: 'yes' },
    ], (words) => (asked.push(words), zipf(words)))
    expect(asked).toEqual([['APT', 'COLOUR']])
    expect(writeOfficial(result.official)).toBe('AA,4.01\nAPT,3.46\nCOCK,3.90,V\nCOLOUR,3.46,B\nWRY,2.86\n')
    expect(result.applied.map((c) => c.id)).toEqual(['APT', 'COCK', 'COLOUR', 'BUM'])
    // left in the check-against list: the No words (FUCK, BUM) — WRY's old yes row was folded in too
    expect(result.rows.map((r) => `${r.word} ${r.status}`)).toEqual(['FUCK no', 'BUM no'])
  })

  it('a save with no marks folds rows accepted before 2026-10-12 (yes / british / vulgar) and keeps open + no', () => {
    const rows = parseSubmitted(file + 'MATHS,british,british,2026-10-11,\nTIT,vulgar,swear or word,2026-10-11,a small bird\n')
    const result = applyChanges(rows, parseOfficial(official), [], zipf)
    expect(writeOfficial(result.official)).toBe('AA,4.01\nCOCK,3.90\nMATHS,3.46,B\nTIT,3.46,V\nWRY,2.86\n')
    expect(result.rows.map((r) => r.word)).toEqual(['COCK', 'APT', 'FUCK'])
  })

  it('a No on a tagged word takes it out of words.csv', () => {
    const result = applyChanges(parseSubmitted(file), parseOfficial('COCK,3.90,V\n'), [{ id: 'COCK', status: 'no' }], zipf)
    expect(result.official.has('COCK')).toBe(false)
  })


  it('finds the marks the online server missed (a failed send), so the next save sends them too', () => {
    const rows = parseSubmitted(file)
    const server = [{ word: 'COCK', status: 'open' }, { word: 'WRY', status: 'yes' }, { word: 'FUCK', status: 'open' }, { word: 'ZZZ', status: 'no' }]
    expect(outOfStep(rows, server)).toEqual([{ id: 'FUCK', status: 'no' }])
    expect(outOfStep(rows, [])).toEqual([]) // server out of reach: nothing to compare
  })

  it('re-sends an accepted word the server still has as open (its send failed) — by its words.csv tag', () => {
    const list = new Map([['GLIMMEROUS', '0.00'], ['COLOUR', '3.10,B'], ['BOLLOCKS', '2.50,V'], ['ZYGOTES', '2.01']])
    const server = [
      { word: 'GLIMMEROUS', status: 'open' }, { word: 'COLOUR', status: 'open' }, { word: 'BOLLOCKS', status: 'vulgar' }, { word: 'NEWONE', status: 'open' },
    ]
    expect(outOfStep([], server, list)).toEqual([{ id: 'GLIMMEROUS', status: 'yes' }, { id: 'COLOUR', status: 'british' }])
  })

  it('reads a quoted note the same way the online server does (one shared reader, party/csv.ts)', () => {
    const line = 'ASS,open,swear or word,2026-10-11,"donkey, ""the"" animal"'
    const csv = `word,status,category,added,note\n${line}\n`
    expect(parseSubmitted(csv)[0].note).toBe('donkey, "the" animal')
    expect(parseSubmittedCsv(csv)[0].note).toBe('donkey, "the" animal')
    expect(writeSubmitted(parseSubmitted(csv)).split('\n')[1]).toBe(line)
  })

  it('shows a row as the review list wants it', () => {
    expect(reviewItem(parseSubmitted(file)[0])).toEqual({ id: 'COCK', label: 'COCK', status: 'open', detail: 'swear or word · rooster' })
    expect(reviewItem(parseSubmitted(file)[3]).detail).toBe('swear')
  })
})

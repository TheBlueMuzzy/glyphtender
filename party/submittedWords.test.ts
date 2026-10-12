// The submitted words list (F69): what a player's word does, the seed from submitted.csv, the Open cap, and the
// admin addresses' key. Runs the real web handler (wordsRoutes.ts) on plain Requests — no Cloudflare.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { everyWordIn, parseWordFile } from '../src/engine/words'
import type { WordList } from '../src/engine/types'
import submit from '../content/words/submit.json'
import { memoryRows, parseSubmittedCsv, PLAYER, reviewWords, seedIfEmpty, submitWord, type WordRows } from './submittedWords'
import { handleWords, sameKey } from './wordsRoutes'

const csv = readFileSync('content/words/submitted.csv', 'utf8')
const TODAY = '2026-10-12'
const KEY = 'test-admin-key-123'
let official: WordList
// (the server's list for submissions: every word, B / V too — party/server.ts loadWords)
beforeAll(() => { official = everyWordIn(parseWordFile(readFileSync('public/words/words.csv', 'utf8'))) })

/** A list seeded like the live one on its first day. */
function seeded(): WordRows {
  const rows = memoryRows()
  seedIfEmpty(rows, csv)
  return rows
}
const call = (rows: WordRows, path: string, init: RequestInit = {}, server: { adminKey?: string } = { adminKey: KEY }) =>
  handleWords(new Request(`http://words.test${path}`, init), { rows, official, adminKey: server.adminKey, today: TODAY })
const post = (body: unknown) => ({ method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })
const admin = (init: RequestInit = {}, key = KEY) => ({ ...init, headers: { Authorization: `Bearer ${key}` } })

describe('seeding from content/words/submitted.csv', () => {
  it('fills an empty list with every row of the file, once', () => {
    const rows = seeded()
    const fromFile = parseSubmittedCsv(csv)
    expect(fromFile.length).toBe(csv.trim().split('\n').length - 1) // every row parsed
    expect(rows.count()).toBe(fromFile.length)
    rows.add({ word: 'QWERTYZ', status: 'open', category: PLAYER, added: TODAY, note: '' })
    seedIfEmpty(rows, csv) // not empty any more: nothing changes
    expect(rows.count()).toBe(fromFile.length + 1)
    expect(rows.get(fromFile[0].word)?.status).toBe(fromFile[0].status)
  })
})

describe('POST /words/submit', () => {
  it('a new word is added as Open, category player, today — and the answer is just ok', async () => {
    const rows = seeded()
    const before = rows.count()
    const res = await call(rows, '/words/submit', post({ word: 'glimmerfoo' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(rows.get('GLIMMERFOO')).toEqual({ word: 'GLIMMERFOO', status: 'open', category: PLAYER, added: TODAY, note: '' })
    expect(rows.count()).toBe(before + 1)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*') // the game is on another site (github.io)
  })

  it('a repeat, a word on the list already (any status) or an official word: the same answer, nothing added', async () => {
    const rows = seeded()
    await call(rows, '/words/submit', post({ word: 'GLIMMERFOO' }))
    const no = parseSubmittedCsv(csv).find((r) => r.status === 'no')!
    const before = rows.count()
    for (const word of ['GLIMMERFOO', no.word, 'GARDEN']) {
      const res = await call(rows, '/words/submit', post({ word }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    }
    expect(rows.count()).toBe(before)
    expect(rows.get(no.word)?.status).toBe('no') // a No stays a No
    expect(rows.get('GARDEN')).toBeNull()
  })

  it('F71: a British or vulgar word (words.csv B / V) is already a word — dropped silently, whatever the player’s switches', async () => {
    const rows = seeded()
    const before = rows.count()
    for (const word of ['COLOUR', 'COCK']) {
      const res = await call(rows, '/words/submit', post({ word }))
      expect(await res.json()).toEqual({ ok: true })
      expect(rows.get(word), word).toBeNull()
    }
    expect(rows.count()).toBe(before)
  })

  it(`fewer than ${submit.minLetters} letters → 400 too-short; junk → 400 bad-word; nothing added`, async () => {
    const rows = seeded()
    const before = rows.count()
    const short = await call(rows, '/words/submit', post({ word: 'ZX' }))
    expect(short.status).toBe(400)
    expect(await short.json()).toEqual({ ok: false, code: 'too-short' })
    for (const body of [{ word: 'AB1' }, { word: 'Z'.repeat(submit.maxLetters + 1) }, { word: 42 }, {}, 'not json']) {
      const res = await call(rows, '/words/submit', post(body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, code: 'bad-word' })
    }
    const big = await call(rows, '/words/submit', post({ word: 'QWERTYZ', pad: 'x'.repeat(2000) })) // body over 1 KB
    expect(big.status).toBe(400)
    expect(rows.count()).toBe(before)
  })

  it('answers the browser\'s CORS check', async () => {
    const res = await call(memoryRows(), '/words/submit', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it(`past ${submit.maxOpenPlayerWords} Open player words, new ones are dropped (still ok)`, () => {
    const rows = memoryRows()
    const numbers = { ...submit, maxOpenPlayerWords: 2 }
    for (const word of ['QQQA', 'QQQB', 'QQQC']) expect(submitWord(rows, word, official, TODAY, numbers)).toEqual({ ok: true })
    expect(rows.all().map((r) => r.word)).toEqual(['QQQA', 'QQQB'])
    reviewWords(rows, [{ word: 'QQQA', status: 'yes' }]) // reviewed → room again
    submitWord(rows, 'QQQC', official, TODAY, numbers)
    expect(rows.get('QQQC')?.status).toBe('open')
  })

  it('takes the toggle marks too (British, Vulgar — Muzzy 2026-10-12), and a vulgar word sent again stays dropped', () => {
    const rows = memoryRows()
    submitWord(rows, 'QQQA', official, TODAY, submit)
    submitWord(rows, 'QQQB', official, TODAY, submit)
    expect(reviewWords(rows, [{ word: 'QQQA', status: 'vulgar' }, { word: 'QQQB', status: 'british' }])).toEqual({ changed: 2 })
    expect(submitWord(rows, 'QQQA', official, TODAY, submit)).toEqual({ ok: true })
    expect(rows.get('QQQA')?.status).toBe('vulgar')
    expect(rows.get('QQQB')?.status).toBe('british')
  })
})

describe('admin: GET /words/list and POST /words/review (Muzzy only)', () => {
  it('the right key lists every row and changes statuses', async () => {
    const rows = seeded()
    await call(rows, '/words/submit', post({ word: 'GLIMMERFOO' }))
    const list = await call(rows, '/words/list', admin())
    expect(list.status).toBe(200)
    const { words } = (await list.json()) as { words: { word: string; status: string }[] }
    expect(words.length).toBe(rows.count())
    expect(words.find((w) => w.word === 'GLIMMERFOO')?.status).toBe('open')
    expect(list.headers.get('Access-Control-Allow-Origin')).toBeNull() // no CORS: never from a web page
    const review = await call(rows, '/words/review', admin(post({ changes: [{ word: 'glimmerfoo', status: 'yes' }, { word: 'NOPEWORD', status: 'no' }, { word: 'X', status: 'maybe' }] })))
    expect(await review.json()).toEqual({ ok: true, changed: 1 })
    expect(rows.get('GLIMMERFOO')?.status).toBe('yes')
  })

  it('no key or a wrong key → 401; no key on the server → 403 (admin off); nothing changes', async () => {
    const rows = seeded()
    await call(rows, '/words/submit', post({ word: 'GLIMMERFOO' }))
    expect((await call(rows, '/words/list')).status).toBe(401)
    expect((await call(rows, '/words/list', admin({}, 'wrong-key'))).status).toBe(401)
    expect((await call(rows, '/words/review', admin(post({ changes: [{ word: 'GLIMMERFOO', status: 'yes' }] }), KEY.slice(0, -1)))).status).toBe(401)
    expect((await call(rows, '/words/list', admin(), {})).status).toBe(403)
    expect((await call(rows, '/words/list', admin(), { adminKey: '' })).status).toBe(403)
    expect(rows.get('GLIMMERFOO')?.status).toBe('open')
  })

  it('compares keys fully (sameKey)', () => {
    expect(sameKey(KEY, KEY)).toBe(true)
    expect(sameKey(KEY + 'x', KEY)).toBe(false)
    expect(sameKey('', KEY)).toBe(false)
    expect(sameKey(KEY.replace('1', '2'), KEY)).toBe(false)
  })

  it('any other address → 404', async () => {
    expect((await call(memoryRows(), '/words/other')).status).toBe(404)
    expect((await call(memoryRows(), '/words/list', { method: 'POST' })).status).toBe(404)
  })
})

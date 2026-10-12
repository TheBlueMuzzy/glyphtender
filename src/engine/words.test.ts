/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { everyWordIn, onlySwitchedOn, parseWordFile, parseWordList, spell, wordListFor } from './words'

const file = readFileSync(new URL('../../public/words/words.csv', import.meta.url))
const words = parseWordList(file.toString('utf8'))
const atLeast = (z: number) => [...words.values()].filter((v) => v >= z).length

// The list as cleaned in F68 (sprint 25, 2026-10-11, scripts/words/build-submitted.py): the original's words.txt
// (git blob 3280512a) with slurs + swears out, six lost words back and ZYGOTESAA split (B001) — every word kept
// out is in content/words/submitted.csv with its category. Since F70 it changes through the Dev Kit Words tab.
const submitted = readFileSync(new URL('../../content/words/submitted.csv', import.meta.url), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((line) => line.split(','))
const wordFile = parseWordFile(file.toString('utf8'))

describe('the official word list (public/words/words.csv)', () => {
  // No fixed fingerprint since F70: Muzzy's Dev Kit Words tab adds and removes words on purpose. These check its shape.
  it('is one WORD,zipf per line (F71: or WORD,zipf,B / WORD,zipf,V), sorted, with no doubles', () => {
    const lines = file.toString('utf8').split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(60000)
    for (const line of lines) expect(line, line).toMatch(/^[A-Z]{2,15},\d+\.\d\d(,[BV])?$/)
    expect([...lines].sort()).toEqual(lines)
    expect(everyWordIn(wordFile).size).toBe(lines.length)
    expect(words.size).toBe(lines.filter((l) => !/,[BV]$/.test(l)).length) // switches off: the plain words only
  })

  it('has roughly the known Zipf tiers (F68: 997 / 6,334 / 21,773 / 43,952)', () => {
    expect(atLeast(5)).toBeGreaterThan(950)
    expect(atLeast(4)).toBeGreaterThan(6200)
    expect(atLeast(3)).toBeGreaterThan(21500)
    expect(atLeast(2)).toBeGreaterThan(43500)
  })

  it('knows common words and their Zipf scores', () => {
    expect(words.get('THE')).toBe(7.73)
    expect(words.get('AA')).toBe(4.01)
    expect(words.has('QUIT')).toBe(true)
    expect(words.has('XYZZY')).toBe(false)
  })

  it('ZYGOTES is a word again and the glued "ZYGOTESAA" is gone (B001)', () => {
    expect(words.has('ZYGOTES')).toBe(true)
    expect(words.has('ZYGOTESAA')).toBe(false)
  })

  it('agrees with content/words/submitted.csv: it holds only open + no rows (accepted words moved into words.csv), no "no" word is a word', () => {
    expect(submitted.length).toBeGreaterThan(0)
    for (const [word, status] of submitted) {
      expect(['open', 'no'], word).toContain(status)
      if (status === 'no') expect(everyWordIn(wordFile).has(word), word).toBe(false)
    }
  })

  it('keeps out slurs and swears (rude-or-word ones are V, counted only with Vulgar Words on), keeps names that are also words', () => {
    for (const w of ['NIGGER', 'FAGGOT', 'FUCK', 'SHIT', 'CUNT', 'COCK', 'TIT']) expect(words.has(w), w).toBe(false)
    for (const w of ['NIGGER', 'FAGGOT']) expect(everyWordIn(wordFile).has(w), w).toBe(false) // slurs: never, with any switch
    for (const w of ['CHINA', 'JAPAN']) expect(words.has(w), w).toBe(true)
  })
})

describe('F71: the word list per game switches (British Spelling, Vulgar Words)', () => {
  const british = wordListFor(wordFile, { british: true })
  const vulgar = wordListFor(wordFile, { vulgar: true })
  const both = wordListFor(wordFile, { british: true, vulgar: true })

  it('both off (or missing, or false) = today’s list exactly, the same Map', () => {
    expect(wordListFor(wordFile)).toBe(wordFile.plain)
    expect(wordListFor(wordFile, { british: false, vulgar: false })).toBe(wordFile.plain)
    expect(words.size).toBe(wordFile.plain.size)
  })

  it('COLOUR counts only with British on; COCK only with Vulgar on; each keeps its Zipf', () => {
    expect(words.has('COLOUR')).toBe(false)
    expect(british.get('COLOUR')).toBe(4.49)
    expect(vulgar.has('COLOUR')).toBe(false)
    expect(words.has('COCK')).toBe(false)
    expect(british.has('COCK')).toBe(false)
    expect(vulgar.get('COCK')).toBe(4.23)
    expect(both.has('COLOUR') && both.has('COCK') && both.has('THE')).toBe(true)
    expect(both.size).toBe(wordFile.plain.size + wordFile.tagged.B.size + wordFile.tagged.V.size)
  })

  it('each mix is made once (the same Map back), and a game config keeps only the switches that are on', () => {
    expect(wordListFor(wordFile, { british: true })).toBe(british)
    expect(onlySwitchedOn({ british: false, vulgar: false })).toBeUndefined()
    expect(onlySwitchedOn(undefined)).toBeUndefined()
    expect(onlySwitchedOn({ british: true, vulgar: false })).toEqual({ british: true })
  })

  it('parseWordList reads tags: plain by default, the tagged words when asked, an unknown tag never', () => {
    const text = 'CAT,3.5\nCOLOUR,4.49,B\nCOCK,4.23,V\nODD,1.00,X\n'
    expect([...parseWordList(text).keys()]).toEqual(['CAT'])
    expect([...parseWordList(text, { british: true, vulgar: true }).keys()].sort()).toEqual(['CAT', 'COCK', 'COLOUR'])
  })
})


describe('parseWordList copes with other file shapes', () => {
  it('ignores a byte-order mark, Windows line ends, blank lines and a header', () => {
    const parsed = parseWordList('﻿WORD,ZIPF\r\ncat,3.5\r\n\r\nDOG,4\r\n')
    expect([...parsed.entries()]).toEqual([
      ['CAT', 3.5],
      ['DOG', 4],
    ])
  })
})

describe('Q (GDD §4.3 — plain Q since 2026-10-01)', () => {
  it('a Q seed spells just Q, like every other seed spells its letter', () => {
    expect(spell('Q')).toBe('Q')
    expect(spell('A')).toBe('A')
  })

  it('the list has the Q-without-U words a plain Q opens up (QI, QAT) and QUA for Q + U + A', () => {
    for (const w of ['QI', 'QAT', 'QUA', 'SUQ']) expect(words.has(w)).toBe(true)
  })
})

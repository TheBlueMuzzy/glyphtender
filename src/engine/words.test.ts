/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseWordList, spell } from './words'

const file = readFileSync(new URL('../../public/words/words.csv', import.meta.url))
const words = parseWordList(file.toString('utf8'))
const atLeast = (z: number) => [...words.values()].filter((v) => v >= z).length

// The list as cleaned in F68 (sprint 25, 2026-10-11, scripts/words/build-submitted.py): the original's words.txt
// (git blob 3280512a) with slurs + swears out, six lost words back and ZYGOTESAA split (B001) — every word kept
// out is in content/words/submitted.csv with its category. Changes are deliberate commits: update the hash here.
const submitted = readFileSync(new URL('../../content/words/submitted.csv', import.meta.url), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((line) => line.split(','))

describe('the official word list (public/words/words.csv)', () => {
  it('is the F68 cleaned list, byte for byte', () => {
    expect(createHash('sha256').update(file).digest('hex')).toBe('85919d01c4f6a18257768c530a5ef891c931ceaa84d17c27beacf252b9a03334')
  })

  it('has the known Zipf tiers', () => {
    expect(atLeast(5)).toBe(997)
    expect(atLeast(4)).toBe(6334)
    expect(atLeast(3)).toBe(21773)
    expect(atLeast(2)).toBe(43952)
  })

  it('has 63,602 words, one per line, sorted', () => {
    const lines = file.toString('utf8').split('\n').filter(Boolean)
    expect(lines.length).toBe(63602)
    expect(words.size).toBe(63602)
    expect([...lines].sort()).toEqual(lines)
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

  it('agrees with content/words/submitted.csv: no "no" word is in the list, every "yes" word is', () => {
    expect(submitted.length).toBeGreaterThan(0)
    for (const [word, status] of submitted) {
      if (status === 'no') expect(words.has(word), word).toBe(false)
      if (status === 'yes') expect(words.has(word), word).toBe(true)
    }
  })

  it('keeps out slurs and swears, keeps words that are only sometimes rude for Muzzy to decide', () => {
    for (const w of ['NIGGER', 'FAGGOT', 'FUCK', 'SHIT', 'CUNT']) expect(words.has(w), w).toBe(false)
    for (const w of ['COCK', 'CHINA', 'TIT']) expect(words.has(w), w).toBe(true)
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

import { describe, expect, it } from 'vitest'
import { submitChoices } from './submitChoices'
import { wordsOf } from '../engine/testkit'
import submit from '../../content/words/submit.json'

const words = wordsOf('CAT', 'AT', 'GARDEN')
const long = (n: number) => 'Z'.repeat(n)

describe('Submit a word — what the picker offers (F69)', () => {
  it('lists only stretches that are not words yet and long enough, longest first then A–Z', () => {
    const choices = submitChoices(['CA', 'CAT', 'XAT', 'CATX', 'AT', 'ZAT'], words)
    expect(choices).toEqual({ kind: 'list', words: ['CATX', 'XAT', 'ZAT'] })
  })

  it('shows at most pickerMax and nothing longer than maxLetters', () => {
    const many = Array.from({ length: submit.pickerMax + 3 }, (_, i) => long(submit.minLetters + i))
    const choices = submitChoices(many, words)
    if (choices.kind !== 'list') throw new Error('expected a list')
    expect(choices.words.length).toBeLessThanOrEqual(submit.pickerMax)
    expect(choices.words.every((w) => w.length <= submit.maxLetters)).toBe(true)
  })

  it('only short non-words → "too short"; only words or nothing → "none"', () => {
    expect(submitChoices(['QX'], words)).toEqual({ kind: 'tooShort' })
    expect(submitChoices(['QX', 'CAT'], words)).toEqual({ kind: 'tooShort' })
    expect(submitChoices(['AT', 'CAT'], words)).toEqual({ kind: 'none' })
    expect(submitChoices([], words)).toEqual({ kind: 'none' })
  })
})

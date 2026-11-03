import { describe, expect, it } from 'vitest'
import type { Award } from '../game/stats'
import { recordNews } from './awardNews'

const award = (id: Award['id'], holder: number, moment: number, effect: number): Award =>
  ({ id, holder, seats: [holder], moment, values: { word: `W${effect}` }, effect })

describe('award news: which records a turn set or took', () => {
  it('a first record, a record taken by someone else, a player beating their own — each is news', () => {
    const before = [award('longWord', 0, 3, 6), award('lockdown', 1, 4, 7)]
    const after = [award('longWord', 1, 9, 7), award('lockdown', 1, 10, 8), award('powerPlay', 0, 9, 4)]
    expect(recordNews(before, after).map((n) => [n.record.id, n.record.holder, n.previous?.holder ?? null])).toEqual([
      ['longWord', 1, 0], ['lockdown', 1, 1], ['powerPlay', 0, null],
    ])
  })
  it('nothing changed → no news', () => {
    const records = [award('longWord', 0, 3, 6)]
    expect(recordNews(records, records.map((a) => ({ ...a })))).toEqual([])
  })
})

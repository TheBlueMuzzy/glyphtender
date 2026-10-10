import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/setup'
import type { LogTurn } from '../engine/types'
import { awardText, bestCells, playText, playsText, roundPlays, scorecardRows, tangleBonusPlays } from './endText'
import type { Award, Scorecard } from './stats'

const NB = String.fromCharCode(160) // the no-break space holding an award's last two words together
const names = ['Yellow', 'Blue', 'Purple', 'Pink']
const name = (seat: number) => names[seat]
const award = (id: Award['id'], values: Award['values'], holder = 0): Award => ({ id, holder, seats: [holder], moment: 3, values, effect: 1 })
const turn = (extra: Partial<LogTurn>): LogTurn => ({
  turnNo: 7, round: 4, seat: 1, glyphlingId: 2, from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, letter: 'N', target: { q: 1, r: 1 },
  words: [], magic: 0, refreshed: 0, refresh: false, totalsAfter: [0, 0], tangledAfter: [], newlyTangled: [], freed: [], ...extra,
})

describe('award words', () => {
  it('never leaves one word alone on the last line: the last two words are held together (no-break space)', () => {
    expect(awardText(award('pincer', { other: 0, from: 18, to: 7, turns: 2, pct: 61 }), name).reason).toMatch(new RegExp(`to 7${NB}\\(61%\\)$`))
  })
  it('fills in the proof: "Blue’s glyphling: 9 moves → 2"', () => {
    expect(awardText(award('lockdown', { other: 1, from: 9, to: 2 }), name)).toEqual({ title: 'Lockdown', reason: `Blue's glyphling: 9 moves →${NB}2` })
  })
  it('Weed toss: a taken spot or a cut, and whether they refreshed after', () => {
    expect(awardText(award('weedToss', { kind: 'block', other: 2, n: 8, word: 'GARDEN', refreshed: false }), name).reason).toBe(`A junk seed took Purple's +8 spot${NB}(GARDEN)`)
    expect(awardText(award('weedToss', { kind: 'cut', other: 1, from: 6, to: 1, refreshed: true }), name).reason).toBe(`A junk seed cut Blue's glyphling: 6 moves → 1, then${NB}refreshed`)
  })
  it('Trickster’s Victory names who ended it', () => {
    expect(awardText(award('trickster', { other: 3, n: 5 }), name).reason).toBe(`Pink ended the game 5${NB}behind`)
  })
})

describe('the Story chart turn list (F61)', () => {
  const word = (w: string, magic: number) => ({ word: w, letters: [], owners: [], magic, ownMagic: 0 })
  // 3 players, turn order [2, 0, 1]; round 4: Purple NEST · TEN +9, Yellow F then a refresh of 3, Blue moved and
  // tangled Yellow's glyphling 0
  const game = {
    ...newGame({ players: 3, seed: 1, turnOrder: [2, 0, 1] }),
    glyphlings: [0, 1, 2, 3, 4, 5].map((id) => ({ id, seat: Math.floor(id / 2), hex: { q: id, r: 0 } })),
    log: { turns: [
      turn({ turnNo: 10, seat: 2, words: [word('NEST', 6), word('TEN', 3)], magic: 9 }),
      turn({ turnNo: 11, seat: 0, letter: 'F', refresh: true, refreshed: 3 }),
      turn({ turnNo: 12, seat: 1, letter: null, newlyTangled: [0] }),
    ], end: null },
  }
  const texts = (rows: ReturnType<typeof roundPlays>) => rows.map((r) => [r.seat, playText(r)])

  it('one row per player in turn order: words + Magic, a cast then a refresh, a move + a tangle', () => {
    const rows = roundPlays(game, 4, 8, 40)
    expect(texts(rows)).toEqual([[2, 'NEST · TEN +9'], [0, 'F · Refresh 3'], [1, 'moved · tangled']])
    expect(rows[2].knots).toEqual([{ owner: 0, by: 1 }])
  })
  it('online: a turn a bot played for its person ends "by a bot" (F62); the others don’t', () => {
    expect(texts(roundPlays(game, 4, 8, 40, [10, 12]))).toEqual([[2, 'NEST · TEN +9 · by a bot'], [0, 'F · Refresh 3'], [1, 'moved · tangled · by a bot']])
  })
  it('long words are cut (…) and words that do not fit become one …; the Magic always shows', () => {
    const long = { ...game, log: { turns: [turn({ turnNo: 10, seat: 2, words: [word('GARDENING', 12), word('DEN', 3), word('GARDEN', 8)], magic: 23 })], end: null } }
    expect(playText(roundPlays(long, 4, 8, 18)[0])).toBe('GARDENI… · DEN · … +23')
  })
  it('a cast with no words, Keep all, and players with no turn (all tangled / the game ended)', () => {
    const quiet = { ...game, log: { turns: [turn({ turnNo: 10, seat: 2 }), turn({ turnNo: 11, seat: 0, refresh: true, refreshed: 0 })], end: null } }
    // the game ended on Yellow's turn (the last in the log): Blue comes after Yellow in the order
    expect(texts(roundPlays(quiet, 4, 8, 40))).toEqual([[2, 'N · no words'], [0, 'N · Refresh · kept all'], [1, 'no turn · the game ended']])
    // a round before the last: a missing player was skipped (every glyphling tangled)
    const later = { ...quiet, log: { turns: [...quiet.log.turns, turn({ turnNo: 12, round: 5, seat: 2 })], end: null } }
    expect(texts(roundPlays(later, 4, 8, 40))[2]).toEqual([1, 'no turn · all tangled'])
  })
  it('the Tangles column: each player’s bonus; the whole round for screen readers', () => {
    expect(tangleBonusPlays({ ...game, tangleMagic: [6, 0, 3] }).map(playText)).toEqual(['+3', '+6', 'no bonus'])
    expect(playsText('Round 4', roundPlays(game, 4, 8, 40), name)).toBe('Round 4: Purple NEST · TEN +9; Yellow F · Refresh 3; Blue moved · tangled')
  })
})

describe('scorecard rows', () => {
  const card = (seat: number): Scorecard => ({
    seat, total: 10 + seat, wordMagic: 10, soloMagic: 2, tangleMagic: seat, byLength: [1, 2, 3, 0, 0], wordsMade: 6, longestWord: 'TREE',
    bestWord: null, bestTurn: null, multiWordTurns: 0, seedsRefreshed: 3, completeTangles: seat, lettersBorrowed: 0, lettersGiven: 0,
  })
  it('the 2-letter row only when 2-letter words count', () => {
    const two = newGame({ players: 2, seed: 1 })
    const three = newGame({ players: 2, seed: 1, rules: { minWordLength: 3 } })
    const labels = (g: typeof two) => scorecardRows(g, [card(0), card(1)], [1, 0]).flatMap((group) => group.rows.map((r) => r.label))
    expect(labels(two)).toContain('2-letter')
    expect(labels(three)).not.toContain('2-letter')
    expect(labels(three)).toContain('6+ letters')
  })
  it('Magic: Total, From words, From tangles, From solo words; Play: Multi-word turns, Seeds refreshed, Complete tangles', () => {
    const [magic, , play] = scorecardRows(newGame({ players: 2, seed: 1 }), [card(0), card(1)], [1, 0])
    expect(magic.rows.map((r) => r.label)).toEqual(['Total', 'From words', 'From tangles', 'From solo words'])
    expect(play.rows.map((r) => r.label)).toEqual(['Multi-word turns', 'Seeds refreshed', 'Complete tangles'])
    expect(play.rows[2].values).toEqual([1, 0])
    expect(play.rows[2].tint).toBe(true)
  })
  it('complete tangles unknown (an old log) → "–" for everyone, never tinted', () => {
    const old = (seat: number) => ({ ...card(seat), completeTangles: null })
    const [, , play] = scorecardRows(newGame({ players: 2, seed: 1 }), [old(0), old(1)], [1, 0])
    expect(play.rows[2].shown).toEqual(['–', '–'])
    expect(bestCells(play.rows[2])).toEqual([false, false])
  })
  it('columns follow the seats given (best place first)', () => {
    const [magic] = scorecardRows(newGame({ players: 2, seed: 1 }), [card(0), card(1)], [1, 0])
    expect(magic.rows[0].values).toEqual([11, 10])
  })
  it('the best in a row is tinted — ties share it; nobody when all are equal, 0, or the row is never "best"', () => {
    expect(bestCells({ label: '', values: [3, 5, 5, 1], tint: true })).toEqual([false, true, true, false])
    expect(bestCells({ label: '', values: [4, 4], tint: true })).toEqual([false, false])
    expect(bestCells({ label: '', values: [0, 0, 0], tint: true })).toEqual([false, false, false])
    expect(bestCells({ label: '', values: [1, 3], tint: false })).toEqual([false, false])
  })
})

import { describe, expect, it } from 'vitest'
import { applyAction } from '../engine/engine'
import { greedyAction, randomAction } from '../engine/sim'
import { newGame } from '../engine/setup'
import type { GameState, LogTurn, LogWord, PlantedSeed } from '../engine/types'
import { earnedAwards, hijacks } from '../game/stats'
import { allMeters, meterNames, meters } from './meters'

// ─── A hand-checked game ───
// 2 players. Glyphlings 0, 1 = seat 0 (Yellow); 2, 3 = seat 1 (Blue). Five turns:
//   1 Yellow: g0 (0,0) → (0,1), casts A at (1,1), no word. Cuts g2 6 → 4. Ends 2 hexes from g2 at (2,0).
//   2 Blue:   g2 (2,0) → (4,0), grows TOE (all Blue).
//   3 Yellow: g1 (-3,0) → (-3,1), casts T at (1,2) next to its own A — a setup — and refreshes. Cuts g3 6 → 5. Far from rivals.
//   4 Blue:   g3 (6,0) → (6,1), grows NO; tangles Yellow's g0.
//   5 Yellow: g0 (0,1) → (3,1) (1 hex from g2), grows AT + ATOESET (7 letters, 4 Yellow — a hijack of TOE), tangles g2, ends it.
const W = (word: string, owners: number[], hexes?: string[]): LogWord => {
  const seat = turnSeat
  const ownMagic = owners.filter((o) => o === seat).length
  return { word, letters: [...word], owners, magic: word.length + ownMagic, ownMagic, ...(hexes ? { hexes } : {}) }
}
let turnSeat = 0
const mob = (before: number[], afterCast: number[]) => ({ before, afterMove: before, afterCast })

function handGame(): GameState {
  const base = newGame({ players: 2, seed: 1 })
  const totals = [0, 0]
  const plan: Omit<LogTurn, 'turnNo' | 'round' | 'totalsAfter' | 'magic'>[] = []
  const turn = (t: (typeof plan)[number]) => plan.push(t)
  const none = { newlyTangled: [], tangledAfter: [], freed: [], refreshed: 0, refresh: false }
  turnSeat = 0
  turn({ seat: 0, ...none, glyphlingId: 0, from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, letter: 'A', target: { q: 1, r: 1 }, words: [], mobility: mob([5, 5, 6, 6], [5, 5, 4, 6]) })
  turnSeat = 1
  turn({ seat: 1, ...none, glyphlingId: 2, from: { q: 2, r: 0 }, to: { q: 4, r: 0 }, letter: 'E', target: { q: 4, r: 2 }, words: [W('TOE', [1, 1, 1], ['4,0', '4,1', '4,2'])], mobility: mob([5, 5, 4, 6], [3, 5, 4, 6]) })
  turnSeat = 0
  turn({ seat: 0, ...none, glyphlingId: 1, from: { q: -3, r: 0 }, to: { q: -3, r: 1 }, letter: 'T', target: { q: 1, r: 2 }, words: [], refresh: true, refreshed: 2, mobility: mob([5, 5, 4, 6], [5, 5, 4, 5]) })
  turnSeat = 1
  turn({ seat: 1, ...none, glyphlingId: 3, from: { q: 6, r: 0 }, to: { q: 6, r: 1 }, letter: 'O', target: { q: 6, r: 2 }, words: [W('NO', [1, 1])], newlyTangled: [0], tangledAfter: [0], mobility: mob([1, 5, 4, 5], [0, 5, 4, 5]) })
  turnSeat = 0
  turn({ seat: 0, ...none, glyphlingId: 0, from: { q: 0, r: 1 }, to: { q: 3, r: 1 }, letter: 'S', target: { q: 4, r: 3 },
    words: [W('AT', [0, 0]), W('ATOESET', [0, 1, 1, 1, 0, 0, 0], ['4,-1', '4,0', '4,1', '4,2', '4,3', '4,4', '4,5'])],
    newlyTangled: [2], tangledAfter: [0, 2], mobility: mob([3, 5, 4, 5], [3, 5, 0, 5]) })

  const turns: LogTurn[] = plan.map((t, i) => {
    const magic = t.words.reduce((s, w) => s + w.magic, 0)
    totals[t.seat] += magic
    return { ...t, turnNo: i + 1, round: Math.floor(i / 2) + 1, magic, totalsAfter: [...totals] }
  })
  const tangleMagic = [3, 0]
  const magic = totals.map((m, s) => m + tangleMagic[s])
  const seed = (key: string, seat: number, letter: string): [string, PlantedSeed] => [key, { id: `seed-${key}`, letter, seat } as PlantedSeed]
  const seeds = Object.fromEntries([seed('1,1', 0, 'A'), seed('1,2', 0, 'T'), seed('4,2', 1, 'E'), seed('6,2', 1, 'O'), seed('4,3', 0, 'S')])
  return {
    ...base, phase: 'over', magic, tangleMagic, winners: [0], tangled: [0, 2], turnCount: turns.length, seeds,
    glyphlings: [
      { id: 0, seat: 0, hex: { q: 3, r: 1 } }, { id: 1, seat: 0, hex: { q: -3, r: 1 } },
      { id: 2, seat: 1, hex: { q: 4, r: 0 } }, { id: 3, seat: 1, hex: { q: 6, r: 1 } },
    ],
    log: { turns, end: { endedOnTurn: 5, endedBy: 0, selfTangle: false, tangles: [], tangleMagic, totals: magic } },
  }
}

describe('meters: a hand-checked game', () => {
  const game = handGame()
  const y = meters(game, 0)
  const b = meters(game, 1)

  it('tangles: caused, suffered', () => {
    expect([y.tanglesCaused, y.rivalTangledThisGame, y.timesTangled, y.gotTangled]).toEqual([1, 1, 1, 1])
    expect([b.tanglesCaused, b.rivalTangledThisGame, b.timesTangled, b.gotTangled]).toEqual([1, 1, 1, 1])
  })
  it('positioning: near a rival on 2 of 3 turns, cut 2 + 1 + 4 rival moves, room 5, 5, 4', () => {
    expect(y.nearRivalShare).toBeCloseTo(2 / 3)
    expect(y.rivalMovesCut).toBeCloseTo(7 / 3)
    expect(y.roomToMove).toBeCloseTo(14 / 3)
    expect(b.rivalMovesCut).toBeCloseTo((2 + 1) / 2) // TOE cut g0 5 → 3, NO cut g0 1 → 0
  })
  it('words: AT + ATOESET → length 4.5, every scoring cast multi-word, 1 steal (TOE), 15 of 18 Magic from words', () => {
    expect(y.avgWordLength).toBe(4.5)
    expect(y.multiWordShare).toBe(1)
    expect(y.steals).toBe(1)
    expect(b.steals).toBe(0)
    expect(y.wordMagicShare).toBeCloseTo(15 / 18)
    expect(b.multiWordShare).toBe(0)
  })
  it('setups, halves, refreshes', () => {
    expect(y.setups).toBe(1) // the T next to its own A (turn 1's A doesn't count: nothing of its own was there yet)
    expect(y.secondHalfRatio).toBe(15) // no Magic in turns 1–2, 15 in turns 3–5
    expect(y.refreshes).toBe(1)
  })
  it('ending: Yellow called it, right, and won; Blue none of those', () => {
    expect([y.calledIt, y.calledItRight, y.won]).toEqual([1, 1, 1])
    expect([b.calledIt, b.calledItRight, b.won]).toEqual([0, 0, 0])
  })
  it('awards = the end screen’s awards for that seat (Hijack among them)', () => {
    const awards = earnedAwards(game)
    expect(y.awards).toBe(awards.filter((a) => a.holder === 0).length)
    expect(awards.some((a) => a.id === 'hijack' && a.holder === 0)).toBe(true)
  })
  it('every meter has a plain-English name, and no more', () => {
    expect(Object.keys(y).sort()).toEqual(Object.keys(meterNames).sort())
  })
})

describe('meters: real games played to the end', () => {
  const words = new Map(['AT', 'TA', 'AN', 'NA', 'IN', 'IT', 'TO', 'ON', 'NO', 'ES', 'RE', 'ER', 'EAT', 'TEA', 'ATE', 'NET', 'TEN', 'SET', 'RAT', 'TAR', 'ART', 'TEAS', 'RATE', 'STAR', 'NEAT'].map((w) => [w, 1]))
  const play = (players: number, seed: number, greedy: boolean) => {
    let state = newGame({ players, seed })
    let rng = seed
    while (state.phase !== 'over') {
      const pick = greedy ? greedyAction(state, rng, words, 8) : randomAction(state, rng)
      rng = pick.rng
      state = applyAction(state, pick.action, words)
    }
    return state
  }
  for (const players of [2, 3, 4]) {
    it(`${players} players: shares stay 0–1, exactly one seat ended it, steals + awards match the detectors`, () => {
      for (const seed of [1, 2, 3]) {
        const game = play(players, seed, seed !== 1)
        const all = allMeters(game)
        expect(all).toHaveLength(players)
        expect(all.reduce((n, m) => n + m.calledIt, 0)).toBe(1)
        expect(all.reduce((n, m) => n + m.steals, 0)).toBe(hijacks(game).length)
        expect(all.reduce((n, m) => n + m.awards, 0)).toBe(earnedAwards(game).length)
        expect(all.reduce((n, m) => n + m.timesTangled, 0)).toBeGreaterThan(0) // a game only ends with a tangle (maybe its own)
        all.forEach((m, seat) => {
          for (const share of [m.nearRivalShare, m.wordMagicShare, m.multiWordShare]) {
            expect(share).toBeGreaterThanOrEqual(0)
            expect(share).toBeLessThanOrEqual(1)
          }
          expect(m.won).toBe(game.winners.includes(seat) ? 1 : 0)
          expect(m.calledItRight).toBeLessThanOrEqual(m.calledIt)
          expect(m.roomToMove).toBeGreaterThan(0)
          for (const value of Object.values(m)) expect(Number.isFinite(value)).toBe(true)
        })
      }
    })
  }
})

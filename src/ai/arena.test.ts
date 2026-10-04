import { describe, expect, it } from 'vitest'
import { greedyAction } from '../engine/sim'
import { reportHtml } from './kit/report'
import type { Personality, Skill } from './kit/types'
import { personalityCheck, playArenaGame, toResults, type MakeBot } from './arena'

// Plumbing only: greedy stand-in bots (the real AI is tested in its own files). Small word list keeps it quick.
const words = new Map(['AT', 'TA', 'AN', 'NA', 'IN', 'IT', 'TO', 'ON', 'NO', 'ES', 'RE', 'ER', 'EAT', 'TEA', 'ATE', 'NET', 'TEN', 'SET', 'RAT', 'TAR', 'ART', 'TEAS', 'RATE', 'STAR', 'NEAT'].map((w) => [w, 1]))
const person = (id: string): Personality => ({ id, traits: {}, goals: [], nudge: 0, shifts: [], chattiness: 0 })
const skill: Skill = { id: 'FirstClass', candidates: 10, worlds: 1, spread: 1, topN: 1, wobble: 0, beliefNoise: 0 }
const greedy: MakeBot = (s, onNote) => (view, _seat, rng) => {
  const out = greedyAction(view, rng, words, 6)
  onNote(`${s.personality.id} played greedy`)
  return out
}

describe('the arena', () => {
  it('plays whole games from views only, and turns them into Personality Check rows', () => {
    const seats = [{ personality: person('Bully'), skill }, { personality: person('Scholar'), skill }, { personality: person('Balanced'), skill }]
    const games = [1, 2, 3].map((seed) => playArenaGame(seats, 'small', seed, words, greedy))
    for (const g of games) {
      expect(g.game.phase).toBe('over')
      expect(g.notes.length).toBe(g.decisionMs.length)
      expect(g.game.log?.turns?.length ?? 1).toBeGreaterThan(0)
    }
    const rows = toResults(games)
    expect(rows[0].seats.map((s) => s.personality)).toEqual(['Bully', 'Scholar', 'Balanced'])
    expect(rows.every((r) => Math.abs(r.seats.reduce((n, s) => n + s.won, 0) - 1) < 1e-9)).toBe(true)
    expect(typeof rows[0].seats[0].meters.tanglesCaused).toBe('number')
  })

  it('the same seed plays the same game', () => {
    const seats = [{ personality: person('A'), skill }, { personality: person('B'), skill }]
    expect(playArenaGame(seats, 'small', 9, words, greedy).game).toEqual(playArenaGame(seats, 'small', 9, words, greedy).game)
  })

  it('builds a report page', () => {
    const seats = [{ personality: person('Bully'), skill }, { personality: person('Balanced'), skill }]
    const games = [4, 5].map((seed) => playArenaGame(seats, 'small', seed, words, greedy))
    const report = personalityCheck(
      games,
      { personalities: { Bully: [{ meter: 'tanglesCaused', op: '>=', value: 0, label: 'tangles' }] }, all: [{ check: 'winRateVsBalanced', min: 0, max: 1, label: 'wins sometimes' }] },
      ['Apprentice', 'FirstClass', 'Archmage'],
      ['tanglesCaused', 'avgWordLength'],
      '2 games',
    )
    expect(report.feel.Bully[0].pass).toBe(true)
    expect(report.all[0].pass).toBe(true)
    expect(reportHtml(report)).toContain('Personality Check — Glyphtender')
  })
})

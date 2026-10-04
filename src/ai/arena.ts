// THE ARENA — AI-vs-AI games for the Personality Check (F40 / F45). Pure: no React, no store, no screen.
// Plays whole games through the one rules door (full mode, so the game log the meters read is kept), each bot seeing
// only its own seat's view. Then every seat becomes a row of behaviour meters, and the framework's Personality Check
// (src/ai/kit/check.ts) judges them against content/ai/feel-targets.json.
// Used by scripts/ai-arena.mjs (`npm run ai:arena`) and, later, the Dev Kit AI tab.
import { averages, checkFeelTargets, skillLadder, tellApart, winRates, type FeelTarget, type GameResult } from './kit/check'
import type { CheckReport } from './kit/report'
import type { Personality, Skill } from './kit/types'
import { allMeters } from './meters'
import { glyphtenderRules, viewFor } from '../engine/rules'
import type { Action, GameState, WordList } from '../engine/types'

export interface ArenaSeat {
  personality: Personality
  skill: Skill
}

/** A bot for one seat: view in, action out (the Table's Bot shape), plus a hook that hears each decision's note. */
export type MakeBot = (seat: ArenaSeat, onNote: (note: string) => void) => (view: GameState, seat: number, rng: number) => { action: Action; rng: number }

export interface ArenaGame {
  seats: ArenaSeat[]
  game: GameState
  /** Every decision's note, in order, with the seat in front ("2 Bully rolled TRAP…"). */
  notes: string[]
  /** How long each decision took, in ms (this machine). */
  decisionMs: number[]
}

/** One whole game. Bots get their own random start per seat, from the game's seed. */
export function playArenaGame(seats: ArenaSeat[], boardName: string, seed: number, words: WordList, makeBot: MakeBot, maxTurns = 1000): ArenaGame {
  const rules = glyphtenderRules(words)
  let state = rules.setup({ players: seats.length, boardName, seed })
  const notes: string[] = []
  const decisionMs: number[] = []
  const bots = seats.map((s, i) => makeBot(s, (note) => notes.push(`${i} ${note}`)))
  const rngs = seats.map((_, i) => (seed ^ 0x5eed) + i * 7919)
  while (state.phase !== 'over') {
    if (state.turnCount > maxTurns) throw new Error(`Arena game did not end within ${maxTurns} turns (seed ${seed})`)
    const seat = state.current
    const started = performance.now()
    const picked = bots[seat](viewFor(state, seat), seat, rngs[seat])
    decisionMs.push(performance.now() - started)
    rngs[seat] = picked.rng
    state = rules.apply(state, seat, picked.action).state
  }
  return { seats, game: state, notes, decisionMs }
}

/** Each finished game as rows for the Personality Check: who sat where, their meters, their share of the win. */
export function toResults(games: ArenaGame[]): GameResult[] {
  return games.map(({ seats, game }) => {
    const meters = allMeters(game)
    return {
      seats: seats.map((s, i) => ({
        personality: s.personality.id,
        skill: s.skill.id,
        meters: { ...meters[i] },
        won: game.winners.includes(i) ? 1 / game.winners.length : 0,
      })),
    }
  })
}

export interface FeelTargetsFile {
  personalities: Record<string, FeelTarget[]>
  all: { check: string; min?: number; max?: number; label: string }[]
}

/** The whole Personality Check for one batch of games, ready for reportHtml. Feel, tell-apart and wins look only at
 *  `mainSkill` seats (when given); the skill ladder looks at every game. */
export function personalityCheck(games: ArenaGame[], targets: FeelTargetsFile, skillOrder: string[], tellMeters: string[], subtitle: string, mainSkill?: string): CheckReport {
  const results = toResults(games)
  const feel = checkFeelTargets(results, targets.personalities, mainSkill)
  const tell = tellApart(results, tellMeters, mainSkill)
  const wins = winRates(results, mainSkill)
  const ladder = skillLadder(results, skillOrder)
  const names = Object.keys(wins.overall)
  const band = (v: number | undefined, min?: number, max?: number) => v !== undefined && (min === undefined || v >= min) && (max === undefined || v <= max)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const calledIt = averages(results, 'calledIt', mainSkill)
  const calledItRight = averages(results, 'calledItRight', mainSkill)
  const all = targets.all.map((t) => {
    const per: [string, number | undefined][] =
      t.check === 'winRateVsBalanced' ? names.filter((n) => n !== 'Balanced').map((n) => [n, wins.headToHead[n]?.Balanced])
      : t.check === 'tellApart' ? names.map((n) => [n, tell.accuracy[n]])
      : t.check === 'skillLadder' ? names.map((n) => [n, ladder[n]])
      : t.check === 'callsIt' ? names.map((n) => [n, calledIt.get(n)])
      : t.check === 'callsItWrong' ? names.map((n) => [n, (calledIt.get(n) ?? 0) - (calledItRight.get(n) ?? 0)])
      : []
    const measured = per.filter(([, v]) => v !== undefined)
    const failing = measured.filter(([, v]) => !band(v, t.min, t.max))
    const notMeasured = per.length - measured.length
    const pass = measured.length > 0 && failing.length === 0
    const detail = !measured.length ? 'not measured in these games' : failing.length ? `off: ${failing.map(([n, v]) => `${n} ${pct(v!)}`).join(', ')}` : `all ${measured.length} in range${notMeasured ? ` (${notMeasured} not measured)` : ''}`
    return { label: t.label, pass, detail }
  })
  const sample = games[0]?.notes.slice(0, 24) ?? []
  return { title: 'Personality Check — Glyphtender', subtitle, feel, all, tell, wins, ladder, notes: sample }
}

// THE AI MODULE — "WHAT WINS?" Which situations predict winning, from the arena's AI-vs-AI games (F25).
//
// A game names situations per seat (score lead, letters in hand, glyphlings trapped…), read after each seat's own
// turns 3, 5… and at the end (arena.ts). For each situation at each moment this answers, in plain maths:
//   - Low / mid / high: the seats split into thirds by the number (ties never split — a yes/no number gives two
//     groups), and each group's win rate.
//   - The edge: in winner-vs-loser pairs OF THE SAME GAME, how often the winner had the higher number (ties = half).
//     50% says nothing; 100% = the winner always had more; 0% = always less (fewer is better). Same-game pairs, so a
//     2-player table's 50% and a 4-player table's 25% never get mixed up.
//   - Too few games: a group, or a situation's pairs, under the minimum is left out — and listed, never hidden.
// Then the strongest ones as sentences: "Players with score lead 10 or more after turn 5 win 78% (of 240 games, ±6%)".
// No libraries. Design: framework .planning/design/ai.md ("What wins?").
import type { GameResult } from './check'

/** One third (or so) of the seats, by the situation's number. */
export interface WinsGroup {
  /** The lowest and highest number in the group. */
  low: number
  high: number
  /** How many seats (one player's game each). */
  games: number
  /** Their share of the wins (a shared win counts its share). */
  winRate: number
}

/** One situation at one moment. */
export interface SituationWins {
  situation: string
  /** "turn 3", "turn 5", "end". */
  moment: string
  /** Low → high. Groups under the minimum are still here (with `games`) — only the sentences skip them. */
  groups: WinsGroup[]
  /** In winner-vs-loser pairs of the same game: how often the winner had the higher number (ties half). 0.5 = nothing. */
  edge: number
  /** How many such pairs. */
  pairs: number
  /** How strongly it predicts the win, 0 (not at all) … 1 (always): how far the edge is from 50%, doubled. */
  strength: number
  /** Why it's left out ("too few games"…), or undefined when it counts. */
  leftOut?: string
  /** At the end and (nearly) always the winner's — it IS the win (the score itself), so it's no advice: kept out of
   *  the sentences, named apart. */
  isTheWin?: boolean
}

export interface WhatWins {
  /** The sentences, strongest first (one per situation, at its strongest moment). */
  top: string[]
  /** Every situation at every moment, strongest first (those left out last). */
  all: SituationWins[]
  /** Situations that at the end decide the winner by themselves (the score itself) — kept out of `top`. */
  theWin: string[]
  /** The plain-English reasons some were left out ("letters in hand at turn 5: too few games (12 pairs, needs 30)"). */
  leftOut: string[]
  /** Every seat's share of the wins on average (the base rate the group win rates sit around). */
  baseRate: number
  /** How many seats had any situation. */
  seats: number
}

export interface WhatWinsOptions {
  /** Below this many seats in a group, or winner-vs-loser pairs, → left out. Default 30. */
  minGames?: number
  /** How many sentences. Default 5. */
  top?: number
  /** Only seats at this skill. */
  skill?: string
  /** A situation whose strength at the END is at least this is the win itself (the score) — not a sentence. Default 0.95. */
  isTheWin?: number
}

const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const pct = (v: number) => `${Math.round(v * 100)}%`
const num = (v: number) => String(round(v, 2))
/** A low…high span in words, the same on the report's table and in the sentences: "-78 to -21", one number just
 *  "4". "to", never a dash — "-78–-21" reads as a sum and wraps at the dash. */
export const span = (low: number, high: number) => (low === high ? num(low) : `${num(low)} to ${num(high)}`)

/** Split numbers into up to three groups by size — about a third each, but equal numbers always stay together
 *  (so 0/1 numbers make two groups, and one number repeated makes one). Each cut goes at the change of number
 *  nearest its third. Returns each group's low…high. */
export function terciles(values: number[]): { low: number; high: number }[] {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (!n) return []
  // where a cut may go: between two different numbers (so equal numbers stay together)
  const places: number[] = []
  for (let i = 1; i < n; i++) if (sorted[i] !== sorted[i - 1]) places.push(i)
  // each cut at the place nearest its third (a smaller run before a big one stays its own group, not swallowed)
  const nearest = (target: number, after: number) =>
    places.filter((p) => p > after).reduce<number | undefined>((best, p) => (best === undefined || Math.abs(p - target) < Math.abs(best - target) ? p : best), undefined)
  const first = nearest(n / 3, 0)
  const second = first === undefined ? undefined : nearest((2 * n) / 3, first)
  const cuts = [0, ...[first, second].filter((c): c is number => c !== undefined), n]
  return cuts.slice(1).map((end, i) => ({ low: sorted[cuts[i]], high: sorted[end - 1] }))
}

/** The edge: in winner-vs-loser pairs of the same game, how often the winner's number was higher (ties count half).
 *  Each game = its seats' { won, value }; a seat with a bigger share of the win counts as the winner of the pair. */
export function edge(games: { won: number; value: number }[][]): { edge: number; pairs: number } {
  let pairs = 0
  let score = 0
  for (const seats of games) for (const w of seats) for (const l of seats) {
    if (!(w.won > l.won)) continue
    pairs++
    score += w.value > l.value ? 1 : w.value === l.value ? 0.5 : 0
  }
  return { edge: pairs ? round(score / pairs) : 0.5, pairs }
}

/** How sure a win rate from n games is: ± about 1/√n at 95% (the widest it can be — 100 games → ±10%). */
export const margin = (n: number) => (n > 0 ? 1 / Math.sqrt(n) : 1)

/** "after turn 5" / "at the end". */
const when = (moment: string) => (moment === 'end' ? 'at the end' : `after ${moment}`)

/** How a group reads in a sentence: the top one "10 or more", the bottom one "-3 or less", a middle one "2 to 6",
 *  one number just "1". */
function range(g: WinsGroup, place: 'top' | 'bottom' | 'middle'): string {
  if (g.low === g.high) return num(g.low)
  if (place === 'top') return `${num(g.low)} or more`
  if (place === 'bottom') return `${num(g.high)} or less`
  return span(g.low, g.high)
}

/** One situation as a sentence: its group that wins most, against the one that wins least (big-enough groups only —
 *  so a middle that wins best, like a total that's high but not bust, says so). */
export function sentence(s: SituationWins, minGames = 30): string {
  const ok = s.groups.filter((g) => g.games >= minGames)
  const place = (g: WinsGroup) => (g === s.groups[0] ? 'bottom' : g === s.groups[s.groups.length - 1] ? 'top' : 'middle')
  // the best group; on a tie, the end the edge points to
  const byRate = [...ok].sort((a, b) => b.winRate - a.winRate || (s.edge >= 0.5 ? b.low - a.low : a.low - b.low))
  const best = byRate[0]
  const worst = byRate[byRate.length - 1]
  return `Players with ${s.situation} ${range(best, place(best))} ${when(s.moment)} win ${pct(best.winRate)} (of ${best.games} games, ±${pct(margin(best.games))}) — vs ${pct(worst.winRate)} with ${range(worst, place(worst))}`
}

/** "What wins?" for a batch of results (the mixed tables — never the skill ladder's). Pure: same results = same answer. */
export function whatWins(results: GameResult[], options: WhatWinsOptions = {}): WhatWins {
  const minGames = options.minGames ?? 30
  const topCount = options.top ?? 5
  const isTheWin = options.isTheWin ?? 0.95
  const games = results.map((g) => g.seats.filter((s) => s.situations && (!options.skill || s.skill === options.skill)))
  const seats = games.flat()
  // every situation at every moment, in the order first seen
  const keys = new Map<string, { situation: string; moment: string }>()
  for (const s of seats) for (const [moment, named] of Object.entries(s.situations ?? {})) for (const situation of Object.keys(named)) keys.set(`${situation}|${moment}`, { situation, moment })
  const all: SituationWins[] = [...keys.values()].map(({ situation, moment }) => {
    const valueOf = (s: (typeof seats)[number]) => s.situations?.[moment]?.[situation]
    const at = games.map((g) => g.filter((s) => valueOf(s) !== undefined).map((s) => ({ won: s.won, value: valueOf(s)! })))
    const flat = at.flat()
    const groups = terciles(flat.map((s) => s.value)).map((r) => {
      const inside = flat.filter((s) => s.value >= r.low && s.value <= r.high)
      return { ...r, games: inside.length, winRate: round(mean(inside.map((s) => s.won))) }
    })
    const e = edge(at)
    const big = groups.filter((g) => g.games >= minGames)
    const leftOut = groups.length < 2 ? `always ${num(groups[0]?.low ?? 0)} — nothing to compare`
      : e.pairs < minGames ? `too few games (${e.pairs} winner-vs-loser pairs, needs ${minGames})`
      : big.length < 2 ? `too few games (${groups.map((g) => g.games).join(' / ')} in its groups, needs ${minGames} in two of them)`
      : undefined
    const strength = round(Math.abs(e.edge - 0.5) * 2)
    return { situation, moment, groups, edge: e.edge, pairs: e.pairs, strength, leftOut, ...(!leftOut && moment === 'end' && strength >= isTheWin ? { isTheWin: true } : {}) }
  })
  all.sort((a, b) => Number(!!a.leftOut) - Number(!!b.leftOut) || b.strength - a.strength || b.pairs - a.pairs || a.situation.localeCompare(b.situation) || a.moment.localeCompare(b.moment))
  const shown = new Set<string>()
  const top: string[] = []
  for (const s of all) {
    if (s.leftOut || s.isTheWin || shown.has(s.situation) || top.length >= topCount) continue
    shown.add(s.situation)
    top.push(sentence(s, minGames))
  }
  return {
    top,
    all,
    theWin: all.filter((s) => s.isTheWin).map((s) => s.situation),
    leftOut: all.filter((s) => s.leftOut).map((s) => `${s.situation} ${when(s.moment)}: ${s.leftOut}`),
    baseRate: round(mean(seats.map((s) => s.won))),
    seats: seats.length,
  }
}

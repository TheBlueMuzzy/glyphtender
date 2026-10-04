// THE AI MODULE — THE PERSONALITY CHECK. Does each personality FEEL like itself, judged by what it does?
//
// Sliders are the mechanics; what players feel comes from behaviour. So after hundreds of AI-vs-AI games, every seat
// of every game is reduced to its behaviour meters (numbers the game measures: "tangles caused", "word length"…) and
// this file answers four questions:
//   1. Feel targets  — does each personality hit its targets ("tangles a rival in ≥ 60% of games")?
//   2. Tell-apart    — from behaviour alone, can a simple model tell who played? (If it can't, players can't either.)
//   3. Wins          — does everyone win sometimes; does anyone dominate?
//   4. Skill ladder  — does the more skilled version beat the less skilled one?
// Plain maths, no libraries. The game runs the games and measures; this only reads the numbers.
// Design: framework .planning/design/ai.md ("Arena + Personality Check").

/** One seat of one finished game. `won` = 1 for a win, a share for a shared win (2 winners → 0.5 each), else 0. */
export interface SeatResult {
  personality: string
  skill: string
  meters: Record<string, number>
  won: number
}

export interface GameResult {
  seats: SeatResult[]
}

/** A feel target as watchable behaviour. '>=' / '<=' compare the personality's average with `value`;
 *  'tableBest' / 'tableWorst' = its average beats every other personality's average; 'nearAverage' = within `value`
 *  of the average of all personalities' averages; 'neverExtreme' (meter "*") = not the highest or lowest personality
 *  on any meter (measured = how many meters it IS extreme on). */
export interface FeelTarget {
  meter: string
  op: '>=' | '<=' | 'tableBest' | 'tableWorst' | 'nearAverage' | 'neverExtreme'
  value?: number
  label: string
}

export interface TargetResult extends FeelTarget {
  measured: number
  pass: boolean
  /** For table targets: the best other personality and its average (nearAverage: the table average). */
  rival?: { personality: string; measured: number }
  /** neverExtreme: the meters it was the highest or lowest on. */
  extremes?: string[]
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places

/** Every seat played by each personality (optionally only at one skill). */
export function seatsBy(results: GameResult[], skill?: string): Map<string, SeatResult[]> {
  const by = new Map<string, SeatResult[]>()
  for (const g of results) for (const s of g.seats) {
    if (skill && s.skill !== skill) continue
    by.set(s.personality, [...(by.get(s.personality) ?? []), s])
  }
  return by
}

/** Each personality's average for one meter. */
export function averages(results: GameResult[], meter: string, skill?: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [p, seats] of seatsBy(results, skill)) out.set(p, mean(seats.map((s) => s.meters[meter] ?? 0)))
  return out
}

/** 1. Each personality's feel targets, green or red. */
export function checkFeelTargets(results: GameResult[], targets: Record<string, FeelTarget[]>, skill?: string): Record<string, TargetResult[]> {
  const out: Record<string, TargetResult[]> = {}
  for (const [personality, list] of Object.entries(targets)) {
    out[personality] = list.map((t) => {
      const avg = t.meter === '*' ? new Map<string, number>() : averages(results, t.meter, skill)
      const measured = round(avg.get(personality) ?? NaN)
      if (t.op === 'neverExtreme') {
        const meters = [...new Set(results.flatMap((g) => g.seats.flatMap((s) => Object.keys(s.meters))))]
        const extremes = meters.filter((m) => {
          const avgs = averages(results, m, skill)
          const mine = avgs.get(personality)
          const rest = [...avgs].filter(([p]) => p !== personality).map(([, v]) => v)
          return mine !== undefined && rest.length > 0 && (mine > Math.max(...rest) || mine < Math.min(...rest))
        })
        return { ...t, measured: extremes.length, pass: extremes.length === 0, extremes }
      }
      if (t.op === 'nearAverage') {
        const tableAverage = mean([...avg.values()])
        return { ...t, measured, pass: Number.isFinite(measured) && Math.abs(measured - tableAverage) <= (t.value ?? 0), rival: { personality: 'table average', measured: round(tableAverage) } }
      }
      if (t.op === '>=' || t.op === '<=') {
        const pass = Number.isFinite(measured) && (t.op === '>=' ? measured >= (t.value ?? 0) : measured <= (t.value ?? 0))
        return { ...t, measured, pass }
      }
      const others = [...avg].filter(([p]) => p !== personality)
      const best = others.sort((a, b) => (t.op === 'tableBest' ? b[1] - a[1] : a[1] - b[1]))[0]
      const pass = Number.isFinite(measured) && (!best || (t.op === 'tableBest' ? measured > best[1] : measured < best[1]))
      return { ...t, measured, pass, rival: best ? { personality: best[0], measured: round(best[1]) } : undefined }
    })
  }
  return out
}

/** 2. Tell-apart: guess each seat's personality from its meters alone (nearest average, each meter put on the same
 *  scale, the seat itself left out of the averages). Returns the share guessed right per personality and a grid
 *  grid[actual][guessed] = how many. */
export function tellApart(results: GameResult[], meters: string[], skill?: string): { accuracy: Record<string, number>; overall: number; grid: Record<string, Record<string, number>> } {
  const seats = [...seatsBy(results, skill)].flatMap(([p, list]) => list.map((s) => ({ p, v: meters.map((m) => s.meters[m] ?? 0) })))
  const names = [...new Set(seats.map((s) => s.p))].sort()
  // Same scale for every meter: (value − average) / spread.
  const centre = meters.map((_, i) => mean(seats.map((s) => s.v[i])))
  const spread = meters.map((_, i) => Math.sqrt(mean(seats.map((s) => (s.v[i] - centre[i]) ** 2))) || 1)
  const scaled = seats.map((s) => ({ p: s.p, v: s.v.map((x, i) => (x - centre[i]) / spread[i]) }))
  const sums = new Map(names.map((n) => [n, { total: meters.map(() => 0), count: 0 }]))
  for (const s of scaled) {
    const t = sums.get(s.p)!
    s.v.forEach((x, i) => (t.total[i] += x))
    t.count++
  }
  const grid: Record<string, Record<string, number>> = Object.fromEntries(names.map((a) => [a, Object.fromEntries(names.map((b) => [b, 0]))]))
  for (const s of scaled) {
    let bestName = ''
    let bestDist = Infinity
    for (const n of names) {
      const t = sums.get(n)!
      const count = n === s.p ? t.count - 1 : t.count
      if (count <= 0) continue
      const centroid = t.total.map((x, i) => (n === s.p ? x - s.v[i] : x) / count)
      const dist = centroid.reduce((d, c, i) => d + (c - s.v[i]) ** 2, 0)
      if (dist < bestDist) [bestDist, bestName] = [dist, n]
    }
    if (bestName) grid[s.p][bestName]++
  }
  const accuracy: Record<string, number> = {}
  let right = 0
  for (const n of names) {
    const row = Object.values(grid[n]).reduce((a, b) => a + b, 0)
    accuracy[n] = row ? round(grid[n][n] / row) : 0
    right += grid[n][n]
  }
  return { accuracy, overall: seats.length ? round(right / seats.length) : 0, grid }
}

/** 3. Wins: each personality's win share overall, and head-to-head: grid[a][b] = a's share of the wins between a and b
 *  in games where both played (0.5 = even). */
export function winRates(results: GameResult[], skill?: string): { overall: Record<string, number>; headToHead: Record<string, Record<string, number>> } {
  const overall: Record<string, number> = {}
  for (const [p, seats] of seatsBy(results, skill)) overall[p] = round(mean(seats.map((s) => s.won)))
  const pairs = new Map<string, { a: number; b: number }>()
  for (const g of results) {
    const seats = g.seats.filter((s) => !skill || s.skill === skill)
    for (const x of seats) for (const y of seats) {
      if (x === y || x.personality === y.personality) continue
      const key = `${x.personality}|${y.personality}`
      const t = pairs.get(key) ?? { a: 0, b: 0 }
      t.a += x.won
      t.b += y.won
      pairs.set(key, t)
    }
  }
  const headToHead: Record<string, Record<string, number>> = {}
  for (const [key, t] of pairs) {
    const [a, b] = key.split('|')
    headToHead[a] = { ...(headToHead[a] ?? {}), [b]: t.a + t.b ? round(t.a / (t.a + t.b)) : 0.5 }
  }
  return { overall, headToHead }
}

/** 4. Skill ladder: for each personality, when its higher skill met a lower one (skills in order, low → high), the
 *  higher one's share of their wins. */
export function skillLadder(results: GameResult[], skillOrder: string[]): Record<string, number> {
  const tally = new Map<string, { hi: number; lo: number }>()
  for (const g of results) for (const x of g.seats) for (const y of g.seats) {
    const rx = skillOrder.indexOf(x.skill)
    const ry = skillOrder.indexOf(y.skill)
    if (x.personality !== y.personality || rx <= ry || ry < 0) continue
    const t = tally.get(x.personality) ?? { hi: 0, lo: 0 }
    t.hi += x.won
    t.lo += y.won
    tally.set(x.personality, t)
  }
  return Object.fromEntries([...tally].map(([p, t]) => [p, t.hi + t.lo ? round(t.hi / (t.hi + t.lo)) : 0.5]))
}

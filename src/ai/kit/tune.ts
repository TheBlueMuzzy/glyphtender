// THE AI MODULE — THE AUTO-TUNER. Suggests slider values for ONE personality so it hits more of its feel targets.
// (Pure: no screen, no network, no waiting. It only SUGGESTS — nothing is written; the designer applies it.)
//
// How it searches (plain coordinate steps — explainable, no libraries):
//   1. Play a small seeded batch of arena games with the personality as it is (try 1). Every game has it at the table;
//      the other personalities stay exactly as they are.
//   2. Take its sliders one at a time (each trait's range — moved whole, its width kept — then nudge, focus and each
//      steady goal). Move the slider up by a step; if that hits more targets, keep it; if not, try down. Each move is
//      one "try", played on the SAME seeds, so only the slider changed.
//   3. After a pass where no slider helped, halve the step. Stop when every target is green, the tries or the time
//      run out, or no slider helps even at the smallest step ("settled").
//   4. Guard against luck: the start and the best are both played again on FRESH seeds. Only a best that is still
//      better there is suggested; otherwise it says so and suggests nothing.
// "Better" = more of ITS targets green, then more of the OTHER personalities' targets green, then closer to the red
// ones. Every value stays inside its slider's range (traits 0–100, nudge / focus / steady 0–1).
// Used by `npm run ai:tune` (ai-arena.mjs --tune) and the Dev Kit's "Suggest sliders" (in the check's Web Worker).
// Design: framework .planning/design/ai.md ("Auto-tuner").
import { arenaPlan, playArenaGame, toResults, type ArenaPlug, type ArenaRequest, type ArenaTable } from './arena'
import { checkFeelTargets, type FeelTarget, type GameResult, type TargetResult } from './check'
import { shuffle } from './random'
import type { Personality } from './types'

/** The tuner's budget — content/ai/arena.json (the installer's starter has them; anything left out = these). */
export interface TuneSettings {
  /** Games per try (every try plays the same seeds). */
  tuneGames: number
  /** Tries in all, the start included. */
  tuneTries: number
  /** Stop searching after this many seconds (0 = no limit). The fresh-seed check still runs after. */
  tuneSeconds: number
  /** Games for the fresh-seed check (start and best each play them). */
  tuneFreshGames: number
  /** The tuning games' first seed. */
  tuneSeed: number
  /** The fresh games' first seed — far from tuneSeed, so no game is played twice. */
  tuneFreshSeed: number
  /** The first step, as a share of each slider's range (0.25 = a quarter); halved after a pass where nothing helped. */
  tuneStep: number
  /** Fewer fresh games than this = too few to trust: the best try is shown, never suggested (like whatWinsMinGames). */
  tuneMinFreshGames: number
}

export const defaultTuneSettings: TuneSettings = { tuneGames: 12, tuneTries: 20, tuneSeconds: 900, tuneFreshGames: 30, tuneSeed: 7000, tuneFreshSeed: 9000, tuneStep: 0.25, tuneMinFreshGames: 30 }

/** One slider the tuner may move: where it is in the personality, and its allowed range. */
export interface TuneSlider {
  /** "traits.caution" · "nudge" · "focus" · "steady.SCORE" */
  path: string
  /** Lowest and highest value it may take (a trait: its range's low end, so the whole range fits in 0–100). */
  min: number
  max: number
  /** The smallest change that means anything (1 for traits, 0.05 for the 0–1 sliders). */
  grain: number
}

const isTrait = (path: string) => path.startsWith('traits.')
const roundTo = (v: number, grain: number) => Math.round(Math.round(v / grain) * grain * 1e6) / 1e6
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The sliders of a personality, in the order the tuner tries them: each trait, nudge, focus, each steady goal. */
export function slidersOf(p: Personality): TuneSlider[] {
  const traits = Object.entries(p.traits).map(([name, r]) => ({ path: `traits.${name}`, min: 0, max: 100 - Math.max(0, r.max - r.min), grain: 1 }))
  const steady = Object.keys(p.steady ?? {}).map((goal) => ({ path: `steady.${goal}`, min: 0, max: 1, grain: 0.05 }))
  return [...traits, { path: 'nudge', min: 0, max: 1, grain: 0.05 }, { path: 'focus', min: 0, max: 1, grain: 0.05 }, ...steady]
}

/** A slider's value (a trait: its range's low end). */
export function sliderValue(p: Personality, path: string): number {
  if (isTrait(path)) return p.traits[path.slice(7)]?.min ?? 0
  if (path.startsWith('steady.')) return p.steady?.[path.slice(7)] ?? 0
  if (path === 'focus') return p.focus ?? 0
  return p.nudge
}

/** A copy with one slider set (kept inside its range; a trait's range moves whole, its width kept). */
export function withSlider(p: Personality, slider: TuneSlider, value: number): Personality {
  const v = roundTo(clamp(value, slider.min, slider.max), slider.grain)
  if (isTrait(slider.path)) {
    const name = slider.path.slice(7)
    const r = p.traits[name]
    return { ...p, traits: { ...p.traits, [name]: { min: v, max: v + (r.max - r.min) } } }
  }
  if (slider.path.startsWith('steady.')) return { ...p, steady: { ...p.steady, [slider.path.slice(7)]: v } }
  return { ...p, [slider.path]: v }
}

/** A slider's value as people read it: a trait's range "40–60", else the number. */
export function sliderText(p: Personality, path: string): string {
  if (isTrait(path)) {
    const r = p.traits[path.slice(7)]
    return r ? `${r.min}–${r.max}` : '—'
  }
  return String(sliderValue(p, path))
}

/** The tuning tables: the personality at every table (its seat moving round), table sizes going round, the other
 *  seats shuffled from the rest of the cast (repeats past the cast, like mixedTables). Seeded: same plan every time. */
export function tuneTables(personalities: Personality[], id: string, skill: ArenaRequest['skills'][number], games: number, seats: { minSeats: number; maxSeats: number }, seed: number): ArenaTable[] {
  const me = personalities.find((p) => p.id === id)
  if (!me) throw new Error(`No personality "${id}"`)
  const rest = personalities.filter((p) => p.id !== id)
  const sizes = Math.max(1, seats.maxSeats - seats.minSeats + 1)
  let rng = seed
  return Array.from({ length: games }, (_, g) => {
    const n = Math.max(1, seats.minSeats + (g % sizes))
    let others: Personality[] = []
    while (others.length < n - 1) {
      if (!rest.length) others = [...others, me]
      else {
        const s = shuffle(rest, rng)
        rng = s.rng
        others = [...others, ...s.items]
      }
    }
    const cast = others.slice(0, n - 1)
    cast.splice(g % n, 0, me)
    return { seats: cast.map((personality) => ({ personality, skill })), seed: seed + g, kind: 'mixed' as const }
  })
}

/** How far a red target is from green, 0 (green) up — on its own scale, so targets of any size count alike. */
export function shortfall(t: TargetResult): number {
  if (t.pass) return 0
  if (!Number.isFinite(t.measured)) return 1
  const rel = (gap: number, size: number) => Math.max(0, gap) / Math.max(Math.abs(size), 1e-6)
  if (t.op === '>=') return rel((t.value ?? 0) - t.measured, t.value ?? 1)
  if (t.op === '<=') return rel(t.measured - (t.value ?? 0), t.value || 1)
  if (t.op === 'beats') return Math.max(0, (t.value ?? 0.5) - t.measured)
  if (t.op === 'neverExtreme') return t.measured
  if (t.op === 'nearAverage') return rel(Math.abs(t.measured - (t.rival?.measured ?? 0)) - (t.value ?? 0), t.rival?.measured || 1)
  const rival = t.rival?.measured ?? t.measured
  const size = Math.abs(rival) + Math.abs(t.measured) || 1
  return (t.op === 'tableBest' ? rival - t.measured : t.measured - rival) / size + 0.01 // a tie is still red
}

/** How far a target is past its line, on its own scale (the mirror of shortfall): below 0 = red, 0.02 = only just
 *  green. "Just over" = under JUST_OVER — the Glyphtender proof's Strategist went 0.5 → 0.6 against "≥ 0.6" on the
 *  tuner's fresh games and read 0.53 on a bigger ai:arena run: a target that lands on its line may be luck. */
export function edgeOf(t: TargetResult): number {
  if (!Number.isFinite(t.measured)) return -1
  const rel = (gap: number, size: number) => gap / Math.max(Math.abs(size), 1e-6)
  if (t.op === '>=') return rel(t.measured - (t.value ?? 0), t.value || 1)
  if (t.op === '<=') return rel((t.value ?? 0) - t.measured, t.value || 1)
  if (t.op === 'beats') return t.measured - (t.value ?? 0.5)
  if (t.op === 'neverExtreme') return t.pass ? 1 : -t.measured
  if (t.op === 'nearAverage') return rel((t.value ?? 0) - Math.abs(t.measured - (t.rival?.measured ?? 0)), t.rival?.measured || 1)
  const rival = t.rival?.measured ?? t.measured
  const size = Math.abs(rival) + Math.abs(t.measured) || 1
  return (t.op === 'tableBest' ? t.measured - rival : rival - t.measured) / size
}
/** A green target closer than this to its line is flagged "only just over" (5% of its own scale). */
export const JUST_OVER = 0.05

/** How good one batch is for the tuned personality. */
export interface TuneScore {
  /** Its own targets green. */
  own: number
  /** The other personalities' targets green. */
  others: number
  /** Its red targets' shortfalls, added up (lower = closer). */
  gap: number
}

export function scoreOf(feel: Record<string, TargetResult[]>, id: string): TuneScore {
  const mine = feel[id] ?? []
  const others = Object.entries(feel).filter(([p]) => p !== id).flatMap(([, list]) => list)
  return { own: mine.filter((t) => t.pass).length, others: others.filter((t) => t.pass).length, gap: mine.reduce((s, t) => s + shortfall(t), 0) }
}

/** Is `a` better than `b`? More of its own targets green, then more of the others', then closer. */
export function isBetter(a: TuneScore, b: TuneScore): boolean {
  if (a.own !== b.own) return a.own > b.own
  if (a.others !== b.others) return a.others > b.others
  return a.gap < b.gap - 1e-9
}

/** Where a tune run is (for a progress bar: "Try 4 / 20"). */
export interface TuneProgress {
  phase: 'search' | 'fresh'
  /** The try being played (search), 1-based. */
  tryNo: number
  tries: number
  /** Games of this batch done / in the batch. */
  game: number
  games: number
}

/** One slider in the suggestion: old → new. */
export interface TuneSliderChange {
  path: string
  from: string
  to: string
  changed: boolean
}

/** One of its targets, measured on the fresh seeds with the start and with the suggestion. */
export interface TuneTargetChange {
  label: string
  meter: string
  op: FeelTarget['op']
  /** What it wants, in words ("≥ 0.6", "the table's highest", "wins ≥ 55% vs Survivor"). */
  wants: string
  before: { measured: number; pass: boolean }
  /** borderline = green, but only just over its line (edgeOf < JUST_OVER) — confirm with a bigger run. */
  after: { measured: number; pass: boolean; borderline?: boolean }
}

export interface TuneResult {
  personality: string
  /** better = a suggestion that held up on fresh seeds · noGain = nothing held up (keep what you have) ·
   *  alreadyGreen = every target green at the start · noTargets = it has no feel targets to aim at ·
   *  tooFewGames = it held up, but on fewer fresh games than tuneMinFreshGames — shown, not suggested. */
  verdict: 'better' | 'noGain' | 'alreadyGreen' | 'noTargets' | 'tooFewGames'
  /** The verdict in one plain sentence. */
  message: string
  /** The suggested personality (only sliders changed), or null when there is nothing to suggest. */
  suggested: Personality | null
  sliders: TuneSliderChange[]
  /** Its targets on the fresh seeds, before → after. */
  targets: TuneTargetChange[]
  /** Its targets still red after, each with why ("within these ranges" vs "within this budget"). */
  cantReach: { label: string; why: string }[]
  /** Other personalities' targets that changed colour on the fresh seeds (the tuner tries not to, but says so). */
  others: { personality: string; label: string; before: boolean; after: boolean }[]
  /** Each try: what changed and how many of its targets went green; a kept try says why (more of its own targets
   *  green, the same but more of the others', or the same counts but closer to its red lines). */
  log: { tryNo: number; change: string; own: number; kept: boolean; why?: 'more' | 'others' | 'closer' }[]
  tries: number
  games: number
  seconds: number
  stoppedBy: 'allGreen' | 'tries' | 'time' | 'settled' | 'noTargets'
  settings: TuneSettings
  /** "12 games a try at FirstClass · seeds 7000 / fresh 9000" */
  subtitle: string
}

export interface TuneOptions {
  /** The budget: content/ai/arena.json as it is (only its tune* numbers are read); anything left out = defaultTuneSettings. */
  settings?: Partial<TuneSettings> & { [other: string]: unknown }
  onProgress?: (p: TuneProgress) => void
  /** The clock in ms (tests pass their own). Default performance.now / Date.now. */
  now?: () => number
}

const wantsText = (t: FeelTarget) =>
  t.op === '>=' ? `≥ ${t.value}` : t.op === '<=' ? `≤ ${t.value}` : t.op === 'tableBest' ? "the table's highest" : t.op === 'tableWorst' ? "the table's lowest"
    : t.op === 'nearAverage' ? `within ${t.value} of the table average` : t.op === 'neverExtreme' ? 'never the highest or lowest' : `wins ≥ ${Math.round((t.value ?? 0.5) * 100)}% vs ${t.against ?? '?'}`

const clockNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Suggest slider values for personality `id` (see the top of this file). The same request + settings = the same
 *  suggestion (unless the time budget cuts it short). Throws in plain English for a personality that isn't there. */
export function tunePersonality<State, Action, Setup, View>(plug: ArenaPlug<State, Action, Setup, View>, request: ArenaRequest, id: string, options: TuneOptions = {}): TuneResult {
  const given = options.settings ?? {}
  const settings = Object.fromEntries(Object.entries(defaultTuneSettings).map(([k, v]) => [k, given[k] ?? v])) as unknown as TuneSettings
  for (const [k, v] of Object.entries(settings)) if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`content/ai/arena.json "${k}" should be a number of 0 or more (got ${JSON.stringify(v)})`)
  const now = options.now ?? clockNow
  const started = now()
  const start = request.personalities.find((p) => p.id.toLowerCase() === id.toLowerCase())
  if (!start) throw new Error(`No personality "${id}" (there are ${request.personalities.map((p) => p.id).join(', ')})`)
  const targets = request.targets.personalities[start.id] ?? []
  const { main, settings: arena } = arenaPlan({ ...request, settings: { ...request.settings, ladderGames: 0 } })
  const subtitle = `${settings.tuneGames} games a try at ${main.id} · up to ${settings.tuneTries} tries${settings.tuneSeconds ? ` or ${settings.tuneSeconds} s` : ''} · checked on ${settings.tuneFreshGames} fresh games · seeds ${settings.tuneSeed} / fresh ${settings.tuneFreshSeed}`
  const sliders = slidersOf(start)
  const unchanged = (p: Personality) => sliders.map((s) => ({ path: s.path, from: sliderText(start, s.path), to: sliderText(p, s.path), changed: sliderText(start, s.path) !== sliderText(p, s.path) }))
  const base = { personality: start.id, settings, subtitle, others: [] as TuneResult['others'] }
  if (!targets.length) {
    return { ...base, verdict: 'noTargets', message: `${start.id} has no feel targets (content/ai/feel-targets.json) — nothing to tune toward.`, suggested: null, sliders: unchanged(start), targets: [], cantReach: [], log: [], tries: 0, games: 0, seconds: 0, stoppedBy: 'noTargets' }
  }

  let gamesPlayed = 0
  const tries = Math.max(1, Math.floor(settings.tuneTries))
  /** Play one batch with `me` in place of the start; its feel targets (every personality's). */
  const play = (me: Personality, seed: number, games: number, phase: TuneProgress['phase'], tryNo: number) => {
    const cast = request.personalities.map((p) => (p.id === start.id ? me : p))
    const tables = tuneTables(cast, start.id, main, Math.max(1, Math.floor(games)), arena, seed)
    const played = tables.map((t, i) => {
      const game = playArenaGame(plug, t.seats, t.seed, t.kind, [])
      options.onProgress?.({ phase, tryNo, tries, game: i + 1, games: tables.length })
      return game
    })
    gamesPlayed += played.length
    const results: GameResult[] = toResults(plug, played)
    return checkFeelTargets(results, request.targets.personalities, main.id)
  }

  // 1. The start
  let best = start
  let bestScore = scoreOf(play(start, settings.tuneSeed, settings.tuneGames, 'search', 1), start.id)
  const log: TuneResult['log'] = [{ tryNo: 1, change: 'as it is now', own: bestScore.own, kept: true }]
  let tryNo = 1
  let stoppedBy: TuneResult['stoppedBy'] = 'tries'
  // 2–3. Coordinate steps
  let step = settings.tuneStep
  const deltaOf = (s: TuneSlider) => roundTo(step * (s.max - s.min), s.grain)
  const directions = sliders.map(() => 1) // each slider's last helpful way, tried first next time
  let i = 0
  let sinceHelp = 0 // sliders tried in a row with none helping: a whole pass → smaller steps
  let again = false // this slider just helped
  search: while (true) {
    if (bestScore.own === targets.length) { stoppedBy = 'allGreen'; break }
    if (sliders.every((sl) => deltaOf(sl) < sl.grain)) { stoppedBy = 'settled'; break }
    const s = sliders[i]
    let helped = false
    // after a move that helped, only further the same way (back is where it came from)
    for (const dir of again ? [directions[i]] : [directions[i], -directions[i]]) {
      const from = sliderValue(best, s.path)
      const candidate = withSlider(best, s, from + dir * deltaOf(s))
      if (sliderValue(candidate, s.path) === from) continue // at the end of its range (or the step is too small): no try spent
      if (tryNo >= tries) { stoppedBy = 'tries'; break search }
      if (settings.tuneSeconds && (now() - started) / 1000 >= settings.tuneSeconds) { stoppedBy = 'time'; break search }
      tryNo++
      const score = scoreOf(play(candidate, settings.tuneSeed, settings.tuneGames, 'search', tryNo), start.id)
      const kept = isBetter(score, bestScore)
      const why = !kept ? undefined : score.own > bestScore.own ? 'more' as const : score.others > bestScore.others ? 'others' as const : 'closer' as const
      log.push({ tryNo, change: `${s.path} ${sliderText(best, s.path)} → ${sliderText(candidate, s.path)}`, own: score.own, kept, ...(why ? { why } : {}) })
      if (kept) {
        ;[best, bestScore, directions[i], helped] = [candidate, score, dir, true]
        break
      }
    }
    if (helped) {
      sinceHelp = 0 // the same slider gets another go, the same way
      again = true
      continue
    }
    again = false
    i = (i + 1) % sliders.length
    if (++sinceHelp >= sliders.length) {
      step /= 2
      sinceHelp = 0
    }
  }

  // 4. Fresh seeds: the start and the best, on games neither was tuned on
  const changedAny = best !== start
  const freshStart = play(start, settings.tuneFreshSeed, settings.tuneFreshGames, 'fresh', tryNo)
  const freshBest = changedAny ? play(best, settings.tuneFreshSeed, settings.tuneFreshGames, 'fresh', tryNo) : freshStart
  const startScore = scoreOf(freshStart, start.id)
  // Suggested only when MORE of its targets are green on the fresh games (closer but still red isn't enough)
  const heldUp = changedAny && scoreOf(freshBest, start.id).own > startScore.own
  // …and only on enough fresh games to trust (the Dev Kit proof suggested "2 → 3 of 4" on 4 fresh games: noise)
  const freshGames = Math.max(1, Math.floor(settings.tuneFreshGames))
  const tooFew = heldUp && freshGames < settings.tuneMinFreshGames
  // "after" = what the best try really got on the fresh games (suggested or not — so the page shows why not)
  const after = freshBest
  const targetsOut: TuneTargetChange[] = targets.map((t, k) => {
    const a = freshStart[start.id][k]
    const b = after[start.id][k]
    return { label: t.label, meter: t.meter, op: t.op, wants: wantsText(t), before: { measured: a.measured, pass: a.pass }, after: { measured: b.measured, pass: b.pass, ...(b.pass && edgeOf(b) < JUST_OVER ? { borderline: true } : {}) } }
  })
  const newlyBorderline = targetsOut.filter((t) => !t.before.pass && t.after.borderline).length
  const others = Object.keys(request.targets.personalities).filter((p) => p !== start.id).flatMap((p) =>
    (freshStart[p] ?? []).flatMap((t, k) => (after[p]?.[k] && after[p][k].pass !== t.pass ? [{ personality: p, label: t.label, before: t.pass, after: after[p][k].pass }] : [])))
  const allGreenAtStart = startScore.own === targets.length && !changedAny
  const why = stoppedBy === 'settled'
    ? 'within these ranges — every slider was tried both ways, down to the smallest step'
    : stoppedBy === 'time' ? `within this budget — the time ran out (${settings.tuneSeconds} s); more time or a bigger step may get there`
      : stoppedBy === 'allGreen' ? 'on the fresh games — it was green on the tuning games, so it sits on the edge (more games a try give a truer picture)'
        : `within this budget (${tries} tries) — more tries may get there`
  const cantReach = targetsOut.filter((t) => !t.after.pass).map((t) => ({ label: t.label, why: `measured ${Number.isFinite(t.after.measured) ? t.after.measured : 'nothing'}, wants ${t.wants} — couldn't reach it ${why}` }))
  const greenBefore = targetsOut.filter((t) => t.before.pass).length
  const greenAfter = targetsOut.filter((t) => t.after.pass).length
  const verdict: TuneResult['verdict'] = tooFew ? 'tooFewGames' : heldUp ? 'better' : allGreenAtStart ? 'alreadyGreen' : 'noGain'
  const message = verdict === 'better'
    ? `Suggested: ${greenBefore} → ${greenAfter} of ${targets.length} targets green on ${settings.tuneFreshGames} fresh games.${newlyBorderline ? ` ${newlyBorderline === 1 ? 'One of them is' : `${newlyBorderline} of them are`} only just over the line — confirm with npm run ai:arena (more games) before saving.` : ''}`
    : verdict === 'tooFewGames'
      ? `The best try had ${greenBefore} → ${greenAfter} of ${targets.length} targets green, but on only ${freshGames} fresh games — too few to trust (it wants ${settings.tuneMinFreshGames}), so it isn't suggested. Raise tuneFreshGames in content/ai/arena.json, or try its values and confirm with npm run ai:arena.`
    : verdict === 'alreadyGreen'
      ? `All ${targets.length} of ${start.id}'s targets are green already — nothing to change.`
      : bestScore.own > log[0].own
        ? `The best try had ${bestScore.own} of ${targets.length} green on the tuning games but ${scoreOf(freshBest, start.id).own} on ${settings.tuneFreshGames} fresh games (as it is now: ${greenBefore}) — luck, not a real gain, so keep what you have.`
        : log[0].own === targets.length
          ? `All ${targets.length} targets were green on the ${settings.tuneGames} tuning games, so nothing was tried — but ${greenBefore} on ${settings.tuneFreshGames} fresh games: it sits on the edge. More games a try (tuneGames) give the search a truer picture.`
          : `No slider move hit more targets in ${tryNo} tries — keep what you have (${greenBefore} of ${targets.length} green on fresh games).`
  const suggested = heldUp && !tooFew ? best : null
  // sliders = the best try's values (when not suggested: for the record — the page and the Dev Kit say "best found")
  return {
    ...base, verdict, message, suggested, sliders: unchanged(best), targets: targetsOut, cantReach: verdict === 'alreadyGreen' ? [] : cantReach,
    others: suggested ? others : [], log, tries: tryNo, games: gamesPlayed, seconds: Math.round((now() - started) / 100) / 10, stoppedBy,
  }
}

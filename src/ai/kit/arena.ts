// THE AI MODULE — THE ARENA. AI-vs-AI games for the Personality Check.  (Pure: no screen, no network, no waiting.)
//
// Bots sit in every seat and play whole games through the game's own rules door (viewFor → bot → apply, until it's
// over), each bot seeing only its own seat's view. Every seat gets its own seeded randomness from the game's seed,
// so the same seed always plays the same game. Bots are called straight away — no think-moments, no timers (the
// game's pace is for people watching; here it's always Instant), so hundreds of games run in seconds on the PC.
// The game's half (its ARENA PLUG): its rules, how to set up a game for these seats (its board choice), its bot, and
// its behaviour meters. Everything else — the loop, seating plans, the whole report — is here, the same for every game.
// Used by `npm run ai:arena` (ai-arena.mjs) and the Dev Kit's Run check (inside a Web Worker).
// Design: framework .planning/design/ai.md ("Arena + Personality Check").
import { botSeed } from './brain'
import { averages, checkFeelTargets, skillLadder, tellApart, winRates, type FeelTarget, type GameResult } from './check'
import { shuffle } from './random'
import type { CheckReport } from './report'
import { whatWins, type WhatWinsOptions } from './wins'
import type { Decision, Personality, Skill } from './types'

/** A number per personality, worked out from the results (a game's own "for all of them" check). */
export type PersonalityNumbers = (results: GameResult[], skill?: string) => Map<string, number>

/** The part of the Table's Rules the arena uses (a game's Rules fits as it is — table/kit/core.ts). */
export interface ArenaRules<State, Action, Setup, View> {
  setup(input: Setup): State
  apply(state: State, seat: number, action: Action, options?: { fast?: boolean }): { state: State }
  isOver(state: State): boolean
  toAct(state: State): number[]
  viewFor(state: State, seat: number): View
}

/** Who sits in one seat: a personality at a skill. */
export interface ArenaSeat {
  personality: Personality
  skill: Skill
}

/** The Table's Bot shape: view in, action out, the rng position carried along. */
export type ArenaBot<View, Action> = (view: View, seat: number, rng: number) => { action: Action; rng: number }

/** What kind of table a game is (the plug may pick a different board for the skill ladder). */
export type TableKind = 'mixed' | 'ladder'

/** The game's half of the arena. */
export interface ArenaPlug<State, Action, Setup, View> {
  /** The game's name, for the report's title. */
  name: string
  rules: ArenaRules<State, Action, Setup, View>
  /** A new game's setup for these seats — the game picks its board (or anything else) here. */
  setup(seats: ArenaSeat[], seed: number, kind: TableKind): Setup
  /** A bot for one seat. Call onDecision with each decision (asBot's onDecision fits) so its note is kept. */
  bot(seat: ArenaSeat, onDecision: (decision: Decision<Action>) => void): ArenaBot<View, Action>
  /** The behaviour meters of each seat of one finished game ("tangles caused", "word length"…), seat order. */
  meters(game: ArenaGame<State, Action>): Record<string, number>[]
  /** The seats that won (several = a shared win). */
  winners(state: State): number[]
  /** apply in fast mode? Default false: full mode, so a game log the meters read is kept. */
  fast?: boolean
  /** Stop a game after this many moves (an error: the game never ended). Default 5000. */
  maxMoves?: number
  /** The meters the tell-apart grid looks at. Default: every meter (leave out ones that give the answer away). */
  tellMeters?: string[]
  /** The game's own "for all of them" checks, by the name feel-targets.json uses (e.g. Glyphtender's "callsIt"). */
  checks?: Record<string, PersonalityNumbers>
  /** Where a seat's randomness starts. Default: the AI kit's botSeed rule (a game moving its own arena up can keep
   *  its old rule, so its old numbers stay the same). */
  seatRng?: (seed: number, seat: number) => number
  /** "What wins?" (F25, optional): the numbers the game names for one seat right now — "score lead", "letters in
   *  hand", "glyphlings trapped"… Read after each seat's own turns 3, 5… and at the end (content/ai/arena.json
   *  `whatWinsMoments`); the report says which of them predict the win. Numbers only (true/false → 1/0). */
  situations?: (state: State, seat: number) => Record<string, number>
  /** How many of its own turns this seat has finished, the game's way (e.g. a draft that isn't "a turn" left out).
   *  Default: a turn = the seat's moves until someone else acts. */
  turns?: (state: State, seat: number) => number
}

/** When situations are read: after the seat's own turn N (a number), or 'end' (the game as it ended). */
export type Moment = number | 'end'
/** A moment's name in the results ("turn 3", "end"). */
export const momentName = (m: Moment) => (m === 'end' ? 'end' : `turn ${m}`)

/** One finished game. */
export interface ArenaGame<State, Action> {
  seats: ArenaSeat[]
  seed: number
  kind: TableKind
  /** The game as it ended. */
  state: State
  /** Every move in order (meters may count them). */
  moves: { seat: number; action: Action }[]
  /** Every decision's note, in order, with the seat in front ("2 Strategist rolled TRAP…"). */
  notes: string[]
  /** How long each decision took, in ms (this machine — never part of the report, so the report stays the same). */
  decisionMs: number[]
  /** Each seat's situations (seat order): moment name ("turn 3", "end") → situation → number. A moment the game
   *  never reached (it ended before that seat's turn 5) isn't there. Empty when the plug names none. */
  situations: Record<string, Record<string, number>>[]
}

/** The plug's situations for one seat, checked: every value a real number (true/false count as 1/0). */
function readSituations<State>(plug: { name: string; situations?: (state: State, seat: number) => Record<string, number> }, state: State, seat: number, moment: string): Record<string, number> {
  const raw = plug.situations?.(state, seat) ?? {}
  const out: Record<string, number> = {}
  for (const [name, value] of Object.entries(raw)) {
    const v: unknown = value
    const n = typeof v === 'boolean' ? Number(v) : v
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${plug.name}'s situation "${name}" (seat ${seat}, ${moment}) isn't a number — it gave ${JSON.stringify(v) ?? String(v)}. Situations are numbers only (true/false → 1/0).`)
    out[name] = n
  }
  return out
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** One whole game with bots in every seat. */
export function playArenaGame<State, Action, Setup, View>(
  plug: ArenaPlug<State, Action, Setup, View>,
  seats: ArenaSeat[],
  seed: number,
  kind: TableKind = 'mixed',
  /** When to read the plug's situations (if it has any). */
  moments: Moment[] = momentsOf(defaultArenaSettings.whatWinsMoments),
): ArenaGame<State, Action> {
  const { rules } = plug
  let state = rules.setup(plug.setup(seats, seed, kind))
  const notes: string[] = []
  const decisionMs: number[] = []
  const moves: { seat: number; action: Action }[] = []
  const bots = seats.map((s, i) => plug.bot(s, (d) => notes.push(`${i} ${d.note}`)))
  const rngs = seats.map((_, i) => (plug.seatRng ?? botSeed)(seed, i))
  const maxMoves = plug.maxMoves ?? 5000
  const situations: Record<string, Record<string, number>>[] = seats.map(() => ({}))
  const turnsAt = new Set(moments.filter((m): m is number => typeof m === 'number'))
  const turns = seats.map(() => 0)
  while (!rules.isOver(state)) {
    if (moves.length >= maxMoves) throw new Error(`An arena game did not end within ${maxMoves} moves (seed ${seed})`)
    const acting = rules.toAct(state)
    if (!acting.length) throw new Error(`Nobody may act, but the game is not over (seed ${seed}, move ${moves.length + 1})`)
    const seat = acting[0]
    const started = now()
    const picked = bots[seat](rules.viewFor(state, seat), seat, rngs[seat])
    decisionMs.push(now() - started)
    rngs[seat] = picked.rng
    state = rules.apply(state, seat, picked.action, plug.fast ? { fast: true } : undefined).state
    moves.push({ seat, action: picked.action })
    // The seat's own turn count: the game's (plug.turns), or +1 when someone else acts next (or the game ends)
    if (plug.situations) {
      const before = turns[seat]
      turns[seat] = plug.turns ? plug.turns(state, seat) : rules.isOver(state) || rules.toAct(state)[0] !== seat ? before + 1 : before
      const now = turns[seat]
      if (now !== before && turnsAt.has(now) && !situations[seat][momentName(now)]) situations[seat][momentName(now)] = readSituations(plug, state, seat, momentName(now))
    }
  }
  if (plug.situations && moments.includes('end')) seats.forEach((_, i) => (situations[i].end = readSituations(plug, state, i, 'end')))
  return { seats, seed, kind, state, moves, notes, decisionMs, situations }
}

/** Each finished game as rows for the Personality Check (check.ts): who sat where, their meters, their share of the
 *  win (two winners → 0.5 each). */
export function toResults<State, Action, Setup, View>(plug: ArenaPlug<State, Action, Setup, View>, games: ArenaGame<State, Action>[]): GameResult[] {
  return games.map((game) => {
    const meters = plug.meters(game)
    const winners = plug.winners(game.state)
    return {
      seats: game.seats.map((s, i) => ({
        personality: s.personality.id,
        skill: s.skill.id,
        meters: { ...meters[i] },
        won: winners.includes(i) ? 1 / winners.length : 0,
        ...(game.situations?.[i] && Object.keys(game.situations[i]).length ? { situations: game.situations[i] } : {}),
      })),
    }
  })
}

// ─── Seating plans ───

/** How a run is shaped. The game keeps its own numbers in content/ai/arena.json (the installer gives it a starter). */
export interface ArenaSettings {
  /** Mixed tables at the main skill. */
  games: number
  /** Table sizes go round minSeats, minSeats + 1 … maxSeats, game after game. */
  minSeats: number
  maxSeats: number
  /** Skill-ladder games per personality: its highest skill against its lowest, two seats, sides swapped each game. */
  ladderGames: number
  /** The first mixed game's seed (game g plays seed + g); it also seeds the seating shuffle. */
  seed: number
  /** Ladder game g plays seed + ladderSeedOffset + g. */
  ladderSeedOffset: number
  /** How many decision notes of the first game go in the report. */
  notesInReport: number
  /** "What wins?" (F25): when the plug's situations are read — after each seat's own turn N, and 'end'. (Strings
   *  allowed so a game's imported arena.json fits as it is; anything but "end" or a whole number is refused.) */
  whatWinsMoments: (Moment | string)[]
  /** A low / mid / high group, or a situation's winner-vs-loser pairs, below this many → "too few games", left out. */
  whatWinsMinGames: number
  /** How many sentences the report shows. */
  whatWinsTop: number
  /** A situation this strong at the end (0–1) is the win itself (the score) — named apart, not a sentence. */
  whatWinsIsTheWin: number
}

/** Used for anything content/ai/arena.json leaves out (the numbers Glyphtender's own arena used). */
export const defaultArenaSettings: ArenaSettings = { games: 60, minSeats: 2, maxSeats: 4, ladderGames: 6, seed: 1000, ladderSeedOffset: 4000, notesInReport: 24, whatWinsMoments: [3, 5, 'end'], whatWinsMinGames: 30, whatWinsTop: 5, whatWinsIsTheWin: 0.95 }

/** One game to play: who sits where, its seed, what kind of table. */
export interface ArenaTable {
  seats: ArenaSeat[]
  seed: number
  kind: TableKind
}

/** Mixed tables: sizes going round min → max seats, personalities shuffled (seeded — the same plan every run). A table
 *  bigger than the cast gets repeats (3 personalities at 4 seats = one of them twice). `only` = these exact seats every
 *  game instead. */
export function mixedTables(personalities: Personality[], skill: Skill, games: number, settings: Pick<ArenaSettings, 'minSeats' | 'maxSeats' | 'seed'>, only: Personality[] = []): ArenaTable[] {
  const sizes = Math.max(1, settings.maxSeats - settings.minSeats + 1)
  let rng = settings.seed
  const tables: ArenaTable[] = []
  for (let g = 0; g < games; g++) {
    let cast = only
    if (!only.length) {
      const n = settings.minSeats + (g % sizes)
      cast = []
      while (cast.length < n && personalities.length) {
        const s = shuffle(personalities, rng)
        rng = s.rng
        cast = [...cast, ...s.items]
      }
      cast = cast.slice(0, n)
    }
    tables.push({ seats: cast.map((personality) => ({ personality, skill })), seed: settings.seed + g, kind: 'mixed' })
  }
  return tables
}

/** Skill-ladder tables: for each personality, `gamesEach` two-seat games of its `high` skill against its `low` one,
 *  swapping who goes first every game. */
export function ladderTables(personalities: Personality[], low: Skill, high: Skill, gamesEach: number, seed: number): ArenaTable[] {
  return personalities.flatMap((personality) =>
    Array.from({ length: gamesEach }, (_, g) => {
      const seats = [{ personality, skill: high }, { personality, skill: low }]
      return { seats: g % 2 ? seats.reverse() : seats, seed: seed + g, kind: 'ladder' as const }
    }),
  )
}

// ─── The whole Personality Check ───

/** A "for all of them" check: each personality's number must sit inside min…max. Built in: 'tellApart' (how often
 *  the tell-apart grid recognises it), 'skillLadder' (its higher skill's share of the wins), 'winRate' (its overall
 *  win share), 'meter' (its average of `meter`). Anything else = one of the game plug's own `checks`. */
export interface AllCheck {
  check: string
  meter?: string
  min?: number
  max?: number
  label: string
}

/** The game's content/ai/feel-targets.json: feel targets per personality + the checks for all of them. */
export interface CheckTargets {
  personalities: Record<string, FeelTarget[]>
  all: AllCheck[]
}

export interface ReportOptions {
  /** Skills in order, lowest first (for the skill ladder). */
  skillOrder: string[]
  /** Feel, tell-apart and wins look only at this skill's seats (the ladder looks at every game). */
  mainSkill?: string
  /** The skill-ladder games, kept apart: then `results` are the mixed tables only, and only the ladder sees these
   *  (F24 review: a ladder seat at the main skill — the low end of a 2-skill game — was counted as a mixed seat). */
  ladderResults?: GameResult[]
  subtitle: string
  /** The meters the tell-apart grid looks at. Default: every meter the games measured. */
  tellMeters?: string[]
  /** The game's own "for all of them" checks, by name. */
  checks?: Record<string, PersonalityNumbers>
  /** How many notes of the first game to show. Default 24. */
  notes?: number
  /** "What wins?" (F25): the minimum games and how many sentences (only when the games have situations). */
  whatWins?: Omit<WhatWinsOptions, 'skill'>
}

/** The whole Personality Check for a batch of results, ready for reportHtml. Pure: the same results = the same report. */
export function checkReport(name: string, results: GameResult[], firstNotes: string[], targets: CheckTargets, options: ReportOptions): CheckReport {
  const { mainSkill } = options
  const tellMeters = options.tellMeters ?? [...new Set(results.flatMap((g) => g.seats.flatMap((s) => Object.keys(s.meters))))]
  const feel = checkFeelTargets(results, targets.personalities, mainSkill)
  const tell = tellApart(results, tellMeters, mainSkill)
  const wins = winRates(results, mainSkill)
  const ladder = skillLadder(options.ladderResults ? [...results, ...options.ladderResults] : results, options.skillOrder)
  const names = Object.keys(wins.overall)
  const band = (v: number, min?: number, max?: number) => (min === undefined || v >= min) && (max === undefined || v <= max)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const numbersFor = (t: AllCheck): Map<string, number> | null => {
    if (t.check === 'tellApart') return new Map(Object.entries(tell.accuracy))
    if (t.check === 'skillLadder') return new Map(Object.entries(ladder))
    if (t.check === 'winRate') return new Map(Object.entries(wins.overall))
    if (t.check === 'meter') return t.meter ? averages(results, t.meter, mainSkill) : null
    return options.checks?.[t.check]?.(results, mainSkill) ?? null
  }
  const all = targets.all.map((t) => {
    const numbers = numbersFor(t)
    if (!numbers) return { label: t.label, pass: false, detail: `no check called "${t.check}"${t.check === 'meter' ? ' (it needs a "meter")' : ''}` }
    const measured = names.filter((n) => numbers.get(n) !== undefined).map((n) => [n, numbers.get(n)!] as const)
    const failing = measured.filter(([, v]) => !band(v, t.min, t.max))
    const notMeasured = names.length - measured.length
    const pass = measured.length > 0 && failing.length === 0
    const detail = !measured.length ? 'not measured in these games' : failing.length ? `off: ${failing.map(([n, v]) => `${n} ${pct(v)}`).join(', ')}` : `all ${measured.length} in range${notMeasured ? ` (${notMeasured} not measured)` : ''}`
    return { label: t.label, pass, detail }
  })
  const named = results.some((g) => g.seats.some((s) => s.situations))
  return { title: `Personality Check — ${name}`, subtitle: options.subtitle, feel, all, tell, wins, ladder, notes: firstNotes.slice(0, options.notes ?? 24), ...(named ? { whatWins: whatWins(results, { ...options.whatWins, skill: mainSkill }) } : {}) }
}

/** What to play: the cast, their skills, the targets, and anything to change from the settings for this run. */
export interface ArenaRequest {
  personalities: Personality[]
  /** Lowest first (the ladder plays the last against the first). */
  skills: Skill[]
  targets: CheckTargets
  /** The skill the mixed tables play at. Default: the middle one. */
  mainSkill?: string
  /** Play only these personalities (ids), all of them every game, instead of mixed tables. */
  only?: string[]
  settings?: Partial<ArenaSettings>
}

/** content/ai/arena.json's whatWinsMoments, checked: whole turn numbers (1 or more) and "end". Throws in plain English. */
export function momentsOf(list: unknown): Moment[] {
  if (!Array.isArray(list)) throw new Error(`content/ai/arena.json "whatWinsMoments" should be a list like [3, 5, "end"] (got ${JSON.stringify(list)})`)
  return list.map((m) => {
    if (m === 'end' || (Number.isInteger(m) && (m as number) >= 1)) return m as Moment
    throw new Error(`content/ai/arena.json "whatWinsMoments": ${JSON.stringify(m)} isn't a turn number (1, 2, 3…) or "end"`)
  })
}

/** The whole run as a list of tables: mixed first, then the ladder. Throws in plain English for a skill or
 *  personality that isn't there. */
export function arenaPlan(request: ArenaRequest): { tables: ArenaTable[]; main: Skill; settings: ArenaSettings } {
  const settings = { ...defaultArenaSettings, ...request.settings }
  settings.whatWinsMoments = momentsOf(settings.whatWinsMoments)
  const { personalities, skills } = request
  if (!personalities.length) throw new Error('No personalities to play')
  if (!skills.length) throw new Error('No skills to play at')
  const main = request.mainSkill === undefined ? skills[Math.floor((skills.length - 1) / 2)] : skills.find((s) => s.id === request.mainSkill)
  if (!main) throw new Error(`No skill "${request.mainSkill}" (there are ${skills.map((s) => s.id).join(', ')})`)
  const only = (request.only ?? []).map((id) => {
    const found = personalities.find((p) => p.id.toLowerCase() === id.toLowerCase())
    if (!found) throw new Error(`No personality "${id}" (there are ${personalities.map((p) => p.id).join(', ')})`)
    return found
  })
  const mixed = mixedTables(personalities, main, settings.games, settings, only)
  const low = skills[0]
  const high = skills[skills.length - 1]
  const ladder = settings.ladderGames > 0 && low !== high ? ladderTables(only.length ? only : personalities, low, high, settings.ladderGames, settings.seed + settings.ladderSeedOffset) : []
  return { tables: [...mixed, ...ladder], main, settings }
}

/** How many games a request plays in all (a progress bar's end). */
export const arenaTotal = (request: ArenaRequest) => arenaPlan(request).tables.length

/** Play the whole request and build its report. onProgress(done, total) after every game. Same request = same report. */
export function runArena<State, Action, Setup, View>(
  plug: ArenaPlug<State, Action, Setup, View>,
  request: ArenaRequest,
  onProgress?: (done: number, total: number) => void,
): { games: ArenaGame<State, Action>[]; results: GameResult[]; mixedResults: GameResult[]; report: CheckReport } {
  const { tables, main, settings } = arenaPlan(request)
  const games: ArenaGame<State, Action>[] = []
  for (const t of tables) {
    games.push(playArenaGame(plug, t.seats, t.seed, t.kind, momentsOf(settings.whatWinsMoments)))
    onProgress?.(games.length, tables.length)
  }
  const results = toResults(plug, games)
  // feel, tell-apart and wins look at the mixed tables only; the ladder games only feed the skill ladder
  const mixedResults = results.filter((_, i) => tables[i].kind === 'mixed')
  const ladderResults = results.filter((_, i) => tables[i].kind !== 'mixed')
  const mixed = tables.filter((t) => t.kind === 'mixed')
  const ladder = tables.length - mixed.length
  const sizes = [...new Set(mixed.map((t) => t.seats.length))].sort((a, b) => a - b)
  const players = sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]} players` : `${sizes[0] ?? 0} players`
  const subtitle = `${mixed.length} mixed games at ${main.id} (${players})${ladder ? ` + ${ladder} skill-ladder games` : ''} · seed ${settings.seed}`
  const report = checkReport(plug.name, mixedResults, games[0]?.notes ?? [], request.targets, {
    skillOrder: request.skills.map((s) => s.id),
    mainSkill: main.id,
    ladderResults,
    subtitle,
    tellMeters: plug.tellMeters,
    checks: plug.checks,
    notes: settings.notesInReport,
    whatWins: { minGames: settings.whatWinsMinGames, top: settings.whatWinsTop, isTheWin: settings.whatWinsIsTheWin },
  })
  return { games, results, mixedResults, report }
}

/** The Dev Kit's Run check plays a smaller batch: the ladder only joins in from `devKitLadderFrom` games asked for. */
export interface DevKitArenaSettings {
  devKitLadderFrom: number
  devKitLadderGames: number
}
export const defaultDevKitArenaSettings: DevKitArenaSettings = { devKitLadderFrom: 20, devKitLadderGames: 2 }

/** The settings for a Dev Kit Run check of `games` games. */
export function devKitSettings(settings: Partial<ArenaSettings & DevKitArenaSettings>, games: number): Partial<ArenaSettings> {
  const { devKitLadderFrom, devKitLadderGames } = { ...defaultDevKitArenaSettings, ...settings }
  return { ...settings, games, ladderGames: games >= devKitLadderFrom ? devKitLadderGames : 0 }
}

/** What a game's arena file (src/ai/arenaGame.ts) gives `npm run ai:arena`: its plug and its cast. Personalities and
 *  skills are the game's content/ai/ files as it reads them (leave out any it never offers players). */
export interface ArenaGameFile<State, Action, Setup, View> {
  plug: ArenaPlug<State, Action, Setup, View>
  personalities: Personality[]
  /** Lowest first. */
  skills: Skill[]
  targets: CheckTargets
  /** Meters to print per personality on the PC (default: the plug's tellMeters, else every meter). */
  columns?: string[]
}

/** Decision times across games, in ms (this machine; a phone is roughly 4× slower). */
export function decisionTimes(games: { decisionMs: number[] }[]): { median: number; p90: number; slowest: number; count: number } {
  const ms = games.flatMap((g) => g.decisionMs).sort((a, b) => a - b)
  const at = (q: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] : 0)
  return { median: at(0.5), p90: at(0.9), slowest: at(1), count: ms.length }
}

// THE AI MODULE — BANTER. Should this bot say something at this moment, and what?
//
// The game names its MOMENTS from its own events ("tangledRival", "gotTangled", "stoleWord", "calledIt", "won"…): the
// plug's moments(event, seat) says what an event means to one seat (the same "tangled" event is "tangledRival" for the
// one who did it and "gotTangled" for the one it happened to). The lines are data — content/text/en.json
// "banter": { "<personality>": { "<moment>": "…", "<moment>_2": "…" } } — and the numbers live in
// content/ai/banter.json (chance per moment, cooldown, the moments that ignore it, preset emotes per moment, how long
// a bot takes to speak). This picks: a chance per moment × the personality's chattiness, nothing again for a few moves
// after it spoke (cooldown — some moments may skip it), and a line it hasn't said lately. Memory is plain JSON per seat.
import { nextRandom } from './random'

/** A moment's name: a short code name the game picks ("won", "gotTangled"). Its lines are banter.<personality>.<moment>. */
export type Moment = string

/** A moment with who caused it: `by` = the seat whose move it was (0.5.0 — so a PERSON's good move can always get an
 *  answer: content/ai/banter.json "answerPeople"). A plain name = cause unknown (never counts as a person's move). */
export interface MomentBy {
  moment: Moment
  by?: number
}

/** The game's moment map (on its plug): what this event means to this seat — one moment, a few (most important
 *  first: the bot says at most one line per change), or nothing. Seat = the Table's seat number. A moment may be a
 *  plain name or `{ moment, by }` (who caused it — 0.5.0; plain names still work). */
export type MomentMap<Event> = (event: Event, seat: number) => Moment | MomentBy | readonly (Moment | MomentBy)[] | null | undefined

/** The moment names most games have, with what each means — a starting list for content/ai/banter.json and the Dev
 *  Kit's labels. A game adds its own (any code name), and leaves out the ones it doesn't have. */
export const COMMON_MOMENTS: Readonly<Record<string, string>> = {
  gameStart: 'the game begins',
  bigMove: 'it just made a great move',
  rivalBigMove: 'someone else just made a great move',
  hitRival: 'it just hurt another player',
  gotHit: 'another player just hurt it',
  closeCall: 'it nearly lost something big',
  won: 'the game ended and it won',
  lost: 'the game ended and it lost',
}

/** A moment's name must be a code name (it becomes part of an emote id: banter.<personality>.<moment>). */
export const MOMENT_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/

export interface BanterSettings {
  /** 0–1: the chance for a fully chatty (100) personality to speak at each moment. Unlisted moments: never. The keys
   *  are the game's moments (the Dev Kit and check:framework read them from here). */
  chance: Record<string, number>
  /** Moves (changes at the table) of quiet after it speaks. */
  cooldownTurns: number
  /** Moments that ignore the cooldown (e.g. the end of the game). */
  alwaysAllowed?: string[]
  /** Preset emote ids (content/emotes.json phrases) a bot may press at a moment it has no lines of its own for
   *  ({ "won": ["goodGame"] }). */
  presets?: Record<string, string[]>
  /** Seconds between the moment and the line (picked between min and max, on the rules clock — a pause stops it). */
  delay?: { min: number; max: number }
  /** Seconds after any bot speaks before another may (so two bubbles never talk over each other): a second bot waits
   *  for the gap and answers a beat later — or lets its line go when that would be more than delay.max + tableGap
   *  after its moment. 0 = off. */
  tableGap?: number
  /** The player's "Bot chatter" setting (Settings → Off · Some · Lots): the numbers for Some and Lots. Off = the bots
   *  say nothing at all. chanceTimes multiplies every moment's chance (capped at 1); cooldownTurns, when given,
   *  shortens the file's (never lengthens it). Some = ×1 and no cooldown change = the file's own numbers. */
  levels?: Partial<Record<'some' | 'lots', ChatterNumbers>>
  /** Moments a PERSON's move always gets one bot's answer to (like Sparky in MTG Arena): when the moment's cause is a
   *  person's seat (the moment map says `{ moment, by }`), the chattiest bot with a line answers — no chance roll, no
   *  cooldown; still muted, paused, the table gap and Off. */
  answerPeople?: string[]
}

/** One level's numbers (content/ai/banter.json "levels"). */
export interface ChatterNumbers {
  /** × every moment's chance (capped at 1). */
  chanceTimes: number
  /** cooldownTurns at this level, when shorter than the file's (left out = the file's). */
  cooldownTurns?: number
}

/** The player's "Bot chatter" setting. */
export type ChatterLevel = 'off' | 'some' | 'lots'
export const CHATTER_LEVELS: readonly ChatterLevel[] = ['off', 'some', 'lots']
/** A Settings value ("Off", "Some", "lots"…) → the level, or null for anything else. */
export function chatterLevelOf(value: unknown): ChatterLevel | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (CHATTER_LEVELS as readonly string[]).includes(v) ? (v as ChatterLevel) : null
}

export const DEFAULT_BANTER_SETTINGS: Required<BanterSettings> = {
  chance: { gameStart: 0.3, bigMove: 0.5, rivalBigMove: 0.3, hitRival: 0.6, gotHit: 0.5, closeCall: 0.4, won: 0.9, lost: 0.6 },
  cooldownTurns: 2,
  alwaysAllowed: ['won', 'lost'],
  presets: { won: ['goodGame'], lost: ['wellPlayed'], rivalBigMove: ['wow'] },
  delay: { min: 0.6, max: 1.6 },
  tableGap: 3, // (longer than a bubble shows — emotes' bubble.showMs 2.5 s — so bots never have two bubbles up at once)
  levels: { some: { chanceTimes: 1 }, lots: { chanceTimes: 2, cooldownTurns: 1 } },
  answerPeople: ['rivalBigMove'],
}

/** The settings at a chatter level: null for Off (say nothing); Some / Lots scale each chance (capped at 1) and may
 *  change the cooldown. */
export function settingsAtLevel(settings: BanterSettings, level: ChatterLevel): BanterSettings | null {
  if (level === 'off') return null
  const numbers = settings.levels?.[level] ?? DEFAULT_BANTER_SETTINGS.levels[level] ?? { chanceTimes: 1 }
  const chance: Record<string, number> = {}
  for (const moment of Object.keys(settings.chance)) chance[moment] = Math.min(1, settings.chance[moment] * numbers.chanceTimes)
  // (a level's cooldown only ever shortens it: Lots is never quieter than the file's own numbers)
  const cooldownTurns = numbers.cooldownTurns === undefined ? settings.cooldownTurns : Math.min(numbers.cooldownTurns, settings.cooldownTurns)
  return { ...settings, chance, cooldownTurns }
}

/** content/ai/banter.json → the settings. A bad value → one warning (plain words) + the default for it. Unlisted
 *  keys (_help…) are ignored. */
export function readBanterSettings(json: unknown, warn: (message: string) => void = (m) => console.warn(`[ai banter] ${m}`)): Required<BanterSettings> {
  const d = DEFAULT_BANTER_SETTINGS
  if (json === undefined || json === null) return { ...d }
  if (typeof json !== 'object' || Array.isArray(json)) {
    warn('content/ai/banter.json isn\'t an object — using the defaults.')
    return { ...d }
  }
  const file = json as Record<string, unknown>
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const out: Required<BanterSettings> = { ...d, chance: {}, presets: {} }

  if (file.chance === undefined) out.chance = { ...d.chance }
  else if (!isObject(file.chance)) { warn('"chance" must be { "<moment>": 0–1 } — using the defaults.'); out.chance = { ...d.chance } }
  else {
    for (const [moment, value] of Object.entries(file.chance)) {
      if (moment.startsWith('_')) continue
      if (!MOMENT_NAME.test(moment)) warn(`"chance": "${moment}" isn't a code name (letters, digits, - or _, starting with a letter) — left out.`)
      else if (!isNumber(value) || value < 0 || value > 1) warn(`"chance.${moment}" is ${JSON.stringify(value)} — it must be 0–1; left out.`)
      else out.chance[moment] = value
    }
  }

  if (file.cooldownTurns !== undefined) {
    if (isNumber(file.cooldownTurns) && file.cooldownTurns >= 0) out.cooldownTurns = Math.round(file.cooldownTurns)
    else warn(`"cooldownTurns" is ${JSON.stringify(file.cooldownTurns)} — 0 or more; using ${d.cooldownTurns}.`)
  }
  if (file.alwaysAllowed !== undefined) {
    if (Array.isArray(file.alwaysAllowed) && file.alwaysAllowed.every((m) => typeof m === 'string')) out.alwaysAllowed = [...file.alwaysAllowed]
    else warn('"alwaysAllowed" must be a list of moment names — using the defaults.')
  }

  if (file.presets === undefined) out.presets = { ...d.presets }
  else if (!isObject(file.presets)) { warn('"presets" must be { "<moment>": ["<phrase id>"] } — using the defaults.'); out.presets = { ...d.presets } }
  else {
    for (const [moment, ids] of Object.entries(file.presets)) {
      if (moment.startsWith('_')) continue
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string' && MOMENT_NAME.test(id))) out.presets[moment] = [...ids]
      else warn(`"presets.${moment}" must be a list of phrase ids (content/emotes.json) — left out.`)
    }
  }

  if (file.delay !== undefined) {
    const delay = file.delay as { min?: unknown; max?: unknown }
    if (isObject(delay) && isNumber(delay.min) && isNumber(delay.max) && delay.min >= 0 && delay.max >= delay.min && delay.max <= 30) out.delay = { min: delay.min, max: delay.max }
    else warn(`"delay" must be { "min": seconds, "max": seconds } with 0 ≤ min ≤ max ≤ 30 — using ${d.delay.min}–${d.delay.max} s.`)
  }
  if (file.tableGap !== undefined) {
    if (isNumber(file.tableGap) && file.tableGap >= 0 && file.tableGap <= 60) out.tableGap = file.tableGap
    else warn(`"tableGap" is ${JSON.stringify(file.tableGap)} — seconds, 0–60; using ${d.tableGap}.`)
  }
  if (file.levels !== undefined) {
    if (!isObject(file.levels)) warn('"levels" must be { "some": { "chanceTimes": n }, "lots": { "chanceTimes": n, "cooldownTurns": n } } — using the defaults.')
    else {
      const levels = { ...d.levels }
      for (const level of ['some', 'lots'] as const) {
        const given = file.levels[level]
        if (given === undefined) continue
        const g = (isObject(given) ? given : {}) as { chanceTimes?: unknown; cooldownTurns?: unknown }
        const okTimes = isObject(given) && isNumber(g.chanceTimes) && g.chanceTimes >= 0 && g.chanceTimes <= 10
        const okCool = g.cooldownTurns === undefined || (isNumber(g.cooldownTurns) && g.cooldownTurns >= 0)
        if (okTimes && okCool) levels[level] = { chanceTimes: g.chanceTimes as number, ...(g.cooldownTurns === undefined ? {} : { cooldownTurns: Math.round(g.cooldownTurns as number) }) }
        else warn(`"levels.${level}" must be { "chanceTimes": 0–10, "cooldownTurns": 0 or more (optional) } — using the default.`)
      }
      out.levels = levels
    }
  }
  if (file.answerPeople !== undefined) {
    if (Array.isArray(file.answerPeople) && file.answerPeople.every((m) => typeof m === 'string')) out.answerPeople = file.answerPeople.filter((m) => MOMENT_NAME.test(m))
    else warn('"answerPeople" must be a list of moment names — using the defaults.')
  }
  return out
}

/** May this seat see this event? A Table event says (seen: 'all' | { seats }); anything else counts as seen by all. */
function sees(event: unknown, seat: number): boolean {
  const seen = event && typeof event === 'object' ? (event as { seen?: unknown }).seen : undefined
  if (!seen || typeof seen !== 'object') return true
  const seats = (seen as { seats?: unknown }).seats
  return !Array.isArray(seats) || seats.includes(seat)
}

/** What one change means to one seat: every moment the plug names for its events, in order, no repeats. Events the
 *  seat may not see (a Table event's `seen`) are skipped — a bot never comments on a secret. */
export function momentsFor<Event>(map: MomentMap<Event>, events: readonly Event[], seat: number): Moment[] {
  return [...new Set(momentsWithCause(map, events, seat).map((m) => m.moment))]
}

/** momentsFor, with who caused each (`by`, when the moment map said). A moment caused by two seats in one change is
 *  listed once per cause (so a bot's big move named first never hides a person's in the same change). */
export function momentsWithCause<Event>(map: MomentMap<Event>, events: readonly Event[], seat: number): MomentBy[] {
  const out: MomentBy[] = []
  for (const event of events) {
    if (!sees(event, seat)) continue
    const named = map(event, seat)
    const list: readonly (Moment | MomentBy)[] = named === null || named === undefined ? [] : Array.isArray(named) ? named : [named as Moment | MomentBy]
    for (const item of list) {
      const moment = typeof item === 'string' ? item : item && typeof item === 'object' ? item.moment : undefined
      if (typeof moment !== 'string' || !MOMENT_NAME.test(moment)) continue
      const by = typeof item === 'object' && Number.isInteger(item.by) ? item.by : undefined
      if (out.some((m) => m.moment === moment && m.by === by)) continue
      out.push(by === undefined ? { moment } : { moment, by })
    }
  }
  return out
}

/** The game's banter lines as content/text/en.json holds them: personality → moment (or moment_2, moment_3…) → words. */
export type BanterLines = Record<string, Record<string, string>>

const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key)

/** Is this key a line for this moment: the moment itself, or a numbered extra line (won_2, won_3…)? */
export const isLineFor = (key: string, moment: Moment) => key === moment || (key.startsWith(`${moment}_`) && /^\d+$/.test(key.slice(moment.length + 1)))

/** The emote ids of a personality's lines for a moment — banter.<personality>.<moment>, banter.<personality>.<moment>_2…
 *  (only those with words). Read every time (never copied), so a line edited in the Dev Kit counts at the next moment. */
export function linesFor(lines: BanterLines | undefined, personality: string, moment: Moment): string[] {
  if (!lines || typeof lines !== 'object' || !own(lines, personality)) return []
  const mine = lines[personality]
  if (!mine || typeof mine !== 'object') return []
  return Object.keys(mine)
    .filter((key) => isLineFor(key, moment) && typeof mine[key] === 'string' && mine[key].trim() !== '' && MOMENT_NAME.test(key))
    .map((key) => `banter.${personality}.${key}`)
}

export interface BanterMemory {
  /** The turn it last spoke on (−Infinity is not JSON: use null for never). */
  lastSpokeTurn: number | null
  /** Lines it has said, oldest first (so it doesn't repeat itself). */
  said: string[]
}

export const quietMemory = (): BanterMemory => ({ lastSpokeTurn: null, said: [] })

export function maybeSay(
  moment: string,
  turn: number,
  chattiness: number,
  lines: readonly string[],
  memory: BanterMemory,
  settings: BanterSettings,
  rng: number,
): { line: string | null; memory: BanterMemory; rng: number } {
  const quiet = { line: null, memory, rng }
  if (!lines.length) return quiet
  const cooling = memory.lastSpokeTurn !== null && turn - memory.lastSpokeTurn <= settings.cooldownTurns
  if (cooling && !settings.alwaysAllowed?.includes(moment)) return quiet
  const roll = nextRandom(rng)
  // (own keys only: a moment named "constructor" or "toString" would otherwise read a built-in → NaN → always speak)
  const chance = own(settings.chance, moment) && typeof settings.chance[moment] === 'number' ? settings.chance[moment] : 0
  // (a missing or broken chattiness = 0, silent — as check:framework counts it; NaN would otherwise always speak)
  const talk = Number.isFinite(chattiness) && chattiness > 0 ? chattiness : 0
  if (roll.value >= chance * (talk / 100)) return { ...quiet, rng: roll.rng }
  return freshLine(lines, turn, memory, roll.rng)
}

/** A line it hasn't said lately (the ones never said, else the one said longest ago), remembered as said on this
 *  turn. No chance roll, no cooldown: maybeSay uses it after its roll, and a bot answering a person's good move
 *  (answerPeople) uses it straight. */
export function freshLine(lines: readonly string[], turn: number, memory: BanterMemory, rng: number): { line: string | null; memory: BanterMemory; rng: number } {
  if (!lines.length) return { line: null, memory, rng }
  const fresh = lines.filter((l) => !memory.said.includes(l))
  const pickFrom = fresh.length ? fresh : [memory.said.find((l) => lines.includes(l))!]
  const pick = nextRandom(rng)
  const line = pickFrom[Math.floor(pick.value * pickFrom.length)]
  return { line, memory: { lastSpokeTurn: turn, said: [...memory.said.filter((l) => l !== line), line].slice(-50) }, rng: pick.rng }
}

// THE CHECKED LEADERBOARD'S WEB ADDRESSES (F98) — the game's board worker (board/worker.ts) sends every /board/…
// request here. Plain web Requests in, Responses out; the store AND the game's own rules are passed in: no Cloudflare,
// so the tests call it directly (like cloudRoutes.ts). The worker only keeps the rows (SQLite) and sets the alarm.
//   POST /board/send    { day, name, player, record }  a finished Daily game →
//                         { ok: true, checking: true }                  (it waits; the alarm replays it — checkLater)
//                       | { ok: true, score, best, rank }               (replayed right now)
//   POST /board/day     { day?, player? } → { ok: true, day, top: [{ rank, name, score, you? }], mine, checking, refused, tries }
//   POST /board/remove  { day, player }   → { ok: true }                ("Remove my score")
//   GET  /health                          → { ok: true }
// Refusals: { ok: false, code } — bad-request · too-big · not-a-name · not-a-day · other-version · not-todays-game ·
// no-tries-left · too-many (this address) · server-busy (everyone) · server-full · not-found · and, from a replay,
// move-refused · damaged · different · not-finished.
//
// THE RULE: the score on the board is ONLY what this server's replay of the moves computed. A score sent with the
// record is never read. The record must be today's (or yesterday's) Daily game exactly — the setup the game's own
// dailySetup(day) makes — under the rules version the server runs, every move legal, and the game finished.
//
// Who is "a player" without accounts: a random id the game makes once and keeps on the device (board.ts). It's sent
// only to this server, kept only as a keyed hash, and it's also the proof for "Remove my score" — nobody else has it.
// What a cheater can still do is written down in the design (.planning/design/saves.md → Layer 7).
import type { BoardConfig } from './config'
import { addressKey, MAX_STORED_BYTES, readJson } from './cloudRoutes'
import { replayRun, utcDay, type ReplayRules, type RunRecord } from './replay'

/** What the board needs from the game — the game's board worker fills it in from its own rules (never a copy). */
export interface BoardGame<State, Action, Setup> {
  /** The rules version the server runs (the game's RULES_VERSION). A record from any other version is refused. */
  rulesVersion: number | string
  /** The game's rules for this setup (Glyphtender: glyphtenderRules(the word list with this setup's extra words)). */
  rules(setup: Setup): ReplayRules<State, Action, Setup>
  /** The Daily game's setup on `day` ("2026-10-20") — the very function the game starts its Daily game with. */
  dailySetup(day: string): Setup
  /** The score of a FINISHED game, from the replayed end state — null when the game isn't over. */
  score(state: State): number | null
  /** The most moves one whole game can take: a longer record is refused before a single move is replayed. */
  maxMoves: number
}

/** What one hashed someone did on one day: sent a game (address), used a try (player), a game the replay refused
 *  (player), a wrong "remove" (address). */
export type BoardCount = 'send' | 'try' | 'refused' | 'wrong' | 'work'

/** One player's best score on one day. `player` is the keyed hash of their id, never the id. */
export interface BoardScore {
  day: string
  player: string
  name: string
  score: number
  /** When it was sent (ms) — on a tie, the earlier score is listed first. */
  at: number
}

/** A sent game waiting for the alarm to replay it ("checking…"). `record` = the record as JSON text. A long game is
 *  replayed a few moves per alarm: `progress` = moves replayed so far, `state` = the game after them (JSON), or null. */
export interface WaitingGame {
  id: number
  day: string
  player: string
  name: string
  record: string
  at: number
  progress: number
  state: string | null
  /** How many alarm steps have STARTED on this game (saved before each step, so a step that dies is still counted). */
  attempts: number
}

/** The rows the routes need. The worker keeps them in its SQLite; the tests in memory (memoryBoardRows). */
export interface BoardRows {
  count(who: string, what: BoardCount, day: string): number
  /** +1 (or + `by`) on that count. */
  bump(who: string, what: BoardCount, day: string, by?: number): void
  score(day: string, player: string): BoardScore | null
  /** Add, or replace that player's row for that day. */
  putScore(row: BoardScore): void
  /** The day's best `n`: highest score first, the earlier one first on a tie. */
  top(day: string, n: number): BoardScore[]
  /** How many scores that day are higher than `score` (a rank is this + 1: ties share a place). */
  higher(day: string, score: number): number
  wait(game: Omit<WaitingGame, 'id' | 'progress' | 'state' | 'attempts'>): void
  /** A step is about to start on this waiting game: attempts + 1 (the worker makes sure it's saved before replaying). */
  attemptWaiting(id: number): void
  /** The oldest waiting games, up to `n`. */
  waiting(n: number): WaitingGame[]
  waitingFor(day: string, player: string): number
  /** Where a waiting game's replay got to (moves done, the game after them as JSON) — and attempts back to 0. */
  stepWaiting(id: number, progress: number, state: string): void
  doneWaiting(id: number): void
  /** "Remove my score": that player's score and waiting games for that day. false = there was nothing. */
  remove(day: string, player: string): boolean
  /** Delete scores and waiting games from before `oldestDay`, and counts from before `countsFrom`. */
  tidy(oldestDay: string, countsFrom: string): void
  /** Is anything stored at all (so the alarm knows whether to come back tomorrow)? */
  anything(): boolean
  /** About how much is stored (bytes). */
  storedBytes(): number
}

/** The store in memory — for tests, and to try the routes without Cloudflare. */
export function memoryBoardRows(): BoardRows & { scores: BoardScore[]; queue: WaitingGame[]; counts: Map<string, number> } {
  const scores: BoardScore[] = []
  const queue: WaitingGame[] = []
  const counts = new Map<string, number>() // "who|what|day" → count
  let nextId = 1
  const best = (a: BoardScore, b: BoardScore) => b.score - a.score || a.at - b.at
  return {
    scores,
    queue,
    counts,
    count: (who, what, day) => counts.get(`${who}|${what}|${day}`) ?? 0,
    bump: (who, what, day, by = 1) => { counts.set(`${who}|${what}|${day}`, (counts.get(`${who}|${what}|${day}`) ?? 0) + by) },
    score: (day, player) => scores.find((s) => s.day === day && s.player === player) ?? null,
    putScore: (row) => {
      const at = scores.findIndex((s) => s.day === row.day && s.player === row.player)
      if (at >= 0) scores.splice(at, 1)
      scores.push({ ...row })
    },
    top: (day, n) => scores.filter((s) => s.day === day).sort(best).slice(0, n),
    higher: (day, score) => scores.filter((s) => s.day === day && s.score > score).length,
    wait: (game) => { queue.push({ ...game, id: nextId++, progress: 0, state: null, attempts: 0 }) },
    attemptWaiting: (id) => { const game = queue.find((g) => g.id === id); if (game) game.attempts += 1 },
    waiting: (n) => queue.slice(0, n),
    waitingFor: (day, player) => queue.filter((g) => g.day === day && g.player === player).length,
    stepWaiting: (id, progress, state) => {
      const game = queue.find((g) => g.id === id)
      if (game) Object.assign(game, { progress, state, attempts: 0 }) // (a step that finished: the tries start again)
    },
    doneWaiting: (id) => { const at = queue.findIndex((g) => g.id === id); if (at >= 0) queue.splice(at, 1) },
    remove: (day, player) => {
      const before = scores.length + queue.length
      for (let i = scores.length - 1; i >= 0; i--) if (scores[i].day === day && scores[i].player === player) scores.splice(i, 1)
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].day === day && queue[i].player === player) queue.splice(i, 1)
      return scores.length + queue.length < before
    },
    tidy: (oldestDay, countsFrom) => {
      for (let i = scores.length - 1; i >= 0; i--) if (scores[i].day < oldestDay) scores.splice(i, 1)
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].day < oldestDay) queue.splice(i, 1)
      for (const key of counts.keys()) if (key.split('|')[2] < countsFrom) counts.delete(key)
    },
    anything: () => scores.length > 0 || queue.length > 0 || counts.size > 0,
    storedBytes: () => scores.length * 100 + queue.reduce((total, g) => total + g.record.length + (g.state?.length ?? 0), 0),
  }
}

// --- names, days, players -----------------------------------------------------------------------------------------

/** Arcade names nobody gets to show (the board is public and has no free text — this is the only text there is).
 *  A game may pass its own list (context.blockedNames). */
export const BLOCKED_NAMES = ['ASS', 'CUM', 'DIK', 'FAG', 'FCK', 'FUC', 'FUK', 'FKU', 'KKK', 'NAZ', 'NIG', 'NGR', 'PUS', 'SEX', 'SHT', 'TIT', 'VAG', 'WTF', 'XXX']

/** What the player typed → exactly 3 letters A–Z in capitals ("ada" → "ADA"), or null (not 3 letters, or blocked). */
export function readArcadeName(typed: unknown, blocked: string[] = BLOCKED_NAMES): string | null {
  if (typeof typed !== 'string') return null
  const name = typed.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(name) && !blocked.includes(name) ? name : null
}

/** A player id as the game makes it (board.ts newPlayerId: 22 random letters, digits, - and _). */
export const PLAYER_SHAPE = /^[A-Za-z0-9_-]{16,64}$/

const DAY_MS = 24 * 60 * 60 * 1000
/** "2026-10-20" → that many days earlier ("2026-10-19" for 1). */
export const daysBefore = (day: string, days: number) => utcDay(Date.parse(`${day}T00:00:00Z`) - days * DAY_MS)
/** A real day written as YYYY-MM-DD (not "2026-02-31", not "yesterday"). */
const isDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && utcDay(Date.parse(`${day}T00:00:00Z`)) === day

/** Two setups the same, whatever order their fields were written in (JSON drops undefined fields on both sides). */
export function sameSetup(a: unknown, b: unknown): boolean {
  const sorted = (_key: string, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, (value as Record<string, unknown>)[k]]))
      : value
  return JSON.stringify(a, sorted) === JSON.stringify(b, sorted)
}

/** Text → a keyed hash (HMAC-SHA-256 with the worker's own secret, the first 16 hex digits). Addresses and player ids
 *  are only ever kept like this: enough to count and to find "mine", never the thing itself (review F96). */
export async function keyedHash(what: 'address' | 'player', text: string, secret = ''): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`saves-board:${what}:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

// --- the routes ---------------------------------------------------------------------------------------------------

export interface BoardContext<State, Action, Setup> {
  rows: BoardRows
  game: BoardGame<State, Action, Setup>
  /** content/saves.json → board (readSavesConfig(savesJson).board). */
  settings: BoardConfig
  /** The caller's address (Cloudflare's CF-Connecting-IP header). Only ever kept as a keyed hash, for a day or two. */
  address: string
  /** The worker's own random secret for the keyed hashes (made once, kept in its storage, never sent). */
  secret?: string
  now?: number
  /** true = a sent game waits ("checking…") and the worker's alarm replays it (checkWaiting) — for a game whose replay
   *  takes longer than the plan's CPU time per request (Workers Free: 10 ms). false = replayed inside the request. */
  checkLater?: boolean
  /** A record bigger than this (characters) is refused unread. */
  maxRecordChars?: number
  maxStoredBytes?: number
  /** Games the whole server takes in a day (default SERVER_SENDS_PER_DAY). */
  serverSendsPerDay?: number
  /** Rows of checking work the whole server takes in a day (default SERVER_WORK_PER_DAY). */
  serverWorkPerDay?: number
  /** Replay moves per alarm step (the worker's MOVES_PER_ALARM) — how a game's work is counted. */
  movesPerStep?: number
  blockedNames?: string[]
  /** Hears how long each replay took (ms) and how many moves it had — the worker logs it. */
  timed?: (ms: number, moves: number) => void
}

/** Games the whole server takes in a day, from everyone — a last stop for a flood from many addresses. Each game sent
 *  writes rows (counts, the waiting game, one row per alarm step, the score: ~20 for a 70-move game checked 10 moves
 *  an alarm), and the free plan's SQLite allows 100,000 rows written a day — so 3,000 games, then "busy" until
 *  midnight UTC. A game expecting more players a day moves to the paid plan and raises it. */
export const SERVER_SENDS_PER_DAY = 3_000
/** The real budget: rows the board may write in a day for checking games (one per replay step + a few per game). A
 *  long game costs more than a short one, so 3,000 long games can't spend the free plan's 100,000 rows written a day
 *  on their own (review F98). The rest of the 100,000 is left for counts, scores and the tidy-up. */
export const SERVER_WORK_PER_DAY = 60_000
/** Replay moves per alarm step, unless the worker says otherwise — what a game's work is measured in. */
export const MOVES_PER_STEP = 10
/** A waiting game whose step has started this many times without finishing (it ran out of time, or broke) is
 *  refused and dropped — so one bad game can't hold up every game behind it (review F98). */
export const MAX_STEP_ATTEMPTS = 3
/** Wrong "remove my score" tries one address may make in a day. No server-wide cap: the proof is a 128-bit player
 *  id nobody can guess, so a cap would protect nothing and only let a flood block everyone's removal (v0.11.0 review). */
export const WRONG_REMOVES_PER_DAY = 10
/** A whole game's record is a few KB (Glyphtender: ~8,000 characters); 100,000 is far past any real one. */
export const MAX_RECORD_CHARS = 100_000
const EVERYONE = '*'

const OPEN_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...OPEN_CORS } })
const refuse = (code: string, status: number) => json({ ok: false, code }, status)

/** Shaped like a record (a version, a setup, a list of moves)? The full check is the replay's own. */
const looksLikeRecord = (r: unknown): r is RunRecord<unknown, unknown> =>
  !!r && typeof r === 'object' && 'setup' in r && Array.isArray((r as { moves?: unknown }).moves)
  && ['number', 'string'].includes(typeof (r as { rulesVersion?: unknown }).rulesVersion)

export async function handleBoard<State, Action, Setup>(request: Request, context: BoardContext<State, Action, Setup>): Promise<Response> {
  const { rows, settings, game } = context
  const now = context.now ?? Date.now()
  const today = utcDay(now)
  const path = new URL(request.url).pathname
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: OPEN_CORS })
  if (path === '/health' && request.method === 'GET') return json({ ok: true })
  if (request.method !== 'POST' || !['/board/send', '/board/day', '/board/remove'].includes(path)) return refuse('not-found', 404)
  // Everything that waits (the body, the hashes) happens FIRST. From the limit checks to the counts going up — and the
  // replay itself — there's no waiting at all, so 30 games sent at once can't all pass a check before any is counted.
  const body = await readJson(request, path === '/board/send' ? context.maxRecordChars ?? MAX_RECORD_CHARS : 1_000)
  const who = await keyedHash('address', addressKey(context.address), context.secret)
  const playerId = typeof body?.player === 'string' && PLAYER_SHAPE.test(body.player) ? body.player : null
  const player = playerId ? await keyedHash('player', playerId, context.secret) : null

  if (path === '/board/send') {
    // every game sent counts against the limits — a forged one too, so a flood of them stops at the limit
    if (rows.count(EVERYONE, 'send', today) >= (context.serverSendsPerDay ?? SERVER_SENDS_PER_DAY)) return refuse('server-busy', 429)
    if (rows.count(who, 'send', today) >= settings.sendsPerDay) return refuse('too-many', 429)
    rows.bump(who, 'send', today)
    rows.bump(EVERYONE, 'send', today)
    if (!body) return refuse('too-big', 413) // (or not JSON at all — the game never sends that)
    if (!player) return refuse('bad-request', 400)
    const name = readArcadeName(body.name, context.blockedNames)
    if (!name) return refuse('not-a-name', 400)
    const day = body.day
    // today's game, or yesterday's (a game started just before midnight UTC) — never an old or a future day
    if (!isDay(day) || (day !== today && day !== daysBefore(today, 1))) return refuse('not-a-day', 400)
    const record = body.record
    if (!looksLikeRecord(record)) return refuse('damaged', 400)
    if (record.rulesVersion !== game.rulesVersion) return refuse('other-version', 409)
    if (record.moves.length > game.maxMoves) return refuse('too-big', 413)
    if (!sameSetup(record.setup, game.dailySetup(day))) return refuse('not-todays-game', 422) // a seed of the player's choosing
    // From here the replay starts from the SERVER's own daily setup, never the copy the player sent (JSON-equal isn't
    // always the same value: -0, a float for a whole number…) — review F98
    record.setup = game.dailySetup(day)
    if (settings.dailyTries > 0 && rows.count(player, 'try', day) >= settings.dailyTries) return refuse('no-tries-left', 429)
    if (rows.storedBytes() + JSON.stringify(record).length > (context.maxStoredBytes ?? MAX_STORED_BYTES)) return refuse('server-full', 507)
    // its share of the day's checking work: one row per replay step, plus a few for the game itself
    const work = Math.ceil(record.moves.length / (context.movesPerStep ?? MOVES_PER_STEP)) + 3
    if (rows.count(EVERYONE, 'work', today) + work > (context.serverWorkPerDay ?? SERVER_WORK_PER_DAY)) return refuse('server-busy', 429)
    rows.bump(EVERYONE, 'work', today, work)
    rows.bump(player, 'try', day) // a try is a finished game sent — one the replay refuses used its try too
    if (context.checkLater) {
      rows.wait({ day, player, name, record: JSON.stringify(record), at: now })
      return json({ ok: true, checking: true })
    }
    const checked = checkGame(context, { day, player, name, record, at: now })
    return checked.ok ? json(checked) : refuse(checked.code, 422)
  }

  if (path === '/board/day') {
    const day = body?.day ?? today
    // only days the board still keeps — anything else is "not a day", so a guess learns nothing
    if (!isDay(day) || day > today || day < daysBefore(today, settings.keepDays - 1)) return refuse('not-a-day', 400)
    const top = rows.top(day, settings.show)
    const ranked = top.map((row) => ({ rank: rows.higher(day, row.score) + 1, name: row.name, score: row.score, ...(row.player === player ? { you: true } : {}) }))
    const mine = player ? rows.score(day, player) : null
    return json({
      ok: true,
      day,
      top: ranked,
      mine: mine && { rank: rows.higher(day, mine.score) + 1, name: mine.name, score: mine.score },
      checking: player ? rows.waitingFor(day, player) : 0,
      refused: player ? rows.count(player, 'refused', day) : 0,
      tries: { used: player ? rows.count(player, 'try', day) : 0, allowed: settings.dailyTries }, // allowed 0 = unlimited
    })
  }

  // /board/remove — the player id is the proof it's yours (random, only on the player's device)
  if (rows.count(who, 'wrong', today) >= WRONG_REMOVES_PER_DAY) return refuse('too-many', 429)
  const day = body?.day
  if (!player || !isDay(day)) return refuse('bad-request', 400)
  if (!rows.remove(day, player)) {
    rows.bump(who, 'wrong', today)
    return refuse('not-found', 404)
  }
  return json({ ok: true })
}

type Checked = { ok: true; score: number; best: number; rank: number } | { ok: false; code: string }
type Sent<Setup, Action> = { day: string; player: string; name: string; record: RunRecord<Setup, Action>; at: number }

/**
 * Replays moves `from`…`to` of a record through the game's own rules (replay.ts replayRun — the same check as a
 * Continue): from the setup when `start` is null, else from the game as it was after move `from` (a step-by-step
 * check, below). Never throws.
 */
function replayPart<State, Action, Setup>(game: BoardGame<State, Action, Setup>, record: RunRecord<Setup, Action>, start: State | null, from: number, to: number) {
  try {
    const rules = game.rules(record.setup)
    // after the first step, the game "starts" where the last step left it, and only the next moves are played
    const doors = start === null ? rules : { setup: () => start, check: rules.check.bind(rules), apply: rules.apply.bind(rules) }
    return replayRun(doors, { rulesVersion: record.rulesVersion, setup: record.setup, moves: record.moves.slice(from, to) }, { rulesVersion: game.rulesVersion })
  } catch {
    return { ok: false as const, reason: 'damaged' as const, message: '' } // (the game's own rules() threw)
  }
}

/** The replay is done: the score IT computed goes on the board (the player's best of the day), or the game is refused. */
function keepScore<State, Action, Setup>(context: Pick<BoardContext<State, Action, Setup>, 'rows' | 'game'>, sent: Sent<Setup, Action>, back: ReturnType<typeof replayPart<State, Action, Setup>>): Checked {
  const { rows, game } = context
  let score: number | null = null
  try {
    score = back.ok ? game.score(back.state) : null
  } catch {
    score = null // (the game's score() broke on this state: refused, never a crash — review F98)
  }
  if (!back.ok || score === null || !Number.isFinite(score)) {
    rows.bump(sent.player, 'refused', sent.day)
    return { ok: false, code: back.ok ? 'not-finished' : back.reason }
  }
  const old = rows.score(sent.day, sent.player)
  if (!old || score > old.score) rows.putScore({ day: sent.day, player: sent.player, name: sent.name, score, at: sent.at })
  const best = Math.max(score, old?.score ?? score)
  return { ok: true, score, best, rank: rows.higher(sent.day, best) + 1 }
}

/** Replays one sent game whole, inside the request, and keeps the score IT computed. */
function checkGame<State, Action, Setup>(context: BoardContext<State, Action, Setup>, sent: Sent<Setup, Action>): Checked {
  const started = performance.now()
  const back = replayPart(context.game, sent.record, null, 0, sent.record.moves.length)
  context.timed?.(performance.now() - started, sent.record.moves.length)
  return keepScore(context, sent, back)
}

/**
 * The alarm's job when sent games wait (checkLater): ONE step on the oldest waiting game — at most `movesPerStep` of
 * its moves, so each alarm stays inside the plan's CPU time (an alarm has the same limit as a request: Workers Free,
 * 10 ms). Unfinished, the game as it stands is kept (JSON) and the next alarm goes on from there; finished, the score
 * is kept exactly as a request would. (A move count, not a clock: on Cloudflare the clock doesn't move while code runs.)
 * The game's state must survive JSON — plain data, like a save. → how many games are still waiting after this.
 */
export function checkWaiting<State, Action, Setup>(context: Pick<BoardContext<State, Action, Setup>, 'rows' | 'game' | 'timed'>, movesPerStep = Infinity): number {
  const { rows } = context
  const [waiting] = rows.waiting(1)
  if (!waiting) return 0
  let record: RunRecord<Setup, Action> | null = null
  let start: State | null = null
  try {
    record = JSON.parse(waiting.record)
    start = waiting.state === null ? null : JSON.parse(waiting.state)
  } catch { /* stored by us — can't happen, but an alarm never throws */ }
  if (!record) {
    rows.doneWaiting(waiting.id)
    return rows.waiting(1).length
  }
  // Steps keep dying on this game (out of CPU time, or broken): refuse it and move on — never hold up the queue.
  // (attempts counts steps STARTED: the worker saves the +1 before calling this — see attemptWaiting.)
  if (waiting.attempts > MAX_STEP_ATTEMPTS) {
    rows.doneWaiting(waiting.id)
    rows.bump(waiting.player, 'refused', waiting.day)
    return rows.waiting(1).length
  }
  const to = Math.min(record.moves.length, waiting.progress + Math.max(1, movesPerStep))
  const started = performance.now()
  const back = replayPart(context.game, record, start, waiting.progress, to)
  context.timed?.(performance.now() - started, to - waiting.progress)
  let saved: string | null = null
  if (back.ok && to < record.moves.length) {
    try {
      saved = JSON.stringify(back.state)
    } catch {
      saved = null // (a state JSON can't write: it can't wait for the next step — refused below)
    }
  }
  if (saved !== null) rows.stepWaiting(waiting.id, to, saved) // more next alarm
  else {
    rows.doneWaiting(waiting.id)
    const finished = back.ok && to >= record.moves.length
    keepScore(context, { ...waiting, record }, finished ? back : { ok: false as const, reason: 'damaged' as const, message: '' })
  }
  return rows.waiting(1).length
}

/** The alarm's tidy-up: scores older than settings.keepDays, and counts older than yesterday, deleted. */
export function tidyBoard(rows: BoardRows, settings: BoardConfig, now = Date.now()) {
  const today = utcDay(now)
  rows.tidy(daysBefore(today, settings.keepDays - 1), daysBefore(today, 1))
}

/** The next midnight (UTC) after `now` — when the next tidy-up is due. */
export const nextMidnight = (now = Date.now()) => Date.parse(`${utcDay(now)}T00:00:00Z`) + DAY_MS

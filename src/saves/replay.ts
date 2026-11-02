// SEED + MOVE LOG (layer 3) — a game kept as how it started + every move, and rebuilt by playing them again.
// Tiny (a seed and a list of moves, not the whole board), and the same record gives Continue, replays, a daily game
// everyone shares, and (F98) a leaderboard that checks the score itself.
//
//   const RULES_VERSION = 3                                          // +1 when a rule change would replay old games differently
//   let record = recordRun({ rulesVersion: RULES_VERSION, setup })   // a new game
//   record = addRunMove(record, seat, action, 'bot')                 // every move, people's AND the AI's
//   matchRun.autosave({ record, print: fingerprint(game) })          // the run IS the record (layer 2 keeps it)
//   const back = replayRun(rules, record, { rulesVersion: RULES_VERSION, matches: { live: print, view: fingerprint } })
//                                                                    // { ok, state } | { ok: false, reason, message }
//   sameResult(liveGame, replayed, fingerprint)                      // did a replay land on exactly the live game? (tests)
//   startGame({ seed: dailySeed('glyphtender') })                    // today's game — the same on every device
//
// What the game must keep: randomness lives IN the state (a seeded position, like Glyphtender's mulberry32), so the
// same setup + the same moves = the same game. The AI's own dice don't matter — its moves are logged, not its thinking.
//
// Why it doesn't import the table module: modules are copied into games one by one (src/saves, src/table…), and a
// game may have saves without the table. The rules only need the three doors below — the table module's Rules has
// them, so a game passes its own glyphtenderRules(words) straight in.

/** The three doors of a game's rules a replay walks through (the table module's Rules fits as it is). */
export interface ReplayRules<State, Action, Setup> {
  setup(input: Setup): State
  /** null = allowed; otherwise why not, in plain English. */
  check(state: State, seat: number, action: Action): string | null
  apply(state: State, seat: number, action: Action, options?: { fast?: boolean }): { state: State }
}

/** Who played a move — the table module's PlayedBy, the same three words. */
export type MoveBy = 'seat' | 'bot-for-seat' | 'bot'

/** One move: which seat, what it did, and (optional) who played it. The table module's RecordedMove. */
export interface RunMove<Action> {
  seat: number
  action: Action
  by?: MoveBy
}

/** A whole game as data: the rules it was played under, how it started (the seed is in there), every move in order.
 *  The table module's MoveRecord plus `rulesVersion`. Plain JSON — it goes in a run save, a save code, a leaderboard. */
export interface RunRecord<Setup, Action> {
  rulesVersion: number | string
  setup: Setup
  moves: RunMove<Action>[]
}

export type ReplayResult<State> =
  | { ok: true; state: State }
  | { ok: false; reason: 'other-version' | 'move-refused' | 'damaged' | 'different'; message: string; move?: number }

/** The replay's player-facing words — replace any of them (another language, the game's own voice). */
export const REPLAY_WORDS = {
  otherVersion: 'This game was played under a different version of the rules, so it can\'t be rebuilt. Start a new game.',
  moveRefused: 'This game can\'t be rebuilt — one of its moves isn\'t allowed by today\'s rules. Start a new game.',
  damaged: 'This game\'s record is damaged, so it can\'t be rebuilt. Start a new game.',
  different: 'This game came back different from how it was left, so it can\'t be continued. Start a new game.',
}

/** A new record — or a copy of one with its moves so far. Plain data, nothing shared with what was passed in. */
export function recordRun<Setup, Action>(start: {
  rulesVersion: number | string
  setup: Setup
  moves?: RunMove<Action>[]
}): RunRecord<Setup, Action> {
  return JSON.parse(JSON.stringify({ rulesVersion: start.rulesVersion, setup: start.setup, moves: start.moves ?? [] }))
}

/** The record with one more move on the end (the record itself is never edited, like the table's addMove —
 *  which would drop rulesVersion, so a run uses this one). `by` left out = not said. */
export function addRunMove<Setup, Action>(
  record: RunRecord<Setup, Action>,
  seat: number,
  action: Action,
  by?: MoveBy,
): RunRecord<Setup, Action> {
  const move: RunMove<Action> = by === undefined ? { seat, action } : { seat, action, by }
  return { rulesVersion: record.rulesVersion, setup: record.setup, moves: [...record.moves, move] }
}

/**
 * Plays a record again from its setup, through the game's own rules, move by move. Never throws:
 *  - a record from another rules version → refused (an old record replayed under new rules would quietly give a
 *    DIFFERENT game — a wrong Continue, a wrong score — so it's never tried);
 *  - a move today's rules refuse → refused, naming the move;
 *  - not a record at all (cut off, edited by hand) → damaged.
 *  - `matches` given (the live game, or its fingerprint saved beside the record) and the replay lands somewhere else →
 *    'different' (a rule that read the clock or Math.random): refused, never shown as if it were the player's game.
 * `everyMove(state, i)` sees the game after each move (tests compare it to the live game's fingerprint).
 */
export function replayRun<State, Action, Setup>(
  rules: ReplayRules<State, Action, Setup>,
  record: RunRecord<Setup, Action>,
  options: {
    rulesVersion: number | string
    matches?: { live: State | string; view?: (state: State) => unknown }
    everyMove?: (state: State, move: number) => void
    words?: Partial<typeof REPLAY_WORDS>
    /** The most moves a real game of this kind can have. A record with more is refused before replaying — a server
     *  replaying records strangers send (a leaderboard, F98) can't be kept busy by a million passes (review F94). */
    maxMoves?: number
  },
): ReplayResult<State> {
  const w = { ...REPLAY_WORDS, ...options.words }
  const damaged = { ok: false as const, reason: 'damaged' as const, message: w.damaged }
  const moveCount = (record as { moves?: unknown })?.moves
  if (Array.isArray(moveCount) && options.maxMoves !== undefined && moveCount.length > options.maxMoves) return damaged
  if (!looksLikeRecord(record)) return damaged
  if (record.rulesVersion !== options.rulesVersion) return { ok: false, reason: 'other-version', message: w.otherVersion }
  // A copy: the rules may change the objects they're handed, and the record belongs to the live game (review F94)
  let copy: RunRecord<Setup, Action>
  try {
    copy = JSON.parse(JSON.stringify(record))
  } catch {
    return damaged
  }
  let state: State
  try {
    state = rules.setup(copy.setup)
  } catch {
    return damaged
  }
  for (let i = 0; i < copy.moves.length; i++) {
    try {
      const { seat, action } = copy.moves[i]
      if (rules.check(state, seat, action) !== null) return { ok: false, reason: 'move-refused', message: w.moveRefused, move: i + 1 }
      state = rules.apply(state, seat, action).state // normal mode, not fast: the end screen's bookkeeping comes back too
    } catch {
      return { ok: false, reason: 'move-refused', message: w.moveRefused, move: i + 1 }
    }
    try {
      options.everyMove?.(state, i + 1)
    } catch {
      return { ok: false, reason: 'different', message: w.different } // (a test's fingerprint check broke: not the same game)
    }
  }
  if (options.matches) {
    let same = false
    try {
      same = sameResult(options.matches.live, state, options.matches.view)
    } catch {
      same = false // (a view that throws, or a state JSON can't write: can't prove it's the same game)
    }
    if (!same) return { ok: false, reason: 'different', message: w.different }
  }
  return { ok: true, state }
}

/**
 * Did the replay land on exactly the live game? `view` = what counts (a game's fingerprint, or the state without
 * screen-only fields); left out = the whole state as JSON. Either side may already be a fingerprint (a string saved
 * beside the record), so `sameResult(savedPrint, replayed, fingerprint)` works too.
 */
export function sameResult<State>(live: State | string, replayed: State | string, view: (state: State) => unknown = (s) => s): boolean {
  const asText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)) // a fingerprint is already text
  const seen = (x: State | string) => (typeof x === 'string' ? x : asText(view(x)))
  return seen(live) === seen(replayed)
}

/** "2026-10-20" — the UTC day of a moment. The day changes at midnight UTC for everyone, wherever they are. */
export function utcDay(when: Date | number = Date.now()): string {
  return new Date(when).toISOString().slice(0, 10)
}

/**
 * Today's seed for this game: the same number on every device, all day (UTC), a different one tomorrow.
 * A plain hash of "<gameId>:<day>" (FNV-1a, then mixed so neighbouring days aren't neighbouring numbers) — no server,
 * no clock but the date. A whole number from 0 to 4,294,967,295: fine as a mulberry32 seed.
 * `when` = a moment (Date or ms) or a day already written as "2026-10-20".
 */
export function dailySeed(gameId: string, when: Date | number | string = Date.now()): number {
  const day = typeof when === 'string' ? when : utcDay(when)
  const text = `${gameId}:${day}`
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  // murmur3's last step: every input bit moves every output bit
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return hash >>> 0
}

/** Is this shaped like a record (a version, a setup, a list of seat + action moves)? A save code or a pasted
 *  record can be anything. */
function looksLikeRecord(record: unknown): record is RunRecord<unknown, unknown> {
  if (!record || typeof record !== 'object') return false
  const r = record as Partial<RunRecord<unknown, unknown>>
  if (!((typeof r.rulesVersion === 'number' || typeof r.rulesVersion === 'string') && r.setup !== undefined && Array.isArray(r.moves))) return false
  // a plain loop, not .every(): .every() skips the holes in a sparse array, which would then crash the replay (review F94)
  for (let i = 0; i < r.moves.length; i++) {
    const m = r.moves[i]
    if (!m || typeof m !== 'object' || !Number.isInteger(m.seat) || !('action' in m)) return false
  }
  return true
}

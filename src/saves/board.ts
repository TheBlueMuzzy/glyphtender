// THE CHECKED LEADERBOARD — the game's side (F98). A finished Daily game's RECORD (setup + every move, layer 3) goes to
// the game's OWN board worker (board/worker.ts, on Muzzy's Cloudflare), which replays it with the game's own rules and
// puts the score IT computed on the day's board, under 3 letters (arcade style). No score is ever sent from here.
//
//   const board = { url: boardAddress(import.meta.env.VITE_SAVES_BOARD), game: 'glyphtender' }   // null url = no board
//   keepForBoard(record, day, board)          // a Daily game just finished: kept on the device until it's sent
//   const sent = await sendScore('ADA', board)        // { ok, checking } | { ok, score, best, rank } | { ok: false, message }
//   const today = await loadBoard(board)              // { ok, day, top, mine, checking, refused, tries } | { ok: false, message }
//   await removeMyScore(board, day)                   // "Remove my score"
//
// Who "you" are without an account: a random player id made once and kept on this device (the board's only way to
// know a score is yours — and the proof for "Remove my score"). Clearing the browser = a new player.
import { ask, serverAddress, type CloudOptions } from './cloud'
import { readArcadeName } from './boardRoutes'
import { savesConfig } from './config'
import { utcDay, type RunRecord } from './replay'
import { createSave } from './saves'

/** The board worker's local port (board/wrangler.json "dev"), beside the cloud's 1998 and the rooms server's 1999. */
export const BOARD_PORT = 1996

export const BOARD_WORDS = {
  title: 'Daily board',
  nothingToSend: 'Finish today\'s Daily game to put a score on the board.',
  notAName: 'Your name on the board is 3 letters, A to Z — like an arcade.',
  offline: 'Couldn\'t reach the board — check your connection and try again. Your game is kept, so you can send it later.',
  notTodays: 'That game isn\'t today\'s Daily game, so it can\'t go on today\'s board.',
  oldDay: 'That Daily game was for another day — boards only take today\'s game (or yesterday\'s, just after midnight).',
  otherVersion: 'This game was played under an older version of the rules, so the board can\'t check it. Update the game and play today\'s again.',
  refused: 'The board replayed your game and it didn\'t add up, so it wasn\'t counted.',
  notFinished: 'The board replayed your game and it isn\'t finished yet, so there\'s no score to count.',
  noTriesLeft: (tries: number) => tries === 1
    ? 'Only your first Daily game each day goes on the board — come back tomorrow for a new one.'
    : `Only your first ${tries} Daily games each day go on the board — come back tomorrow.`,
  tooMany: 'That\'s a lot of games from this connection today. Try again tomorrow.',
  serverBusy: 'The board is very busy today — try again later.',
  serverFull: 'The board is full right now — try again later.',
  serverProblem: 'The board had a problem. Try again in a moment.',
  removed: 'Removed: your score and name are gone from today\'s board.',
  nothingToRemove: 'You have no score on that day\'s board.',
  /** What "tries" means for this game, in one line. allowed 0 = unlimited. */
  triesLine: (allowed: number) => allowed === 0
    ? 'Play the Daily game as often as you like — your best score counts.'
    : allowed === 1
      ? 'Your first Daily game each day counts — one shot, like an arcade.'
      : `Your best of your first ${allowed} Daily games each day counts.`,
  /** The privacy line: what's stored, where, how long, how to remove it. */
  privacy: (days: number) => `The board keeps your 3 letters, your score and your game's moves (no account, no other name) on this game's own server (Cloudflare) for ${days} days, then deletes them. "Remove my score" deletes yours now.`,
}

export interface BoardOptions extends CloudOptions {
  /** The game's name ("glyphtender") — where this device keeps its player id and the game waiting to be sent. */
  game: string
}

/** One line on the day's board. `you` = this device's score. */
export interface BoardLine {
  rank: number
  name: string
  score: number
  you?: boolean
}

export interface BoardDay {
  ok: true
  day: string
  top: BoardLine[]
  /** This device's own score that day (even when it isn't in the top), or null. */
  mine: { rank: number; name: string; score: number } | null
  /** Games of this device's still being checked (the server replays them a moment later). */
  checking: number
  /** Games of this device's the replay refused that day. */
  refused: number
  /** Games sent that day, and how many count (0 = unlimited). */
  tries: { used: number; allowed: number }
}

export type SendResult =
  | { ok: true; checking: true }
  | { ok: true; checking?: false; score: number; best: number; rank: number }
  | { ok: false; message: string }

/**
 * Where the game finds its board. The live build sets VITE_SAVES_BOARD (e.g. glyphtender-board.joebrogno.workers.dev);
 * unset on this PC or a phone on the same Wi-Fi = the PC's own board worker (port 1996); unset anywhere else = no
 * board (null) — the game hides its Daily board.
 */
export function boardAddress(envValue?: string | null, page: { protocol: string; hostname: string } | null = typeof location === 'undefined' ? null : location): string | null {
  return serverAddress(envValue, BOARD_PORT, page)
}

// --- what this device remembers -----------------------------------------------------------------------------------

type BoardMemory = { player: string; name: string; waiting: { day: string; record: RunRecord<unknown, unknown> } | null }

function boardMemory(options: BoardOptions) {
  return createSave<BoardMemory>({ key: `${options.game}:board`, kind: 'settings', version: 1, storage: options.storage, fresh: { player: '', name: '', waiting: null } })
}

/** 22 random letters, digits, - and _ (128 bits, from the browser's secure random numbers): nobody can guess it. */
export function newPlayerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** This device's player id — made the first time it's needed, then kept. */
function playerOf(options: BoardOptions): string {
  const memory = boardMemory(options)
  const kept = memory.load()
  if (kept.player) return kept.player
  const player = newPlayerId()
  memory.save({ ...kept, player })
  return player
}

/** The 3 letters this device last put on the board ('' the first time) — the name box starts with them. */
export const lastBoardName = (options: BoardOptions): string => boardMemory(options).load().name

/** A Daily game just finished: keep its record here until it's sent (a reload, no signal — it waits). */
export function keepForBoard(record: RunRecord<unknown, unknown>, day: string, options: BoardOptions) {
  const memory = boardMemory(options)
  memory.save({ ...memory.load(), waiting: { day, record: JSON.parse(JSON.stringify(record)) } })
}

/** The finished game waiting to be sent → its day, or null. A game from before yesterday can't be sent any more. */
export function waitingForBoard(options: BoardOptions): { day: string } | null {
  const { waiting } = boardMemory(options).load()
  const today = utcDay((options.now ?? Date.now)())
  const yesterday = utcDay((options.now ?? Date.now)() - 24 * 60 * 60 * 1000)
  return waiting && (waiting.day === today || waiting.day === yesterday) ? { day: waiting.day } : null
}

// --- talking to the board -----------------------------------------------------------------------------------------

/** A refusal's code → one plain sentence. */
function message(code: string, triesAllowed = savesConfig().board.dailyTries): string {
  switch (code) {
    case 'offline': return BOARD_WORDS.offline
    case 'not-a-name': return BOARD_WORDS.notAName
    case 'not-todays-game': return BOARD_WORDS.notTodays
    case 'not-a-day': return BOARD_WORDS.oldDay
    case 'other-version': return BOARD_WORDS.otherVersion
    case 'move-refused': case 'damaged': case 'different': return BOARD_WORDS.refused
    case 'not-finished': return BOARD_WORDS.notFinished
    case 'no-tries-left': return BOARD_WORDS.noTriesLeft(triesAllowed)
    case 'too-many': return BOARD_WORDS.tooMany
    case 'server-busy': return BOARD_WORDS.serverBusy
    case 'server-full': return BOARD_WORDS.serverFull
    case 'not-found': return BOARD_WORDS.nothingToRemove
    default: return BOARD_WORDS.serverProblem
  }
}

/** Worth trying again later (the game stays waiting on the device); anything else = this game will never count. */
const tryAgainLater = (code: string) => ['offline', 'server', 'server-busy', 'server-full', 'too-many', 'bad-request', 'too-big'].includes(code)

/** Sends the waiting Daily game under `typedName` (3 letters). The server replays it and keeps ITS score. */
export async function sendScore(typedName: string, options: BoardOptions): Promise<SendResult> {
  const name = readArcadeName(typedName)
  if (!name) return { ok: false, message: BOARD_WORDS.notAName }
  const memory = boardMemory(options)
  const waiting = waitingForBoard(options) && memory.load().waiting
  if (!waiting) return { ok: false, message: BOARD_WORDS.nothingToSend }
  const player = playerOf(options)
  const answer = await ask('/board/send', { day: waiting.day, name, player, record: waiting.record }, options)
  if (!answer.ok && tryAgainLater(answer.code)) return { ok: false, message: message(answer.code) }
  memory.save({ ...memory.load(), name, waiting: null }) // sent (or refused for good): it never goes again
  if (!answer.ok) return { ok: false, message: message(answer.code) }
  if (answer.body.checking === true) return { ok: true, checking: true }
  return { ok: true, score: Number(answer.body.score), best: Number(answer.body.best), rank: Number(answer.body.rank) }
}

/** The day's board (today unless `day` is given), with this device's own line. */
export async function loadBoard(options: BoardOptions, day?: string): Promise<BoardDay | { ok: false; message: string }> {
  const answer = await ask('/board/day', { day: day ?? utcDay((options.now ?? Date.now)()), player: playerOf(options) }, options)
  if (!answer.ok) return { ok: false, message: message(answer.code) }
  const b = answer.body as unknown as BoardDay
  return { ok: true, day: b.day, top: b.top, mine: b.mine, checking: b.checking, refused: b.refused, tries: b.tries }
}

/** "Remove my score": this device's score (and any game still being checked) gone from that day's board, now. */
export async function removeMyScore(options: BoardOptions, day?: string): Promise<{ ok: boolean; message: string }> {
  const answer = await ask('/board/remove', { day: day ?? utcDay((options.now ?? Date.now)()), player: playerOf(options) }, options)
  if (answer.ok) return { ok: true, message: BOARD_WORDS.removed }
  return { ok: answer.code === 'not-found', message: message(answer.code) }
}

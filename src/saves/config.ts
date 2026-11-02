// CONTENT/SAVES.JSON — the few knobs a designer tunes: how many backup copies, when to nudge "back up your save",
// how long a link code lasts (the cloud), the checked leaderboard (board), and which lines of game code may still use the browser's storage directly
// (checked by check:framework).
// A bad value never crashes the game: it gives ONE console warning and the default is used instead.

export interface NudgeConfig {
  /** Progress points (the game decides what one is: a finished game, a level, an unlock) since the last save code
   *  before the "back up your save" nudge shows. 0 = never nudge. */
  afterProgress: number
  /** At least this many days between two nudges. */
  minDaysBetween: number
  /** true = only nudge when the browser might wipe saves (Safari, a private window, the itch.io frame…). */
  onlyWhenAtRisk: boolean
}

/** The link-code cloud (F96) — read by the game's cloud worker (cloud/worker.ts) AND by the Save code screen
 *  (its privacy line says how long), so both always agree. */
export interface CloudConfig {
  /** Days a link code (and the copy of the save under it) is kept, then it deletes itself (1–30). */
  keepDays: number
  /** Wrong link codes one address may type in an hour; past that, every try from it is refused until the hour ends. */
  wrongTriesPerHour: number
  /** New link codes one address may make in an hour (so nobody can fill the game's store). */
  uploadsPerHour: number
}

/** The checked leaderboard (F98) — read by the game's board worker (board/worker.ts) AND by the board screen (its
 *  privacy line says how long scores are kept), so both always agree. */
export interface BoardConfig {
  /** Finished Daily games each player may send a day: 1 = only the first game counts (arcade-fair), N = the best of the
   *  first N, 0 = unlimited (the best of all). A game decision — the installer asks the designer (Muzzy 2026-10-20). */
  dailyTries: number
  /** Days a day's board is kept (1–30), then the alarm deletes it. */
  keepDays: number
  /** Games one address may send in a day — good or bad (a home or a school shares one address, so not 1). */
  sendsPerDay: number
  /** How many scores the board shows (3–50). */
  show: number
}

export interface SavesConfig {
  /** Older copies kept beside each save (0–5). A broken save falls back to the newest good one. */
  backups: number
  nudge: NudgeConfig
  cloud: CloudConfig
  board: BoardConfig
}

export const DEFAULT_SAVES_CONFIG: SavesConfig = {
  backups: 2,
  nudge: { afterProgress: 10, minDaysBetween: 7, onlyWhenAtRisk: false },
  cloud: { keepDays: 7, wrongTriesPerHour: 10, uploadsPerHour: 20 }, // 7 days: Muzzy 2026-10-20
  board: { dailyTries: 1, keepDays: 7, sendsPerDay: 30, show: 10 },
}

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** Any JSON (content/saves.json) → a complete config. Odd values → the default, with one warning each. */
export function readSavesConfig(json: unknown, warn: (message: string) => void = console.warn): SavesConfig {
  const file = (json && typeof json === 'object' ? json : {}) as { backups?: unknown; nudge?: Record<string, unknown>; cloud?: Record<string, unknown>; board?: Record<string, unknown> }
  const nudge = file.nudge && typeof file.nudge === 'object' ? file.nudge : {}
  const cloud = file.cloud && typeof file.cloud === 'object' ? file.cloud : {}
  const board = file.board && typeof file.board === 'object' ? file.board : {}
  const pick = <T>(name: string, value: unknown, ok: (v: unknown) => v is T, fallback: T): T => {
    if (value === undefined) return fallback
    if (ok(value)) return value
    warn(`content/saves.json: "${name}" is ${JSON.stringify(value)} — using ${JSON.stringify(fallback)} instead.`)
    return fallback
  }
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
  return {
    backups: Math.round(pick('backups', file.backups, (v): v is number => inRange(v, 0, 5), DEFAULT_SAVES_CONFIG.backups)),
    nudge: {
      afterProgress: pick('nudge.afterProgress', nudge.afterProgress, (v): v is number => inRange(v, 0, 100000), DEFAULT_SAVES_CONFIG.nudge.afterProgress),
      minDaysBetween: pick('nudge.minDaysBetween', nudge.minDaysBetween, (v): v is number => inRange(v, 0, 365), DEFAULT_SAVES_CONFIG.nudge.minDaysBetween),
      onlyWhenAtRisk: pick('nudge.onlyWhenAtRisk', nudge.onlyWhenAtRisk, isBool, DEFAULT_SAVES_CONFIG.nudge.onlyWhenAtRisk),
    },
    cloud: {
      keepDays: Math.round(pick('cloud.keepDays', cloud.keepDays, (v): v is number => inRange(v, 1, 30), DEFAULT_SAVES_CONFIG.cloud.keepDays)),
      wrongTriesPerHour: Math.round(pick('cloud.wrongTriesPerHour', cloud.wrongTriesPerHour, (v): v is number => inRange(v, 1, 100), DEFAULT_SAVES_CONFIG.cloud.wrongTriesPerHour)),
      uploadsPerHour: Math.round(pick('cloud.uploadsPerHour', cloud.uploadsPerHour, (v): v is number => inRange(v, 1, 1000), DEFAULT_SAVES_CONFIG.cloud.uploadsPerHour)),
    },
    board: {
      dailyTries: Math.round(pick('board.dailyTries', board.dailyTries, (v): v is number => inRange(v, 0, 100), DEFAULT_SAVES_CONFIG.board.dailyTries)),
      keepDays: Math.round(pick('board.keepDays', board.keepDays, (v): v is number => inRange(v, 1, 30), DEFAULT_SAVES_CONFIG.board.keepDays)),
      sendsPerDay: Math.round(pick('board.sendsPerDay', board.sendsPerDay, (v): v is number => inRange(v, 1, 1000), DEFAULT_SAVES_CONFIG.board.sendsPerDay)),
      show: Math.round(pick('board.show', board.show, (v): v is number => inRange(v, 3, 50), DEFAULT_SAVES_CONFIG.board.show)),
    },
  }
}

// The game's config, set once at start-up (setSavesConfig(savesJson)). Until then, the defaults.
let current: SavesConfig = DEFAULT_SAVES_CONFIG

/** Once at start-up: `setSavesConfig(savesJson)` (import savesJson from '../content/saves.json'). */
export function setSavesConfig(json: unknown): SavesConfig {
  current = readSavesConfig(json)
  return current
}

export const savesConfig = (): SavesConfig => current

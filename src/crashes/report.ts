// ONE CRASH REPORT — the exact shape the game sends and the server checks (design: framework .planning/design/crashes.md
// "One report"). Shared by the game side (capture.ts) and the server side (crashRoutes.ts), so the two can't disagree.
// Nothing in here can hold a player's name, an address or anything typed: names are code names, the rest numbers or
// short fixed descriptions.

export const REPORT_FORMAT = 1
export const MAX_REPORT_BYTES = 8 * 1024
export const MAX_FRAMES = 10
export const MAX_MOMENTS = 30
export const MAX_TITLE_CHARS = 200

export const REPORT_KINDS = ['error', 'rejection', 'asset', 'react', 'webgl', 'game'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

/** A moment's name must look like a code name — so a player's name or chat can never get in, even by mistake. */
export const MOMENT_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/
/** A fingerprint: 16 lowercase hex characters (the start of a SHA-256). */
export const FINGERPRINT = /^[0-9a-f]{16}$/

/** A moment's numbers stay within ±1e12, and a moment at most a day before the error (the server refuses others). */
export const MAX_MOMENT_NUMBER = 1e12
export const MAX_MOMENT_AGE_S = 86_400

/** Text with its control and invisible format characters taken out (an emoji's joiner, a zero-width space, a
 *  right-to-left mark): the server refuses them, so a title with one would lose the whole report. */
export const withoutHidden = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, '')

export interface Frame {
  /** The path inside the site, e.g. "assets/index-Bx12.js" — never the full URL or its ?query. */
  file: string
  line: number
  col: number
  /** The function's name in the built code, when the browser gives one. */
  fn?: string
}

export interface Moment {
  /** Seconds before the error (negative), e.g. -4.2. */
  at: number
  name: string
  /** Up to 4 numbers. */
  n?: number[]
}

export interface CrashReport {
  v: typeof REPORT_FORMAT
  kind: ReportKind
  fp: string
  title: string
  frames: Frame[]
  /** The game's version, e.g. "0.3.1.12" (version module). */
  version: string
  platform: 'web' | 'itch' | 'app' | 'desktop'
  /** "Chrome 141" — a name + major version only. */
  browser: string
  /** "Android 15" — a name + major version only. */
  os: string
  /** "390x844@3" */
  screen: string
  /** The WebGL renderer's name, "" when the game has no WebGL. */
  gpu: string
  /** "en" — the language only, no region. */
  lang: string
  /** Seconds since the game started. */
  secs: number
  moments: Moment[]
  /** More times this kind happened since it was last sent. */
  repeats: number
}

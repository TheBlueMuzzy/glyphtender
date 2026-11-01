// THE CRASH SERVER'S WEB ADDRESSES (F89) — the game's crashes worker (templates/worker/worker.ts) sends every request
// here. Plain web Requests in, Responses out, the store passed in: no Cloudflare, so the tests call it directly (like
// saves/kit/cloudRoutes.ts). The worker only keeps the rows (SQLite, crashRows.ts) and runs the daily tidy-up alarm.
//   POST /report                  a crash report (report.ts) → 204, ALWAYS when it was a report: stored, only counted
//                                 or dropped — the game never learns which, so there's nothing to probe or retry
//                                 · 413 too big · 400 not a report
//   GET  /summary?since=<ms>      (token) → { now, since, newKinds, cameBack, reports, dropped, kinds: [...] }
//   GET  /kinds/<fp>?samples=<n>  (token) → { kind, samples: [{ at, report }] } newest first
//   POST /kinds/<fp>/fixed        (token) { version } → { ok: true, kind }
//   GET  /health                  → { ok: true }   (live-check: is the server up?)
// The token: the header "Authorization: Bearer <token>" (never in the address — addresses end up in logs). A wrong or
// missing token gets exactly what an unknown address gets (404), and counts toward that address's hourly limit.
//
// Who can do what: anyone can SEND a report (that's the point), nobody without the token can READ or CHANGE anything.
// What's kept is only what report.ts allows, re-built field by field (an extra field is never stored). The caller's
// address is never kept: it's counted in memory under a salted hash for an hour, then forgotten (AddressLimiter).
import type { ServerConfig } from './config'
import { FINGERPRINT, MAX_FRAMES, MAX_MOMENTS, MAX_REPORT_BYTES, MAX_TITLE_CHARS, MOMENT_NAME, REPORT_FORMAT, REPORT_KINDS, type CrashReport, type Frame, type Moment } from './report'
import type { CrashRows, KindRow } from './crashRows'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Kinds the summary lists at most (newest first). */
export const SUMMARY_KINDS = 50
/** Versions a kind remembers (the last 10 seen, each with its count). */
export const MAX_VERSIONS = 10
/** Samples /kinds/<fp> gives back unless ?samples= says otherwise. */
export const DEFAULT_SAMPLES = 20
/** Past this many bytes stored, new samples stop (reports are still counted). The free plan's Durable Object storage
 *  is a few GB for the whole account, shared with the game's other servers — this keeps crashes to a small corner. */
export const MAX_STORED_BYTES = 300_000_000
/** The most one report may add to a kind's count (1 + repeats) — a made-up "repeats: 1e15" can't break the numbers. */
export const MAX_REPEATS = 100_000

/** "2026-10-22" — the UTC day of a time (ms). */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** The start (ms) of the UTC day that `ms` is in. */
export const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY
/** The next midnight (UTC) after `now` — when the next tidy-up is due. */
export const nextMidnight = (now: number) => dayStart(now) + DAY

// --- versions -----------------------------------------------------------------------------------------------------

/** A version as the game writes it: 1 to 4 numbers with dots ("0.3.1.12", "0.10.0"). */
export const VERSION_SHAPE = /^\d{1,6}(\.\d{1,6}){0,3}$/

/** Compares two dotted versions number by number ("0.10.0" is newer than "0.9.0"; a missing part counts as 0, so
 *  "0.3.2" = "0.3.2.0"). → below 0: a is older · 0: the same · above 0: a is newer. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

// --- checking a report --------------------------------------------------------------------------------------------

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const isNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
/** Text of at most `max` characters that matches `shape`. */
const isText = (value: unknown, max: number, shape: RegExp): value is string =>
  typeof value === 'string' && value.length <= max && shape.test(value)

/** Any printable text: no control characters (no new lines, no terminal colour codes when Muzzy prints it) and no
 *  invisible format characters (no right-to-left trick that makes a line print as something else). */
const PRINTABLE = /^[^\p{Cc}\p{Cf}]*$/u
/** A path inside the site: no spaces, no "?query" or "#part", no ":" (so never "https://…"), no ".." step. */
const SITE_PATH = /^(?!.*(^|\/)\.\.(\/|$))[^\s?#:\\]{1,200}$/
/** "Chrome 141", "Android 15", "Safari 18" — a name and a number, nothing more. */
const NAME_AND_VERSION = /^[A-Za-z0-9 ._()-]{0,40}$/
/** "390x844@3", "412x915@2.63" — or "" when unknown. */
const SCREEN = /^(\d{1,5}x\d{1,5}@\d{1,2}(\.\d{1,2})?)?$/
/** "en" — or "" when unknown. */
const LANGUAGE = /^([a-z]{2,3})?$/
const PLATFORMS = ['web', 'itch', 'app', 'desktop'] as const

function readFrame(value: unknown): Frame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const f = value as Record<string, unknown>
  if (!isText(f.file, 200, SITE_PATH) || !isWhole(f.line, 0, 10_000_000) || !isWhole(f.col, 0, 10_000_000)) return null
  if (f.fn !== undefined && !isText(f.fn, 100, PRINTABLE)) return null
  // built field by field: anything else the frame carried is left behind
  return f.fn === undefined ? { file: f.file, line: f.line, col: f.col } : { file: f.file, line: f.line, col: f.col, fn: f.fn }
}

function readMoment(value: unknown): Moment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const m = value as Record<string, unknown>
  if (!isNumber(m.at, -86_400, 0) || typeof m.name !== 'string' || !MOMENT_NAME.test(m.name)) return null
  if (m.n === undefined) return { at: m.at, name: m.name }
  if (!Array.isArray(m.n) || m.n.length > 4 || !m.n.every((n) => isNumber(n, -1e12, 1e12))) return null
  return { at: m.at, name: m.name, n: [...m.n] }
}

/**
 * Any JSON → a crash report exactly in report.ts's shape, or null when it isn't one. EVERY field is checked (type,
 * length, pattern, range) and the report is re-built from the checked fields only — so an extra field, a field inside a
 * frame the shape doesn't have, or a moment named "Bob says hi" can never be stored. The game never sends anything
 * this refuses (its own capture.ts makes reports in this shape), so a refusal means someone else is sending.
 */
export function readReport(value: unknown): CrashReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const r = value as Record<string, unknown>
  if (r.v !== REPORT_FORMAT) return null
  if (typeof r.kind !== 'string' || !(REPORT_KINDS as readonly string[]).includes(r.kind)) return null
  if (typeof r.fp !== 'string' || !FINGERPRINT.test(r.fp)) return null
  if (!isText(r.title, MAX_TITLE_CHARS, PRINTABLE) || r.title.length === 0) return null
  if (!Array.isArray(r.frames) || r.frames.length > MAX_FRAMES) return null
  if (!Array.isArray(r.moments) || r.moments.length > MAX_MOMENTS) return null
  if (typeof r.version !== 'string' || !VERSION_SHAPE.test(r.version)) return null
  if (typeof r.platform !== 'string' || !(PLATFORMS as readonly string[]).includes(r.platform)) return null
  if (!isText(r.browser, 40, NAME_AND_VERSION) || !isText(r.os, 40, NAME_AND_VERSION)) return null
  if (!isText(r.screen, 20, SCREEN) || !isText(r.gpu, 120, PRINTABLE) || !isText(r.lang, 3, LANGUAGE)) return null
  if (!isNumber(r.secs, 0, 1e9) || !isWhole(r.repeats, 0, Number.MAX_SAFE_INTEGER)) return null
  const frames = r.frames.map(readFrame)
  const moments = r.moments.map(readMoment)
  if (frames.includes(null) || moments.includes(null)) return null
  return {
    v: REPORT_FORMAT,
    kind: r.kind as CrashReport['kind'],
    fp: r.fp,
    title: r.title,
    frames: frames as Frame[],
    version: r.version,
    platform: r.platform as CrashReport['platform'],
    browser: r.browser,
    os: r.os,
    screen: r.screen,
    gpu: r.gpu,
    lang: r.lang,
    secs: r.secs,
    moments: moments as Moment[],
    repeats: r.repeats,
  }
}

// --- the per-address limit (memory only) --------------------------------------------------------------------------

/** Who to count: an IPv4 address as it is; an IPv6 address by its first half (/64) — one home gets 2^64 of them, so
 *  counting the full address would let a sender take a fresh one per request. (The same rule as saves/kit/cloudRoutes.ts
 *  addressKey — copied, because a game may have crash reports without the saves module.) */
export function addressKey(address: string): string {
  if (!address.includes(':')) return address
  const [head, tail = ''] = address.toLowerCase().split('::')
  const front = head ? head.split(':') : []
  const back = address.includes('::') ? (tail ? tail.split(':') : []) : []
  const groups = [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back]
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/** Addresses one hour may hold in memory. Past it, a NEW address is treated as over its limit (dropped, nothing
 *  written) — so a flood from millions of IPv6 blocks can't fill the server's memory. The daily cap still holds. */
export const MAX_ADDRESSES = 50_000

/**
 * Counts what each address did this hour, in this server's memory only — never written to storage, and a restart
 * forgets it (that's fine: it's a speed bump, the daily cap is the wall). An address is kept only as a salted hash:
 * SHA-256 of a random salt made when the server starts + the address. The salt is never stored or sent, so even this
 * memory can't be turned back into addresses by trying all 4 billion.
 */
export class AddressLimiter {
  private salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
  private hour = -1
  private counts = new Map<string, { sent: number; wrong: number }>()

  /** An address → its salted hash (what the counts are kept under). */
  async hash(address: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.salt}|${addressKey(address)}`))
    return Array.from(new Uint8Array(bytes).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  }

  /** This hour's counts for a hash — a new hour starts every count again. null = memory is full (treat as limited). */
  private entry(who: string, now: number) {
    const hour = Math.floor(now / HOUR)
    if (hour !== this.hour) {
      this.hour = hour
      this.counts.clear()
    }
    let found = this.counts.get(who)
    if (!found) {
      if (this.counts.size >= MAX_ADDRESSES) return null
      found = { sent: 0, wrong: 0 }
      this.counts.set(who, found)
    }
    return found
  }

  /** A request arrived (a report, or a wrong token): +1. → true when this address is now past `limit` this hour. */
  count(who: string, what: 'sent' | 'wrong', limit: number, now: number): boolean {
    const found = this.entry(who, now)
    if (!found) return true
    found[what] += 1
    return found.sent + found.wrong > limit
  }

  /** Has this address made `limit` wrong-token tries this hour? (Reports from a home don't lock its owner out.) */
  tooManyWrong(who: string, limit: number, now: number): boolean {
    const found = this.entry(who, now)
    return !found || found.wrong >= limit
  }

  /** How many addresses are held right now (tests). */
  get size() { return this.counts.size }
}

// --- reading a body -----------------------------------------------------------------------------------------------

/** The body as text, or null when it's bigger than maxBytes. Read a piece at a time and given up the moment it passes
 *  maxBytes — a body that says it's small but keeps coming is never read whole (as saves/kit/cloudRoutes.ts readJson). */
export async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const pieces: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      reader.cancel().catch(() => {}) // tell the sender to stop; nothing more is read
      return null
    }
    pieces.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const piece of pieces) {
    bytes.set(piece, at)
    at += piece.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/** The worker's front door (before the ONE shared object): a POST must say how big it is (Content-Length) and be no
 *  bigger than maxBytes — else 413 right there, and the object never sees it. sendBeacon and fetch both send a
 *  Content-Length for a text body. null = let it through. */
export function refuseHugeBody(request: Request, maxBytes: number): Response | null {
  if (request.method !== 'POST') return null
  const length = request.headers.get('Content-Length')?.trim() ?? ''
  if (!/^\d+$/.test(length) || Number(length) > maxBytes) return new Response(null, { status: 413, headers: REPORT_CORS })
  return null
}

// --- the token ----------------------------------------------------------------------------------------------------

/** A token shorter than this is treated as not set (the routes stay closed): the token is the only lock on the
 *  reports, and the per-address limit only slows a guesser down — it has to be too long to guess (32 random letters
 *  and digits: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`). */
export const MIN_TOKEN_CHARS = 24

/** What's wrong with the server's token, or null when it's fine (GET /health says it, so a closed server is explained). */
export const tokenProblem = (secret: string | undefined): 'not-set' | 'too-short' | null =>
  !secret ? 'not-set' : secret.length < MIN_TOKEN_CHARS ? 'too-short' : null

/** Is the request's "Authorization: Bearer <token>" the secret? Both are hashed first and the hashes compared byte by
 *  byte without stopping early, so how long the answer takes says nothing about how close a guess was. An empty or
 *  missing secret never matches anything (a server whose token isn't set is closed, not open). */
export async function rightToken(request: Request, secret: string | undefined): Promise<boolean> {
  const sent = /^Bearer (\S{1,200})$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? ''
  if (tokenProblem(secret) || !sent) return false
  const [a, b] = await Promise.all([sent, secret].map((text) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i]
  return difference === 0
}

// --- the routes ---------------------------------------------------------------------------------------------------

export interface CrashContext {
  rows: CrashRows
  /** content/crashes.json → server (readCrashesConfig(crashesJson).server). */
  settings: ServerConfig
  /** The per-address counts, in memory (one per running server). */
  limiter: AddressLimiter
  /** The caller's address (Cloudflare's CF-Connecting-IP header). Only ever hashed and counted in memory. */
  address: string
  /** The secret token (the worker's CRASHES_TOKEN). Missing or "" = every token route is closed. */
  token?: string
  now?: number
  /** New samples stop past this many bytes stored (default MAX_STORED_BYTES). */
  maxStoredBytes?: number
}

/** /report is sent from the game's page on another site (github.io, itch.io): any site may SEND. The game sends its
 *  report as text/plain (sendBeacon / fetch keepalive), a "simple" request with no preflight; the OPTIONS answer is
 *  there for a game that sends application/json anyway. Nothing else on this server gets these headers, so a web page
 *  can never read a summary, even with the token. */
const REPORT_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
const accepted = () => new Response(null, { status: 204, headers: REPORT_CORS })
const notAReport = (status: 400 | 413) => new Response(null, { status, headers: REPORT_CORS })
/** The same answer for an unknown address, a wrong token and a limited address — a guess learns nothing. */
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
/** JSON already made as text (the stored samples are kept as JSON, so they're never parsed again just to be sent). */
const answerText = (text: string) => new Response(text, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** A kind as the summary shows it. */
const showKind = (k: KindRow) => ({
  fp: k.fp, kind: k.kind, title: k.title, firstSeen: k.firstSeen, lastSeen: k.lastSeen, count: k.count,
  versions: k.versions, status: k.status, fixedIn: k.fixedIn, cameBackAt: k.cameBackAt, samples: k.kept,
})

export async function handleCrashes(request: Request, context: CrashContext): Promise<Response> {
  const { rows, settings, limiter } = context
  const now = context.now ?? Date.now()
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/report') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: REPORT_CORS })
    if (request.method !== 'POST') return notFound()
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_REPORT_BYTES) return notAReport(413) // before reading
    // The address is counted the moment it arrives (a bad report too), in the same step as the check — so 1,000
    // reports sent at once can't all pass the check before any is counted (the saves cloud's lesson, review F96).
    // Past the limit the body isn't even read: no work, nothing written.
    const who = await limiter.hash(context.address)
    if (limiter.count(who, 'sent', settings.perAddressPerHour, now)) return accepted() // dropped: nothing written at all
    const text = await readBody(request, MAX_REPORT_BYTES)
    if (text === null) return notAReport(413) // (it lied about its size, or sent none and kept coming)
    // From here to the last row written nothing waits: the daily cap's check and its count are one step too.
    let parsed: unknown = null
    try { parsed = JSON.parse(text) } catch { /* not JSON: refused below */ }
    const report = readReport(parsed)
    if (!report) return notAReport(400)
    storeReport(context, report, now)
    return accepted()
  }

  // token: 'ok' · 'not-set' · 'too-short' — says only whether the summary can open at all, never anything about the token
  if (path === '/health' && request.method === 'GET') return answer({ ok: true, token: tokenProblem(context.token) ?? 'ok' })

  // Everything else needs the token. Unknown address, wrong token, too many wrong tries: all the same 404.
  const tokenRoute = /^\/(summary|kinds\/[0-9a-f]{16}(\/fixed)?)$/.exec(path)
  if (!tokenRoute) return notFound()
  const who = await limiter.hash(context.address)
  const right = await rightToken(request, context.token)
  if (limiter.tooManyWrong(who, settings.perAddressPerHour, now)) return notFound() // (checked before it's counted)
  if (!right) {
    limiter.count(who, 'wrong', settings.perAddressPerHour, now)
    return notFound()
  }

  if (path === '/summary' && request.method === 'GET') return summary(context, url, now)
  const fp = path.split('/')[2]
  if (path.endsWith('/fixed')) {
    if (request.method !== 'POST') return notFound()
    const text = await readBody(request, 1_000)
    let body: { version?: unknown } | null = null
    try { body = text === null ? null : JSON.parse(text) } catch { body = null }
    const version = body?.version
    if (typeof version !== 'string' || !VERSION_SHAPE.test(version)) return answer({ ok: false, code: 'not-a-version' }, 400)
    const kind = rows.kind(fp)
    if (!kind) return answer({ ok: false, code: 'no-such-kind' }, 404)
    rows.putKind({ ...kind, status: 'fixed', fixedIn: version })
    return answer({ ok: true, kind: showKind({ ...kind, status: 'fixed', fixedIn: version }) })
  }
  if (request.method !== 'GET') return notFound()
  const kind = rows.kind(fp)
  if (!kind) return answer({ ok: false, code: 'no-such-kind' }, 404)
  const asked = Number(url.searchParams.get('samples') ?? DEFAULT_SAMPLES)
  const n = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), settings.samplesPerKind) : DEFAULT_SAMPLES
  // the samples were stored as JSON made by readReport + JSON.stringify — glued in as they are, never parsed again
  const samples = rows.samples(fp, n).map((s) => `{"at":${s.at},"report":${s.report}}`).join(',')
  return answerText(`{"kind":${JSON.stringify(showKind(kind))},"samples":[${samples}]}`)
}

/** GET /summary?since=<ms>: what happened since then. No since (or one older than what's kept) = everything kept; a
 *  since in the future = nothing yet. Not a number → 400 (a typo shouldn't quietly look like "no errors"). */
function summary(context: CrashContext, url: URL, now: number): Response {
  const { rows, settings } = context
  const given = url.searchParams.get('since') ?? ''
  if (given !== '' && !/^\d{1,15}$/.test(given)) return answer({ ok: false, code: 'not-a-time' }, 400)
  const oldest = now - settings.keepDays * DAY
  const since = given === '' ? oldest : Math.max(Number(given), oldest)
  const totals = rows.totalsSince(since, utcDay(since))
  return answer({
    now,
    since,
    newKinds: totals.newKinds,
    cameBack: totals.cameBack,
    // reports + dropped are kept per UTC day, so these two count from the start of since's day
    reports: totals.reports,
    dropped: totals.dropped,
    kinds: rows.kindsSince(since, SUMMARY_KINDS).map(showKind),
  })
}

/**
 * One checked report → the store. No waiting in here (all of it runs as one piece in the Durable Object).
 * Rows written: the day's count (1) + the kind (1) + a sample while there's room today (1, +1 when the oldest goes).
 * Past the daily cap or the new-kinds cap: only the day's `dropped` (1 row).
 */
function storeReport(context: CrashContext, report: CrashReport, now: number) {
  const { rows, settings } = context
  const today = utcDay(now)
  const day = rows.day(today)
  if (day.reports >= settings.perDay) {
    rows.bumpDay(today, { dropped: 1 })
    return
  }
  const old = rows.kind(report.fp)
  if (!old && day.newKinds >= settings.newKindsPerDay) {
    rows.bumpDay(today, { dropped: 1 })
    return
  }
  const happened = 1 + Math.min(report.repeats, MAX_REPEATS)
  const kind: KindRow = old ?? {
    fp: report.fp, kind: report.kind, title: report.title, firstSeen: now, lastSeen: now, count: 0, versions: [],
    status: 'open', fixedIn: null, cameBackAt: null, kept: 0, sampleDay: today, samplesToday: 0,
  }
  kind.lastSeen = now
  kind.count += happened
  // the versions it was seen in: the last MAX_VERSIONS, each with its count (the newest at the end)
  const seen = kind.versions.find((v) => v.v === report.version)
  kind.versions = [...kind.versions.filter((v) => v.v !== report.version), { v: report.version, n: (seen?.n ?? 0) + happened }].slice(-MAX_VERSIONS)
  // fixed, but here it is again from a version that has the fix → it came back. From an older version (a player who
  // hasn't updated) it's only counted.
  if (kind.status === 'fixed' && kind.fixedIn && compareVersions(report.version, kind.fixedIn) >= 0) {
    kind.status = 'open'
    kind.cameBackAt = now
  }
  // a sample (the whole report) while the kind has room today and the server has room at all
  if (kind.sampleDay !== today) {
    kind.sampleDay = today
    kind.samplesToday = 0
  }
  const room = kind.samplesToday < settings.samplesPerKindPerDay && rows.storedBytes() < (context.maxStoredBytes ?? MAX_STORED_BYTES)
  if (room) {
    rows.addSample(report.fp, now, JSON.stringify(report))
    kind.samplesToday += 1
    kind.kept += 1
    if (kind.kept > settings.samplesPerKind) { // the newest replace the oldest
      rows.dropOldestSample(report.fp)
      kind.kept -= 1
    }
  }
  rows.putKind(kind)
  rows.bumpDay(today, { reports: 1, newKinds: old ? 0 : 1 })
}

/** Rows one alarm deletes at most per table — a big clean-up is done over a few alarms, so no single one runs long. */
export const TIDY_BATCH = 2_000

/** The alarm's tidy-up: samples older than keepDays, kinds not seen for keepDays (and their samples), and old days.
 *  → true when there's more to delete (the worker comes back in a minute instead of tomorrow). */
export function tidyCrashes(rows: CrashRows, settings: ServerConfig, now: number, batch = TIDY_BATCH): boolean {
  const before = now - settings.keepDays * DAY
  return rows.tidy(before, utcDay(before), batch)
}

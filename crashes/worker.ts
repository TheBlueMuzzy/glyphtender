// THE GAME'S CRASH SERVER (crashes module, F89) — Cloudflare runs this file (crashes/wrangler.json "main") on Muzzy's
// own account. The game sends a report when it breaks; this keeps them grouped by kind; `npm run crashes` on the PC
// reads them with the token. Everything it answers is decided in src/crashes/crashRoutes.ts (no Cloudflare there, so
// it's tested on its own) and every SQL statement is in src/crashes/crashRows.ts (tested on a real SQLite); this file
// only plugs them into Cloudflare: one Durable Object, its SQLite, the daily tidy-up alarm, the token.
//   Local:  npm run crashes:dev   (port 1995)   ·   Live: npm run crashes:deploy (Muzzy's call — it's public)
//   Token:  npx wrangler secret put CRASHES_TOKEN -c crashes/wrangler.json   (the same text as ~/.config/bmuz/crashes/<this server's host>.token)
// Template version: 1 (keep this line: the installer compares it with the kit's to say what changed since your copy)
//
// ONE copy of the CrashStore class (named "crashes") holds everything in its own SQLite: a SQLite Durable Object, the
// free plan's kind. No packages: a plain class with fetch() and alarm() is a Durable Object to Cloudflare.
// Nothing here logs a request: no address, no token, no report ever goes to console.log.
import crashesJson from '../content/crashes.json'
import { readCrashesConfig } from '../src/crashes/config'
import { AddressLimiter, handleCrashes, nextMidnight, refuseHugeBody, tidyCrashes } from '../src/crashes/crashRoutes'
import { sqlCrashRows, type CrashRows } from '../src/crashes/crashRows'
import { MAX_REPORT_BYTES } from '../src/crashes/report'

// The few Cloudflare shapes used here (written out, so the game needs no Cloudflare type package)
type SqlValue = string | number | null
type SqlStorage = { exec(sql: string, ...values: SqlValue[]): { toArray(): Record<string, unknown>[] }; readonly databaseSize: number }
interface ObjectState { storage: { sql: SqlStorage; getAlarm(): Promise<number | null>; setAlarm(time: number): Promise<void> } }
interface ObjectStub { fetch(request: Request): Promise<Response> }
interface Env {
  CrashStore: { idFromName(name: string): unknown; get(id: unknown): ObjectStub }
  /** The secret that opens /summary and /kinds (a Wrangler secret, never in a file). Not set = they stay closed. */
  CRASHES_TOKEN?: string
}

const settings = readCrashesConfig(crashesJson).server

export class CrashStore {
  private state: ObjectState
  private rows: CrashRows
  private token: string
  /** The per-address counts: in this object's memory only, never written (a restart forgets them — that's fine). */
  private limiter = new AddressLimiter()
  /** true once this object knows the tidy-up alarm is set (so it's asked once, not on every report). */
  private alarmSet = false

  constructor(state: ObjectState, env: Env) {
    this.state = state
    this.token = env.CRASHES_TOKEN ?? ''
    const sql = state.storage.sql
    this.rows = sqlCrashRows((statement, ...values) => sql.exec(statement, ...values).toArray(), () => sql.databaseSize)
  }

  async fetch(request: Request): Promise<Response> {
    const response = await handleCrashes(request, {
      rows: this.rows, settings, limiter: this.limiter, token: this.token,
      address: request.headers.get('CF-Connecting-IP') ?? 'unknown', // Cloudflare always sets it on the live server
    })
    if (!this.alarmSet && response.status === 204 && request.method === 'POST') {
      // the first report since this object started: make sure the daily tidy-up is coming
      if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(nextMidnight(Date.now()))
      this.alarmSet = true
    }
    return response
  }

  /** Cloudflare calls this at midnight (UTC): reports past keepDays (content/crashes.json) are deleted, and kinds not
   *  seen for that long — a few thousand per alarm; a bigger clean-up comes back a minute later for the rest. Then it
   *  comes back tomorrow while anything is stored. */
  async alarm(): Promise<void> {
    const more = tidyCrashes(this.rows, settings, Date.now())
    if (more) await this.state.storage.setAlarm(Date.now() + 60_000)
    else if (this.rows.anything()) await this.state.storage.setAlarm(nextMidnight(Date.now()))
    else this.alarmSet = false
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/report' && request.method === 'OPTIONS') {
      // a browser's preflight (only when a game sends application/json — the kit sends text/plain, which needs none):
      // answered here, so it never costs the shared object anything
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } })
    }
    if (path === '/report' || path === '/health' || path === '/summary' || path.startsWith('/kinds/')) {
      // a POST with no size, or bigger than a report may be, stops HERE — never read inside the one shared object
      const tooBig = refuseHugeBody(request, MAX_REPORT_BYTES)
      if (tooBig) return tooBig
      return env.CrashStore.get(env.CrashStore.idFromName('crashes')).fetch(request)
    }
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  },
}

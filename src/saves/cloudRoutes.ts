// THE LINK-CODE CLOUD'S WEB ADDRESSES (F96) — the game's cloud worker (cloud/worker.ts) sends every /saves/… request
// here. Plain web Requests in, Responses out, the store passed in: no Cloudflare, so the tests call it directly
// (Glyphtender's wordsRoutes.ts pattern). The worker only keeps the rows (SQLite) and sets the tidy-up alarm.
//   POST /saves/link    { code }   a save code → { ok: true, link: 'K7QM2XRP', expiresAt }   (a new link code)
//   POST /saves/get     { link }   → { ok: true, code, expiresAt }   (the save code under it — NOT deleted: see below)
//   POST /saves/delete  { link }   → { ok: true }                    ("Delete my data")
//   GET  /health                   → { ok: true }                    (live-check: is the server up?)
// Refusals: { ok: false, code } — not-a-link · not-a-save · too-big · not-found (wrong, expired or deleted: the
// same answer, so a guess learns nothing) · too-many-tries · too-many-codes · server-full · bad-request.
// Called from the game's page on any site (github.io, itch.io) → CORS open; nothing here needs a login.
//
// Why a fetch doesn't delete the code: the player may bring it to a third device, or try again when the other
// device's storage was full. It lasts until it expires (content/saves.json cloud.keepDays) or "Delete my data".
import type { CloudConfig } from './config'
import { MAX_CODE_CHARS } from './saveCode'

/** 32 characters that can't be mistaken for each other: no O / 0, no I / 1. 32^8 ≈ 1.1 trillion link codes. */
export const LINK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const LINK_LENGTH = 8
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** The free plan's Durable Object holds 1 GB; new codes stop a little before that, so old ones can still be fetched. */
export const MAX_STORED_BYTES = 900_000_000

/** A new random link code ("K7QM2XRP"), from the browser's / Cloudflare's secure random numbers. */
export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LINK_LENGTH))
  return Array.from(bytes, (b) => LINK_ALPHABET[b % LINK_ALPHABET.length]).join('') // 256 / 32 = 8: every letter equally likely
}

/** What the player typed → the 8 characters ("k7qm-2xrp " → "K7QM2XRP"), or null when it can't be a link code. */
export function readLinkCode(typed: string): string | null {
  const link = (typed ?? '').toUpperCase().replace(/[\s-]+/g, '')
  if (link.length !== LINK_LENGTH) return null
  return [...link].every((c) => LINK_ALPHABET.includes(c)) ? link : null
}

/** "K7QM2XRP" → "K7QM-2XRP" (how it's shown: two halves are easier to read out and type). */
export function showLinkCode(link: string): string {
  return `${link.slice(0, LINK_LENGTH / 2)}-${link.slice(LINK_LENGTH / 2)}`
}

// --- the store ----------------------------------------------------------------------------------------------------

/** What one address did in one hour: typed a wrong link code, or made a new one. */
export type TryKind = 'wrong' | 'upload'

/** The rows the routes need. The worker keeps them in its SQLite; the tests in memory (memoryCloudRows). */
export interface CloudRows {
  /** Keep a save code under a link code. false = that link code is already taken (pick another). */
  add(link: string, code: string, expiresAt: number): boolean
  get(link: string): { code: string; expiresAt: number } | null
  /** false = there was nothing under it. */
  remove(link: string): boolean
  /** How many times `who` (a scrambled address) did `what` in `hour` (hours since 1970). */
  count(who: string, what: TryKind, hour: number): number
  bump(who: string, what: TryKind, hour: number): void
  /** Delete expired saves and tries from past hours. → when the next one is due (ms), or null when nothing's left. */
  tidy(now: number): number | null
  /** About how much is stored (bytes). */
  storedBytes(): number
}

/** The store in memory — for tests, and to try the routes without Cloudflare. */
export function memoryCloudRows(): CloudRows & { saves: Map<string, { code: string; expiresAt: number }>; tries: Map<string, number> } {
  const saves = new Map<string, { code: string; expiresAt: number }>()
  const tries = new Map<string, number>() // "who|what|hour" → count
  const nextDue = (): number | null => {
    const times = [...saves.values()].map((s) => s.expiresAt)
    for (const key of tries.keys()) times.push((Number(key.split('|')[2]) + 1) * HOUR)
    return times.length ? Math.min(...times) : null
  }
  return {
    saves,
    tries,
    add: (link, code, expiresAt) => (saves.has(link) ? false : (saves.set(link, { code, expiresAt }), true)),
    get: (link) => saves.get(link) ?? null,
    remove: (link) => saves.delete(link),
    count: (who, what, hour) => tries.get(`${who}|${what}|${hour}`) ?? 0,
    bump: (who, what, hour) => { tries.set(`${who}|${what}|${hour}`, (tries.get(`${who}|${what}|${hour}`) ?? 0) + 1) },
    tidy: (now) => {
      for (const [link, save] of saves) if (save.expiresAt <= now) saves.delete(link)
      for (const key of tries.keys()) if ((Number(key.split('|')[2]) + 1) * HOUR <= now) tries.delete(key)
      return nextDue()
    },
    storedBytes: () => [...saves.values()].reduce((total, s) => total + s.code.length, 0),
  }
}

// --- the routes ---------------------------------------------------------------------------------------------------

export interface CloudContext {
  rows: CloudRows
  /** content/saves.json → cloud (readSavesConfig(savesJson).cloud). */
  settings: CloudConfig
  /** The caller's address (Cloudflare's CF-Connecting-IP header). Only ever kept scrambled, for an hour. */
  address: string
  /** The worker's own random secret for scrambling addresses (made once, kept in its storage, never sent). */
  secret?: string
  now?: number
  /** How long a new link code lasts, in ms — normally settings.keepDays. (A test server sets seconds.) */
  keepMs?: number
  /** Stop making new codes past this many bytes stored. */
  maxStoredBytes?: number
  /** Where new link codes come from (tests pass their own). */
  newLink?: () => string
}

const OPEN_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...OPEN_CORS } })
const refuse = (code: string, status: number) => json({ ok: false, code }, status)

/** The body as JSON, or null when it's too big or not JSON. Read a piece at a time and given up the moment it passes
 *  maxBytes — a body sent without a size (chunked) is never read whole first, so tens of MB can't fill the one shared
 *  object's memory (security review, v0.11.0). The game only sends plain ASCII, so bytes = characters. */
export async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) return null
  if (!request.body) return null
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
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes))
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

/** The worker's front door (its fetch, before the ONE shared object): a POST must say how big it is (Content-Length)
 *  and be no bigger than maxBytes — else 413 right there, and the object never sees it (security review, v0.11.0).
 *  The game's fetch() always sends a Content-Length for its JSON body. null = let it through. */
export function refuseHugeBody(request: Request, maxBytes: number): Response | null {
  if (request.method !== 'POST') return null
  const length = request.headers.get('Content-Length')?.trim() ?? ''
  if (!/^\d+$/.test(length) || Number(length) > maxBytes) return refuse('too-big', 413)
  return null
}

/** An address → a scrambled number (HMAC-SHA-256 with the worker's own secret, the first 16 hex digits): enough to
 *  count tries, never the address. With a secret nobody else has, the 4 billion IPv4 addresses can't simply be tried
 *  one by one to undo it (review F96). */
export async function scramble(address: string, secret = '', prefix: 64 | 48 = 64): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`saves-cloud:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(addressKey(address, prefix)))
  return Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Who to count: an IPv4 address as it is; an IPv6 address by its first half (/64) — one home gets 2^64 of them, so
 *  counting the full address would let a guesser take a fresh one per guess (review F96). prefix 48 = the wider block
 *  one customer is often given (65,536 /64s), for the wrong-try limit per block (security review, v0.11.0). */
export function addressKey(address: string, prefix: 64 | 48 = 64): string {
  if (!address.includes(':')) return address
  const [head, tail = ''] = address.toLowerCase().split('::')
  const front = head ? head.split(':') : []
  const back = address.includes('::') ? (tail ? tail.split(':') : []) : []
  const groups = [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back]
  return `${groups.slice(0, prefix / 16).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/${prefix}`
}

/** Wrong link codes one IPv6 /48 may make in an hour (its /64s together) — so a guesser with a block of /64s can't
 *  spend the whole server's wrong tries alone (security review, v0.11.0). An IPv4 address is only counted on its own. */
export const WRONG_PER_48_PER_HOUR = 30
/** Wrong link codes the whole server takes in an hour, from everyone — a last stop for a guesser with many addresses.
 *  It only stops /saves/get: "Delete my data" needs the exact code, so it rests on the per-address and per-/48 limits
 *  and a flood from many addresses can't stop a player deleting their data (security review, v0.11.0). */
export const SERVER_WRONG_PER_HOUR = 2_000
const EVERYONE = '*'

/** The same shape as a save code (saveCode.ts) — the cloud only carries save codes, nothing else. */
const SAVE_CODE_SHAPE = /^[A-Za-z0-9]+-\d+[zj]-[A-Za-z0-9_-]+$/
/** A body is a save code + a little JSON around it — the biggest the cloud takes (the worker's front door uses it too). */
export const MAX_BODY_CHARS = MAX_CODE_CHARS + 1_000

export async function handleCloud(request: Request, context: CloudContext): Promise<Response> {
  const { rows, settings, address } = context
  const now = context.now ?? Date.now()
  const hour = Math.floor(now / HOUR)
  const path = new URL(request.url).pathname
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: OPEN_CORS })
  if (path === '/health' && request.method === 'GET') return json({ ok: true })
  if (request.method !== 'POST' || !['/saves/link', '/saves/get', '/saves/delete'].includes(path)) return refuse('not-found', 404)
  // Everything that waits (the body, the scramble) happens FIRST. From the limit check to the count going up there's no
  // waiting at all, so a Durable Object can't let 500 requests sent at once all pass the check before any is counted
  // (review F96).
  const body = await readJson(request, path === '/saves/link' ? MAX_BODY_CHARS : 1_000)
  const who = await scramble(address, context.secret)
  const block = address.includes(':') ? await scramble(address, context.secret, 48) : null // IPv6 only

  if (path === '/saves/link') {
    if (rows.count(who, 'upload', hour) >= settings.uploadsPerHour) return refuse('too-many-codes', 429)
    if (!body) return refuse('too-big', 413) // (or not JSON at all — the game never sends that)
    const code = body.code
    if (typeof code !== 'string' || !SAVE_CODE_SHAPE.test(code)) return refuse('not-a-save', 400)
    if (code.length > MAX_CODE_CHARS) return refuse('too-big', 413)
    if (rows.storedBytes() + code.length > (context.maxStoredBytes ?? MAX_STORED_BYTES)) return refuse('server-full', 507)
    const expiresAt = now + (context.keepMs ?? settings.keepDays * DAY)
    for (let attempt = 0; attempt < 5; attempt++) { // a taken code is one in a trillion; five tries is plenty
      const link = (context.newLink ?? newLinkCode)()
      if (rows.add(link, code, expiresAt)) {
        rows.bump(who, 'upload', hour)
        return json({ ok: true, link, expiresAt })
      }
    }
    return refuse('server-full', 507)
  }

  // /saves/get and /saves/delete: both need the right link code, so both count wrong tries (per address, per IPv6 /48,
  // and server-wide — that last one only stops a fetch, so a flood can't stop anyone deleting their data)
  if (rows.count(who, 'wrong', hour) >= settings.wrongTriesPerHour) return refuse('too-many-tries', 429)
  if (block && rows.count(block, 'wrong', hour) >= WRONG_PER_48_PER_HOUR) return refuse('too-many-tries', 429)
  if (path === '/saves/get' && rows.count(EVERYONE, 'wrong', hour) >= SERVER_WRONG_PER_HOUR) return refuse('too-many-tries', 429)
  const link = typeof body?.link === 'string' ? readLinkCode(body.link) : null
  if (!link) return refuse('not-a-link', 400) // can't match anything, so it isn't counted as a guess
  const saved = rows.get(link)
  if (!saved || saved.expiresAt <= now) {
    rows.bump(who, 'wrong', hour)
    if (block) rows.bump(block, 'wrong', hour)
    rows.bump(EVERYONE, 'wrong', hour)
    return refuse('not-found', 404)
  }
  if (path === '/saves/delete') {
    rows.remove(link)
    return json({ ok: true })
  }
  return json({ ok: true, code: saved.code, expiresAt: saved.expiresAt })
}

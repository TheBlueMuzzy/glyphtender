// THE SUBMITTED WORDS' WEB ADDRESSES (F69) — worker.ts sends every /words/… request here (through the Words
// Durable Object, so there's one list). Plain web Requests and Responses: no Cloudflare, so the tests call it directly.
//   POST /words/submit  { word }        anyone (the game, from github.io → CORS open) → { ok: true } (new or not —
//                                        the same answer), or 400 { ok: false, code: 'too-short' | 'bad-word' }
//   GET  /words/list                    Muzzy only → { words: SubmittedWord[] }
//   POST /words/review  { changes: [{ word, status }] }   Muzzy only → { ok: true, changed }
// "Muzzy only" = the header Authorization: Bearer <WORDS_ADMIN_KEY> (a Worker secret: npx wrangler secret put
// WORDS_ADMIN_KEY · locally .dev.vars). No key on the server = no admin at all (403). No CORS on these: only the
// Dev Kit's own server (Node) calls them, never a web page.
import type { WordList } from '../src/engine/types'
import { reviewWords, submitWord, type WordRows } from './submittedWords'

/** Biggest body each address reads (bytes): a word is tiny; a review can change the whole list at once. */
const MAX_SUBMIT_BODY = 1024
const MAX_REVIEW_BODY = 512 * 1024

export interface WordsContext {
  rows: WordRows
  official: WordList
  /** The server's WORDS_ADMIN_KEY ('' or missing = admin turned off). */
  adminKey: string | undefined
  /** Today, YYYY-MM-DD (the "added" day of a new word). */
  today: string
}

const OPEN_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

/** The body as JSON, or null when it's too big or not JSON. */
async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) return null
  const text = await request.text()
  if (text.length > maxBytes) return null
  try { return JSON.parse(text) } catch { return null }
}

/** Same key? Compared in constant time (every character, whatever matches), so timing can't guess it. */
export function sameKey(given: string, real: string): boolean {
  let diff = given.length ^ real.length
  for (let i = 0; i < Math.max(given.length, real.length); i++) diff |= (given.charCodeAt(i) || 0) ^ (real.charCodeAt(i) || 0)
  return diff === 0
}

/** Muzzy's key? null = yes; else the refusal (403 when admin is off, 401 for a missing / wrong key). */
function refuseAdmin(request: Request, adminKey: string | undefined): Response | null {
  if (!adminKey) return json({ ok: false, code: 'admin-off' }, 403)
  const given = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  return given && sameKey(given, adminKey) ? null : json({ ok: false, code: 'not-allowed' }, 401)
}

export async function handleWords(request: Request, { rows, official, adminKey, today }: WordsContext): Promise<Response> {
  const path = new URL(request.url).pathname
  if (path === '/words/submit') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: OPEN_CORS })
    if (request.method !== 'POST') return json({ ok: false, code: 'bad-request' }, 405, OPEN_CORS)
    const body = (await readJson(request, MAX_SUBMIT_BODY)) as { word?: unknown } | null
    const answer = submitWord(rows, body?.word, official, today)
    return json(answer, answer.ok ? 200 : 400, OPEN_CORS)
  }
  if (path === '/words/list' && request.method === 'GET') return refuseAdmin(request, adminKey) ?? json({ words: rows.all() })
  if (path === '/words/review' && request.method === 'POST') {
    const refused = refuseAdmin(request, adminKey)
    if (refused) return refused
    const body = (await readJson(request, MAX_REVIEW_BODY)) as { changes?: unknown } | null
    if (!body) return json({ ok: false, code: 'bad-request' }, 400)
    return json({ ok: true, ...reviewWords(rows, body.changes) })
  }
  return json({ ok: false, code: 'not-found' }, 404)
}

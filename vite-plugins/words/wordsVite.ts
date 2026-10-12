// THE WORDS TAB'S DEV-SERVER ENDPOINTS (F70) — Glyphtender's own (the Dev Kit's review list tab is the framework's).
// Dev server only (`npm run dev`), never in a build:
//   GET  /__words/list   content/words/submitted.csv + any new words players sent to the online server
//   POST /__words/save   body { changes: [{ id: "WORD", status: "open" | "yes" | "no" }] } → both word files + the server
// The online server's admin key never reaches the browser: it's read here, from .env.local (gitignored):
//   WORDS_ADMIN_KEY=<the key set with `npx wrangler secret put WORDS_ADMIN_KEY`>
//   WORDS_SERVER=https://glyphtender.joebrogno.workers.dev   (optional — that's the default)
// Without the key, or with the server out of reach, the tab still works from the file; the dev server's terminal says why.
// Zipf scores for words Muzzy says yes to come from Python's wordfreq (`pip install wordfreq`), like the rest of the list;
// without it they get 0 and the terminal says so.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { applyChanges, mergeServerRows, outOfStep, parseOfficial, parseSubmitted, reviewItem, writeOfficial, writeSubmitted, type Change } from './wordLists'

export const LIST_URL = '/__words/list'
export const SAVE_URL = '/__words/save'
const LIVE_SERVER = 'https://glyphtender.joebrogno.workers.dev'
const MAX_BODY_BYTES = 1_000_000

type Settings = { key?: string; server?: string }

export function words(settings: Settings = {}): Plugin {
  return {
    name: 'glyphtender-words',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const files = { submitted: join(root, 'content/words/submitted.csv'), official: join(root, 'public/words/words.csv') }
      const online = { key: settings.key, server: (settings.server || LIVE_SERVER).replace(/\/$/, '') }
      server.middlewares.use(LIST_URL, (req, res) => void list(req, res, files, online))
      server.middlewares.use(SAVE_URL, (req, res) => void save(req, res, files, online))
    },
  }
}

type Files = { submitted: string; official: string }
type Online = { key?: string; server: string }

async function list(req: IncomingMessage, res: ServerResponse, files: Files, online: Online) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'GET only' })
  try {
    const rows = mergeServerRows(parseSubmitted(readFileSync(files.submitted, 'utf8')), await serverRows(online))
    reply(res, 200, rows.map(reviewItem))
  } catch (error) {
    reply(res, 500, { error: `Couldn't read the word files: ${String(error)}` })
  }
}

/** Only the game's own page may save (like the Dev Kit's Save): the dev server is on the Wi-Fi (--host), and any web
 *  page Muzzy has open could otherwise POST here and use the server key. A same-page fetch sends Origin = this server. */
function refused(req: IncomingMessage): [number, string] | null {
  if (req.method !== 'POST') return [405, 'POST only']
  let originHost = ''
  try { originHost = new URL(req.headers.origin ?? '').host } catch { /* no or bad Origin */ }
  if (!originHost || originHost !== req.headers.host) return [403, 'Save only from the game page']
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return [415, 'application/json only']
  return null
}

async function save(req: IncomingMessage, res: ServerResponse, files: Files, online: Online) {
  const refusal = refused(req)
  if (refusal) return reply(res, refusal[0], { error: refusal[1] })
  try {
    const body = JSON.parse(await readBody(req)) as { changes?: Change[] }
    if (!Array.isArray(body.changes)) return reply(res, 400, { error: 'changes must be a list' })
    // New player words the file hasn't seen yet are merged in first, so a mark on one of them is kept.
    const server = await serverRows(online)
    const rows = mergeServerRows(parseSubmitted(readFileSync(files.submitted, 'utf8')), server)
    const result = applyChanges(rows, parseOfficial(readFileSync(files.official, 'utf8')), body.changes, zipfScores)
    writeFileSync(files.official, writeOfficial(result.official), 'utf8')
    writeFileSync(files.submitted, writeSubmitted(result.rows), 'utf8')
    // This save's marks, plus any older mark the server missed (else its open count only grows and it stops taking words)
    const missed = outOfStep(result.rows, server).filter((c) => !result.applied.some((a) => a.id === c.id))
    await sendMarks(online, [...result.applied, ...missed])
    reply(res, 200, { saved: result.applied.length })
  } catch (error) {
    reply(res, 500, { error: `Couldn't save the word files: ${String(error)}` })
  }
}

/** The online server's submitted list (its new player words) — [] when there's no key or it can't be reached. */
async function serverRows(online: Online): Promise<unknown[]> {
  if (!online.key) {
    console.warn('[words] no WORDS_ADMIN_KEY in .env.local — the Words tab shows content/words/submitted.csv only')
    return []
  }
  try {
    const response = await fetch(`${online.server}/words/list`, { headers: { authorization: `Bearer ${online.key}` } })
    if (!response.ok) throw new Error(`the server said ${response.status}`)
    const data = (await response.json()) as unknown
    const rows = Array.isArray(data) ? data : (data as { words?: unknown[] }).words // the server answers { words: [...] }
    return Array.isArray(rows) ? rows : []
  } catch (error) {
    console.warn(`[words] couldn't fetch new player words from ${online.server} (${String(error)}) — showing the file only`)
    return []
  }
}

/** Tell the online server about Muzzy's marks. Only nice to have: it drops any word already on its list, whatever the mark. */
async function sendMarks(online: Online, changes: Change[]) {
  if (!online.key || changes.length === 0) return
  try {
    const response = await fetch(`${online.server}/words/review`, {
      method: 'POST',
      headers: { authorization: `Bearer ${online.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ changes: changes.map((c) => ({ word: c.id, status: c.status })) }),
    })
    if (!response.ok) throw new Error(`the server said ${response.status}`)
  } catch (error) {
    console.warn(`[words] saved the files, but couldn't send the marks to ${online.server} (${String(error)})`)
  }
}

/** Zipf scores (how common a word is) from Python's wordfreq — the same source as the rest of the list. */
export function zipfScores(list: string[]): Record<string, number> {
  const script = 'import sys, json, wordfreq\nprint(json.dumps({w: round(wordfreq.zipf_frequency(w.lower(), "en"), 2) for w in json.load(sys.stdin)}))'
  for (const python of ['python', 'python3', 'py']) {
    const run = spawnSync(python, ['-c', script], { input: JSON.stringify(list), encoding: 'utf8' })
    if (run.status === 0) return JSON.parse(run.stdout) as Record<string, number>
  }
  console.warn('[words] no Python with wordfreq (pip install wordfreq) — new words get Zipf 0')
  return {}
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) fail(new Error('too big'))
    })
    req.on('end', () => done(body))
    req.on('error', fail)
  })
}

function reply(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}

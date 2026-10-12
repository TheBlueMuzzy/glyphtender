// THE ONLINE SERVER'S FRONT DOOR — Cloudflare runs this file (wrangler.json "main") on Muzzy's own account.
// It hands every room to GlyphtenderServer (./server.ts), which knows nothing about Cloudflare.
//   Local:  npm run party:dev   (port 1997)   ·   Live: npm run party:deploy (Muzzy's call — it's public)
//
// PartyServer (the open-source successor of PartyKit) gives us PartyKit's rooms on plain Cloudflare:
// one room code = one Durable Object = one copy of the server, at /parties/main/<room code> —
// the same address PartySocket already uses, so the game's client didn't change.
// /words/… (F69) goes to the ONE submitted-words list (the Words class below).
import { Server, getServerByName, routePartykitRequest } from 'partyserver'
import type { Connection } from 'partyserver'
import GlyphtenderServer, { loadWords } from './server'
import { LiveConnections } from '../src/rooms/server/liveConnections'
import { PLAYER, seedIfEmpty, type SubmittedWord, type WordRows, type WordStatus } from './submittedWords'
import { handleWords } from './wordsRoutes'
// The words kept out of the official list (F68), bundled as text (scripts/server-words.mjs copies it here before each build)
import submittedCsv from './submitted.gen.txt'

// The class name is the address: "Main" → /parties/main/… (PartySocket's default). Keep it in step with wrangler.json.
export class Main extends Server {
  private room!: GlyphtenderServer
  // Our own list of live sockets — PartyServer's forgets a reconnected phone's NEW socket when the old one closes late
  private live = new LiveConnections<Connection>()

  // The worker's variables (only an e2e test server has any — testSettings below)
  private vars: unknown

  constructor(...args: ConstructorParameters<typeof Server>) {
    super(...args)
    this.vars = args[1]
  }

  onStart() {
    this.room = new GlyphtenderServer({ id: this.name, getConnection: (id) => this.live.get(id) }, testSettings(this.vars))
  }

  onConnect(connection: Connection) {
    this.live.opened(connection)
    this.room.onConnect(connection)
  }

  onMessage(connection: Connection, message: string | ArrayBuffer) {
    this.room.onMessage(message, connection)
  }

  onClose(connection: Connection) {
    this.live.closed(connection)
    this.room.onClose(connection)
  }

  onError(connection: Connection) {
    this.live.closed(connection)
    this.room.onError(connection)
  }
}

/** e2e only: a test server started with `wrangler dev --var TEST_IDLE_WARN_MS:4000 --var TEST_IDLE_TAKEOVER_MS:8000` gets
 *  short idle timings (F52's e2e). Nothing is set on the live server, so it always uses content/rooms.json. */
function testSettings(env: unknown): { idleWarnAfterMs?: number; idleTakeoverAfterMs?: number } {
  const vars = (env ?? {}) as Record<string, unknown>
  const ms = (value: unknown) => (typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : undefined)
  const settings: { idleWarnAfterMs?: number; idleTakeoverAfterMs?: number } = {}
  const warn = ms(vars.TEST_IDLE_WARN_MS)
  const takeover = ms(vars.TEST_IDLE_TAKEOVER_MS)
  if (warn !== undefined) settings.idleWarnAfterMs = warn
  if (takeover !== undefined) settings.idleTakeoverAfterMs = takeover
  return settings
}

// THE SUBMITTED WORDS (F69) — ONE copy of this class (named "submitted") holds the whole list in its own SQLite.
// The list's rules + web addresses are Cloudflare-free (./submittedWords.ts, ./wordsRoutes.ts); this only stores rows.
// First use: it fills itself from content/words/submitted.csv (bundled by scripts/server-words.mjs).
type SqlStorage = { exec(sql: string, ...values: (string | number)[]): { toArray(): Record<string, unknown>[] } }
export class Words extends Server {
  private vars: Record<string, unknown>
  private sqlite: SqlStorage

  constructor(...args: ConstructorParameters<typeof Server>) {
    super(...args)
    this.sqlite = (args[0] as unknown as { storage: { sql: SqlStorage } }).storage.sql
    this.vars = (args[1] ?? {}) as Record<string, unknown>
    this.query('CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, status TEXT NOT NULL, category TEXT NOT NULL, added TEXT NOT NULL, note TEXT NOT NULL)')
  }

  /** Runs one SQL statement on this object's own SQLite (the ?s are filled from values) → its rows. */
  private query(sql: string, ...values: (string | number)[]): Record<string, unknown>[] {
    return this.sqlite.exec(sql, ...values).toArray()
  }

  async onRequest(request: Request): Promise<Response> {
    const rows = this.rows()
    seedIfEmpty(rows, submittedCsv)
    const adminKey = typeof this.vars.WORDS_ADMIN_KEY === 'string' ? this.vars.WORDS_ADMIN_KEY : undefined
    return handleWords(request, { rows, official: loadWords(), adminKey, today: new Date().toISOString().slice(0, 10) })
  }

  /** The table, as the list's WordRows. */
  private rows(): WordRows {
    const row = (r: Record<string, unknown>): SubmittedWord =>
      ({ word: String(r.word), status: r.status as WordStatus, category: String(r.category), added: String(r.added), note: String(r.note) })
    return {
      count: () => Number(this.query('SELECT COUNT(*) AS n FROM words')[0].n),
      get: (word) => {
        const found = this.query('SELECT * FROM words WHERE word = ?', word)
        return found.length ? row(found[0]) : null
      },
      add: (r) => { this.query('INSERT OR IGNORE INTO words (word, status, category, added, note) VALUES (?, ?, ?, ?, ?)', r.word, r.status, r.category, r.added, r.note) },
      setStatus: (word, status) => {
        if (!this.query('SELECT word FROM words WHERE word = ?', word).length) return false
        this.query('UPDATE words SET status = ? WHERE word = ?', status, word)
        return true
      },
      openPlayerCount: () => Number(this.query("SELECT COUNT(*) AS n FROM words WHERE status = 'open' AND category = ?", PLAYER)[0].n),
      all: () => this.query('SELECT * FROM words ORDER BY word').map(row),
    }
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    const path = new URL(request.url).pathname
    // The submitted words: always the ONE list (never a room address — /parties/words/… is shut)
    if (path.startsWith('/words/')) {
      const list = await getServerByName(env.Words as Parameters<typeof getServerByName>[0], 'submitted')
      return list.fetch(request)
    }
    if (path.startsWith('/parties/words')) return new Response('Not found', { status: 404 })
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
}

// THE ONLINE SERVER'S FRONT DOOR — Cloudflare runs this file (wrangler.json "main") on Muzzy's own account.
// It hands every room to GlyphtenderServer (./server.ts), which knows nothing about Cloudflare.
//   Local:  npm run party:dev   (port 1997)   ·   Live: npm run party:deploy (Muzzy's call — it's public)
//
// PartyServer (the open-source successor of PartyKit) gives us PartyKit's rooms on plain Cloudflare:
// one room code = one Durable Object = one copy of the server, at /parties/main/<room code> —
// the same address PartySocket already uses, so the game's client didn't change.
import { Server, routePartykitRequest } from 'partyserver'
import type { Connection } from 'partyserver'
import GlyphtenderServer from './server'
import { LiveConnections } from './liveConnections'

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

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
}

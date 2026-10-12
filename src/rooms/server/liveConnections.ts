// LIVE CONNECTIONS — which socket is live for each connection id, kept by the server itself.  (Server only.)
// PartyServer (the online server's host, on Cloudflare) has its own connection list, but a phone that
// reconnects (Wi-Fi ↔ mobile, screen lock) reuses its id, and its NEW socket can open before the OLD
// one's close arrives. PartyServer forgets the id on that late close, which would drop the new, live
// socket too — so here only the socket that is still the live one may be forgotten. (Glyphtender, D46)
// The game's party/worker.ts keeps one of these and hands RoomServer `getConnection: (id) => live.get(id)`.
import type { PartyConnection } from './roomServer'

export class LiveConnections<C extends PartyConnection = PartyConnection> {
  private live = new Map<string, C>()

  opened(connection: C): void {
    this.live.set(connection.id, connection)
  }

  /** A socket closed (or failed). Forget it only if it's still the live one for its id. */
  closed(connection: C): void {
    if (this.live.get(connection.id) === connection) this.live.delete(connection.id)
  }

  get(id: string): C | undefined {
    return this.live.get(id)
  }

  /** Every live socket (one per connection id) — e.g. to send something to everyone. */
  all(): C[] {
    return [...this.live.values()]
  }
}

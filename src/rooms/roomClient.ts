// ROOM CLIENT — opens the connection to a room's server.  (Browser only.)
// PartySocket is a WebSocket that reconnects by itself after a drop (phone locked, Wi-Fi blip…).
import PartySocket from 'partysocket'
import { getTabId } from './identity'
import type { ClientMessage } from './protocol'

/** The local room server's port when the game doesn't say (every game before rooms 0.13.0). */
export const LOCAL_PARTY_PORT = 1999

/**
 * The game's own local room port: wrangler.json "dev" → "port" — the same line `npm run party:dev` (wrangler dev)
 * reads — baked into the page by the rooms Vite plugin (vitePlugin.mjs → import.meta.env.PARTY_PORT).
 * No plugin in vite.config, or no port in wrangler.json → 1999.
 */
export function localPartyPort(): number {
  const port = Number(import.meta.env.PARTY_PORT)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : LOCAL_PARTY_PORT
}

/**
 * Where the room server is.
 * - Live build: VITE_PARTY_HOST (e.g. "glyphtender.joebrogno.workers.dev"), set when building.
 * - Local dev: the same computer that served the page, on the game's own port (localPartyPort) — so a phone on the
 *   Wi-Fi (http://192.168.x.x:5173) reaches the PC's server too. Leave VITE_PARTY_HOST unset for local dev.
 */
export function partyHost(): string {
  const fromBuild = import.meta.env.VITE_PARTY_HOST as string | undefined
  if (fromBuild) return fromBuild
  return `${window.location.hostname}:${localPartyPort()}`
}

/** Connect to the room with this code. The caller closes it. */
export function openRoomSocket(roomCode: string, host: string = partyHost()): PartySocket {
  return new PartySocket({ host, room: roomCode, id: getTabId() })
}

export function sendToRoom(socket: PartySocket, message: ClientMessage): void {
  socket.send(JSON.stringify(message))
}

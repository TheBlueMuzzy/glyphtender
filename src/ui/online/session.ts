// THE ONLINE SESSION — which room this device is in (the code), and the live room from useRoom
// (OnlineSession.tsx keeps `room` up to date). Screens read it; Create / Join / Leave go through here.
// Leaving ALWAYS goes through useRoom's leave() — a bare socket close would look like a dropped connection.
import { create } from 'zustand'
import text from '../../../content/text/en.json'
import wranglerJson from '../../../wrangler.json'
import type { GameView, OnlineAction, OnlineOptions } from '../../../party/protocol'
import type { OnlineRoom } from '../../rooms/useRoom'
import type { CloseReason } from '../../rooms/protocol'
import { makeRoomCode } from '../../rooms/roomCodes'
import { getPlayerName, setPlayerName } from '../../rooms/identity'
import { roomBeforeReload } from '../../rooms/lastRoom'
import { stopOnline } from '../../store/onlinePlay'
import { useGameStore } from '../../store/gameStore'
import { toast } from '../kit'

export type Room = OnlineRoom<GameView, OnlineAction, OnlineOptions>

interface Session {
  /** The room code this device is in (null = not online). */
  code: string | null
  /** true = this device made the room (only its very first join may create it). */
  creating: boolean
  /** true = getting back into a match this device was in (a reload, or Rejoin match): only my own seat will do. */
  rejoin: boolean
  name: string
  /** The live room (useRoom's result), or null before OnlineSession has run. */
  room: Room | null
  /** Why the last try to get into a room didn't work (friendly words), shown on the join screen. */
  joinError: string | null
}

// Which room this device was in lives in the rooms kit (src/rooms/lastRoom.ts — useRoom remembers and forgets it by
// itself). A reload in the same tab goes straight back in: a match as a rejoin (only my own seat), a lobby as a plain
// join (the lobby seat went when the page unloaded). After a closed tab, the main menu offers "Rejoin match".
const reloaded = roomBeforeReload()

export const useOnline = create<Session>()(() => ({
  code: reloaded?.code ?? null, creating: false, rejoin: reloaded?.phase === 'playing', name: getPlayerName(), room: null, joinError: null,
}))

/**
 * Where the online server is. Live builds: VITE_PARTY_HOST. Local: the computer that served this page, on
 * wrangler.json's dev port (1997) — so a phone on the Wi-Fi reaches the PC's `npm run party:dev` too.
 * (VITE_PARTY_PORT overrides the port: e2e:online runs its own server on another one.)
 */
export function partyHost(): string {
  const fromBuild = import.meta.env.VITE_PARTY_HOST as string | undefined
  const port = (import.meta.env.VITE_PARTY_PORT as string | undefined) || wranglerJson.dev.port
  return fromBuild || `${window.location.hostname}:${port}`
}

/** A reason the server shut us out, in the player's words (en.json → online.errors). */
export const closedMessage = (reason: CloseReason) =>
  (text.online.errors as Record<string, string>)[reason] ?? text.online.errors.room_closed

export function setName(name: string) {
  setPlayerName(name) // remembered for next time
  useOnline.setState({ name, joinError: null })
}

export function createRoom() {
  const code = makeRoomCode()
  useOnline.setState({ code, creating: true, rejoin: false, room: null, joinError: null })
}

export function joinRoom(code: string) {
  useOnline.setState({ code, creating: false, rejoin: false, room: null, joinError: null })
}

/** Main menu → Rejoin match: back into the match this device was in (the kit's matchToRejoin()), with the saved name. */
export function rejoinMatch(code: string) {
  useOnline.setState({ code, creating: false, rejoin: true, room: null, joinError: null })
}

/** Out of the room (Leave, Menu → Leave game): tell the server, stop the online game, back to the menu. */
export function leaveOnline() {
  useOnline.getState().room?.leave()
  endOnline(null)
}

/** The room is gone for us (left, or shut out). `why` shows on the join screen if given. (useRoom has already
 *  forgotten the room on this device — lastRoom.ts — unless another tab has the seat now.) */
export function endOnline(why: string | null) {
  stopOnline()
  useOnline.setState({ code: null, creating: false, rejoin: false, room: null, joinError: why })
  if (useGameStore.getState().online) useGameStore.getState().leaveGame()
}

/** End table → New game: the host takes everyone back to the lobby (to change the options); everyone else waits. */
export function onlineBackToLobby() {
  const room = useOnline.getState().room
  if (room?.isHost) room.backToLobby()
  else toast(text.game.prompts.waitingHost)
}

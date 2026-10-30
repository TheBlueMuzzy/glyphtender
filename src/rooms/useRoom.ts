// useRoom — the React hook a game's screens use to be in an online room.  (Browser only.)
//
//   const online = useRoom<MyView, MyAction, MyOptions, MyEvent>(roomCode, { name, create })
//   online.status   'idle' (no code) · 'connecting' · 'open' · 'reconnecting' · 'closed'
//   online.room     seats, phase, host… (null until the server answers)
//   online.mySeat   your own seat (null if you have none)
//   online.view     your view of the game, straight from the server's viewFor()
//   online.send(action)   a game move → the server's rules check it
//   online.leave()        ALWAYS leave through this (a plain socket close looks like a dropped connection)
//
// Pass roomCode = null when not online. Changing the code connects to the new room.
// Unmounting (or React StrictMode's practice unmount in dev) just drops the connection — it does
// NOT give up the seat, and the next mount takes the seat straight back. Only leave() gives it up.
//
// Rejoin (0.9.0): the room's code is remembered on this device (lastRoom.ts) from the moment the room arrives, and
// forgotten on leave / kick / game over / a closed or missing room. After the tab was closed, the menu offers
// "Rejoin match" (matchToRejoin()) → useRoom(code, { name, create: false, rejoin: true }). A room that's gone by then
// → `matchEnded` ("That match has ended") instead of a join error; back in → `cameBack` ({ botTurns }).
import { useCallback, useEffect, useRef, useState } from 'react'
import type PartySocket from 'partysocket'
import { getPersistentId } from './identity'
import { forgetLastRoom, rememberLastRoom } from './lastRoom'
import { parseServerMessage } from './protocol'
import type { ClientMessage, CloseReason, ErrorCode, RoomState, Seat } from './protocol'
import { openRoomSocket, sendToRoom } from './roomClient'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface RoomIdentity {
  /** The player's name (the server trims it to 16 characters). */
  name: string
  /** true = making a new room with this code · false = joining a friend's room (refused if nobody's there). */
  create: boolean
  /** true = "Rejoin match" (a match this device was in — lastRoom.ts): only our own seat will do, it never creates a
   *  room (even with create: true), and a room that's gone → matchEnded instead of a join error. */
  rejoin?: boolean
  /** Leave out — it comes from identity.ts. (Tests and e2e can pass their own.) */
  persistentId?: string
}

export interface UseRoomOptions<Event> {
  /** Called for every `event` the server sends, in order (views can arrive in one batch; events never get lost). */
  onEvent?: (event: Event) => void
  /** Called for every emote the room relays — `{ seat, id }` (Rooms 0.12.0). Hand it to the emotes module:
   *  onEmote: (message) => emotes.receive(message) — it drops the senders this player muted. */
  onEmote?: (emote: { seat: string; id: string }) => void
  /** Leave out — it comes from partyHost() in roomClient.ts. */
  host?: string
}

export interface OnlineRoom<View, Action, Options> {
  status: ConnectionStatus
  room: RoomState | null
  mySeat: Seat | null
  isHost: boolean
  view: View | null
  /** The last thing the server refused (still in the room). Clear it with clearError(). */
  error: { code: ErrorCode; message: string } | null
  /** Why the room shut you out (status is 'closed'). */
  closedReason: CloseReason | null
  /** The match you were rejoining is gone (cleared while everyone was away), or the room closed: show "That match has
   *  ended" (the UI kit's rejoinWords.ended), not a join error. Nothing new was made. */
  matchEnded: boolean
  /** You came back into a game after being away: how many of your turns a bot played meanwhile (0 = none) — "You're
   *  back — a bot played 3 turns for you" (the UI kit's welcomeBackLine). null = nothing to say. Clear it once shown. */
  cameBack: { botTurns: number } | null
  clearCameBack: () => void
  /** Send a game move. false = not sent (not connected right now). */
  send: (action: Action) => boolean
  /** Say a preset phrase to the table (its id only — the server checks it, counts it and relays it to every seat,
   *  yours too). false = not sent. Use it as the emotes module's `send`: (seat, id) => online.sendEmote(id). */
  sendEmote: (id: string) => boolean
  setReady: (ready: boolean) => void
  /** Host: start a game (from the lobby, or a rematch after a game). */
  start: (options: Options) => void
  /** Host: remove a player or bot. */
  kick: (seatId: string) => void
  /** Host, lobby: add a bot seat (if the game allows bots). `profile` = which bot, in the game's words (its botProfile checks it). */
  addBot: (profile?: string) => void
  /** Host, after a game: everyone back to the lobby. */
  backToLobby: () => void
  /** Give up your seat and disconnect. */
  leave: () => void
  clearError: () => void
  /** You've done nothing on your turn for a while: a bot takes your seat at `endsAt` (a Date.now() time) unless you
   *  do something. null = no warning. (Show it with the UI kit's IdleWarning.) */
  idleWarning: { endsAt: number } | null
  /** A bot is playing your seat because you went idle (you're still here): any active() gives it straight back. */
  botPlaysForMe: boolean
  /**
   * "I'm here" — call it on any tap or key while it matters (your turn, the warning is up, or botPlaysForMe). It resets
   * your idle clock on the server. Cheap to call often: it sends at most one ping every few seconds, except straight
   * away while the warning is up or the bot has your seat.
   */
  active: () => void
}

/** At most one "active" ping this often while nothing's urgent (a player taps a lot; the server only needs a sign of life). */
export const ACTIVE_PING_EVERY_MS = 5_000

// Everything the hook remembers about ONE room code. If the code changes, it starts blank.
interface Connection<View> {
  code: string | null
  status: ConnectionStatus
  room: RoomState | null
  you: string | null
  view: View | null
  error: { code: ErrorCode; message: string } | null
  closedReason: CloseReason | null
  idleWarning: { endsAt: number } | null
  cameBack: { botTurns: number } | null
}

function blank<View>(code: string | null): Connection<View> {
  return { code, status: code ? 'connecting' : 'idle', room: null, you: null, view: null, error: null, closedReason: null, idleWarning: null, cameBack: null }
}

export function useRoom<View = unknown, Action = unknown, Options = unknown, Event = unknown>(
  roomCode: string | null,
  identity: RoomIdentity,
  options: UseRoomOptions<Event> = {},
): OnlineRoom<View, Action, Options> {
  const [saved, setSaved] = useState<Connection<View>>(() => blank(roomCode))
  const socketRef = useRef<PartySocket | null>(null)
  const identityRef = useRef(identity)
  const onEventRef = useRef(options.onEvent)
  const onEmoteRef = useRef(options.onEmote)
  const roomCodeRef = useRef(roomCode)
  useEffect(() => {
    identityRef.current = identity
    onEventRef.current = options.onEvent
    onEmoteRef.current = options.onEmote
    roomCodeRef.current = roomCode
  })

  const host = options.host
  useEffect(() => {
    if (!roomCode) return
    const code = roomCode
    let joined = false // true once the server has given us the room (reconnects then never "create")
    let closedOnPurpose = false

    // Change what we remember about THIS code (ignores anything left over from an older code)
    const update = (change: Partial<Connection<View>>) =>
      setSaved((before) => ({ ...(before.code === code ? before : blank<View>(code)), ...change }))

    const socket = openRoomSocket(code, host)
    socketRef.current = socket

    socket.onopen = () => {
      // Every open — the first AND every reconnect — says who we are; a known player gets their seat back.
      const me = identityRef.current
      update({ status: joined ? 'reconnecting' : 'connecting' })
      const persistentId = me.persistentId ?? getPersistentId()
      // A rejoin never creates, and once we're in, a reconnect is just a reconnect
      if (me.rejoin && !joined) sendToRoom(socket, { type: 'join', name: me.name, persistentId, create: false, rejoin: true })
      else sendToRoom(socket, { type: 'join', name: me.name, persistentId, create: me.create && !me.rejoin && !joined })
    }

    socket.onclose = () => {
      if (closedOnPurpose) return
      // PartySocket tries again by itself (a dropped connection stops the server's idle clock: no warning while away)
      update({ status: joined ? 'reconnecting' : 'connecting', idleWarning: null })
    }

    socket.onmessage = (event: MessageEvent) => {
      const message = parseServerMessage(event.data)
      if (!message) return
      switch (message.type) {
        case 'room':
          joined = true
          // Remembered on this device so a closed tab can come back (Rejoin match); a finished game is forgotten
          if (message.room.phase === 'over') forgetLastRoom(code)
          else rememberLastRoom(code, message.room.phase)
          update({ status: 'open', room: message.room, you: message.you })
          break
        case 'back':
          update({ cameBack: { botTurns: message.botTurns } })
          break
        case 'view':
          update({ view: message.view as View })
          break
        case 'event':
          onEventRef.current?.(message.event as Event)
          break
        case 'emote':
          // (ids only; the emotes module checks the id again and drops muted senders)
          if (typeof message.seat === 'string' && typeof message.id === 'string') onEmoteRef.current?.({ seat: message.seat, id: message.id })
          break
        case 'error':
          update({ error: { code: message.code, message: message.message } })
          break
        case 'closed':
          // The server shut us out: stop, and don't let PartySocket reconnect
          closedOnPurpose = true
          socket.close()
          // Nothing to come back to (left, kicked, the room closed or is gone…) — except "another tab has your seat":
          // that tab is still in the match, and keeps it remembered
          if (message.reason !== 'connected_elsewhere') forgetLastRoom(code)
          update({ status: 'closed', closedReason: message.reason, idleWarning: null })
          break
        case 'idle_warning':
          update({ idleWarning: { endsAt: Date.now() + message.msLeft } })
          break
        case 'idle_warning_off':
          update({ idleWarning: null })
          break
      }
    }

    return () => {
      // Unmount / code change / StrictMode: just drop the connection. The seat stays ours.
      closedOnPurpose = true
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [roomCode, host])

  // What this render shows: what we saved for this code, or a blank start if it's a new code
  const current = saved.code === roomCode ? saved : blank<View>(roomCode)
  const mySeat = current.room?.seats.find((seat) => seat.id === current.you) ?? null
  // The match is over for us without anyone choosing it: the room closed, or the one we came back for is gone.
  // (A plain join to a wrong code is still a join error — 'no_room' says "no room with that code" there.)
  // (A rejoin that finds we were kicked while away: the match is over for us too — not a join error. Review F95.)
  const matchEnded = current.status === 'closed'
    && (current.closedReason === 'room_closed'
      || (identity.rejoin === true && (current.closedReason === 'no_room' || current.closedReason === 'kicked')))

  // Only send while we're really in the room (a message queued during a reconnect would arrive before our join)
  const sendMessage = useCallback((message: ClientMessage): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    sendToRoom(socket, message)
    return true
  }, [])

  // "I'm here": at most one ping every ACTIVE_PING_EVERY_MS — but straight away when it's urgent (the warning is up,
  // or the bot is playing for me), so a tap always lands in time and gives the seat back at once.
  const botPlaysForMe = current.room?.phase === 'playing' && mySeat?.kind === 'bot' && mySeat.connected
  const urgent = current.idleWarning !== null || botPlaysForMe
  const urgentRef = useRef(urgent)
  useEffect(() => {
    urgentRef.current = urgent
  })
  const lastPingRef = useRef(-Infinity)
  const active = useCallback(() => {
    const now = Date.now()
    if (!urgentRef.current && now - lastPingRef.current < ACTIVE_PING_EVERY_MS) return
    if (sendMessage({ type: 'active' })) lastPingRef.current = now
  }, [sendMessage])

  const leave = useCallback(() => {
    if (roomCodeRef.current) forgetLastRoom(roomCodeRef.current) // left on purpose: no Rejoin offer
    const socket = socketRef.current
    if (!socket) return
    sendMessage({ type: 'leave' })
    socket.onclose = null
    socket.onmessage = null
    socket.close()
    socketRef.current = null
    setSaved((before) => ({ ...before, status: 'closed', closedReason: 'left' }))
  }, [sendMessage])

  return {
    status: current.status,
    room: current.room,
    mySeat,
    isHost: mySeat?.isHost ?? false,
    view: current.view,
    error: current.error,
    closedReason: current.closedReason,
    matchEnded,
    cameBack: current.cameBack,
    clearCameBack: useCallback(() => setSaved((before) => ({ ...before, cameBack: null })), []),
    send: useCallback((action: Action) => sendMessage({ type: 'action', action }), [sendMessage]),
    sendEmote: useCallback((id: string) => sendMessage({ type: 'emote', id }), [sendMessage]),
    setReady: useCallback((ready: boolean) => void sendMessage({ type: 'ready', ready }), [sendMessage]),
    start: useCallback((startOptions: Options) => void sendMessage({ type: 'start', options: startOptions }), [sendMessage]),
    kick: useCallback((seatId: string) => void sendMessage({ type: 'kick', seatId }), [sendMessage]),
    addBot: useCallback((profile?: string) => void sendMessage(profile === undefined ? { type: 'add_bot' } : { type: 'add_bot', profile }), [sendMessage]),
    backToLobby: useCallback(() => void sendMessage({ type: 'back_to_lobby' }), [sendMessage]),
    leave,
    clearError: useCallback(() => setSaved((before) => ({ ...before, error: null })), []),
    idleWarning: current.idleWarning,
    botPlaysForMe,
    active,
  }
}

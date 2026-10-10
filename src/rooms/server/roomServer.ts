// ROOM SERVER — the base a game's party/server.ts builds on.  (Server — no React, no Dev Kit, no browser code.)
//
//   // party/server.ts
//   import type * as Party from 'partykit/server'
//   import { RoomServer } from '../src/rooms/server/roomServer'
//   import settings from '../content/rooms.json'
//   import { myGameRules } from './myGameRules'
//   export default class MyGameServer extends RoomServer<State, Options, Action, View, Event> implements Party.Server {
//     constructor(party: Party.Room) { super(party, myGameRules, settings) }
//   }
//
// PartyKit calls onConnect / onMessage / onClose. This class runs the room (seats.ts has the rules
// for seats and host) and calls the game's rules (gameRules.ts) for everything about the game itself.
// One PartyKit room = one room code. Everything is in memory: if the room is cleared, it's gone.
import { parseClientMessage } from '../protocol'
import type { ClientMessage, CloseReason, ErrorCode, ServerMessage } from '../protocol'
import type { GameRules, RoomTools, SeatChange } from './gameRules'
import {
  addBot, backToLobby, dropOut, findSeat, findSeatOf, handToBot, joinRoom, kick,
  newRoom, playedBy, publicRoom, publicSeat, removeSeat, startPlaying, takeBack, whyNotStart,
} from './seats'
import type { RoomData, SeatRecord } from './seats'
import { readSettings } from './settings'
import type { RoomSettings } from './settings'
import { Timers } from './timers'

// The bits of PartyKit this class uses. PartyKit's own Party.Room / Party.Connection fit these,
// and tests pass simple fakes — so none of this needs a live PartyKit to be tested.
export interface PartyConnection {
  id: string
  send(message: string): void
  close(): void
}
export interface PartyRoom {
  id: string
  getConnection(id: string): PartyConnection | undefined
}

// The room's own timers start with "room:" — the game's timers are everything else.
const ROOM_TIMER = 'room:'
const botTakeoverTimer = (seatId: string) => `${ROOM_TIMER}bot-takes-over:${seatId}`
const EMPTY_ROOM_TIMER = `${ROOM_TIMER}empty`
// A seat on the clock that does nothing: first a warning on their screen, then a bot takes over
const idleWarnTimer = (seatId: string) => `${ROOM_TIMER}idle-warn:${seatId}`
const idleTakeoverTimer = (seatId: string) => `${ROOM_TIMER}idle-takeover:${seatId}`

export class RoomServer<State, Options, Action, View, Event = never> {
  readonly party: PartyRoom
  readonly rules: GameRules<State, Options, Action, View, Event>
  readonly settings: RoomSettings
  readonly timers: Timers
  /** Seats, host, phase — see seats.ts. */
  data: RoomData
  /** The game's state (null when no game has started). Only the server has it. */
  game: State | null = null
  /** The live connection of each seated player: seat id → connection. */
  private sockets = new Map<string, PartyConnection>()
  /** Messages each connection sent this second (connection id → count), for settings.maxMessagesPerSecond. */
  private messageCounts = new Map<string, { second: number; count: number }>()
  /** Seats the game is waiting for (room.onTheClock). Each connected human among them has an idle clock. */
  private onClock = new Set<string>()
  /** Seats whose screen shows the idle warning right now. */
  private warned = new Set<string>()
  /** true while a game callback runs (so update() can't clash with it). */
  private insideGameCode = false
  private tools: RoomTools<State, Event>

  constructor(party: PartyRoom, rules: GameRules<State, Options, Action, View, Event>, settings: Partial<RoomSettings> = {}) {
    this.party = party
    this.rules = rules
    this.settings = readSettings(settings)
    this.timers = new Timers((message) => this.log(message))
    this.data = newRoom(party.id)
    this.tools = {
      code: party.id,
      settings: this.settings,
      timers: this.timers,
      seats: () => this.data.seats.map(publicSeat),
      update: (change) => this.updateGame(change),
      sendEvent: (seatId, event) => this.sendToSeat(seatId, { type: 'event', event }),
      broadcastEvent: (event, exceptSeatId) => {
        for (const seatId of this.sockets.keys()) {
          if (seatId !== exceptSeatId) this.sendToSeat(seatId, { type: 'event', event })
        }
      },
      sendEventPerSeat: (eventFor) => {
        this.data.seats.forEach((seat, index) => {
          if (!this.sockets.has(seat.id)) return
          const event = eventFor(publicSeat(seat), index)
          if (event !== null) this.sendToSeat(seat.id, { type: 'event', event })
        })
      },
      onTheClock: (seatIds) => this.setOnTheClock(seatIds),
      timedOut: (seatId) => this.botTakesIdleSeat(seatId, 'their turn timer ran out'),
      playedBy: (seatId) => {
        const seat = findSeat(this.data, seatId)
        return seat ? playedBy(seat) : null
      },
      log: (message) => this.log(message),
    }
  }

  // ─── PartyKit calls these ─────────────────────────────────────────

  onConnect(connection: PartyConnection): void {
    // Nothing yet — the player's first message ("join") says who they are.
    this.log(`connected ${connection.id.slice(0, 8)}`)
  }

  onMessage(raw: unknown, sender: PartyConnection): void {
    if (this.tooManyMessages(sender)) return // flooding: dropped unread
    const message = parseClientMessage(raw)
    if (!message) {
      this.sendError(sender, 'bad_message', 'The server didn\'t understand that message.')
      return
    }
    if (message.type === 'join') {
      this.handleJoin(sender, message)
      return
    }
    const seat = this.seatOf(sender)
    if (!seat) {
      this.sendError(sender, 'not_now', 'Join the room first.')
      return
    }
    switch (message.type) {
      case 'leave': return this.handleLeave(sender, seat)
      case 'ready': return this.handleReady(seat, message.ready)
      case 'start': return this.handleStart(sender, seat, message.options)
      case 'kick': return this.handleKick(sender, seat, message.seatId)
      case 'add_bot': return this.handleAddBot(sender, seat, message.profile)
      case 'back_to_lobby': return this.handleBackToLobby(sender, seat)
      case 'action': return this.handleAction(sender, seat, message.action)
      case 'active': return this.handleActive(seat)
    }
  }

  onClose(connection: PartyConnection): void {
    this.messageCounts.delete(connection.id)
    const seatId = this.seatIdOfClosed(connection)
    if (!seatId) return
    this.sockets.delete(seatId)
    this.stopIdleClock(seatId) // (a dropped player has the away timer below instead)
    const seat = findSeat(this.data, seatId)
    this.log(`${seat?.name ?? seatId} dropped out`)
    if (dropOut(this.data, seatId) === 'waiting') {
      // Mid-game: the seat waits. If they stay away too long, a bot takes it (they can still come back).
      if (this.settings.botTakesOverAfterMs > 0) {
        this.timers.start(botTakeoverTimer(seatId), this.settings.botTakesOverAfterMs, () => {
          const stillAway = findSeat(this.data, seatId)
          if (!stillAway || stillAway.kind !== 'human' || stillAway.connected) return
          handToBot(this.data, seatId)
          this.log(`a bot took ${stillAway.name}'s seat (away too long)`)
          this.seatChanged(seatId, 'bot')
          this.afterSeatsChanged()
        })
      }
      this.seatChanged(seatId, 'dropped')
    }
    this.afterSeatsChanged()
  }

  /** A connection that broke with an error counts as dropped, like a close. */
  onError(connection: PartyConnection): void {
    this.onClose(connection)
  }

  /** Past settings.maxMessagesPerSecond this second? (A real player sends a few a minute; 0 = no limit.) */
  private tooManyMessages(connection: PartyConnection): boolean {
    const limit = this.settings.maxMessagesPerSecond
    if (limit <= 0) return false
    const second = Math.floor(Date.now() / 1000)
    const seen = this.messageCounts.get(connection.id)
    if (!seen || seen.second !== second) {
      this.messageCounts.set(connection.id, { second, count: 1 })
      return false
    }
    seen.count += 1
    if (seen.count === limit + 1) this.log(`too many messages from ${connection.id.slice(0, 8)} — dropping them for the rest of this second`)
    return seen.count > limit
  }

  // ─── Room messages ────────────────────────────────────────────────

  private handleJoin(connection: PartyConnection, message: Extract<ClientMessage, { type: 'join' }>): void {
    // One connection = one seat. (A second seat on it would never be let go when it closes: a ghost seat, maybe a ghost host.)
    const already = this.seatOf(connection)
    if (already && already.persistentId !== message.persistentId) {
      return this.sendError(connection, 'not_now', 'You already have a seat in this room.')
    }
    const before = findSeatOf(this.data, message.persistentId)
    const wasAway = before !== undefined && (before.kind === 'bot' || !before.connected)

    const result = joinRoom(this.data, message, this.settings)
    if (!result.ok) {
      this.log(`join refused (${result.reason})`)
      this.sendClosed(connection, result.reason)
      return
    }
    const seat = result.seat

    // Their seat already had a live connection from ANOTHER tab: that tab loses it.
    const oldSocket = this.sockets.get(seat.id)
    if (oldSocket && oldSocket !== connection && oldSocket.id !== connection.id) {
      this.sendClosed(oldSocket, 'connected_elsewhere')
    }
    this.sockets.set(seat.id, connection)
    this.timers.stop(botTakeoverTimer(seat.id))
    this.log(result.cameBack ? `${seat.name} is back (${seat.id})` : `${seat.name} joined (${seat.id})`)

    this.restartIdleClock(seat.id) // (back on their turn: a fresh idle clock)
    if (wasAway) this.seatChanged(seat.id, 'back')
    this.afterSeatsChanged()
    if (this.game !== null) this.sendView(seat)
  }

  private handleLeave(connection: PartyConnection, seat: SeatRecord): void {
    this.sockets.delete(seat.id)
    this.timers.stop(botTakeoverTimer(seat.id))
    this.stopIdleClock(seat.id)
    this.log(`${seat.name} left`)
    if (this.data.phase === 'lobby') {
      removeSeat(this.data, seat.id)
    } else {
      handToBot(this.data, seat.id)
      seat.connected = false
      this.seatChanged(seat.id, 'bot')
    }
    this.sendClosed(connection, 'left')
    this.afterSeatsChanged()
  }

  private handleReady(seat: SeatRecord, ready: boolean): void {
    if (this.data.phase !== 'lobby') return
    seat.ready = ready
    this.sendRoomToEveryone()
  }

  private handleStart(connection: PartyConnection, seat: SeatRecord, rawOptions: unknown): void {
    if (!seat.isHost) return this.sendError(connection, 'not_host', 'Only the host can start the game.')
    const problem = whyNotStart(this.data, this.settings)
    if (problem) return this.sendError(connection, 'cant_start', problem)

    let state: State
    try {
      const options = this.rules.checkOptions(rawOptions)
      this.insideGameCode = true
      state = this.rules.onStart(options, this.data.seats.map(publicSeat), this.tools)
    } catch (error) {
      return this.sendError(connection, 'cant_start', reasonOf(error))
    } finally {
      this.insideGameCode = false
    }
    this.log(`game started with ${this.data.seats.length} seats`)
    startPlaying(this.data)
    this.game = state
    this.afterGameChanged()
    this.sendRoomToEveryone()
  }

  private handleKick(connection: PartyConnection, seat: SeatRecord, targetId: string): void {
    if (!seat.isHost) return this.sendError(connection, 'not_host', 'Only the host can remove players.')
    const wasHuman = findSeat(this.data, targetId)?.kind === 'human'
    const removed = kick(this.data, targetId)
    if (!removed) return this.sendError(connection, 'not_now', 'That seat can\'t be removed.')
    this.log(`host removed ${removed.name}`)
    const socket = this.sockets.get(targetId)
    this.sockets.delete(targetId)
    this.timers.stop(botTakeoverTimer(targetId))
    this.stopIdleClock(targetId)
    if (socket) this.sendClosed(socket, 'kicked')
    if (wasHuman && this.data.phase !== 'lobby') this.seatChanged(targetId, 'bot')
    this.afterSeatsChanged()
  }

  private handleAddBot(connection: PartyConnection, seat: SeatRecord, profile?: string): void {
    if (!seat.isHost) return this.sendError(connection, 'not_host', 'Only the host can add bots.')
    let described: { profile: string; name: string } | undefined
    if (profile !== undefined && this.rules.botProfile) {
      try {
        described = this.rules.botProfile(profile)
      } catch (error) {
        return this.sendError(connection, 'bad_action', reasonOf(error))
      }
    }
    if (!addBot(this.data, this.settings, described)) {
      return this.sendError(connection, 'not_now', this.settings.allowBots ? 'No room for another seat.' : 'This game has no bots.')
    }
    this.sendRoomToEveryone()
  }

  private handleBackToLobby(connection: PartyConnection, seat: SeatRecord): void {
    if (!seat.isHost) return this.sendError(connection, 'not_host', 'Only the host can do that.')
    if (this.data.phase !== 'over') return this.sendError(connection, 'not_now', 'The game isn\'t over yet.')
    backToLobby(this.data)
    this.game = null
    this.clearIdleClocks()
    this.timers.stopAll() // nothing to wait for in the lobby
    this.sendToEveryone({ type: 'view', view: null })
    this.sendRoomToEveryone()
  }

  // ─── The game ─────────────────────────────────────────────────────

  private handleAction(connection: PartyConnection, seat: SeatRecord, rawAction: unknown): void {
    if (this.data.phase !== 'playing' || this.game === null) {
      return this.sendError(connection, 'not_now', 'No game is on.')
    }
    if (seat.kind === 'bot') {
      // A bot had their seat (they idled) but they're still here and making a move: it's theirs again
      this.takeSeatBack(seat)
      if (this.game === null) return
    }
    let action: Action
    try {
      action = this.rules.checkAction(rawAction)
    } catch (error) {
      return this.sendError(connection, 'bad_action', reasonOf(error))
    }
    let state: State
    try {
      this.insideGameCode = true
      state = this.rules.onAction(this.game, publicSeat(seat), action, this.tools)
    } catch (error) {
      return this.sendError(connection, 'action_refused', reasonOf(error))
    } finally {
      this.insideGameCode = false
    }
    // Nothing changed (the game gave back the SAME state, e.g. "send me my view again"): only the sender is answered
    if (state === this.game) return this.sendView(seat)
    this.game = state
    // A move of their own: they're not idle (if the game still waits for them — e.g. the second half of a turn — their clock starts again)
    this.restartIdleClock(seat.id)
    this.afterGameChanged()
  }

  /** "I'm here" (a tap or a key): a fresh idle clock — and if a bot has their seat because they idled, it's theirs again. */
  private handleActive(seat: SeatRecord): void {
    if (this.data.phase !== 'playing') return
    // (Only an idle player's seat can be taken back like this: Leave and kick close the connection, so no "active" comes.)
    if (seat.kind === 'bot') this.takeSeatBack(seat)
    else this.restartIdleClock(seat.id)
  }

  /** The owner, still connected, is active again while a bot plays their seat: it's theirs again, at once. */
  private takeSeatBack(seat: SeatRecord): void {
    takeBack(this.data, seat.id)
    this.log(`${seat.name} took their seat back from the bot`)
    this.restartIdleClock(seat.id)
    this.seatChanged(seat.id, 'back')
    this.afterSeatsChanged()
  }

  /** RoomTools.update — a change from a timer or a bot, not from a player's message. */
  private updateGame(change: (state: State) => State): void {
    if (this.insideGameCode) {
      throw new Error('room.update() was called inside onStart/onAction/onSeatChange — return the new state there instead')
    }
    if (this.data.phase !== 'playing' || this.game === null) return
    try {
      this.insideGameCode = true
      this.game = change(this.game)
    } catch (error) {
      this.log(`update failed: ${reasonOf(error)}`)
      return
    } finally {
      this.insideGameCode = false
    }
    this.afterGameChanged()
  }

  // ─── Idle players ─────────────────────────────────────────────────
  // The game says whose move it's waiting for (room.onTheClock). A connected human on the clock who does nothing
  // (no move, no "active" tap) is warned after idleWarnAfterMs, and a bot plays their seat after idleTakeoverAfterMs —
  // mid-turn, as if they'd dropped out. Any tap or move from them gives the seat straight back.

  /** RoomTools.onTheClock — the seats the game is waiting for now. A seat that stays on the clock keeps its clock. */
  private setOnTheClock(seatIds: string[]): void {
    const before = this.onClock
    this.onClock = new Set(seatIds)
    for (const seatId of before) {
      if (!this.onClock.has(seatId)) this.stopIdleClock(seatId)
    }
    for (const seatId of this.onClock) {
      if (!before.has(seatId)) this.restartIdleClock(seatId)
    }
  }

  /** A fresh idle clock for this seat — only if the game waits for it and its player is here (a human, connected). */
  private restartIdleClock(seatId: string): void {
    this.stopIdleClock(seatId)
    const seat = findSeat(this.data, seatId)
    const { idleWarnAfterMs, idleTakeoverAfterMs } = this.settings
    if (!seat || seat.kind !== 'human' || !seat.connected || !this.onClock.has(seatId) || idleTakeoverAfterMs <= 0) return
    if (idleWarnAfterMs > 0 && idleWarnAfterMs < idleTakeoverAfterMs) {
      this.timers.start(idleWarnTimer(seatId), idleWarnAfterMs, () => {
        this.warned.add(seatId)
        this.sendToSeat(seatId, { type: 'idle_warning', msLeft: this.timers.msLeft(idleTakeoverTimer(seatId)) })
      })
    }
    this.timers.start(idleTakeoverTimer(seatId), idleTakeoverAfterMs, () => this.botTakesIdleSeat(seatId, 'idle too long'))
  }

  /** Stop this seat's idle clock; if their screen shows the warning, take it away. */
  private stopIdleClock(seatId: string): void {
    this.timers.stop(idleWarnTimer(seatId))
    this.timers.stop(idleTakeoverTimer(seatId))
    if (this.warned.delete(seatId)) this.sendToSeat(seatId, { type: 'idle_warning_off' })
  }

  /** No more waiting on anyone (game over, back to the lobby, room cleared). */
  private clearIdleClocks(): void {
    for (const seatId of this.onClock) this.stopIdleClock(seatId)
    this.onClock.clear()
  }

  /** Idle too long, or the game's turn timer ran out (RoomTools.timedOut): a bot plays the seat until its player is active again. */
  private botTakesIdleSeat(seatId: string, why: string): void {
    this.stopIdleClock(seatId)
    const seat = findSeat(this.data, seatId)
    if (this.data.phase !== 'playing' || !seat || seat.kind !== 'human') return
    handToBot(this.data, seatId)
    this.timers.stop(botTakeoverTimer(seatId)) // (if they'd dropped out as well, the bot already has it)
    this.log(`a bot took ${seat.name}'s seat (${why})`)
    this.seatChanged(seatId, 'bot')
    this.afterSeatsChanged()
  }

  /** Tell the game a seat changed (if it wants to know). */
  private seatChanged(seatId: string, change: SeatChange): void {
    const seat = findSeat(this.data, seatId)
    if (!seat || !this.rules.onSeatChange || this.data.phase !== 'playing' || this.game === null) return
    if (this.insideGameCode) return
    try {
      this.insideGameCode = true
      this.game = this.rules.onSeatChange(this.game, publicSeat(seat), change, this.tools)
    } catch (error) {
      this.log(`onSeatChange failed: ${reasonOf(error)}`)
      return
    } finally {
      this.insideGameCode = false
    }
    this.afterGameChanged()
  }

  /** After every game change: is it over? Then everyone gets their own view. */
  private afterGameChanged(): void {
    if (this.game === null) return
    if (this.data.phase === 'playing' && this.rules.isOver(this.game)) {
      this.data.phase = 'over'
      this.stopGameTimers()
      this.clearIdleClocks()
      this.log('game over')
      this.sendRoomToEveryone()
    }
    for (const seatId of this.sockets.keys()) {
      const seat = findSeat(this.data, seatId)
      if (seat) this.sendView(seat)
    }
  }

  private sendView(seat: SeatRecord): void {
    if (this.game === null) return
    try {
      this.sendToSeat(seat.id, { type: 'view', view: this.rules.viewFor(this.game, publicSeat(seat)) })
    } catch (error) {
      this.log(`viewFor failed for ${seat.name}: ${reasonOf(error)}`)
    }
  }

  private stopGameTimers(): void {
    for (const name of this.timers.names()) {
      if (!name.startsWith(ROOM_TIMER)) this.timers.stop(name)
    }
  }

  // ─── Seats changed ────────────────────────────────────────────────

  /** After anyone comes or goes: clear an empty room, then show everyone the room. */
  private afterSeatsChanged(): void {
    const nobodyHere = this.sockets.size === 0
    if (nobodyHere && this.data.phase === 'lobby') {
      this.clearRoom('everyone left the lobby')
      return
    }
    if (nobodyHere && !this.timers.isRunning(EMPTY_ROOM_TIMER)) {
      // Mid-game and everyone's gone: wait a little for someone to come back
      this.timers.start(EMPTY_ROOM_TIMER, this.settings.keepEmptyRoomMs, () => this.clearRoom('nobody came back'))
    }
    if (!nobodyHere) this.timers.stop(EMPTY_ROOM_TIMER)
    this.sendRoomToEveryone()
  }

  /** Start over: no seats, no game, no timers. The code is free again. */
  private clearRoom(why: string): void {
    this.log(`room cleared (${why})`)
    for (const socket of this.sockets.values()) this.sendClosed(socket, 'room_closed')
    this.sockets.clear()
    this.clearIdleClocks()
    this.timers.stopAll()
    this.game = null
    this.data = newRoom(this.party.id)
  }

  // ─── Which seat is this connection? ───────────────────────────────

  private seatOf(connection: PartyConnection): SeatRecord | undefined {
    for (const [seatId, socket] of this.sockets) {
      if (socket === connection) return findSeat(this.data, seatId)
    }
    // Same tab id but a different object (in case the host hands us fresh objects)
    for (const [seatId, socket] of this.sockets) {
      if (socket.id === connection.id) return findSeat(this.data, seatId)
    }
    return undefined
  }

  /**
   * The seat a closing connection belonged to — or null if that seat has already moved on to a
   * newer connection. (A tab that reconnects can open its new socket BEFORE the old one's close
   * arrives; that late close must not mark the player as gone.)
   */
  private seatIdOfClosed(connection: PartyConnection): string | null {
    for (const [seatId, socket] of this.sockets) {
      if (socket === connection) return seatId
    }
    for (const [seatId, socket] of this.sockets) {
      if (socket.id === connection.id) {
        const live = this.party.getConnection(connection.id)
        return live ? null : seatId // a live socket with this id = the newer one; ignore this close
      }
    }
    return null
  }

  // ─── Sending ──────────────────────────────────────────────────────

  private send(connection: PartyConnection, message: ServerMessage): void {
    try {
      connection.send(JSON.stringify(message))
    } catch {
      // The socket is already closing — nothing to do
    }
  }

  private sendToSeat(seatId: string, message: ServerMessage): void {
    const socket = this.sockets.get(seatId)
    if (socket) this.send(socket, message)
  }

  private sendToEveryone(message: ServerMessage): void {
    for (const socket of this.sockets.values()) this.send(socket, message)
  }

  /** Each player gets the room + which seat is theirs. */
  private sendRoomToEveryone(): void {
    const room = publicRoom(this.data, this.settings)
    for (const [seatId, socket] of this.sockets) this.send(socket, { type: 'room', room, you: seatId })
  }

  private sendError(connection: PartyConnection, code: ErrorCode, message: string): void {
    this.send(connection, { type: 'error', code, message })
  }

  /** Shut this connection out of the room, saying why. */
  private sendClosed(connection: PartyConnection, reason: CloseReason): void {
    this.send(connection, { type: 'closed', reason, message: CLOSE_MESSAGES[reason] })
    try {
      connection.close()
    } catch {
      // already closed
    }
  }

  log(message: string): void {
    console.log(`[room ${this.party.id}] ${message}`)
  }
}

const CLOSE_MESSAGES: Record<CloseReason, string> = {
  left: 'You left the room.',
  kicked: 'The host removed you from the room.',
  connected_elsewhere: 'You opened the game in another tab — it has your seat now.',
  no_room: 'There\'s no room with that code.',
  code_taken: 'That room code is in use — try another.',
  room_full: 'That room is full.',
  game_started: 'That room\'s game has already started.',
  name_needed: 'Pick a name first.',
  room_closed: 'The room closed.',
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ROOM SERVER — the base a game's party/server.ts builds on.  (Server — no React, no Dev Kit, no browser code.)
//
//   // party/server.ts
//   import { RoomServer } from '../src/rooms/server/roomServer'
//   import type { PartyRoom } from '../src/rooms/server/roomServer'
//   import settings from '../content/rooms.json'
//   import { myGameRules } from './myGameRules'
//   export default class MyGameServer extends RoomServer<State, Options, Action, View, Event> {
//     constructor(party: PartyRoom) { super(party, myGameRules, settings) }
//   }
//
// party/worker.ts (PartyServer on Cloudflare) calls onConnect / onMessage / onClose / onError. This class runs
// the room (seats.ts has the rules for seats and host) and calls the game's rules (gameRules.ts) for everything
// about the game itself. One room = one room code.
// A match being played is also saved (0.10.0, F100): after each change the room is packed (savedRoom.ts) and handed
// to party/worker.ts (PartyRoom.saveRoom), which keeps it in the room's Durable Object storage — so a server restart
// loses nothing and players can come back days later (keepMatchDays). The lobby and a finished game are not kept.
import { parseClientMessage } from '../protocol'
import type { ClientMessage, CloseReason, ErrorCode, ServerMessage } from '../protocol'
import type { GameRules, RoomTools, SeatChange } from './gameRules'
import {
  addBot, backToLobby, dropOut, findSeat, findSeatOf, handToBot, joinRoom, kick,
  newRoom, playedBy, publicRoom, publicSeat, removeSeat, startPlaying, takeBack, whyNotStart,
} from './seats'
import type { RoomData, SeatRecord } from './seats'
import { jsonProblem, readSavedRoom, SAVED_ROOM_VERSION, wakeUpAt } from './savedRoom'
import type { SavedRoom } from './savedRoom'
import { readSettings } from './settings'
import type { RoomSettings } from './settings'
import { Timers } from './timers'
import { EmoteGate, readEmoteRoomSettings } from './emotes'

/** The most emote counts a room keeps before forgetting those of players who left (memory stays small). */
const MAX_EMOTE_COUNTS = 64

/** Optional extras a game's server passes (Rooms 0.12.0). */
export interface RoomServerExtras {
  /** content/emotes.json (the emotes module): players' preset phrases are relayed to every seat, checked and counted
   *  here. Without it, emote messages are dropped. */
  emotes?: unknown
}

// The bits of the host this class uses. PartyServer's Connection fits PartyConnection; party/worker.ts builds
// the PartyRoom ({ id, getConnection } via LiveConnections). Tests pass simple fakes — so none of this needs
// a live server to be tested.
export interface PartyConnection {
  id: string
  send(message: string): void
  close(): void
}
export interface PartyRoom {
  id: string
  getConnection(id: string): PartyConnection | undefined
  /**
   * Optional (0.10.0): keep the match in storage. `savedRoom` = the packed match (JSON text), or null = wipe it
   * (game over, back to the lobby, room cleared, the match expired). `wakeUpAt` = when the earliest saved timer ends
   * (ms since 1970) — set the storage alarm for it — or null for none. Called at most once per change, never for
   * a message that changed nothing. Without it the room lives in memory only (as before 0.10.0).
   */
  saveRoom?(savedRoom: string | null, wakeUpAt: number | null): void
}

// The room's own timers start with "room:" — the game's timers are everything else.
const ROOM_TIMER = 'room:'
const BOT_TAKEOVER = `${ROOM_TIMER}bot-takes-over:`
const botTakeoverTimer = (seatId: string) => `${BOT_TAKEOVER}${seatId}`
const EMPTY_ROOM_TIMER = `${ROOM_TIMER}empty`
// A match with no move for keepMatchDays ends (0.10.0)
const MATCH_EXPIRES_TIMER = `${ROOM_TIMER}match-expires`
const DAY_MS = 24 * 60 * 60 * 1000
// A match nobody has moved in, with nobody here, ends after keepUnplayedMatchHours and frees its code (0.11.0)
const UNPLAYED_TIMER = `${ROOM_TIMER}unplayed`
const HOUR_MS = 60 * 60 * 1000
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
  /** Turns a bot played for a player while they were away (seat id → count), told to them when they're back
   *  ("a bot played 3 turns for you"). A "turn" = each time the game put that seat on the clock while a bot held it. */
  private botTurns = new Map<string, number>()
  /** true while a game callback runs (so update() can't clash with it). */
  private insideGameCode = false
  /** A save is already on its way for this change (several changes in one go = one write). */
  private saveComing = false
  /** What storage holds now (the packed match), null = nothing — so an unchanged room is never written twice. */
  private lastSaved: string | null = null
  /** The storage alarm went off: the next save tells the worker when to wake again, even if the match looks the same. */
  private reportAlarm = false
  /** Why this game's state can't be saved (a Map, a Date… — see jsonProblem), or null. Then it lives in memory only. */
  private cantSave: string | null = null
  private tools: RoomTools<State, Event>
  /** The emote gate (content/emotes.json), or null when the game has no emotes. Never stored. */
  private emoteGate: EmoteGate | null
  /** Emotes arrived with no gate: logged once. */
  private toldNoEmotes = false

  constructor(party: PartyRoom, rules: GameRules<State, Options, Action, View, Event>, settings: Partial<RoomSettings> = {}, extras: RoomServerExtras = {}) {
    this.party = party
    this.rules = rules
    this.settings = readSettings(settings)
    this.emoteGate = extras.emotes === undefined ? null : new EmoteGate(readEmoteRoomSettings(extras.emotes))
    this.timers = new Timers((message) => this.log(message), () => this.changed())
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
      emote: (seatId, id) => this.emote(seatId, id),
    }
  }

  /** A seat says a preset phrase — or, from the game's own code (a server bot, F22), a banter line. The same gate as a
   *  player's: the server's count, then every seat gets it. → true if it went out. */
  emote(seatId: string, id: string): boolean {
    return this.relayEmote(seatId, id, true)
  }

  // ─── party/worker.ts calls these ──────────────────────────────────

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
      case 'emote': return void this.relayEmote(seat.id, message.id, false) // (the seat is the connection's own)
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
      if (this.settings.botTakesOverAfterMs > 0) this.startAwayTimer(seatId, this.settings.botTakesOverAfterMs)
      this.seatChanged(seatId, 'dropped')
    }
    this.afterSeatsChanged()
  }

  /** A player who's away mid-game: after `ms` a bot takes their seat (they can still come back and take it). */
  private startAwayTimer(seatId: string, ms: number): void {
    this.timers.start(botTakeoverTimer(seatId), ms, () => {
      const stillAway = findSeat(this.data, seatId)
      if (!stillAway || stillAway.kind !== 'human' || stillAway.connected) return
      handToBot(this.data, seatId)
      if (this.onClock.has(seatId)) this.countBotTurn(seatId) // (taken over mid-turn: the bot plays this one)
      this.log(`a bot took ${stillAway.name}'s seat (away too long)`)
      this.seatChanged(seatId, 'bot')
      this.afterSeatsChanged()
    })
  }

  /** The storage alarm woke the room: run every timer that's due now. (party/worker.ts onAlarm) */
  wakeUp(): void {
    this.timers.runDue()
    // The worker's alarm is spent: always say when to wake next, even if nothing that's kept changed (the alarm can
    // also go off a moment early, with nothing due yet) — otherwise no alarm is set again and the match never ends
    // (review F100)
    this.reportAlarm = true
    this.changed()
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
    if (wasAway && this.data.phase !== 'lobby') this.sayWelcomeBack(seat.id)
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
      if (this.onClock.has(seat.id)) this.countBotTurn(seat.id)
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
    this.botTurns.clear() // (a rematch: last game's count is old news)
    this.emoteGate?.newMatch() // (each match has its own emote cap)
    startPlaying(this.data)
    this.data.personMoved = false
    this.game = state
    this.aMoveWasMade()
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
    this.botTurns.clear()
    this.clearIdleClocks()
    this.timers.stopAll() // nothing to wait for in the lobby
    this.changed() // (the lobby isn't kept: the saved match is wiped)
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
    this.data.personMoved = true // (a person played: this match waits keepMatchDays, never keepUnplayedMatchHours)
    // A move of their own: they're not idle (if the game still waits for them — e.g. the second half of a turn — their clock starts again)
    this.restartIdleClock(seat.id)
    this.aMoveWasMade()
    this.afterGameChanged()
  }

  /** An emote → every connected seat, if the gate lets it through. Dropped quietly otherwise (logged once per seat per
   *  match, no error back). Nothing is stored and nothing else changes — an emote isn't a move and never wakes a save. */
  private relayEmote(seatId: string, id: string, trusted: boolean): boolean {
    if (!this.emoteGate) {
      if (!this.toldNoEmotes) { this.toldNoEmotes = true; this.log('an emote arrived, but this server has no emotes (pass content/emotes.json to RoomServer) — dropped') }
      return false
    }
    const seat = findSeat(this.data, seatId)
    if (!seat) return false
    // Counted per PLAYER (their persistentId — never sent anywhere), so leaving the lobby and joining again as a new
    // seat never refills it; a bot seat the host added is counted by its seat
    const counter = trusted ? `seat:${seatId}` : `player:${seat.persistentId}`
    // Players coming and going in the lobby (a new id each time) would pile up counts: past MAX_EMOTE_COUNTS, only the
    // seats still here keep theirs
    if (this.emoteGate.size >= MAX_EMOTE_COUNTS) {
      this.emoteGate.forgetAllBut(new Set(this.data.seats.flatMap((s) => [`seat:${s.id}`, `player:${s.persistentId}`])))
    }
    const verdict = this.emoteGate.allow(counter, id, Date.now(), trusted)
    if (!verdict.ok) {
      if (this.emoteGate.firstDrop(counter)) this.log(`emotes from ${seatId} dropped (${verdict.why}) — said once`)
      return false
    }
    this.sendToEveryone({ type: 'emote', seat: seatId, id })
    return true
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
    this.botTurns.delete(seat.id) // (they were watching: they saw the bot's turns)
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
    this.aMoveWasMade() // (a bot's move or the game's timer counts too)
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
      if (before.has(seatId)) continue
      this.restartIdleClock(seatId)
      this.countBotTurn(seatId) // (only counts if a bot holds this seat for its player)
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
    if (this.onClock.has(seatId)) this.countBotTurn(seatId) // (taken over mid-turn: the bot plays this one)
    this.timers.stop(botTakeoverTimer(seatId)) // (if they'd dropped out as well, the bot already has it)
    this.log(`a bot took ${seat.name}'s seat (${why})`)
    this.seatChanged(seatId, 'bot')
    this.afterSeatsChanged()
  }

  // ─── Back after being away ────────────────────────────────────────
  // A player who closed the tab (or lost the connection) and comes back is told how many of their turns a bot played
  // meanwhile — so the game can say "You're back — a bot played 3 turns for you" instead of leaving them to guess why
  // the board moved on. (Rooms 0.9.0, F95.)

  /** The game put this seat on the clock, or a bot took it mid-turn: if a bot plays it for its player, count it. */
  private countBotTurn(seatId: string): void {
    const seat = findSeat(this.data, seatId)
    if (!seat || playedBy(seat) !== 'bot-for-seat') return
    this.botTurns.set(seatId, (this.botTurns.get(seatId) ?? 0) + 1)
  }

  /** Only to the player who's back: how many turns the bot played for them. Then the count starts again.
   *  Nothing played for them (a reload, a 2-second Wi-Fi drop) → nothing to say: no "You're back" toast (review F95). */
  private sayWelcomeBack(seatId: string): void {
    const botTurns = this.botTurns.get(seatId) ?? 0
    this.botTurns.delete(seatId)
    if (botTurns > 0) this.sendToSeat(seatId, { type: 'back', botTurns })
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
      this.timers.stop(MATCH_EXPIRES_TIMER)
      this.log('game over')
      // (a finished game isn't kept: if nobody's here — the bots played it out — the room clears after the usual wait)
      if (this.sockets.size === 0) this.startEmptyRoomTimer()
      this.sendRoomToEveryone()
    }
    this.changed()
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
    // A match being played that's saved waits for its players keepMatchDays (its own timer) — not just a few minutes
    const matchWaits = this.data.phase === 'playing' && this.party.saveRoom !== undefined && this.cantSave === null
    if (nobodyHere && !matchWaits && !this.timers.isRunning(EMPTY_ROOM_TIMER)) this.startEmptyRoomTimer()
    if (!nobodyHere || matchWaits) this.timers.stop(EMPTY_ROOM_TIMER)
    this.watchUnplayedMatch(nobodyHere && matchWaits)
    this.changed()
    this.sendRoomToEveryone()
  }

  /** Everyone's gone and the room isn't kept: wait a little for someone to come back (keepEmptyRoomMs), then clear it. */
  private startEmptyRoomTimer(): void {
    this.timers.start(EMPTY_ROOM_TIMER, this.settings.keepEmptyRoomMs, () => this.clearRoom('nobody came back'))
  }

  /** A move (a player's, a bot's, the game's timer — not a seat changing hands): the match is kept keepMatchDays from now. */
  private aMoveWasMade(): void {
    this.startMatchExpiry(this.settings.keepMatchDays * DAY_MS)
  }

  /** The match ends if nobody moves for this long (keepMatchDays). */
  private startMatchExpiry(ms: number): void {
    this.timers.start(MATCH_EXPIRES_TIMER, ms, () => this.clearRoom(`no move for ${this.settings.keepMatchDays} days (keepMatchDays)`))
  }

  /** A saved match nobody has made a move in yet, with nobody here: it ends after keepUnplayedMatchHours and its code
   *  is free again — so a script can't start a match in every room code and hold them all for keepMatchDays (security
   *  review, v0.11.0). Anyone coming back stops the wait; leaving again without a move starts it from the beginning. */
  private watchUnplayedMatch(nobodyHereAndKept: boolean): void {
    const hours = this.settings.keepUnplayedMatchHours
    const waits = nobodyHereAndKept && this.data.phase === 'playing' && this.data.personMoved === false && hours > 0
    if (!waits) this.timers.stop(UNPLAYED_TIMER)
    else if (!this.timers.isRunning(UNPLAYED_TIMER)) this.startUnplayedWait(hours * HOUR_MS)
  }

  private startUnplayedWait(ms: number): void {
    this.timers.start(UNPLAYED_TIMER, ms, () => this.clearRoom(`nobody made a move or came back for ${this.settings.keepUnplayedMatchHours} hours (keepUnplayedMatchHours)`))
  }

  /** Start over: no seats, no game, no timers. The code is free again. */
  private clearRoom(why: string): void {
    this.log(`room cleared (${why})`)
    for (const socket of this.sockets.values()) this.sendClosed(socket, 'room_closed')
    this.sockets.clear()
    this.clearIdleClocks()
    this.timers.stopAll()
    this.game = null
    this.botTurns.clear()
    this.data = newRoom(this.party.id)
    this.changed() // (nothing to keep: the saved match is wiped)
  }

  // ─── Kept in storage (0.10.0, F100) ───────────────────────────────
  // After each change the match is packed and handed to the host (PartyRoom.saveRoom) — once per change, however
  // many things changed in it, and only if it really changed: the Workers free plan allows 100,000 rows written a
  // day (each save = 1 row, and moving the storage alarm = 1 more), so a message that changes nothing writes nothing.

  /** Something changed: save once everything in this go is done (a moment later — a microtask). */
  private changed(): void {
    if (!this.party.saveRoom || this.saveComing) return
    this.saveComing = true
    queueMicrotask(() => {
      this.saveComing = false
      this.saveNow()
    })
  }

  private saveNow(): void {
    const saved = this.packRoom()
    if (saved) {
      const problem = jsonProblem(saved.game)
      if (problem !== this.cantSave) {
        this.cantSave = problem
        if (problem) this.log(`this match can't be saved — it lives in memory only: ${problem}`)
      }
    }
    if (!saved || this.cantSave) {
      // Nothing to keep (the lobby, a finished game, a cleared room — or a state that can't be saved): wipe what's stored
      if (this.lastSaved === null) return
      this.lastSaved = null
      this.party.saveRoom?.(null, null)
      return
    }
    const text = JSON.stringify(saved)
    const mustReport = this.reportAlarm
    this.reportAlarm = false
    if (text === this.lastSaved && !mustReport) return // (nothing that's kept changed)
    this.lastSaved = text
    this.party.saveRoom?.(text, wakeUpAt(saved))
  }

  /** The match as plain JSON — or null when there's nothing to keep (no game being played). Never the live connections. */
  packRoom(): SavedRoom<State> | null {
    if (this.data.phase !== 'playing' || this.game === null) return null
    const timersEndAt: Record<string, number> = {}
    for (const [name, endsAt] of Object.entries(this.timers.endTimes())) {
      // The idle clocks and the empty-room wait only run while someone's connected or the room isn't kept: never saved
      const kept = !name.startsWith(ROOM_TIMER) || name.startsWith(BOT_TAKEOVER) || name === MATCH_EXPIRES_TIMER || name === UNPLAYED_TIMER
      if (kept) timersEndAt[name] = endsAt
    }
    return {
      version: SAVED_ROOM_VERSION,
      data: this.data,
      game: this.game,
      botTurns: Object.fromEntries(this.botTurns),
      onClock: [...this.onClock],
      timersEndAt,
    }
  }

  /**
   * Load a saved match back (what storage held — party/worker.ts onStart). false = nothing usable (missing, broken, an
   * older shape, another code): the room starts empty and the caller wipes storage. The players' connections died
   * with the old server: each player still marked "here" is now away (a bot takes over after botTakesOverAfterMs, as
   * with any drop), and they come back by rejoining. Timers start again by name for what was left — the room's own
   * here, the game's through rules.onRestore.
   */
  restore(raw: unknown): boolean {
    const saved = readSavedRoom(raw)
    if (!saved || saved.data.code !== this.party.id) return false
    // Nobody moved for keepMatchDays while the room slept: that match has ended — it never comes back, not even for a moment
    const expires = saved.timersEndAt[MATCH_EXPIRES_TIMER]
    if (expires !== undefined && expires <= Date.now()) {
      this.log('the saved match ended while the room was asleep (keepMatchDays)')
      return false
    }
    // …and the same for a match nobody played (keepUnplayedMatchHours)
    const unplayedEnds = saved.timersEndAt[UNPLAYED_TIMER]
    if (unplayedEnds !== undefined && unplayedEnds <= Date.now()) {
      this.log('the saved match nobody played ended while the room was asleep (keepUnplayedMatchHours)')
      return false
    }
    this.data = saved.data
    this.game = saved.game as State
    this.botTurns = new Map(Object.entries(saved.botTurns))
    this.onClock = new Set(saved.onClock)
    this.lastSaved = JSON.stringify(saved) // (storage holds it — a wipe must reach it)

    const now = Date.now()
    const gameTimers: Record<string, number> = {}
    for (const [name, endsAt] of Object.entries(saved.timersEndAt)) {
      const msLeft = Math.max(0, endsAt - now)
      if (name.startsWith(BOT_TAKEOVER)) this.startAwayTimer(name.slice(BOT_TAKEOVER.length), msLeft)
      else if (name === MATCH_EXPIRES_TIMER) this.startMatchExpiry(msLeft)
      else if (name === UNPLAYED_TIMER) this.startUnplayedWait(msLeft)
      else if (!name.startsWith(ROOM_TIMER)) gameTimers[name] = endsAt
    }
    if (!this.timers.isRunning(MATCH_EXPIRES_TIMER)) this.aMoveWasMade()
    // Anyone still marked "here" lost their connection with the old server: away from now
    for (const seat of this.data.seats) {
      if (seat.kind !== 'human' || !seat.connected) continue
      dropOut(this.data, seat.id)
      if (this.settings.botTakesOverAfterMs > 0) this.startAwayTimer(seat.id, this.settings.botTakesOverAfterMs)
    }
    this.watchUnplayedMatch(true) // (nobody is here after a restart; a match nobody played starts its wait if it hadn't)
    // The game's own timers (a turn clock, a bot's next move)
    if (this.rules.onRestore) {
      try {
        this.insideGameCode = true
        this.game = this.rules.onRestore(this.game, this.tools, gameTimers)
      } catch (error) {
        this.log(`onRestore failed: ${reasonOf(error)}`)
      } finally {
        this.insideGameCode = false
      }
    } else if (Object.keys(gameTimers).length > 0) {
      this.log(`the game had timers running (${Object.keys(gameTimers).join(', ')}) but its rules have no onRestore — they're gone`)
    }
    this.log(`match loaded from storage (${this.data.seats.length} seats)`)
    this.changed()
    return true
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

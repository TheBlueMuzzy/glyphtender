// THE TURN CLOCK — after every change: whose turn is it, and does the server have to play it?
//   · whoever it is, the rooms module's idle clock watches them (room.onTheClock — rooms.json idleWarnAfterMs /
//     idleTakeoverAfterMs): a person who does nothing gets a draining bar, then a bot plays for them until they tap
//   · a bot has the seat (the host added an AI, or the player left, idled, ran out of turn time, or stayed away past
//     botTakesOverAfterMs)
//     → the AI plays it at a person's pace: it "thinks" for a moment first (content/ai/pace.json at Normal speed —
//     the same pauses as an AI on a phone), then plays ONE action (a draft placement, a turn, or its refresh), so the
//     others watch it happen like any player's turn
//   · the host turned the timer on → the turn (incl. its refresh) must be played in time; if not, a bot takes the
//     seat at once (room.timedOut — the same takeover as idling: a tap gives it back) and plays on at a person's pace
// Turns the server plays: the real AI (F43) — the seat's own (a host-added AI seat carries "<personality>/<skill>",
// aiSeats.ts) or the default AI (Survivor at First Class, store/seats.ts defaultAi) for a seat a bot took over.
// It decides from that seat's VIEW only (rules.viewFor), never the whole game (F36). It thinks right here in the room
// (a Durable Object: up to 30 s of CPU per event; a decision takes ~0.05–0.3 s at First Class — TDD D79, measured by
// npm run ai:server-timing against pace.json serverBudgetMs). If the AI ever fails, or names a move the rules refuse,
// the greedy bot plays that one action instead ("keep all" on a refresh), so a game never freezes.
import paceFile from '../content/ai/pace.json'
import { thinkDelay, type Pace } from '../src/ai/kit/pace'
import { seatThinking, type ThinkRequest, type ThinkResult } from '../src/ai/seatBrain'
import type { RoomTools, SeatChange } from '../src/rooms/server/gameRules'
import { greedyBot } from '../src/engine/bot'
import { glyphtenderRules, viewFor } from '../src/engine/rules'
import type { Action, GameState, WordList } from '../src/engine/types'
import { aiOf } from './aiSeats'
import { play, type ServerGame } from './serverGame'

const TURN_TIMER = 'turn'
const BOT_TIMER = 'bot'

/** content/ai/pace.json in the AI kit's Pace shape (the server plays at Normal speed). */
const pace: Pace = { think: paceFile.thinkSeconds, speeds: paceFile.speeds, timeBudgetMs: paceFile.serverBudgetMs }
/** The kind of action (pace.json thinkSeconds) for the step the game is at. */
const paceKind = (game: GameState) => (game.phase === 'draft' ? 'draft' : game.phase === 'refresh' ? 'refresh' : 'moveCast')

// The AI's thinking for the word list, made once per server copy and SHARED by every room on it — safe only because
// the brain keeps nothing between decisions. Give the AI memory (beliefs, mode stickiness) → key this by room first.
let thinking: { words: WordList; think: (request: ThinkRequest) => ThinkResult } | null = null
const thinkingFor = (words: WordList) => (thinking?.words === words ? thinking : (thinking = { words, think: seatThinking(words) })).think

/** Starts (or stops) the timers for whoever plays next, and says when their turn runs out. */
export function planNextTurn(state: ServerGame, room: RoomTools<ServerGame, never>, words: () => WordList): ServerGame {
  const { game } = state
  room.timers.stop(BOT_TIMER)
  if (game.phase === 'over') {
    room.timers.stop(TURN_TIMER)
    room.onTheClock([])
    return { ...state, turnEndsAt: null }
  }
  const seatId = state.seatIds[game.current]
  // The game waits for this seat (a draft placement, a turn, or its refresh): the room's idle clock watches it
  // (it skips a seat a bot holds, and keeps the clock running when the same seat stays on — e.g. move → refresh)
  room.onTheClock([seatId])
  const seat = room.seats().find((s) => s.id === seatId)
  if (!seat || seat.kind === 'bot') {
    room.timers.stop(TURN_TIMER)
    // (a room started before F43 has no paceRng: it starts from the bot's)
    const delay = thinkDelay(pace, paceKind(game), 'normal', state.paceRng ?? state.botRng ^ 0xface)
    room.timers.start(BOT_TIMER, delay.ms, () => room.update((now) => botStep(now, room, words)))
    return { ...state, turnEndsAt: null, paceRng: delay.rng }
  }
  if (state.options.turnSeconds <= 0) return { ...state, turnEndsAt: null }
  // The refresh after a turn is still the same turn: its clock keeps running
  if (game.phase === 'refresh' && room.timers.isRunning(TURN_TIMER)) return state
  const ms = state.options.turnSeconds * 1000
  // Out of time: a bot takes the seat now (onSeatChange 'bot' → it plays on, at a person's pace)
  room.timers.start(TURN_TIMER, ms, () => room.timedOut(seatId))
  return { ...state, turnEndsAt: Date.now() + ms }
}

/**
 * A seat changed mid-game (a bot took it, or its player is back). Only the seat whose turn it is matters:
 * a bot took it → the bot plays; its player took it back from a bot → their clock starts. A player who
 * dropped out and came straight back keeps the clock that was already running — otherwise reconnecting
 * would be a way to get more time (and anyone else's reconnect would restart the current player's clock).
 */
export function afterSeatChange(state: ServerGame, seatId: string, change: SeatChange, room: RoomTools<ServerGame, never>, words: () => WordList): ServerGame {
  if (change === 'dropped' || seatId !== state.seatIds[state.game.current]) return state
  if (change === 'back' && room.timers.isRunning(TURN_TIMER)) return state
  return planNextTurn(state, room, words)
}

/**
 * The AI's next action for the seat whose turn it is, from that seat's view only. Never throws: if the AI fails or
 * names a move the rules refuse, the greedy bot's move (or "keep all" on a refresh) is played instead.
 */
export function aiAction(state: ServerGame, room: RoomTools<ServerGame, never>, words: WordList): { action: Action; rng: number } {
  const seat = state.game.current
  const view = viewFor(state.game, seat) // (it sees only what that seat may see)
  const ai = aiOf(room.seats().find((s) => s.id === state.seatIds[seat])?.profile)
  try {
    const answer = thinkingFor(words)({ view, seat, rng: state.botRng, personalityId: ai.personality, skillId: ai.skill })
    const problem = glyphtenderRules(words).check(state.game, seat, answer.action)
    if (problem) throw new Error(problem)
    return answer
  } catch (error) {
    room.log(`the AI could not decide for seat ${seat} (${error instanceof Error ? error.message : String(error)}) — playing a simple move instead`)
    if (state.game.phase === 'refresh') return { action: { type: 'refresh', setAside: [] }, rng: state.botRng }
    return greedyBot(words)(view, seat, state.botRng)
  }
}

/** A bot's seat: the AI plays ONE action (a draft placement, a turn, or its refresh), then the clock moves on. */
export function botStep(state: ServerGame, room: RoomTools<ServerGame, never>, words: () => WordList): ServerGame {
  const seat = state.game.current
  const picked = aiAction(state, room, words())
  const next = { ...play(state, seat, picked.action, words()), botRng: picked.rng }
  return planNextTurn(next, room, words)
}

// GLYPHTENDER'S RULES ON THE SERVER — the plug-in the rooms module runs (src/rooms/server/gameRules.ts).
// It never re-writes a rule: it runs the SAME engine as the phones (src/engine — golden rule).
// The server makes the game with its own random seed and keeps the bag, the rng and every hand;
// players only send intentions ("move glyphling 2 there, cast seed-31 here"), which are checked here:
// the right shape → the right player → planned on the latest version → legal (the rules' check) → the rules' apply
// (src/engine/rules.ts — the one door; serverGame.ts play also writes each move into the game's move record).
// Design: .planning/design/online.md.
import roomsJson from '../content/rooms.json'
import { boardNames, defaultBoardFor } from '../src/engine/boards'
import { pickFirstSeat } from '../src/engine/setup'
import { flowOf, glyphtenderRules, type GameSetup } from '../src/engine/rules'
import { mayAct } from '../src/table/flow'
import type { Action, WordList } from '../src/engine/types'
import { emptyStats } from '../src/store/stats'
import { mustBeListWithoutRepeats, mustBeObject, mustBeOneOf, mustBeText, mustBeTrueOrFalse, mustBeWholeNumber, nullOr } from '../src/rooms/server/checks'
import type { GameRules } from '../src/rooms/server/gameRules'
import type { OnlineAction, OnlineOptions, GameView } from './protocol'
import { afterSeatChange, planNextTurn } from './turnClock'
import { botProfile } from './aiSeats'
import { play, type ServerGame } from './serverGame'
import { viewOf } from './views'

export type Rules = GameRules<ServerGame, OnlineOptions, OnlineAction, GameView, never>

/** What the rules need from outside: the word list, and a random number for each new game's seed. */
export interface RulesSetup {
  words: () => WordList
  randomSeed?: () => number
  /** Tests: Yellow always goes first, whatever rules.json "randomFirstPlayer" says. */
  yellowFirst?: boolean
}

// Hexes and glyphling ids are small whole numbers; anything bigger is junk.
const BIG = 64
/** A seed is named by its id (F33): "seed-0" … "seed-119" — text, never a hand position. Anything else is junk;
 *  a well-formed id that isn't in your hand is refused by the rules ("That seed is not in your hand"). */
const seedIdOf = (raw: unknown) => {
  const id = mustBeText(raw, 16, 'seed')
  if (!/^seed-\d{1,4}$/.test(id)) throw new Error('seed must be a seed id like "seed-12"')
  return id
}
const hexOf = (raw: unknown, what: string) => {
  const hex = mustBeObject(raw, what)
  return { q: mustBeWholeNumber(hex.q, -BIG, BIG, `${what}.q`), r: mustBeWholeNumber(hex.r, -BIG, BIG, `${what}.r`) }
}

/** A player's raw action → an engine Action of the right shape (the engine then says if it's legal). */
function engineActionOf(raw: unknown): Action {
  const action = mustBeObject(raw, 'action')
  const type = mustBeOneOf(action.type, ['draft', 'turn', 'refresh'], 'action type')
  if (type === 'draft') return { type, hex: hexOf(action.hex, 'hex') }
  if (type === 'refresh') {
    return { type, setAside: mustBeListWithoutRepeats(action.setAside, BIG, seedIdOf, 'setAside') }
  }
  return {
    type,
    glyphling: mustBeWholeNumber(action.glyphling, 0, BIG, 'glyphling'),
    to: hexOf(action.to, 'to'),
    seed: nullOr(action.seed, seedIdOf),
    target: nullOr(action.target, (target) => hexOf(target, 'target')),
  }
}

// A secret random number (0 … 2^31-1) from the server's cryptographic source. Not Math.random: its next
// numbers can be worked out from earlier ones, and players see some of them (gameId, the seed at game over).
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1

export function makeRules({ words, randomSeed: seedMaker = randomSeed, yellowFirst = false }: RulesSetup): Rules {
  return {
    checkOptions(raw) {
      const options = mustBeObject(raw ?? {}, 'options')
      const timers = roomsJson.turnTimerChoices
      const turnSeconds = options.turnSeconds ?? timers[0]
      if (typeof turnSeconds !== 'number' || !timers.includes(turnSeconds)) throw new Error(`The turn timer must be one of: ${timers.join(', ')}`)
      return {
        boardName: mustBeOneOf(options.boardName ?? 'auto', ['auto', ...boardNames()], 'board'),
        minWordLength: mustBeWholeNumber(options.minWordLength ?? 2, 2, 3, 'minWordLength'),
        turnSeconds,
        wordIndicators: mustBeTrueOrFalse(options.wordIndicators ?? true, 'wordIndicators'),
      }
    },

    checkAction(raw) {
      const message = mustBeObject(raw, 'message')
      const kind = mustBeOneOf(message.kind, ['play', 'sync'], 'kind')
      if (kind === 'sync') return { kind }
      return { kind, action: engineActionOf(message.action), version: mustBeWholeNumber(message.version, 0, 1_000_000, 'version') }
    },

    onStart(options, seats, room) {
      const players = seats.length
      const seed = seedMaker()
      // The engine's bag comes from ONE seed (2^31 choices): a PC can try them all against its own dealt hand
      // (~30 min on one core) and rebuild every hand and the whole bag. So online the bag is shuffled again with
      // a second secret number, and the rng (where set-aside seeds go back) gets a third — nothing to rebuild.
      // All three are part of the setup, so the move record replays the game exactly (they never leave the server).
      const bagSeed = seedMaker()
      const rngSeed = seedMaker()
      const setup: GameSetup = {
        players, seed,
        firstSeat: yellowFirst ? 0 : pickFirstSeat(players, bagSeed), // who goes first (GDD §9) — from a secret number already drawn
        boardName: options.boardName === 'auto' ? defaultBoardFor(players) : options.boardName,
        rules: { minWordLength: options.minWordLength },
        bagSeed, rngSeed,
      }
      const game = glyphtenderRules(words()).setup(setup)
      const state: ServerGame = {
        game, gameId: seedMaker(), version: 0, record: { setup, moves: [] }, feed: [], lastOwnAction: seats.map(() => 0),
        seatIds: seats.map((s) => s.id), names: seats.map((s) => s.name),
        options, change: 'start', by: null,
        stats: emptyStats(players), turnEndsAt: null, botRng: seed ^ 0x5eed, paceRng: seedMaker(),
      }
      return planNextTurn(state, room, words)
    },

    onAction(state, seat, message, room) {
      // "Send me my view again": nothing changes — the same state back, so only the sender is sent their view
      if (message.kind === 'sync') return state
      const mine = state.seatIds.indexOf(seat.id)
      if (mine < 0) throw new Error('You aren’t playing in this game.')
      if (state.game.phase === 'over') throw new Error('The game is over.')
      if (!mayAct(flowOf(state.game), mine)) throw new Error('It’s not your turn.') // (the rules' turn flow)
      if (message.version !== state.version) throw new Error('The game moved on — try again.')
      const problem = glyphtenderRules(words()).check(state.game, mine, message.action)
      if (problem) throw new Error(problem)
      const next = play(state, mine, message.action, words())
      // (remember which change this seat's own action made — its view tells its screen the move got through, B021)
      // (a room started before B021 has no lastOwnAction yet: everyone starts at 0)
      const lastOwnAction = (next.lastOwnAction ?? next.game.hands.map(() => 0)).map((change, seat) => (seat === mine ? next.version : change))
      return planNextTurn({ ...next, lastOwnAction }, room, words)
    },

    viewFor: (state, seat) => viewOf(state, seat.id),

    isOver: (state) => state.game.phase === 'over',

    // The host adds an AI seat in the lobby: "<personality>/<skill>" (aiSeats.ts) → the seat's profile and name
    botProfile,

    // A bot took a seat (the player left, idled or stayed away): if it's that seat's turn, it plays now.
    // A player took their seat back from a bot on their turn: their clock starts (turnClock.ts).
    onSeatChange: (state, seat, change, room) => afterSeatChange(state, seat.id, change, room, words),
  }
}

// THE GAME AS THE SERVER KEEPS IT — the whole truth (every hand, the bag, the rng, all Magic) plus the
// room's bookkeeping. It is never sent to anyone as is: views.ts cuts one player's view out of it.
// Every change goes through the rules' one door (src/engine/rules.ts) and is written into the move record.
import { glyphtenderRules, type GameSetup } from '../src/engine/rules'
import type { Action, GameState, WordList } from '../src/engine/types'
import { addMove, type MoveRecord } from '../src/table/core'
import { addTurn, type PlayerStats } from '../src/store/stats'
import type { Change, OnlineOptions } from './protocol'

/** The whole game as the server keeps it (never sent to anyone as is). */
export interface ServerGame {
  game: GameState
  gameId: number
  version: number
  /** Room seat ids in seat order (seat 0 = Yellow…). */
  seatIds: string[]
  names: string[]
  options: OnlineOptions
  change: Change
  by: number | null
  /** The end table's numbers, gathered on the server turn by turn (D21). */
  stats: PlayerStats[]
  turnEndsAt: number | null
  /** The random position for turns the server plays itself (timer ran out, a bot has the seat). */
  botRng: number
  /** The whole game as a replayable record: its setup (WITH the secret seed numbers) + every move in order.
   *  SECRET: never sent to anyone (views.ts builds each view field by field and leaves it out; server.test checks). */
  record: MoveRecord<GameSetup, Action>
}

/** Plays one action for `seat` through the rules (throws if they say no), keeps the end-table numbers and
 *  writes the move into the record. (Normal mode, not fast: the end screen reads the game log.) */
export function play(state: ServerGame, seat: number, action: Action, words: WordList): ServerGame {
  const game = glyphtenderRules(words).apply(state.game, seat, action).state
  const stats = action.type === 'turn' && game.lastTurn ? addTurn(state.stats, game.lastTurn) : state.stats
  const record = addMove(state.record, seat, action)
  return { ...state, game, stats, record, version: state.version + 1, change: action.type, by: seat }
}

// THE BOT — plays a seat from that seat's VIEW only (the Table's Bot: view in, action out; src/table/seats.ts). It
// sees exactly what a person in that seat would: its own seeds and the public board — never the bag, the other
// players' seeds or the Magic (rules.viewFor hides them). For now it's the engine's greedy sim player (sim.ts: tries
// 20 random turns and keeps the one making the most Magic; drafts and refreshes stay random). The beta AI swaps in here.
// Used by the server (party/turnClock.ts: a bot has the seat, or a turn timer ran out) and by a bot seat on this
// device (store/localBot.ts — tests and the Dev Kit only).
import type { SeatView } from './rules'
import { greedyAction } from './sim'
import type { Action, WordList } from './types'
import type { Bot } from '../table/seats'

/** The greedy bot for this word list. `view` must be the bot's own seat's view (rules.viewFor(game, seat)). */
export const greedyBot = (words: WordList): Bot<SeatView, Action> => (view, _seat, rng) => greedyAction(view, rng, words)

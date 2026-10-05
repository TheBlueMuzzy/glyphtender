// THE BOT — plays a seat from that seat's VIEW only (the Table's Bot: view in, action out; src/table/seats.ts). It
// sees exactly what a person in that seat would: its own seeds and the public board — never the bag, the other
// players' seeds or the Magic (rules.viewFor hides them). For now it's the engine's greedy sim player (sim.ts: tries
// 20 random turns and keeps the one making the most Magic; drafts and refreshes stay random). The beta AI swaps in here.
// Used by the server (party/turnClock.ts: a bot has the seat, or a turn timer ran out) and by a bot seat on this
// device in tests (store/localBot.ts playLocalBot). AI seats on this device play aiBot through src/ai/thinker.ts (F42).
import type { SeatView } from './rules'
import { greedyAction } from './sim'
import type { Action, WordList } from './types'
import type { Bot } from '../table/seats'
import { asBot, makeBrain } from '../ai/kit/brain'
import type { Decision, Mode, Personality, Skill } from '../ai/kit/types'
import modesFile from '../../content/ai/modes.json'
import { glyphtenderPlug } from '../ai/plug'

/** The greedy bot for this word list. `view` must be the bot's own seat's view (rules.viewFor(game, seat)). */
export const greedyBot = (words: WordList): Bot<SeatView, Action> => (view, _seat, rng) => greedyAction(view, rng, words)

/** The AI (beta): a brain (src/ai/kit/brain.ts) with Glyphtender's instincts (src/ai/plug.ts), one personality and one
 *  skill (data: content/ai/). `onDecision` hears each decision's note (Dev Kit, the arena, bug reports — never players).
 *  Like greedyBot it sees only `view` = rules.viewFor(game, seat). (The server keeps greedyBot until F43.) */
/** Glyphtender's AI modes — fight · flight · focus (content/ai/modes.json; personalities switch into them). */
export const MODES = modesFile.modes as unknown as Mode[] // (JSON infers each mode separately; the shape is checked in aiContent.test)

export function aiBot(personality: Personality, skill: Skill, words: WordList, onDecision?: (decision: Decision<Action>, seat: number) => void): Bot<SeatView, Action> {
  return asBot(makeBrain(glyphtenderPlug(words, skill.beliefNoise), personality, skill, MODES), onDecision)
}

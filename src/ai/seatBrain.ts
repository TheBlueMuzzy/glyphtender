// ONE AI DECISION FOR A SEAT — the work the AI's thinker does (think.worker.ts in the background, or right here in
// tests). A request names the seat's personality and skill (content/ai/personalities.json · skills.json) and carries
// ONLY that seat's view (rules.viewFor — never the bag or the other seeds); the answer is the action, the bot's next
// random position (so its picks are repeatable) and the decision's note (Dev Kit / bug reports — never players).
// One bot per seat + personality + skill, made the first time it's asked and kept for the rest of the game.
import personalitiesFile from '../../content/ai/personalities.json'
import skillsFile from '../../content/ai/skills.json'
import { aiBot } from '../engine/bot'
import type { SeatView } from '../engine/rules'
import type { Action, WordList } from '../engine/types'
import type { Decision, Personality, Skill } from './kit/types'

export interface ThinkRequest {
  view: SeatView
  seat: number
  rng: number
  /** An id from content/ai/personalities.json, e.g. "Bully". */
  personalityId: string
  /** An id from content/ai/skills.json, e.g. "FirstClass". */
  skillId: string
}

export interface ThinkResult {
  action: Action
  rng: number
  note: string
  /** The whole decision (goal rolls, readings, traits…) for the Dev Kit's AI tab. */
  decision: Decision<Action>
}

export const personalities: Personality[] = personalitiesFile.personalities
export const skills: Skill[] = skillsFile.skills

/** Who plays an AI seat nobody chose for (tests, the Dev Kit, a stand-in): Balanced at First Class. */
export const DEFAULT_PERSONALITY = 'Balanced'
export const DEFAULT_SKILL = 'FirstClass'

const personalityById = (id: string) => personalities.find((p) => p.id === id) ?? personalities.find((p) => p.id === DEFAULT_PERSONALITY)!
const skillById = (id: string) => skills.find((s) => s.id === id) ?? skills.find((s) => s.id === DEFAULT_SKILL)!

/** One seat's bot and the last decision it reported (a bot tells its decisions to its onDecision listener). */
interface SeatBot {
  play: ReturnType<typeof aiBot>
  last: Decision<Action> | null
}

/** The thinking for one game's word list: request in, decision out. */
export function seatThinking(words: WordList): (request: ThinkRequest) => ThinkResult {
  const bots = new Map<string, SeatBot>()
  const botFor = (seat: number, personalityId: string, skillId: string): SeatBot => {
    const key = `${seat} ${personalityId} ${skillId}`
    let bot = bots.get(key)
    if (!bot) {
      const made: SeatBot = { play: () => { throw new Error('not made yet') }, last: null }
      made.play = aiBot(personalityById(personalityId), skillById(skillId), words, (decision) => { made.last = decision })
      bots.set(key, made)
      bot = made
    }
    return bot
  }
  return ({ view, seat, rng, personalityId, skillId }) => {
    const bot = botFor(seat, personalityId, skillId)
    const picked = bot.play(view, seat, rng)
    const decision = bot.last!
    return { action: picked.action, rng: picked.rng, note: decision.note, decision }
  }
}

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
import { defaultAi } from '../store/seats'

export interface ThinkRequest {
  view: SeatView
  seat: number
  rng: number
  /** An id from content/ai/personalities.json, e.g. "Bully". */
  personalityId: string
  /** An id from content/ai/skills.json, e.g. "FirstClass". */
  skillId: string
  /** The Dev Kit's ▶ Watch: these (unsaved) settings instead of the files' ids. Plain JSON, so it crosses to the worker. */
  custom?: { personality: Personality; skill: Skill }
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

// An unknown id (a renamed personality in an old save, say) plays as the default AI (store/seats.ts defaultAi)
const personalityById = (id: string) => personalities.find((p) => p.id === id) ?? personalities.find((p) => p.id === defaultAi().personality)!
const skillById = (id: string) => skills.find((s) => s.id === id) ?? skills.find((s) => s.id === defaultAi().skill)!

/** One seat's bot and the last decision it reported (a bot tells its decisions to its onDecision listener). */
interface SeatBot {
  play: ReturnType<typeof aiBot>
  last: Decision<Action> | null
}

/** The thinking for one game's word list: request in, decision out. */
export function seatThinking(words: WordList): (request: ThinkRequest) => ThinkResult {
  const bots = new Map<string, SeatBot>()
  const botFor = (seat: number, personalityId: string, skillId: string, custom?: ThinkRequest['custom']): SeatBot => {
    const key = custom ? `${seat} custom ${JSON.stringify(custom)}` : `${seat} ${personalityId} ${skillId}`
    let bot = bots.get(key)
    if (!bot) {
      const made: SeatBot = { play: () => { throw new Error('not made yet') }, last: null }
      const personality = custom?.personality ?? personalityById(personalityId)
      const skill = custom?.skill ?? skillById(skillId)
      made.play = aiBot(personality, skill, words, (decision) => { made.last = decision })
      bots.set(key, made)
      bot = made
    }
    return bot
  }
  return ({ view, seat, rng, personalityId, skillId, custom }) => {
    const bot = botFor(seat, personalityId, skillId, custom)
    const picked = bot.play(view, seat, rng)
    const decision = bot.last!
    return { action: picked.action, rng: picked.rng, note: decision.note, decision }
  }
}

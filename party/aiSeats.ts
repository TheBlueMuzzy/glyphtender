// ONLINE AI SEATS (F43) — which AI plays a bot seat, shared by the server (party/) and the lobby (src/ui/online/).
// The host adds an AI seat in the lobby with a profile: "<personality id>/<skill id>" (content/ai/personalities.json ·
// skills.json), e.g. "Survivor/FirstClass". The rooms module keeps it on the seat (room Seat.profile) and names the
// seat after the personality (en.json ai.personality.<id>.name, "The Survivor"; a second one is "The Survivor 2").
// A seat a bot took over (its player left, idled or stayed away) has no profile: the default AI plays it
// (store/seats.ts defaultAi — the Survivor at First Class).
// No React, no browser code here — the server imports it.
import personalitiesFile from '../content/ai/personalities.json'
import skillsFile from '../content/ai/skills.json'
import text from '../content/text/en.json'
import { defaultAi, type AiPick } from '../src/store/seats'

const personalityIds = () => personalitiesFile.personalities.map((p) => p.id)
const skillIds = () => skillsFile.skills.map((s) => s.id)

/** The profile a seat carries for this AI. */
export const profileOf = (ai: AiPick): string => `${ai.personality}/${ai.skill}`

/** A seat's profile → its AI (no profile, or one naming a personality / skill that's gone → the default AI). */
export function aiOf(profile: string | undefined): AiPick {
  const [personality, skill] = (profile ?? '').split('/')
  const fallback = defaultAi()
  return {
    personality: personalityIds().includes(personality) ? personality : fallback.personality,
    skill: skillIds().includes(skill) ? skill : fallback.skill,
  }
}

/** The personality's name for players, starting with a capital ("the Survivor" → "The Survivor"). */
export function aiName(personality: string): string {
  const name = (text.ai.personality as Record<string, { name: string }>)[personality]?.name ?? personality
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** The rooms module's botProfile (src/rooms/server/gameRules.ts): a profile the host sent → checked, with its name. */
export function botProfile(raw: string): { profile: string; name: string } {
  const [personality, skill, extra] = raw.split('/')
  if (extra !== undefined || !personalityIds().includes(personality) || !skillIds().includes(skill)) {
    throw new Error(`An AI is "<personality>/<skill>", e.g. "${profileOf(defaultAi())}"`)
  }
  return { profile: raw, name: aiName(personality) }
}

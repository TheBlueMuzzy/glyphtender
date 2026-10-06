// THE AI MODULE — FUZZY BELIEFS. What a bot believes about things it can't be sure of (a rival's secret score).
//
// Muzzy: "fuzzy knowledge always — I don't want the AI to just 'know' things… I like some sort of confidence meter."
// A belief = an estimate + a confidence (0.1–1). Turn by turn:
//   - it SAW something (the rival grew words in plain sight) → the estimate takes it in, confidence rises, and the
//     drift so far is halved (it has just checked);
//   - it saw nothing → confidence decays, and the estimate drifts a little — more the less confident it is, and more
//     for a less skilled bot (skill.beliefNoise).
// Nothing is stored: the game hands over the seat's own history of what it saw, and the same history + the same key
// always gives the same belief — so a rejoin, a server restart or a replay believes exactly the same thing.
import { nextRandom } from './random'

export interface BeliefSettings {
  /** Confidence lost per turn it saw nothing. */
  decayPerTurn: number
  /** Confidence gained per turn it saw something. */
  gainWhenSeen: number
  minConfidence: number
  /** The most the estimate can drift in one unseen turn, at zero confidence (scaled by 0.5 + skill.beliefNoise). */
  drift: number
}

/** The original Glyphtender's numbers (AIConstants.cs). */
export const defaultBeliefSettings: BeliefSettings = { decayPerTurn: 0.05, gainWhenSeen: 0.08, minConfidence: 0.1, drift: 3 }

export interface Belief {
  estimate: number
  confidence: number
}

/** A belief from a history: for each turn so far, what was seen added (a number, may be 0) or null (nothing seen).
 *  `noise` = skill.beliefNoise (0–1); `key` = a number unique to this bot + this thing (e.g. game seed × seat × rival). */
export function believe(history: readonly (number | null)[], noise: number, key: number, settings: BeliefSettings = defaultBeliefSettings): Belief {
  let seenTotal = 0
  let confidence = 1
  let drift = 0
  let rng = key
  for (const seen of history) {
    const r = nextRandom(rng)
    rng = r.rng
    if (seen !== null) {
      seenTotal += seen
      confidence = Math.min(1, confidence + settings.gainWhenSeen)
      drift /= 2
    } else {
      confidence = Math.max(settings.minConfidence, confidence - settings.decayPerTurn)
      drift += (r.value * 2 - 1) * settings.drift * (1 - confidence) * (0.5 + noise)
    }
  }
  return { estimate: Math.max(0, Math.round((seenTotal + drift) * 10) / 10), confidence: Math.round(confidence * 100) / 100 }
}

/** How far ahead it believes it is: its own (known) score minus the highest rival estimate. Negative = behind. */
export function believedLead(myScore: number, rivals: readonly Belief[]): number {
  if (!rivals.length) return 0
  return Math.round((myScore - Math.max(...rivals.map((b) => b.estimate))) * 10) / 10
}

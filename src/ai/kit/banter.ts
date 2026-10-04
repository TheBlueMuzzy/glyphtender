// THE AI MODULE — BANTER. Should this bot say something at this moment, and what?
//
// The game names its moments from its events ("tangledRival", "gotTangled", "stoleWord", "calledIt", "won"…) and
// keeps the lines as data (per personality, per moment). This picks: a chance per moment (settings) × the
// personality's chattiness, nothing again for a few turns after it spoke (cooldown — some moments may skip it), and a
// line it hasn't said lately. Memory is plain JSON the game keeps per bot seat.
import { nextRandom } from './random'

export interface BanterSettings {
  /** 0–1: the chance for a fully chatty (100) personality to speak at each moment. Unlisted moments: never. */
  chance: Record<string, number>
  /** Turns of quiet after it speaks. */
  cooldownTurns: number
  /** Moments that ignore the cooldown (e.g. the end of the game). */
  alwaysAllowed?: string[]
}

export interface BanterMemory {
  /** The turn it last spoke on (−Infinity is not JSON: use null for never). */
  lastSpokeTurn: number | null
  /** Lines it has said, oldest first (so it doesn't repeat itself). */
  said: string[]
}

export const quietMemory = (): BanterMemory => ({ lastSpokeTurn: null, said: [] })

export function maybeSay(
  moment: string,
  turn: number,
  chattiness: number,
  lines: readonly string[],
  memory: BanterMemory,
  settings: BanterSettings,
  rng: number,
): { line: string | null; memory: BanterMemory; rng: number } {
  const quiet = { line: null, memory, rng }
  if (!lines.length) return quiet
  const cooling = memory.lastSpokeTurn !== null && turn - memory.lastSpokeTurn <= settings.cooldownTurns
  if (cooling && !settings.alwaysAllowed?.includes(moment)) return quiet
  const roll = nextRandom(rng)
  if (roll.value >= (settings.chance[moment] ?? 0) * (chattiness / 100)) return { ...quiet, rng: roll.rng }
  // A line it hasn't said lately: the ones never said, else the one said longest ago.
  const fresh = lines.filter((l) => !memory.said.includes(l))
  const pickFrom = fresh.length ? fresh : [memory.said.find((l) => lines.includes(l))!]
  const pick = nextRandom(roll.rng)
  const line = pickFrom[Math.floor(pick.value * pickFrom.length)]
  return { line, memory: { lastSpokeTurn: turn, said: [...memory.said.filter((l) => l !== line), line].slice(-50) }, rng: pick.rng }
}

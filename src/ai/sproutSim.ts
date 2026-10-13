// SPROUT'S SIMS (F75) — whole games of Sprout (the hidden tutorial AI) against a player-like AI, and what its two
// habits did: how often it tangled ONE of its own glyphlings (and when, and next to the rival's pieces?), how often it
// made the game-ending second tangle itself, who won, how long the games were. Used by src/ai/sprout.test.ts (a few
// games) and scripts/sprout-sim.mjs (`npm run sim:sprout`, 300 games).
import { aiBot } from '../engine/bot'
import type { WordList } from '../engine/types'
import { playArenaGame, type ArenaGame, type ArenaSeat } from './arena'
import { personalities, skills } from './seatBrain'
import tutorialTuning from '../../content/tuning/tutorial.json'

export interface SproutGame {
  /** Its own turn (1 = its first) on which Sprout's move tangled one of its own glyphlings; null = never. */
  selfTangleTurn: number | null
  /** …and that glyphling had rival pieces next to it at the end (so the rival earned a tangle bonus from it). */
  nextToRival: boolean
  /** Sprout's own turn ended the game by tangling its other glyphling. */
  endedBySelfTangle: boolean
  /** Its own turns played by the end (so an ending can be told apart: while its habits were on, or after maxTurns). */
  ownTurns: number
  /** Sprout's turn ended the game at all (any tangle, its own or the rival's). */
  endedBySprout: boolean
  sproutWon: boolean
  rivalWon: boolean
  /** Completed turns, both players together. */
  turns: number
}

export interface SproutSimOptions {
  games: number
  /** The rival's personality and skill ids (content/ai/). */
  rival?: { personality: string; skill: string }
  boardName?: string
  /** 3 = 2-letter words off (standard play). */
  minWordLength?: number
  firstSeed?: number
  onGame?: (done: number) => void
}

const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id) ?? (() => { throw new Error(`No "${id}" in content/ai/`) })()

/** What Sprout's habits did in one finished game (Sprout at seat `seat`). */
export function sproutFacts(played: ArenaGame, seat: number): SproutGame {
  const { game } = played
  const turns = game.log?.turns ?? []
  const end = game.log?.end ?? null
  const mine = new Set(game.glyphlings.filter((g) => g.seat === seat).map((g) => g.id))
  let own = 0
  let selfTangleTurn: number | null = null
  let glyphling: number | null = null
  for (const t of turns) {
    if (t.seat !== seat) continue
    own++
    const tangledMine = t.newlyTangled.find((id) => mine.has(id))
    if (tangledMine !== undefined && selfTangleTurn === null && !(end && end.endedOnTurn === t.turnNo)) {
      selfTangleTurn = own
      glyphling = tangledMine
    }
  }
  const tangle = end?.tangles.find((x) => x.glyphling === glyphling)
  return {
    selfTangleTurn,
    nextToRival: !!tangle && tangle.pieces.some((n, s) => s !== seat && n > 0),
    endedBySelfTangle: !!end && end.endedBy === seat && end.selfTangle,
    ownTurns: own,
    endedBySprout: !!end && end.endedBy === seat,
    sproutWon: game.winners.includes(seat),
    rivalWon: game.winners.some((w) => w !== seat),
    turns: game.turnCount,
  }
}

/** Sprout (Seedling skill) vs the rival, 2 players; Sprout sits second (Blue, like the tutorial game), every game. */
export function playSproutGames(words: WordList, options: SproutSimOptions): SproutGame[] {
  const rival = options.rival ?? { personality: 'Survivor', skill: 'Apprentice' }
  const seats: ArenaSeat[] = [
    { personality: byId(personalities, rival.personality), skill: byId(skills, rival.skill) },
    { personality: byId(personalities, 'sprout'), skill: byId(skills, 'seedling') },
  ]
  const out: SproutGame[] = []
  for (let g = 0; g < options.games; g++) {
    const played = playArenaGame(seats, options.boardName ?? 'small', (options.firstSeed ?? 5000) + g, words,
      (s) => aiBot(s.personality, s.skill, words), 1000, { minWordLength: options.minWordLength ?? 3 })
    out.push(sproutFacts(played, 1))
    options.onGame?.(g + 1)
  }
  return out
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)

/** The numbers the design asks for (design/tutorial.md §5), as percentages and medians. */
export function sproutSummary(games: SproutGame[]) {
  const tangled = games.filter((g) => g.selfTangleTurn !== null)
  return {
    games: games.length,
    selfTangledPct: pct(tangled.length, games.length),
    medianSelfTangleTurn: median(tangled.map((g) => g.selfTangleTurn!)),
    nextToRivalPct: pct(tangled.filter((g) => g.nextToRival).length, tangled.length),
    endedBySelfTanglePct: pct(games.filter((g) => g.endedBySelfTangle).length, games.length),
    /** …of those, while its habits were still on (its own turn ≤ maxTurns, content/tuning/tutorial.json). */
    endedBySelfTangleInHabitsPct: pct(games.filter((g) => g.endedBySelfTangle && g.ownTurns <= tutorialTuning.maxTurns).length, games.length),
    medianOwnTurns: median(games.map((g) => g.ownTurns)),
    endedBySproutPct: pct(games.filter((g) => g.endedBySprout).length, games.length),
    sproutWonPct: pct(games.filter((g) => g.sproutWon).length, games.length),
    rivalWonPct: pct(games.filter((g) => g.rivalWon).length, games.length),
    medianTurns: median(games.map((g) => g.turns)),
  }
}

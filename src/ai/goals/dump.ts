// DUMP (Pragmatism) — get rid of junk letters. Scores a move by how much of a nuisance the cast letter is in its hand
// (look.ts junkiness: hard letters, copies, too many vowels…) · +3 when it's cast ≥ 3 hexes from every glyphling
// (out of everyone's way, so it can't help a rival).
import type { WordList } from '../../engine/types'
import { hexDistance, junkiness, outcomeOf } from '../look'
import { NOTHING, asTurn, type GlyphGoal } from './shared'

export const DUMP_WEIGHTS = { farAway: 3, farDistance: 3 }

export function dumpGoal(words: WordList): GlyphGoal {
  return {
    id: 'DUMP',
    trait: 'pragmatism',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn || !turn.target) return NOTHING
      const { letter, after } = outcomeOf(ctx.world, turn, words)
      if (!letter) return NOTHING
      const junk = junkiness(letter, ctx.world.hands[ctx.seat].map((s) => s.letter))
      const target = turn.target
      const far = after.glyphlings.every((g) => hexDistance(g.hex, target) >= DUMP_WEIGHTS.farDistance)
      const value = junk + (far ? DUMP_WEIGHTS.farAway : 0)
      if (junk === 0) return { value }
      return { value, why: `shed a junk ${letter}${far ? ' out of the way' : ''}` }
    },
  }
}

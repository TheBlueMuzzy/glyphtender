// SCORE (Greed) — make Magic now. Scores a move by the Magic of the words it grows that the bot KNOWS (Zipf ≥ its
// vocabulary: it can only aim for words it knows; others still score by the rules if they happen) · +2 per letter
// past 4 · + extraWordBonus per extra word (personality extras.extraWordBonus, default 3 — the Strategist's is big).
import type { WordList } from '../../engine/types'
import { knows, outcomeOf } from '../look'
import { NOTHING, asTurn, vocabulary, type GlyphGoal } from './shared'

export const SCORE_WEIGHTS = { perLetterPast4: 2, extraWordBonus: 3 }

export function scoreGoal(words: WordList): GlyphGoal {
  return {
    id: 'SCORE',
    trait: 'greed',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn) return NOTHING
      const aimed = outcomeOf(ctx.world, turn, words).made.filter((w) => knows(words, w.word, vocabulary(ctx)))
      if (!aimed.length) return NOTHING
      const extraWord = ctx.personality.extras?.extraWordBonus ?? SCORE_WEIGHTS.extraWordBonus
      const magic = aimed.reduce((s, w) => s + w.magic, 0)
      const long = aimed.reduce((s, w) => s + Math.max(0, w.hexes.length - 4), 0)
      const value = magic + SCORE_WEIGHTS.perLetterPast4 * long + extraWord * (aimed.length - 1)
      return { value, why: `spelt ${aimed.map((w) => w.word).join(' + ')} +${magic}` }
    },
  }
}

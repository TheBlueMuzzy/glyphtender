// DENY (Spite) — junk the spot a rival wanted ("weed toss"). Scores a cast by the THREAT on that hex (threats.ts): the
// Magic a rival should expect to make there next turn, from the chance they hold a letter that finishes a word there
// (counted from the letters this seat hasn't seen — never the real hidden seeds) — +2 when the seed it blocks with is
// junk anyway. Muzzy (F45): "a bully, it junks a word".
import { hexKey } from '../../engine/hex'
import type { WordList } from '../../engine/types'
import { junkiness, outcomeOf, seatName } from '../look'
import { threatsFor } from '../threats'
import { NOTHING, asTurn, type GlyphGoal } from './shared'

export const DENY_WEIGHTS = { junkBlock: 2 }

export function denyGoal(words: WordList): GlyphGoal {
  return {
    id: 'DENY',
    trait: 'spite',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn || !turn.target) return NOTHING
      const threat = threatsFor(ctx.view, ctx.world, ctx.seat, words).get(hexKey(turn.target))
      if (!threat) return NOTHING
      const letter = outcomeOf(ctx.world, turn, words).letter ?? ''
      const junk = junkiness(letter, ctx.world.hands[ctx.seat].map((s) => s.letter)) > 0 ? DENY_WEIGHTS.junkBlock : 0
      return { value: threat.expected + junk, why: `junked ${seatName(threat.seat)}'s ${threat.word} spot (≈${threat.expected})` }
    },
  }
}

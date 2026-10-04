// DENY (Spite) — take the spot a rival wanted ("weed toss"). Scores a cast by the best Magic a rival could have made
// on that hex next turn — with the seeds the bot IMAGINES in their hand (imagine.ts; never the real ones), cast by one
// of their glyphlings after one move — +2 when the seed it blocks with is junk anyway.
// Like the Weed toss award (turn.ts blockedSpot), but on the board before this turn, from the imagined hands.
import { hexKey, type Hex } from '../../engine/hex'
import { legalCasts, legalMoves } from '../../engine/moves'
import { magicFor } from '../../engine/turn'
import { findWords } from '../../engine/wordFinder'
import type { GameState, WordList } from '../../engine/types'
import { boardMemo, junkiness, outcomeOf, remember, seatName } from '../look'
import { NOTHING, asTurn, rivalsOf, type GlyphContext, type GlyphGoal } from './shared'

export const DENY_WEIGHTS = { junkBlock: 2 }

/** Every hex `seat` could cast onto next turn (one move, then a straight cast) — the board only, remembered. */
function castReach(world: GameState, seat: number): Set<string> {
  return remember(boardMemo(world), `reach ${seat}`, () => {
    const reach = new Set<string>()
    for (const g of world.glyphlings.filter((x) => x.seat === seat)) {
      for (const to of legalMoves(world, g.id)) for (const h of legalCasts(world, g.id, to)) reach.add(hexKey(h))
    }
    return reach
  })
}

/** The best word any rival could grow on `target` next turn, in this imagined world (remembered per world). */
function rivalBest(ctx: GlyphContext, target: Hex, words: WordList): { seat: number; magic: number; word: string } | null {
  return remember(ctx.cache, `deny ${hexKey(target)}`, () => {
    let best: { seat: number; magic: number; word: string } | null = null
    for (const rival of rivalsOf(ctx)) {
      if (!castReach(ctx.world, rival).has(hexKey(target))) continue
      const letters = [...new Set(ctx.world.hands[rival].map((s) => s.letter))].filter((l) => /^[A-Z]$/.test(l))
      for (const letter of letters) {
        const planted = { ...ctx.world, seeds: { ...ctx.world.seeds, [hexKey(target)]: { id: 'what-if', letter, seat: rival } } }
        const made = magicFor(planted, findWords(planted, target, words), rival)
        const magic = made.reduce((s, w) => s + w.magic, 0)
        if (magic > (best?.magic ?? 0)) best = { seat: rival, magic, word: made.map((w) => w.word).join(' + ') }
      }
    }
    return best
  })
}

export function denyGoal(words: WordList): GlyphGoal {
  return {
    id: 'DENY',
    trait: 'spite',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn || !turn.target) return NOTHING
      const blocked = rivalBest(ctx, turn.target, words)
      if (!blocked) return NOTHING
      const letter = outcomeOf(ctx.world, turn, words).letter ?? ''
      const junk = junkiness(letter, ctx.world.hands[ctx.seat].map((s) => s.letter)) > 0 ? DENY_WEIGHTS.junkBlock : 0
      return { value: blocked.magic + junk, why: `blocked ${seatName(blocked.seat)}'s ${blocked.word} spot (${blocked.magic})` }
    },
  }
}

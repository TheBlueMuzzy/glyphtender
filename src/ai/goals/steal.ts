// STEAL (Opportunism) — grow a rival's word into one of its own ("it stole my word!"). A known word it grows is a
// steal when, with the new seed taken out, what's left on one side of it is already a word (≥ the shortest word) made
// mostly of rival seeds — CAT (Blue's) + S = CATS. Scores +3 per rival seed in it, + half the word's Magic, ×1.5 when
// the bot then owns at least as many of its seeds as the rivals do.
import { hexKey } from '../../engine/hex'
import type { WordList } from '../../engine/types'
import { knows, outcomeOf, seatName } from '../look'
import { NOTHING, asTurn, vocabulary, type GlyphGoal } from './shared'

export const STEAL_WEIGHTS = { perRivalSeed: 3, magicShare: 0.5, majority: 1.5 }

export function stealGoal(words: WordList): GlyphGoal {
  return {
    id: 'STEAL',
    trait: 'opportunism',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn || !turn.target) return NOTHING
      const result = outcomeOf(ctx.world, turn, words)
      const minLength = ctx.world.config.rules.minWordLength
      let value = 0
      let best: { word: string; from: number; points: number } | null = null
      for (const w of result.made) {
        if (!knows(words, w.word, vocabulary(ctx))) continue
        const owners = w.hexes.map((h) => result.after.seeds[hexKey(h)].seat)
        const at = w.hexes.findIndex((h) => hexKey(h) === hexKey(turn.target!))
        // The two sides of the new seed: was either already a rival's word?
        const sides = [{ from: 0, to: at }, { from: at + 1, to: w.hexes.length }]
        const rivalWord = sides.find(({ from, to }) => {
          const side = owners.slice(from, to)
          const theirs = side.filter((o) => o !== ctx.seat).length
          return side.length >= minLength && theirs * 2 > side.length && words.has(w.word.slice(from, to))
        })
        if (!rivalWord) continue
        const theirs = owners.filter((o) => o !== ctx.seat)
        const mine = owners.length - theirs.length
        const points = (STEAL_WEIGHTS.perRivalSeed * theirs.length + STEAL_WEIGHTS.magicShare * w.magic) * (mine >= theirs.length ? STEAL_WEIGHTS.majority : 1)
        value += points
        const victim = owners.slice(rivalWord.from, rivalWord.to).find((o) => o !== ctx.seat)!
        if (!best || points > best.points) best = { word: w.word, from: victim, points }
      }
      return best ? { value, why: `stole ${best.word} off ${seatName(best.from)}'s seeds` } : NOTHING
    },
  }
}

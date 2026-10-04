// BUILD (Patience) — set up its own words for later. Scores a cast by the setups it leaves: for each line through the
// new seed (the 3 leylines), each open hex at either end of it and each letter still in its hand, would casting that
// letter there next turn grow a word it knows (through the new seed)? +1 per setup · +1.5 per own seed on those lines
// (it builds on its own seeds, so the word will be worth more to it).
import { hexKey } from '../../engine/hex'
import { getBoard } from '../../engine/boards'
import type { WordList } from '../../engine/types'
import { LEYLINES, boardMemo, knows, lineThrough, outcomeOf, remember, turnKey } from '../look'
import { NOTHING, asTurn, vocabulary, type GlyphGoal } from './shared'

export const BUILD_WEIGHTS = { perSetup: 1, perOwnSeedNear: 1.5 }

export function buildGoal(words: WordList): GlyphGoal {
  return {
    id: 'BUILD',
    trait: 'patience',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn || !turn.target) return NOTHING
      const target = turn.target
      const aim = vocabulary(ctx)
      const found = remember(boardMemo(ctx.world), `build ${aim} ${turnKey(turn)}`, () => {
        const { after } = outcomeOf(ctx.world, turn, words)
        const board = getBoard(after.config.boardName)
        const minLength = after.config.rules.minWordLength
        const handLetters = [...new Set(after.hands[ctx.seat].map((s) => s.letter))] // what's left after this cast
        let setups = 0
        let ownNear = 0
        let example = ''
        for (const dir of LEYLINES) {
          const line = lineThrough(after, target, dir)
          const letters = line.hexes.map((h) => after.seeds[hexKey(h)].letter)
          const at = line.hexes.findIndex((h) => hexKey(h) === hexKey(target))
          let lineSetups = 0
          for (const end of ['before', 'after'] as const) {
            const hex = line[end]
            if (!board.has(hex) || after.seeds[hexKey(hex)]) continue
            for (const l of handLetters) {
              const spelled = end === 'before' ? [l, ...letters] : [...letters, l]
              const added = end === 'before' ? 0 : spelled.length - 1
              const seed = end === 'before' ? at + 1 : at
              const lo = Math.min(added, seed)
              const hi = Math.max(added, seed)
              // Any stretch holding both the new seed and the added letter that's a word it knows.
              let hit = ''
              for (let start = 0; start <= lo && !hit; start++) {
                for (let stop = Math.max(hi, start + minLength - 1); stop < spelled.length && !hit; stop++) {
                  const word = spelled.slice(start, stop + 1).join('')
                  if (knows(words, word, aim)) hit = word
                }
              }
              if (hit) {
                lineSetups++
                if (!example) example = hit
              }
            }
          }
          setups += lineSetups
          if (lineSetups > 0) ownNear += line.hexes.filter((h) => hexKey(h) !== hexKey(target) && after.seeds[hexKey(h)].seat === ctx.seat).length
        }
        return { setups, ownNear, example }
      })
      if (found.setups === 0) return NOTHING
      const value = BUILD_WEIGHTS.perSetup * found.setups + BUILD_WEIGHTS.perOwnSeedNear * found.ownNear
      return { value, why: `set up ${found.setups} word${found.setups === 1 ? '' : 's'} for next turn (e.g. ${found.example})` }
    },
  }
}

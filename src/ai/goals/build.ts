// BUILD (Patience) — set up its own words for later. Scores a cast by the setups it leaves: for each line through the
// new seed (the 3 leylines), each open hex at either end of it and each letter still in its hand, would casting that
// letter there next turn grow a word it knows (through the new seed)? +1 per setup · +1.5 per own seed on those lines
// (it builds on its own seeds, so the word will be worth more to it).
// FRAMES (F45, Muzzy: "building words from the outside in… B, blank, plays G because they have a vowel that can make
// Big, Bag, Bug, Bog, Beg"): the new seed and a letter already on the board with ONE empty hex between them. Each
// letter in its own hand that would fill the gap into a word it knows +1.5; each letter in rivals' (imagined) hands
// that would too −1 — the best frames are the ones only it can finish.
import { addHex, hexKey } from '../../engine/hex'
import { getBoard } from '../../engine/boards'
import type { WordList } from '../../engine/types'
import { LEYLINES, boardMemo, knows, lineThrough, outcomeOf, remember, turnKey } from '../look'
import { NOTHING, asTurn, vocabulary, type GlyphGoal } from './shared'

export const BUILD_WEIGHTS = { perSetup: 1, perOwnSeedNear: 1.5, perFrameFill: 1.5, perRivalFill: 1 }

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
        // Frames: [run through the new seed] _ [run beyond the gap] on one line. Remember the letters around the gap and
        // where the new seed sits; which letters fill it is worked out per imagined world below (rivals' hands differ).
        const frames: { spelled: string[]; gap: number; seed: number }[] = []
        for (const dir of LEYLINES) {
          const line = lineThrough(after, target, dir)
          const letters = line.hexes.map((h) => after.seeds[hexKey(h)].letter)
          const at = line.hexes.findIndex((h) => hexKey(h) === hexKey(target))
          for (const end of ['before', 'after'] as const) {
            const gap = line[end]
            if (!board.has(gap) || after.seeds[hexKey(gap)]) continue
            const step = end === 'after' ? dir : { q: -dir.q, r: -dir.r }
            const far: string[] = []
            for (let h = addHex(gap, step); after.seeds[hexKey(h)]; h = addHex(h, step)) far.push(after.seeds[hexKey(h)].letter)
            if (!far.length) continue
            frames.push(end === 'after'
              ? { spelled: [...letters, '?', ...far], gap: letters.length, seed: at }
              : { spelled: [...far.reverse(), '?', ...letters], gap: far.length, seed: far.length + 1 + at })
          }
        }
        return { setups, ownNear, example, frames, handLetters }
      })
      // Which letters fill a frame into a word it knows? The word must run through the new seed AND across the gap
      // into the letters beyond it (B _ G → BAG) — a word that stops at the gap is an ordinary setup, counted above.
      const fills = (frame: (typeof found.frames)[number], pool: string[]) => [...new Set(pool)].filter((l) => {
        const spelled = frame.spelled.map((x, i) => (i === frame.gap ? l : x))
        const beyond = frame.gap > frame.seed ? frame.gap + 1 : frame.gap - 1 // the first letter past the gap
        const lo = Math.min(beyond, frame.seed)
        const hi = Math.max(beyond, frame.seed)
        for (let start = 0; start <= lo; start++) {
          for (let stop = hi; stop < spelled.length; stop++) {
            if (stop - start + 1 >= ctx.world.config.rules.minWordLength && knows(words, spelled.slice(start, stop + 1).join(''), aim)) return true
          }
        }
        return false
      })
      const rivalLetters = ctx.world.hands.flatMap((hand, seat) => (seat === ctx.seat ? [] : hand.map((s) => s.letter)))
      let frameValue = 0
      let frameExample = ''
      for (const frame of found.frames) {
        const mine = fills(frame, found.handLetters)
        if (!mine.length) continue
        frameValue += Math.max(0, BUILD_WEIGHTS.perFrameFill * mine.length - BUILD_WEIGHTS.perRivalFill * fills(frame, rivalLetters).length)
        if (!frameExample) frameExample = frame.spelled.join('').replace('?', '_') + ` (${mine.join('/')})`
      }
      if (found.setups === 0 && frameValue === 0) return NOTHING
      const value = BUILD_WEIGHTS.perSetup * found.setups + BUILD_WEIGHTS.perOwnSeedNear * found.ownNear + frameValue
      const why = frameExample
        ? `framed ${frameExample} for next turn`
        : `set up ${found.setups} word${found.setups === 1 ? '' : 's'} for next turn (e.g. ${found.example})`
      return { value, why }
    },
  }
}

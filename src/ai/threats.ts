// THREATS — where could each rival score next turn, and how much, as far as this seat can tell? (F45, Muzzy: "if OG
// was on the board, it would calculate the probability of the other players having a C, B or other letters that
// would finish it, and either steal the word, throw junk in the spot, or cut them off from being able to reach it.")
// For every empty hex a rival could cast into next turn (one move, then a straight cast) that touches a seed, and
// every letter this seat hasn't seen: the Magic that rival would make there × the chance they hold that letter (from
// how many of it are still unseen and how many seeds they hold — fair: counts, never the real hidden seeds). A hex's
// threat = the Magic that rival should EXPECT to make there (their best letter they probably hold). The Strategist's
// DENY junks those spots and its TRAP cuts rivals off from them.
import { getBoard } from '../engine/boards'
import { hexKey, neighbours, type Hex } from '../engine/hex'
import { legalCasts, legalMoves } from '../engine/moves'
import type { SeatView } from '../engine/rules'
import { magicFor } from '../engine/turn'
import { findWords } from '../engine/wordFinder'
import type { GameState, WordList } from '../engine/types'
import { unseenLetters } from './imagine'
import { boardMemo, remember } from './look'

export interface Threat {
  seat: number
  /** The Magic that rival should expect to make on this hex next turn. */
  expected: number
  /** Its likeliest good word there, for notes ("BOG"). */
  word: string
}

/** Every hex `seat` could cast onto next turn (one move, then a straight cast) — the board only, remembered. */
export function castReachOf(world: GameState, seat: number): Set<string> {
  return remember(boardMemo(world), `reach ${seat}`, () => {
    const reach = new Set<string>()
    for (const g of world.glyphlings.filter((x) => x.seat === seat)) {
      for (const to of legalMoves(world, g.id)) for (const h of legalCasts(world, g.id, to)) reach.add(hexKey(h))
    }
    return reach
  })
}

/** The chance a hand of `handSize` unseen seeds holds at least one of a letter that has `copies` of the `pool` left. */
export function chanceToHold(copies: number, pool: number, handSize: number): number {
  if (copies <= 0 || handSize <= 0) return 0
  let none = 1
  for (let i = 0; i < handSize; i++) none *= Math.max(0, pool - copies - i) / (pool - i)
  return 1 - none
}

/** Each hex's threat (the rival who threatens it most), from `seat`'s view. Remembered per board. */
export function threatsFor(view: SeatView, world: GameState, seat: number, words: WordList): Map<string, Threat> {
  return remember(boardMemo(world), `threats ${seat}`, () => {
    const board = getBoard(world.config.boardName)
    const unseen = unseenLetters(view, seat)
    const copies = new Map<string, number>()
    for (const l of unseen) copies.set(l, (copies.get(l) ?? 0) + 1)
    const out = new Map<string, Threat>()
    for (let rival = 0; rival < world.config.players; rival++) {
      if (rival === seat) continue
      const handSize = view.hands[rival]?.length ?? 0
      for (const key of castReachOf(world, rival)) {
        const [q, r] = key.split(',').map(Number)
        const hex: Hex = { q, r }
        if (!neighbours(board, hex).some((n) => world.seeds[hexKey(n)])) continue // nothing to grow there
        // Each letter's Magic there, best first; then the expected best: each letter counts when they hold it and
        // don't hold a better one.
        const options = [...copies.keys()]
          .map((letter) => {
            const planted = { ...world, seeds: { ...world.seeds, [key]: { id: 'what-if', letter, seat: rival } } }
            const made = magicFor(planted, findWords(planted, hex, words), rival)
            return { letter, magic: made.reduce((s, w) => s + w.magic, 0), word: made.map((w) => w.word).join(' + '), p: chanceToHold(copies.get(letter)!, unseen.length, handSize) }
          })
          .filter((o) => o.magic > 0)
          .sort((a, b) => b.magic - a.magic)
        let expected = 0
        let noBetter = 1
        for (const o of options) {
          expected += o.magic * o.p * noBetter
          noBetter *= 1 - o.p
        }
        if (expected <= 0) continue
        const likeliest = options.reduce((a, b) => (b.magic * b.p > a.magic * a.p ? b : a))
        if (expected > (out.get(key)?.expected ?? 0)) out.set(key, { seat: rival, expected: Math.round(expected * 10) / 10, word: likeliest.word })
      }
    }
    return out
  })
}

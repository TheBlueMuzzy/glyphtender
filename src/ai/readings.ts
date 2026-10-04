// WHAT THE AI FEELS — Glyphtender's readings, each 0–10, worked out from the seat's view only.
// The personalities' mood shifts (content/ai/personalities.json) name these EXACTLY, e.g. "myDanger 6 → 10: caution +20".
//   handQuality  10 = a great hand: vowels balanced, few hard letters, few copies
//   myDanger     my most trapped (untangled) glyphling: few moves left, rival glyphlings close → high
//   rivalDanger  the same for the most trapped rival glyphling (a chance to pounce)
//   fill         how full the board is (share of hexes with a seed × 10)
//   territory    who reaches each hex first (look.ts): 5 = even with an average rival, 10 = all mine, 0 = none
//   endNear      tangled glyphlings + glyphlings down to ≤ 1 move, against how many tangles end the game
//   behind/ahead how far behind / ahead it BELIEVES it is (evidence.ts beliefs): 0 = level, 1 point ≈ 2.5 Magic
import { getBoard } from '../engine/boards'
import type { SeatView } from '../engine/rules'
import type { WordList } from '../engine/types'
import { beliefsOf } from './evidence'
import { HARD_LETTERS, VOWELS, hexDistance, mobilityNow, reading, territoryNow } from './look'

/** The names, in one place (personalities' shifts must use these). */
export const READINGS = ['handQuality', 'myDanger', 'rivalDanger', 'fill', 'territory', 'endNear', 'behind', 'ahead'] as const
export type ReadingName = (typeof READINGS)[number]

/** Magic per reading point for behind / ahead. */
export const MAGIC_PER_POINT = 2.5

/** 10 = a great hand. An empty hand reads 5 (nothing to judge). */
export function handQuality(letters: readonly string[]): number {
  if (letters.length === 0) return 5
  const vowels = letters.filter((l) => VOWELS.has(l)).length
  const balance = Math.abs(vowels / letters.length - 0.4) * 15 // 40% vowels is about right
  const hard = letters.filter((l) => HARD_LETTERS.has(l)).length * 1.5
  const copies = letters.length - new Set(letters).size
  return reading(10 - balance - hard - copies)
}

/** How trapped one glyphling is, 0–10: 1 move left = 10, 9+ moves = 0; +1 per rival glyphling within 2 hexes. */
function dangerOf(view: SeatView, id: number, moves: number[]): number {
  const g = view.glyphlings.find((x) => x.id === id)!
  const rivalsNear = view.glyphlings.filter((x) => x.seat !== g.seat && hexDistance(x.hex, g.hex) <= 2).length
  return reading(10 - (moves[id] - 1) * 1.25 + rivalsNear)
}

/** The highest danger among these seats' untangled glyphlings (0 when they have none). */
function worstDanger(view: SeatView, seats: (seat: number) => boolean): number {
  const moves = mobilityNow(view)
  const mine = view.glyphlings.filter((g) => seats(g.seat) && moves[g.id] > 0)
  return mine.length ? Math.max(...mine.map((g) => dangerOf(view, g.id, moves))) : 0
}

export function myDanger(view: SeatView, seat: number): number {
  return worstDanger(view, (s) => s === seat)
}

export function rivalDanger(view: SeatView, seat: number): number {
  return worstDanger(view, (s) => s !== seat)
}

export function fill(view: SeatView): number {
  return reading((Object.keys(view.seeds).length / getBoard(view.config.boardName).cells.length) * 10)
}

/** 5 = I reach first as many hexes as an average rival does; 10 = only I reach any; 0 = I reach none first. */
export function territoryReading(view: SeatView, seat: number): number {
  const owned = territoryNow(view)
  const mine = owned[seat]
  const rivals = owned.filter((_, s) => s !== seat)
  const average = rivals.reduce((a, b) => a + b, 0) / Math.max(1, rivals.length)
  return mine + average === 0 ? 5 : reading((10 * mine) / (mine + average))
}

export function endNear(view: SeatView): number {
  const moves = mobilityNow(view)
  const tangled = view.glyphlings.filter((g) => moves[g.id] === 0).length
  const nearly = view.glyphlings.filter((g) => moves[g.id] === 1).length
  return reading(((tangled + 0.5 * nearly) / view.config.rules.tanglesToEnd) * 10)
}

/** Every reading for `seat`. `beliefNoise` = the skill's (how fuzzy its idea of rivals' Magic is). */
export function readingsFor(view: SeatView, seat: number, words: WordList, beliefNoise: number): Record<ReadingName, number> {
  const playing = view.phase !== 'draft'
  const lead = playing ? beliefsOf(view, seat, words, beliefNoise).lead : 0
  return {
    handQuality: handQuality((view.hands[seat] ?? []).map((s) => s.letter)),
    myDanger: playing ? myDanger(view, seat) : 0,
    rivalDanger: playing ? rivalDanger(view, seat) : 0,
    fill: fill(view),
    territory: playing ? territoryReading(view, seat) : 5,
    endNear: playing ? endNear(view) : 0,
    behind: reading(-lead / MAGIC_PER_POINT),
    ahead: reading(lead / MAGIC_PER_POINT),
  }
}

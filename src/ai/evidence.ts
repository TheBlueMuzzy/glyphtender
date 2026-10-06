// WHAT THE AI HAS SEEN OF EVERYONE'S MAGIC — the evidence its beliefs are built from (framework kit/beliefs.ts).
//
// A seat's view has NO Magic numbers before the end (rules.viewFor zeroes them, even its own) and no game log. What a
// person at the table can see is the garden: every word on the board, and whose seeds it's made of. So:
//   - Board Magic: every word on the board (read like the rules: the 3 leylines, the union rule) is credited to the
//     seat owning most of its seeds (a tie shares it), worth its seeds + ownershipBonus per seed that seat owns.
//     It's a plain estimate: a word that has since grown longer only counts as the longer word.
//   - Tangle Magic: what the glyphlings tangled right now would give each seat if the game ended now.
//   - History (for the fuzzy beliefs): one entry per turn each seat has played since play began. The bot keeps no
//     memory between turns, so the history is rebuilt from the board each time: the last turn it watched (lastTurn)
//     is seen exactly; each other cast turn gets an even share of that seat's board Magic; turns it can't account for
//     from the board (moved only, refreshed, or words since grown over) are null = "not sure what happened".
// Only ever reads the view. Never the log, never the real hidden seeds.
import { believe, believedLead, type Belief } from './kit/beliefs'
import { LEYLINES, addHex, hexKey, type Hex } from '../engine/hex'
import { getBoard } from '../engine/boards'
import { seedMagicOfTurn } from '../engine/turn'
import { tangleBonus } from '../engine/tangle'
import { keepByUnionRule } from '../engine/wordFinder'
import { spell } from '../engine/words'
import type { SeatView } from '../engine/rules'
import type { WordList } from '../engine/types'

export interface Evidence {
  /** Per seat: Magic of the words on the board credited to it. */
  boardMagic: number[]
  /** Per seat: the tangle bonus if the game ended right now. */
  tangleMagic: number[]
  /** Per seat: one entry per turn it played (oldest first) — Magic seen added, or null (not sure). */
  histories: (number | null)[][]
}

/** Every word on the board now, with its seeds' hexes in reading order. */
export function wordsOnBoard(view: SeatView, words: WordList): Hex[][] {
  const board = getBoard(view.config.boardName)
  const minLength = view.config.rules.minWordLength
  const found: Hex[][] = []
  for (const dir of LEYLINES) {
    const back = { q: -dir.q, r: -dir.r }
    for (const cell of board.cells) {
      // Start only at the first seed of each unbroken line.
      if (!view.seeds[hexKey(cell)] || view.seeds[hexKey(addHex(cell, back))]) continue
      const run: Hex[] = []
      for (let h = cell; view.seeds[hexKey(h)]; h = addHex(h, dir)) run.push(h)
      if (run.length < minLength) continue
      const letters = run.map((h) => spell(view.seeds[hexKey(h)].letter))
      const spans: { start: number; end: number; word: string }[] = []
      for (let start = 0; start < run.length; start++) {
        for (let end = start + minLength - 1; end < run.length; end++) {
          const word = letters.slice(start, end + 1).join('')
          if (words.has(word)) spans.push({ start, end, word })
        }
      }
      for (const span of keepByUnionRule(spans)) found.push(run.slice(span.start, span.end + 1))
    }
  }
  return found
}

/** How many turns `seat` has played so far (play starts with seat 0 and goes round the table). */
export function turnsPlayed(view: SeatView, seat: number): number {
  const n = view.turnCount
  return n > seat ? Math.floor((n - 1 - seat) / view.config.players) + 1 : 0
}

/** Everything this view shows about each seat's Magic. */
export function seenEvidence(view: SeatView, words: WordList): Evidence {
  const players = view.config.players
  const bonus = view.config.rules.ownershipBonus
  const boardMagic: number[] = Array(players).fill(0)
  for (const hexes of wordsOnBoard(view, words)) {
    const owners = hexes.map((h) => view.seeds[hexKey(h)].seat)
    const counts = Array.from({ length: players }, (_, s) => owners.filter((o) => o === s).length)
    const most = Math.max(...counts)
    const credited = counts.flatMap((c, s) => (c === most ? [s] : []))
    for (const s of credited) boardMagic[s] += (hexes.length + bonus * counts[s]) / credited.length
  }
  const tangleMagic = view.phase === 'draft' ? Array(players).fill(0) : tangleBonus(view, view.tangled)

  const histories = Array.from({ length: players }, (_, seat) => {
    const turns = turnsPlayed(view, seat)
    if (turns === 0) return []
    const last = view.lastTurn?.seat === seat ? view.lastTurn : null
    const lastMagic = last ? seedMagicOfTurn(view, last.words, seat).flat().reduce((a, b) => a + b, 0) : 0
    const older = turns - (last ? 1 : 0)
    const casts = Math.min(older, Object.values(view.seeds).filter((p) => p.seat === seat).length - (last?.target ? 1 : 0))
    const share = casts > 0 ? Math.max(0, boardMagic[seat] - lastMagic) / casts : 0
    // Spread the unsure turns evenly among the older ones.
    const history: (number | null)[] = []
    for (let i = 0; i < older; i++) history.push(Math.floor(((i + 1) * casts) / older) > Math.floor((i * casts) / older) ? Math.round(share * 10) / 10 : null)
    if (last) history.push(lastMagic)
    return history
  })
  return { boardMagic: boardMagic.map((m) => Math.round(m * 10) / 10), tangleMagic, histories }
}

/** What `seat` believes about everyone's Magic, and how far ahead it believes it is (negative = behind).
 *  Its own Magic it counts from the board (it knows its own words); rivals' are fuzzy beliefs (kit/beliefs.ts) —
 *  `noise` = the skill's beliefNoise. The game's seed is hidden from a seat's view, so the belief key is made from
 *  the seats (the same bot believes the same thing from the same history). */
export function beliefsOf(view: SeatView, seat: number, words: WordList, noise: number): { mine: number; rivals: (Belief & { seat: number })[]; lead: number } {
  const seen = seenEvidence(view, words)
  const mine = seen.boardMagic[seat] + seen.tangleMagic[seat]
  const rivals = seen.histories.flatMap((history, rival) => {
    if (rival === seat) return []
    const belief = believe(history, noise, 7919 * (seat + 1) + 104729 * (rival + 1) + view.config.players)
    return [{ seat: rival, estimate: belief.estimate + seen.tangleMagic[rival], confidence: belief.confidence }]
  })
  return { mine, rivals, lead: believedLead(mine, rivals) }
}

/** The least sure it is about any rival (0.1–1) — "call it" waits for a bigger lead when it isn't sure. */
export const leastConfidence = (rivals: readonly Belief[]) => (rivals.length ? Math.min(...rivals.map((b) => b.confidence)) : 1)

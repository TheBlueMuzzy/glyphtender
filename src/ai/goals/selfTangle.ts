// SELFTANGLE (Clumsiness) — Sprout only: the tutorial AI's two habits (design/tutorial.md §5). A goal only the
// personalities that LIST it get (plug.ts PERSONAL_GOALS), so the other personalities play exactly as before.
//   1. One tangle: from its own turn `selfTangleBy` (content/tuning/tutorial.json), while none of its glyphlings is
//      tangled, it likes moves that walk ONE glyphling into a pocket — its most cornered one: +3 per move that
//      glyphling loses, +2 per rival piece next to it, and a tangle +50, +15 per rival piece next to it (the rival's
//      pieces there earn the tangle bonus — "you create"). It dislikes cornering its OTHER glyphling too (≤ 2 moves −20).
//   2. Keep the other free: once one of its glyphlings is tangled, it dislikes leaving the other with ≤ 2 moves (−20).
//   Either way, a turn that ENDS the game (the last tangle needed) scores −100: ending it is usually the player's call.
// These are preferences, never rules (Muzzy, 2026-10-13: "we could end in a soft lock"): the brain still picks
// among legal moves, so if every move it has tangles itself, it plays one. After `maxTurns` of its own turns, no opinion.
import { getBoard } from '../../engine/boards'
import { hexKey, neighbours } from '../../engine/hex'
import type { GameState, WordList } from '../../engine/types'
import tutorialTuning from '../../../content/tuning/tutorial.json'
import { mobilityAfter, mobilityNow, outcomeOf } from '../look'
import { NOTHING, asTurn, type GlyphGoal } from './shared'

export const SELF_TANGLE_WEIGHTS = { tangle: 50, perRivalPieceAtTangle: 15, perMoveCloser: 3, perRivalPieceNear: 2, otherCornered: -20, endsGame: -100 }
/** "Cornered" for the other glyphling: this many moves or fewer. */
const CORNERED = 2

/** Which of its own turns this is: 1 on its first turn (turnCount counts every player's turns). */
export const ownTurnOf = (world: GameState) => Math.floor(world.turnCount / world.config.players) + 1

/** Rival pieces (seeds + glyphlings) next to a hex. */
function rivalPiecesNear(state: GameState, seat: number, hex: { q: number; r: number }): number {
  return neighbours(getBoard(state.config.boardName), hex).filter((n) => {
    const key = hexKey(n)
    const seed = state.seeds[key]
    if (seed) return seed.seat !== seat
    return state.glyphlings.some((g) => g.seat !== seat && hexKey(g.hex) === key)
  }).length
}

export function selfTangleGoal(words: WordList, tuning: { selfTangleBy: number; maxTurns: number } = tutorialTuning): GlyphGoal {
  return {
    id: 'SELFTANGLE',
    trait: 'clumsiness',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn) return NOTHING
      const ownTurn = ownTurnOf(ctx.world)
      if (ownTurn > tuning.maxTurns) return NOTHING
      const W = SELF_TANGLE_WEIGHTS
      const before = mobilityNow(ctx.world)
      const after = mobilityAfter(ctx.world, turn, words)
      const board = outcomeOf(ctx.world, turn, words).after
      const mine = ctx.world.glyphlings.filter((g) => g.seat === ctx.seat)
      const tangledAfter = ctx.world.glyphlings.filter((g) => after[g.id] === 0).length
      if (tangledAfter >= ctx.world.config.rules.tanglesToEnd) {
        const ownLast = mine.some((g) => before[g.id] > 0 && after[g.id] === 0)
        return { value: W.endsGame, why: ownLast ? 'would tangle its last free glyphling and end the game' : 'would end the game' }
      }
      const tangledMine = mine.filter((g) => before[g.id] === 0)
      if (tangledMine.length) {
        // Keep the other free.
        const free = mine.filter((g) => before[g.id] > 0)
        const cornered = free.filter((g) => after[g.id] <= CORNERED && before[g.id] > CORNERED).length
        return cornered ? { value: W.otherCornered * cornered, why: 'would corner its other glyphling' } : NOTHING
      }
      if (ownTurn < tuning.selfTangleBy || !mine.length) return NOTHING
      // One tangle: its most cornered glyphling is the one it walks into a pocket.
      const chosen = mine.reduce((a, b) => (before[b.id] < before[a.id] ? b : a))
      const hexAfter = board.glyphlings.find((g) => g.id === chosen.id)!.hex
      const near = rivalPiecesNear(board, ctx.seat, hexAfter)
      let value = 0
      let why: string | undefined
      if (after[chosen.id] === 0) {
        value += W.tangle + W.perRivalPieceAtTangle * near
        why = near ? `wandered into a pocket next to ${near} rival piece${near === 1 ? '' : 's'}` : 'wandered into a pocket'
      } else {
        value += W.perMoveCloser * (before[chosen.id] - after[chosen.id]) + W.perRivalPieceNear * near
        if (after[chosen.id] < before[chosen.id]) why = `drifted toward a pocket (${before[chosen.id]} → ${after[chosen.id]} moves)`
      }
      for (const g of mine) {
        if (g.id === chosen.id) continue
        if (after[g.id] === 0) value += W.endsGame // (both at once — only when the game needs more tangles to end)
        else if (after[g.id] <= CORNERED && before[g.id] > CORNERED) value += W.otherCornered
      }
      return { value, why }
    },
  }
}

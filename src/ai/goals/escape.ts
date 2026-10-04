// ESCAPE (Caution) — keep its own glyphlings free. Scores a move by:
//   own danger drop ×5 (danger = how far below 6 moves a glyphling is) · escape routes: the fewest moves any of its
//   glyphlings has ×2 · open directions of that glyphling ×3 · −10 if it's down to ≤ 2 routes · −50 for tangling
//   its own glyphling · territory kept: hexes it reaches first ("walled garden") ×1.
import { occupiedHexes, mobilityAfter, mobilityNow, openDirections, outcomeOf, territoryAfter, type TurnAction } from '../look'
import type { WordList } from '../../engine/types'
import { NOTHING, asTurn, type GlyphGoal } from './shared'

export const ESCAPE_WEIGHTS = { perDangerDrop: 5, perRoute: 2, perOpenDirection: 3, fewRoutes: -10, selfTangle: -50, perHexKept: 1 }

const danger = (moves: number) => Math.max(0, 6 - moves)

export function escapeGoal(words: WordList): GlyphGoal {
  return {
    id: 'ESCAPE',
    trait: 'caution',
    score(action, ctx) {
      const turn: TurnAction | null = asTurn(action)
      if (!turn) return NOTHING
      const W = ESCAPE_WEIGHTS
      const before = mobilityNow(ctx.world)
      const after = mobilityAfter(ctx.world, turn, words)
      const board = outcomeOf(ctx.world, turn, words).after
      const mine = board.glyphlings.filter((g) => g.seat === ctx.seat && before[g.id] > 0)
      if (!mine.length) return NOTHING
      let value = 0
      for (const g of mine) {
        value += W.perDangerDrop * (danger(before[g.id]) - danger(after[g.id]))
        if (after[g.id] === 0) value += W.selfTangle
      }
      const weakest = mine.reduce((a, b) => (after[b.id] < after[a.id] ? b : a))
      const routes = after[weakest.id]
      value += W.perRoute * routes + W.perOpenDirection * openDirections(board, occupiedHexes(board), weakest.hex)
      if (routes <= 2) value += W.fewRoutes
      const kept = territoryAfter(ctx.world, turn, words)[ctx.seat]
      value += W.perHexKept * kept
      const moved = turn.glyphling
      const why = before[moved] <= 3 && after[moved] > before[moved]
        ? `ran from danger: ${before[moved]} → ${after[moved]} moves`
        : `kept ${kept} hexes to itself (fewest moves ${routes})`
      return { value, why }
    },
  }
}

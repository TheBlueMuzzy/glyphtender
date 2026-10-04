// TRAP (Aggression) — hem rival glyphlings in. Scores a move by:
//   every move it takes from a rival glyphling ×5 · a tangle +50, +3 per own piece next to it ("plan the kill") ·
//   a rival glyphling newly down to ≤ 2 moves +15 · territory taken: hexes rivals no longer reach first ×2.
// Cast spots taken (F45): the empty hexes rivals could cast into next turn — a speller's room to score. Measured
// 2026-10-04 (Bully vs Scholar, 60 games): weight 1 → 8% wins, 0 → 9% — no help on its own, so off (0) for now.
// Timing (F45): tangles end the game. A tangle that ENDS it, or leaves it one tangle from the end, while it believes
// it's behind just hands the leader the win ("call it") — so then the tangle is worth nothing, and ending it is bad.
import { getBoard } from '../../engine/boards'
import { hexKey, neighbours } from '../../engine/hex'
import type { WordList } from '../../engine/types'
import { castReachAfter, castReachNow, mobilityAfter, mobilityNow, outcomeOf, seatName, territoryAfter, territoryNow } from '../look'
import { NOTHING, asTurn, rivalsOf, type GlyphGoal } from './shared'

export const TRAP_WEIGHTS = { perMoveCut: 5, tangle: 50, perOwnPieceNear: 3, nearlyTrapped: 15, perHexTaken: 2, perCastSpotTaken: 0, endWhileBehind: -100 }

export function trapGoal(words: WordList): GlyphGoal {
  return {
    id: 'TRAP',
    trait: 'aggression',
    score(action, ctx) {
      const turn = asTurn(action)
      if (!turn) return NOTHING
      const W = TRAP_WEIGHTS
      const before = mobilityNow(ctx.world)
      const after = mobilityAfter(ctx.world, turn, words)
      const board = outcomeOf(ctx.world, turn, words).after
      const rivals = rivalsOf(ctx)
      let value = 0
      // Believed lead from the readings (behind / ahead: ~2.5 Magic per point). Tangles count from the board after.
      const behind = (ctx.readings.behind ?? 0) > (ctx.readings.ahead ?? 0)
      const need = ctx.world.config.rules.tanglesToEnd
      const tangledAfter = ctx.world.glyphlings.filter((g) => after[g.id] === 0).length
      const nearsTheEnd = tangledAfter >= need - 1
      let biggest: { seat: number; from: number; to: number } | null = null
      let tangled: number | null = null
      for (const g of ctx.world.glyphlings) {
        if (g.seat === ctx.seat) continue
        const was = before[g.id]
        const now = after[g.id]
        value += W.perMoveCut * (was - now)
        if (was > 0 && now === 0) {
          const hex = board.glyphlings.find((x) => x.id === g.id)!.hex
          const mine = neighbours(getBoard(board.config.boardName), hex).filter((n) =>
            board.seeds[hexKey(n)]?.seat === ctx.seat || board.glyphlings.some((x) => x.seat === ctx.seat && hexKey(x.hex) === hexKey(n))).length
          value += behind && nearsTheEnd ? W.perOwnPieceNear * mine : W.tangle + W.perOwnPieceNear * mine
          tangled = g.seat
        } else if (was > 2 && now <= 2) value += W.nearlyTrapped
        if (was - now > 0 && (!biggest || was - now > biggest.from - biggest.to)) biggest = { seat: g.seat, from: was, to: now }
      }
      const ground = (owned: number[]) => rivals.reduce((sum, s) => sum + owned[s], 0)
      const taken = ground(territoryNow(ctx.world)) - ground(territoryAfter(ctx.world, turn, words))
      value += W.perHexTaken * taken
      const spotsTaken = ground(castReachNow(ctx.world)) - ground(castReachAfter(ctx.world, turn, words))
      value += W.perCastSpotTaken * spotsTaken
      if (behind && tangledAfter >= need) value += W.endWhileBehind
      let why: string | undefined
      if (tangled !== null) why = `tangled ${seatName(tangled)}'s glyphling`
      else if (biggest) why = `cut ${seatName(biggest.seat)}'s glyphling ${biggest.from} → ${biggest.to}`
      else if (spotsTaken >= 5) why = `took ${spotsTaken} of rivals' casting spots`
      else if (taken > 0) why = `took ${taken} hexes of rivals' ground`
      return { value, why }
    },
  }
}

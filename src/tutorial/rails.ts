// THE RAILS — the tutorial game's scripted opening (F76, design/tutorial.md §2), read from content/tutorial/rails.json.
// rails.json holds a found layout (scripts/tutorial/find-rails.mjs): the bag order, both players' draft hexes, your
// turns 1–2 and Sprout's turn 1. These helpers turn it into the exact rules Actions for each scripted step, so the
// screen (and the proof test, src/tutorial/rails.test.ts) never restates a hex or a letter.
// Pure functions: each takes the game as it is now and (optionally) a layout — the finder passes its candidates.
import railsJson from '../../content/tutorial/rails.json'
import { getBoard } from '../engine/boards'
import type { Hex } from '../engine/hex'
import type { GameSetup } from '../engine/rules'
import type { Action, GameState } from '../engine/types'

/** One scripted turn: which of the seat's two glyphlings moves (in draft order), where to, and the seed it plants. */
export interface RailsTurn {
  glyphling: 'first' | 'second'
  to: string
  seed: string
  plant: string
}

/** The layout in content/tutorial/rails.json. Hexes are designer labels ("C4-3"), seeds are letters. */
export interface Rails {
  seed: number
  boardName: string
  minWordLength: number
  turnOrder: number[]
  you: number
  ai: { seat: number; personality: string; skill: string }
  stack: { hands: string[][]; next: string[] }
  draft: { you: string[]; ai: string[] }
  /** Your turn 1: the move (one of its lines stops short at Blue's glyphling on `blockedAt`), the plant (it flies over
   *  your other glyphling, `overOwn`, and takes moves away from Blue's glyphling on `blocks`), then the refresh. */
  turn1: RailsTurn & { blockedAt: string; overOwn: string; blocks: string; refresh: string[] }
  /** Sprout's turn 1: a T two hexes from your C, in line, with a gap between them. */
  aiTurn1: RailsTurn
  /** What Sprout sets aside after its turn 1 ([] = keep all). */
  aiRefresh: string[]
  /** Your turn 2: the A into the gap — the one word `word`, worth `magic`. */
  turn2: RailsTurn & { word: string; magic: number }
}

export const rails = railsJson as Rails

/** The hex with designer label `label` on the rails board. Throws if there's no such hex. */
export function railsHex(label: string, layout: Rails = rails): Hex {
  const board = getBoard(layout.boardName)
  const hex = board.cells.find((h) => board.label(h) === label)
  if (!hex) throw new Error(`No hex ${label} on the ${layout.boardName} board`)
  return { ...hex }
}

/** The new-game setup for the rails (2 players, you first, the stacked bag; British/vulgar words off). */
export function railsSetup(layout: Rails = rails): GameSetup {
  return {
    players: 2, seed: layout.seed, boardName: layout.boardName, turnOrder: layout.turnOrder,
    rules: { minWordLength: layout.minWordLength }, extraWords: { british: false, vulgar: false }, stack: layout.stack,
  }
}

/** A glyphling's id: seat × 2 + which (its first or second draft placement). */
export const railsGlyphling = (seat: number, which: 'first' | 'second') => seat * 2 + (which === 'second' ? 1 : 0)

/** The scripted steps, in order. 'free' = the rails are over (free play). */
export type RailsStep = 'draft' | 'turn1' | 'refresh1' | 'aiTurn1' | 'aiRefresh' | 'turn2' | 'free'

/** Which scripted step the game is on. */
export function railsStep(game: GameState, layout: Rails = rails): RailsStep {
  if (game.phase === 'draft') return 'draft'
  if (game.phase === 'over') return 'free'
  const yours = game.current === layout.you
  if (game.turnCount === 0 && yours) return game.phase === 'refresh' ? 'refresh1' : 'turn1'
  if (game.turnCount === 1 && !yours) return game.phase === 'refresh' ? 'aiRefresh' : 'aiTurn1'
  if (game.turnCount === 2 && yours && game.phase === 'play') return 'turn2'
  return 'free'
}

/** The id of the first seed with this letter in `seat`'s hand. Throws if there's none. */
export function seedIdOf(game: GameState, seat: number, letter: string): string {
  const piece = game.hands[seat].find((p) => p.letter === letter)
  if (!piece) throw new Error(`Seat ${seat} has no ${letter} seed`)
  return piece.id
}

/** A scripted turn as a rules Action, with the real seed id from the hand. */
export function railsTurnAction(game: GameState, seat: number, turn: RailsTurn, layout: Rails = rails): Action {
  return {
    type: 'turn', glyphling: railsGlyphling(seat, turn.glyphling), to: railsHex(turn.to, layout),
    seed: seedIdOf(game, seat, turn.seed), target: railsHex(turn.plant, layout),
  }
}

/** The hex the current draft step places on (yours or Sprout's), or null once the draft is over. */
export function railsDraftHex(game: GameState, layout: Rails = rails): Hex | null {
  if (game.phase !== 'draft') return null
  const seat = game.current
  const placed = game.glyphlings.filter((g) => g.seat === seat).length
  const label = (seat === layout.you ? layout.draft.you : layout.draft.ai)[placed]
  return label ? railsHex(label, layout) : null
}

/** The exact Action the script expects now — from whoever acts (you or Sprout) — or null in free play. */
export function railsAction(game: GameState, layout: Rails = rails): Action | null {
  const ai = layout.ai.seat
  const you = layout.you
  const setAside = (seat: number, letters: string[]) => {
    const ids: string[] = []
    for (const letter of letters) {
      const piece = game.hands[seat].find((p) => p.letter === letter && !ids.includes(p.id))
      if (!piece) throw new Error(`Seat ${seat} has no ${letter} seed to set aside`)
      ids.push(piece.id)
    }
    return ids
  }
  switch (railsStep(game, layout)) {
    case 'draft': {
      const hex = railsDraftHex(game, layout)
      return hex && { type: 'draft', hex }
    }
    case 'turn1': return railsTurnAction(game, you, layout.turn1, layout)
    case 'refresh1': return { type: 'refresh', setAside: setAside(you, layout.turn1.refresh) }
    case 'aiTurn1': return railsTurnAction(game, ai, layout.aiTurn1, layout)
    case 'aiRefresh': return { type: 'refresh', setAside: setAside(ai, layout.aiRefresh) }
    case 'turn2': return railsTurnAction(game, you, layout.turn2, layout)
    default: return null
  }
}

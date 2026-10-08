// Tangles: a glyphling with no legal move is tangled. Enough tangles end the game.
import { getBoard } from './boards'
import { hexKey, neighbours, type Hex } from './hex'
import { emptyLog, logEnd, logOf, logTurn } from './log'
import { legalMoves, occupancy } from './moves'
import { nextClockwise } from '../table/flow'
import { turnOrderOf } from './setup'
import type { GameState, LogTangle } from './types'

/** How many legal moves this glyphling has right now (0 = tangled; the danger cues warn at 1). */
export const movesLeft = (state: GameState, glyphlingId: number): number => legalMoves(state, glyphlingId).length

/** Ids of every glyphling that can't move right now. */
export function tangledIds(state: GameState): number[] {
  return state.glyphlings.filter((g) => movesLeft(state, g.id) === 0).map((g) => g.id)
}

/** One rival piece next to a tangled glyphling: it earns its owner (`seat`) `amount` Magic (the tangle bonus). */
export interface TanglePiece {
  glyphling: number
  /** Where the rival piece (a seed or a glyphling) stands. */
  hex: Hex
  seat: number
  amount: number
}

/** Every rival piece next to each tangled glyphling, one by one (the owner's own pieces earn nothing) — the tangle
 *  bonus piece by piece. The end's Magic reveal pops each one on its piece. */
export function tanglePieces(state: GameState, tangled: number[]): TanglePiece[] {
  const board = getBoard(state.config.boardName)
  const taken = occupancy(state)
  const found: TanglePiece[] = []
  for (const id of tangled) {
    const g = state.glyphlings.find((x) => x.id === id)
    if (!g) continue
    for (const n of neighbours(board, g.hex)) {
      const who = taken.get(hexKey(n))
      if (who && who.seat !== g.seat) found.push({ glyphling: id, hex: n, seat: who.seat, amount: state.config.rules.tangleBonus })
    }
  }
  return found
}

/**
 * Each tangled glyphling's bonus: every OTHER seat gets tangleBonus × (its seeds + glyphlings next to it).
 * The owner gets nothing from their own pieces.
 */
export function tangleDetails(state: GameState, tangled: number[]): LogTangle[] {
  const pieces = tanglePieces(state, tangled)
  const details: LogTangle[] = []
  for (const id of tangled) {
    const g = state.glyphlings.find((x) => x.id === id)
    if (!g) continue
    const count: number[] = Array(state.config.players).fill(0)
    for (const p of pieces) if (p.glyphling === id) count[p.seat] += 1
    details.push({ glyphling: id, owner: g.seat, pieces: count, bonus: count.map((p) => p * state.config.rules.tangleBonus) })
  }
  return details
}

/** The tangle bonus per seat: every tangled glyphling's bonus added up (tangleDetails). */
export function tangleBonus(state: GameState, tangled: number[]): number[] {
  const bonus: number[] = Array(state.config.players).fill(0)
  for (const t of tangleDetails(state, tangled)) t.bonus.forEach((b, seat) => (bonus[seat] += b))
  return bonus
}

/** Seats with the most Magic (ties share the win). */
export function winnersOf(magic: number[]): number[] {
  const top = Math.max(...magic)
  return magic.flatMap((m, seat) => (m === top ? [seat] : []))
}

/**
 * Called when a turn is complete: re-checks every glyphling (one can come untangled), logs the turn (log.ts),
 * then either ends the game or passes play to the next seat. `refreshed` = seeds set aside on a refresh (null = none).
 * `fast` (bots, sims): no log entry and no log end — the game itself plays exactly the same.
 */
export function endTurn(state: GameState, refreshed: number | null = null, fast = false): GameState {
  const tangled = tangledIds(state)
  const turnCount = state.turnCount + 1
  const entry = fast ? null : logTurn(state, tangled, refreshed)
  const before = logOf(state)
  const log = entry ? { turns: [...before.turns, entry], end: null } : { ...emptyLog(), ...before }
  // Who plays next (the Table's flow): the next seat in this game's turn order, skipping any seat whose glyphlings are
  // all tangled — it has no move to make. Nobody left who can move (only possible when tanglesToEnd is set above 2)
  // also ends the game. (Walks the order's places round like seats round a table.)
  const canMove = (seat: number) => state.glyphlings.some((g) => g.seat === seat && !tangled.includes(g.id))
  const order = turnOrderOf(state)
  const place = nextClockwise(order.indexOf(state.current), order.length, (p) => canMove(order[p]))
  const next = place === null ? null : order[place]
  if (tangled.length >= state.config.rules.tanglesToEnd || next === null) {
    const tangles = tangleDetails(state, tangled)
    const tangleMagic = tangleBonus(state, tangled)
    const magic = state.magic.map((m, seat) => m + tangleMagic[seat])
    const end = entry ? logEnd(state, entry, tangles, tangleMagic, magic) : null
    return { ...state, phase: 'over', tangled, tangleMagic, magic, winners: winnersOf(magic), turnCount, log: { ...log, end }, pendingLog: null }
  }
  return { ...state, phase: 'play', tangled, current: next, turnCount, log, pendingLog: null }
}

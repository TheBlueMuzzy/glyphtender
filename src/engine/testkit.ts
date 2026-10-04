// Helpers for tests: build small hand-made board positions using Muzzy's hex labels ("C6-3").
import { getBoard } from './boards'
import { hexKey, type Hex } from './hex'
import { applyAction, checkAction, previewTurn } from './engine'
import { newGame, seedIdGiver } from './setup'
import type { TurnAction } from './turn'
import type { Action, GameState, RuleNumbers, SeedPiece, WordList } from './types'
import type { ApplyOptions } from '../table/core'

/** The hex with designer label `label` (e.g. "C6-3") on a board. Throws if there's no such hex. */
export function hexAt(label: string, boardName = 'small'): Hex {
  const board = getBoard(boardName)
  const hex = board.cells.find((h) => board.label(h) === label)
  if (!hex) throw new Error(`No hex ${label} on the ${boardName} board`)
  return hex
}

/** Seeds to place: label → letter, owned by `seat`. */
export type SeedPlan = Record<string, string>

export interface PositionPlan {
  players?: number
  boardName?: string
  rules?: Partial<RuleNumbers>
  /** Glyphlings by id → label, e.g. { 0: 'C3-4', 1: 'C9-4', 2: 'C6-2', 3: 'C6-8' }. Seat = floor(id / 2). */
  glyphlings: Record<number, string>
  /** Seeds per seat, e.g. [{ 'C6-3': 'A' }, { 'C6-4': 'T' }]. */
  seeds?: SeedPlan[]
  /** Hands per seat; missing seats get an empty hand. */
  hands?: string[][]
  /** The bag (front = next draw). Defaults to empty. */
  bag?: string[]
  current?: number
}

/** A game in the play phase with exactly the pieces asked for — nothing else on the board.
 *  Seeds are written as letters; each gets a stable id the way an old save does (setup.ts seedIdGiver):
 *  planted seeds first, then each hand, then the bag. */
export function position(plan: PositionPlan): GameState {
  const players = plan.players ?? 2
  const boardName = plan.boardName ?? 'small'
  const base = newGame({ players, seed: 1, boardName, rules: plan.rules })
  const glyphlings = Object.entries(plan.glyphlings).map(([id, label]) => ({
    id: Number(id),
    seat: Math.floor(Number(id) / 2),
    hex: hexAt(label, boardName),
  }))
  const giveId = seedIdGiver()
  const seeds: GameState['seeds'] = {}
  const seedPlans = plan.seeds ?? []
  seedPlans.forEach((perSeat, seat) => {
    for (const [label, letter] of Object.entries(perSeat)) seeds[hexKey(hexAt(label, boardName))] = { ...giveId(letter), seat }
  })
  const hands = Array.from({ length: players }, (_, seat) => (plan.hands?.[seat] ?? []).map(giveId))
  return {
    ...base,
    phase: 'play',
    draftIndex: base.draftOrder.length,
    current: plan.current ?? 0,
    glyphlings,
    seeds,
    hands,
    bag: (plan.bag ?? []).map(giveId),
  }
}

/** Just the letters of some seeds, e.g. a hand → ['T', 'E'] (tests compare letters; ids are stable but arbitrary). */
export const lettersOf = (seeds: readonly SeedPiece[]) => seeds.map((s) => s.letter)

/** An action as a test writes it: a seed in hand by its POSITION (0 = first) or by its id. */
export type TestAction =
  | Extract<Action, { type: 'draft' }>
  | (Omit<TurnAction, 'seed'> & { seed: number | string | null })
  | { type: 'refresh'; setAside: (number | string)[] }

/** A test's action → a real one: each hand position becomes the id of the seed there (in the current player's hand). */
export function byPosition(state: GameState, action: TestAction): Action {
  const hand = state.hands[state.current]
  const idAt = (seed: number | string) => (typeof seed === 'string' ? seed : hand[seed]?.id ?? `no seed at position ${seed}`)
  if (action.type === 'turn') return { ...action, seed: action.seed === null ? null : idAt(action.seed) }
  if (action.type === 'refresh') return { type: 'refresh', setAside: action.setAside.map(idAt) }
  return action
}

/** applyAction / checkAction / previewTurn for a test action that names seeds by hand position. */
export const applyAt = (state: GameState, action: TestAction, words: WordList, options?: ApplyOptions) =>
  applyAction(state, byPosition(state, action), words, options)
export const checkAt = (state: GameState, action: TestAction) => checkAction(state, byPosition(state, action))
export const previewAt = (state: GameState, action: TestAction & { type: 'turn' }, words: WordList) =>
  previewTurn(state, byPosition(state, action) as TurnAction, words)

/** A tiny word list for tests. */
export const wordsOf = (...list: string[]) => new Map(list.map((w) => [w, 1]))

// Starting a new game: the shuffled bag and the snake draft order.
import bagJson from '../../content/data/bag.json'
import { defaultBoardFor, defaultRules, getBoard } from './boards'
import { emptyLog } from './log'
import { shuffle } from './rng'
import { snakeOrder } from '../table/flow'
import { stableIds } from '../table/zones'
import type { GameConfig, GameState, RuleNumbers, SeedPiece } from './types'

/** Every seed in the bag (content/data/bag.json), unshuffled, e.g. ["A","A",…,"Q",…]. */
export function fullBag(): string[] {
  const seeds: string[] = []
  for (const [letter, count] of Object.entries(bagJson.seeds)) {
    for (let i = 0; i < count; i++) seeds.push(letter)
  }
  return seeds
}

/** Every seed in the box as a piece with its stable id, in fullBag's UNSHUFFLED order: "seed-0" is the first A…
 *  The id says which seed it is, never where it sits in the shuffled bag. */
export function bagPieces(): SeedPiece[] {
  return stableIds('seed', fullBag().map((letter) => ({ letter })))
}

/**
 * Hands out ids for seeds known only by their letter (hand-made test positions, games saved before seeds had ids):
 * each letter gets the first box id of that letter not handed out yet, so the same letters always get the same ids.
 * `alreadyUsed`: ids that are taken already (never handed out again).
 * (A made-up position can hold more of a letter than the box does — those get "seed-extra-1", "seed-extra-2"…)
 */
export function seedIdGiver(alreadyUsed: readonly string[] = []): (letter: string) => SeedPiece {
  const unused = bagPieces().filter((p) => !alreadyUsed.includes(p.id))
  let extras = 0
  return (letter) => {
    const i = unused.findIndex((p) => p.letter === letter)
    if (i < 0) return { id: `seed-extra-${++extras}`, letter }
    return unused.splice(i, 1)[0]
  }
}

export interface NewGameOptions {
  players: number
  seed: number
  /** Defaults to the board for this player count in boards.json. */
  boardName?: string
  /** Change any rule numbers (e.g. minWordLength 3); the rest come from content/tuning/rules.json. */
  rules?: Partial<RuleNumbers>
}

/** A fresh game in the draft phase: shuffled bag, nobody placed yet, no hands dealt. */
export function newGame(options: NewGameOptions): GameState {
  const { players, seed } = options
  if (!Number.isInteger(players) || players < 2 || players > 4) throw new Error(`Players must be 2–4, got ${players}`)
  const boardName = options.boardName ?? defaultBoardFor(players)
  getBoard(boardName) // throws if the board doesn't exist
  const config: GameConfig = { players, boardName, seed, rules: { ...defaultRules(), ...options.rules } }
  // The box list gets its ids first, THEN is shuffled — the same shuffle (same random calls, same order) as before ids.
  const shuffled = shuffle(seed, bagPieces())
  return {
    config,
    phase: 'draft',
    current: 0,
    draftOrder: snakeOrder(players, 2), // the Table flow's snake draft: 1-2-2-1, 1-2-3-3-2-1, 1-2-3-4-4-3-2-1
    draftIndex: 0,
    glyphlings: [],
    seeds: {},
    hands: Array.from({ length: players }, () => []),
    bag: shuffled.items,
    magic: Array(players).fill(0),
    tangled: [],
    lastTurn: null,
    tangleMagic: Array(players).fill(0),
    winners: [],
    turnCount: 0,
    rng: shuffled.rng,
    log: emptyLog(),
  }
}

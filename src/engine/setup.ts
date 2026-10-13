// Starting a new game: the shuffled bag and the snake draft order.
import bagJson from '../../content/data/bag.json'
import rulesJson from '../../content/tuning/rules.json'
import { defaultBoardFor, defaultRules, getBoard } from './boards'
import { emptyLog } from './log'
import { shuffle } from './rng'
import { snakeOrder } from '../table/flow'
import { stableIds } from '../table/zones'
import type { ExtraWords, GameConfig, GameState, RuleNumbers, SeedPiece } from './types'
import { onlySwitchedOn } from './words'

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
  /** The order seats take turns, e.g. [2,0,3,1] (default 0,1,2,3 — Yellow, Blue, Purple, Pink). The first drafts
   *  first and plays first. Real games pick it with pickTurnOrder. */
  turnOrder?: number[]
  /** F71: count British spellings / vulgar words in this game (Settings; online the host's). Off when missing. */
  extraWords?: ExtraWords
  /** F76: a fixed start (the tutorial game). Missing = the normal shuffled bag. */
  stack?: SeedStack
}

/** F76: the seeds a fixed start hands out, as letters. `hands`: each seat's starting hand (by seat; dealt when the
 *  draft ends — a hand shorter than the hand size is topped up from the shuffled bag). `next`: what the bag gives
 *  after the deal (refills and draws), in order. Everything else is the normal shuffle(seed) of the seeds left.
 *  Seeds keep their normal box ids (the first unused one of that letter). */
export interface SeedStack {
  hands?: string[][]
  next?: string[]
}

/** The bag for a fixed start: each stacked hand (topped up from the shuffle), then `next`, then the rest shuffled. */
function stackedBag(seed: number, stack: SeedStack, handSize: number, players: number): { items: SeedPiece[]; rng: number } {
  const giveId = seedIdGiver()
  const take = (letter: string) => {
    const piece = giveId(letter)
    if (piece.id.startsWith('seed-extra')) throw new Error(`The bag has no more ${letter} seeds to stack`)
    return piece
  }
  const hands = Array.from({ length: players }, (_, seat) => (stack.hands?.[seat] ?? []).map(take))
  if (hands.some((hand) => hand.length > handSize)) throw new Error(`A stacked hand holds more than ${handSize} seeds`)
  const next = (stack.next ?? []).map(take)
  const used = new Set([...hands.flat(), ...next].map((p) => p.id))
  const rest = shuffle(seed, bagPieces().filter((p) => !used.has(p.id)))
  const left = [...rest.items]
  const dealt = hands.flatMap((hand) => [...hand, ...left.splice(0, handSize - hand.length)])
  return { items: [...dealt, ...next, ...left], rng: rest.rng }
}

/** The turn order for a new game: all seats shuffled when content/tuning/rules.json "randomTurnOrder" is 1
 *  (Muzzy 2026-10-07: "shuffle the whole order" — a new order every game), else 0,1,2,3.
 *  `randomNumber`: any whole number (a fresh random seed). GDD §9 — F46. */
export function pickTurnOrder(players: number, randomNumber: number): number[] {
  const seats = Array.from({ length: players }, (_, seat) => seat)
  return rulesJson.randomTurnOrder ? shuffle(Math.abs(Math.floor(randomNumber)), seats).items : seats
}

/** The order seats take turns in this game (games saved before F46 have none: 0,1,2,3). */
export function turnOrderOf(state: GameState): number[] {
  return state.turnOrder ?? Array.from({ length: state.config.players }, (_, seat) => seat)
}

/** A fresh game in the draft phase: shuffled bag, nobody placed yet, no hands dealt. */
export function newGame(options: NewGameOptions): GameState {
  const { players, seed } = options
  if (!Number.isInteger(players) || players < 2 || players > 4) throw new Error(`Players must be 2–4, got ${players}`)
  const turnOrder = options.turnOrder ?? Array.from({ length: players }, (_, seat) => seat)
  if (turnOrder.length !== players || [...turnOrder].sort().some((seat, i) => seat !== i)) throw new Error(`The turn order must name every seat once, got ${turnOrder}`)
  const boardName = options.boardName ?? defaultBoardFor(players)
  getBoard(boardName) // throws if the board doesn't exist
  const config: GameConfig = { players, boardName, seed, rules: { ...defaultRules(), ...options.rules } }
  const extraWords = onlySwitchedOn(options.extraWords)
  if (extraWords) config.extraWords = extraWords // (both off: no field at all — the same games as before F71)
  // The box list gets its ids first, THEN is shuffled — the same shuffle (same random calls, same order) as before ids.
  const shuffled = options.stack ? stackedBag(seed, options.stack, config.rules.handSize, players) : shuffle(seed, bagPieces())
  return {
    config,
    phase: 'draft',
    current: turnOrder[0],
    turnOrder,
    // The Table flow's snake draft (1-2-2-1, 1-2-3-3-2-1, 1-2-3-4-4-3-2-1) in this game's turn order
    draftOrder: snakeOrder(players, 2).map((place) => turnOrder[place]),
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

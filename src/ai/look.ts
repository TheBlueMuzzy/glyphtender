// THE AI'S EYES — board facts every part of the AI needs: what a turn would do to the board, which words it would
// grow, how many moves each glyphling would have, and who "owns" which part of the garden (territory).
// Pure: reads a game, returns numbers. It never decides anything (the goals in goals/ and decisions.ts do).
//
// Speed: the brain scores hundreds of moves, each by 7 goals, in up to 4 imagined worlds. Everything here depends
// ONLY on the board and the bot's own seeds — the same in every imagined world — so it's worked out once per board
// and remembered (boardMemo), not once per goal per world.
import { getBoard } from '../engine/boards'
import { DIRECTIONS, LEYLINES, addHex, hexKey, type Hex } from '../engine/hex'
import { legalCasts, legalMoves } from '../engine/moves'
import { magicFor } from '../engine/turn'
import { findWords } from '../engine/wordFinder'
import { SEAT_COLOURS, type Action, type GameState, type MadeWord, type WordList } from '../engine/types'

export type TurnAction = Extract<Action, { type: 'turn' }>

/** "Yellow", "Blue"… — a seat's colour as a name, for the notes. */
export const seatName = (seat: number) => {
  const c = SEAT_COLOURS[seat] ?? `seat ${seat}`
  return c.charAt(0).toUpperCase() + c.slice(1)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** A reading: any number squeezed into 0–10, rounded to one decimal. */
export const reading = (v: number) => Math.round(clamp(v, 0, 10) * 10) / 10

/** Steps between two hexes (axial coordinates). */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

// ── Remembering per board ────────────────────────────────────────────────────────────────────────────────────────
// The engine never changes a game in place: a new board = new `seeds` / `glyphlings` objects. So "the same board" =
// the same two objects, and what we worked out for it can be looked up by them. (WeakMap: forgotten with the board.)
const memos = new WeakMap<object, WeakMap<object, Map<string, unknown>>>()

/** The scratch space for this board (its seeds + glyphlings). Imagined worlds share their view's board, so they share it. */
export function boardMemo(state: GameState): Map<string, unknown> {
  let bySeeds = memos.get(state.seeds)
  if (!bySeeds) memos.set(state.seeds, (bySeeds = new WeakMap()))
  let memo = bySeeds.get(state.glyphlings)
  if (!memo) bySeeds.set(state.glyphlings, (memo = new Map()))
  return memo
}

/** Look `key` up in `memo`, working it out with `make` the first time. */
export function remember<T>(memo: Map<string, unknown>, key: string, make: () => T): T {
  if (memo.has(key)) return memo.get(key) as T
  const value = make()
  memo.set(key, value)
  return value
}

// ── Moves ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every hex with a seed or a glyphling on it. */
export function occupiedHexes(state: GameState): Set<string> {
  const taken = new Set(Object.keys(state.seeds))
  for (const g of state.glyphlings) taken.add(hexKey(g.hex))
  return taken
}

/** How many hexes a glyphling on `from` could move to (straight lines, stopping before anything). */
export function movesFrom(state: GameState, taken: Set<string>, from: Hex): number {
  const board = getBoard(state.config.boardName)
  let count = 0
  for (const dir of DIRECTIONS) {
    for (let h = addHex(from, dir); board.has(h) && !taken.has(hexKey(h)); h = addHex(h, dir)) count++
  }
  return count
}

/** In how many of the 6 directions a glyphling on `from` can move at all. */
export function openDirections(state: GameState, taken: Set<string>, from: Hex): number {
  const board = getBoard(state.config.boardName)
  return DIRECTIONS.filter((d) => {
    const h = addHex(from, d)
    return board.has(h) && !taken.has(hexKey(h))
  }).length
}

/** Every glyphling's legal moves, by glyphling id (the same numbers as insight.ts mobilityOf, worked out faster). */
export function mobility(state: GameState): number[] {
  const taken = occupiedHexes(state)
  const out: number[] = []
  for (const g of state.glyphlings) out[g.id] = movesFrom(state, taken, g.hex)
  return out
}

/** Every glyphling's legal moves on this board, remembered. */
export const mobilityNow = (state: GameState): number[] => remember(boardMemo(state), 'mobility', () => mobility(state))

// ── Territory (Amazons-style: who reaches each hex first) ───────────────────────────────────────────────────────

/**
 * How many moves each seat's glyphlings need to reach each hex (a move = any distance in a straight line, like the
 * rules), and so how many hexes each seat reaches FIRST — strictly before every other seat. A hex two seats reach in
 * the same number of moves belongs to nobody. Glyphlings and seeds block the way (the movers' own starting hexes too).
 */
export function territory(state: GameState): number[] {
  const grid = gridOf(state.config.boardName)
  const count = grid.cells.length
  const blocked = new Uint8Array(count)
  for (const key of Object.keys(state.seeds)) blocked[grid.numberOf.get(key)!] = 1
  for (const g of state.glyphlings) blocked[grid.numberOf.get(hexKey(g.hex))!] = 1
  const players = state.config.players
  const FAR = 9999
  const distances: Int16Array[] = []
  for (let seat = 0; seat < players; seat++) {
    const dist = new Int16Array(count).fill(FAR)
    let frontier = state.glyphlings.filter((g) => g.seat === seat).map((g) => grid.numberOf.get(hexKey(g.hex))!)
    for (let step = 1; frontier.length > 0; step++) {
      const reached: number[] = []
      for (const from of frontier) {
        for (let dir = 0; dir < 6; dir++) {
          // Slide along the line until something is in the way (a hex reached already doesn't stop the slide).
          for (let c = grid.next[from * 6 + dir]; c >= 0 && !blocked[c]; c = grid.next[c * 6 + dir]) {
            if (dist[c] !== FAR) continue
            dist[c] = step
            reached.push(c)
          }
        }
      }
      frontier = reached
    }
    distances.push(dist)
  }
  const owned = Array(players).fill(0)
  for (let c = 0; c < count; c++) {
    let best = FAR
    let who = -1
    for (let seat = 0; seat < players; seat++) {
      const d = distances[seat][c]
      if (d < best) [best, who] = [d, seat]
      else if (d === best) who = -1 // a tie: nobody's
    }
    if (who >= 0) owned[who]++
  }
  return owned
}

/** A board as numbered cells, for the territory count (it runs hundreds of times per decision, so it works on plain
 *  numbers instead of "q,r" text): next[cell × 6 + direction] = the neighbouring cell's number, or -1 off the board. */
interface Grid {
  cells: Hex[]
  numberOf: Map<string, number>
  next: Int16Array
}
const grids = new Map<string, Grid>()

function gridOf(boardName: string): Grid {
  const known = grids.get(boardName)
  if (known) return known
  const board = getBoard(boardName)
  const numberOf = new Map(board.cells.map((h, i) => [hexKey(h), i]))
  const next = new Int16Array(board.cells.length * 6)
  board.cells.forEach((h, i) => DIRECTIONS.forEach((d, dir) => (next[i * 6 + dir] = numberOf.get(hexKey(addHex(h, d))) ?? -1)))
  const grid = { cells: board.cells, numberOf, next }
  grids.set(boardName, grid)
  return grid
}

/** Territory on this board, remembered. */
export const territoryNow = (state: GameState): number[] => remember(boardMemo(state), 'territory', () => territory(state))

// ── What a turn would do ─────────────────────────────────────────────────────────────────────────────────────────

/** A turn's result before scoring: the board after the move and the cast. */
export interface Outcome {
  /** The board after the move + cast (no Magic, no draw — those don't change the board). Its RIVALS' hands are from
   *  whichever imagined world asked first: never read them from here (DENY reads its own world's). */
  after: GameState
  /** The letter cast (null = moved only). */
  letter: string | null
  /** The words the cast grows, with their Magic (for the seat whose turn it is). */
  made: MadeWord[]
  magic: number
}

/** The board after a turn. No rule checks: the AI only ever looks at legal moves (rules.legalActions). */
function boardAfter(state: GameState, action: TurnAction): { after: GameState; letter: string | null } {
  const glyphlings = state.glyphlings.map((g) => (g.id === action.glyphling ? { ...g, hex: { ...action.to } } : g))
  if (action.seed === null || !action.target) return { after: { ...state, glyphlings }, letter: null }
  const hand = state.hands[state.current]
  const seed = hand.find((s) => s.id === action.seed)
  if (!seed) throw new Error(`The AI tried to cast seed ${action.seed}, which isn't in its hand`)
  const seeds = { ...state.seeds, [hexKey(action.target)]: { ...seed, seat: state.current } }
  return { after: { ...state, glyphlings, hands: state.hands.map((h, s) => (s === state.current ? h.filter((x) => x !== seed) : h)), seeds }, letter: seed.letter }
}

/** A stable text key for a turn (the plug's key uses it too). */
export const turnKey = (a: TurnAction) => `${a.glyphling}>${hexKey(a.to)} ${a.seed ?? '-'}@${a.target ? hexKey(a.target) : '-'}`

/** What this turn would do — worked out once per board and remembered. */
export function outcomeOf(state: GameState, action: TurnAction, words: WordList): Outcome {
  return remember(boardMemo(state), `outcome ${turnKey(action)}`, () => {
    const { after, letter } = boardAfter(state, action)
    const made = action.target && letter ? magicFor(after, findWords(after, action.target, words), state.current) : []
    return { after, letter, made, magic: made.reduce((s, w) => s + w.magic, 0) }
  })
}

/** Every glyphling's moves after this turn (by id), remembered. */
export const mobilityAfter = (state: GameState, action: TurnAction, words: WordList): number[] =>
  remember(boardMemo(state), `mobility ${turnKey(action)}`, () => mobility(outcomeOf(state, action, words).after))

/** Territory after this turn, remembered. */
export const territoryAfter = (state: GameState, action: TurnAction, words: WordList): number[] =>
  remember(boardMemo(state), `territory ${turnKey(action)}`, () => territory(outcomeOf(state, action, words).after))

// ── Cast reach (a speller's room to score) ──────────────────────────────────────────────────────────────────────

/** For each seat: how many different empty hexes it could cast a seed into on its next turn (any untangled glyphling,
 *  any legal move, then any legal cast — the engine's own rules). A speller needs these, not moves: squeezing them
 *  is how a hunter beats a speller (F45, Muzzy's rock-paper-scissors). */
export function castReach(state: GameState): number[] {
  const out = state.magic.map(() => 0)
  for (let seat = 0; seat < out.length; seat++) {
    const spots = new Set<string>()
    for (const g of state.glyphlings) {
      if (g.seat !== seat) continue
      for (const to of legalMoves(state, g.id)) for (const h of legalCasts(state, g.id, to)) spots.add(hexKey(h))
    }
    out[seat] = spots.size
  }
  return out
}

export const castReachNow = (state: GameState): number[] => remember(boardMemo(state), 'castReach', () => castReach(state))

/** Cast reach after this turn, remembered. */
export const castReachAfter = (state: GameState, action: TurnAction, words: WordList): number[] =>
  remember(boardMemo(state), `castReach ${turnKey(action)}`, () => castReach(outcomeOf(state, action, words).after))

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The lowest Zipf score a word needs for this bot to AIM for it — set by the SKILL only (Muzzy, 2026-10-04: "amount
 *  of words is dictated by difficulty"; Zipf = how common a word is, 0 = rare/unknown). Any word still scores by the
 *  rules if it happens. */
export function vocabularyOf(skillExtras?: Record<string, number>): number {
  return skillExtras?.zipf ?? 0
}

/** Does this bot know the word well enough to aim for it? */
export const knows = (words: WordList, word: string, vocabulary: number) => (words.get(word) ?? -1) >= vocabulary

/** The letters on the unbroken line of seeds through `at` along `dir` (reading order), and the hexes just before and
 *  just after it (where the line could grow). */
export function lineThrough(state: GameState, at: Hex, dir: Hex): { hexes: Hex[]; before: Hex; after: Hex } {
  const back = { q: -dir.q, r: -dir.r }
  let first = at
  while (state.seeds[hexKey(addHex(first, back))]) first = addHex(first, back)
  const hexes: Hex[] = []
  let h = first
  for (; state.seeds[hexKey(h)]; h = addHex(h, dir)) hexes.push(h)
  return { hexes, before: addHex(first, back), after: h }
}

export { LEYLINES }

// ── Letters ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])
/** Letters that are hard to use (few words take them). */
export const HARD_LETTERS = new Set(['J', 'Q', 'X', 'Z', 'V', 'K'])

/** How much of a nuisance one letter is in this hand, 0 = fine: a hard letter, a third copy, too many vowels… */
export function junkiness(letter: string, hand: readonly string[]): number {
  let junk = 0
  if (HARD_LETTERS.has(letter)) junk += 3
  const copies = hand.filter((l) => l === letter).length
  if (copies >= 2) junk += 2 * (copies - 1)
  const vowels = hand.filter((l) => VOWELS.has(l)).length
  if (VOWELS.has(letter) && vowels > hand.length * 0.6) junk += 2
  if (!VOWELS.has(letter) && vowels < hand.length * 0.2) junk += 1
  return junk
}

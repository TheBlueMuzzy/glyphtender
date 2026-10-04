// GLYPHTENDER'S RULES CONTRACT — the engine plugged into the framework's Table (src/table/core.ts, TDD D59).
// Every change to a game goes through glyphtenderRules(words).apply: the phone, the online server, bots, sims,
// golden games, the Dev Kit's samples and the dev jumps. It never re-writes a rule — it calls the same engine
// (engine.ts applyAction / checkAction, setup.ts newGame) and adds what the Table asks for:
//   setup → a new game (online too: the server's extra secret numbers are part of the setup, so a game replays exactly)
//   legalActions → every choice a seat has right now (same-letter seeds count once)
//   check → may this seat do this? (plain English)  ·  apply → the new game + its events
//   isOver · toAct → who may act now · viewFor → the game with everything secret from that seat taken out
import { emptyLog } from './log'
import { applyAction, checkAction, legalCasts, legalDraftHexes, legalMoves, newGame } from './engine'
import { shuffle } from './rng'
import type { NewGameOptions } from './setup'
import type { Action, GameState, WordList } from './types'
import type { ApplyOptions, Applied, Audience, Rules, Seat } from '../table/core'
import type { Hex } from './hex'

/** What a new game needs. The same as newGame's options, plus two numbers only the online server uses. */
export interface GameSetup extends NewGameOptions {
  /** Online only: a second secret number the bag is shuffled again with (party/glyphtenderRules.ts onStart). */
  bagSeed?: number
  /** Online only: a third secret number — where the rng starts (it picks where set-aside seeds go back in the bag). */
  rngSeed?: number
}

/** What one seat may see: the game itself, with the secrets taken out (other hands, the bag, Magic…). */
export type SeatView = GameState

/**
 * Something that happened — for animations, sound and online replays (F31; nothing on screen reads them yet).
 * Each says who may see it (`seen`). The rule: an event for everyone holds only what everyone's view shows anyway —
 * no seed in anyone's hand, nothing from the bag, and no Magic until the game is over (views zero all Magic, even
 * your own; with word indicators off you spot your own words). So 'scored' names the words, not their Magic.
 */
export type GameEvent =
  /** A glyphling was placed in the draft. */
  | { type: 'placed'; seen: 'all'; seat: Seat; glyphling: number; hex: Hex }
  | { type: 'moved'; seen: 'all'; seat: Seat; glyphling: number; from: Hex; to: Hex }
  /** A seed was cast onto the board (its letter is on the board for all to see now). */
  | { type: 'cast'; seen: 'all'; seat: Seat; letter: string; target: Hex }
  /** The cast grew these words (their Magic stays secret until the end: gameOver). */
  | { type: 'scored'; seen: 'all'; seat: Seat; words: { word: string; hexes: Hex[] }[] }
  /** Seeds drawn into a hand (the deal, a draw after Magic, a refresh's refill) — the letters, for that seat only. */
  | { type: 'drew'; seen: Audience; seat: Seat; letters: string[] }
  /** …and for everyone else: only how many. */
  | { type: 'drewHidden'; seen: Audience; seat: Seat; count: number }
  /** A refresh: how many seeds went back into the bag (everyone)… */
  | { type: 'refreshed'; seen: 'all'; seat: Seat; count: number }
  /** …and which letters (that seat only). */
  | { type: 'setAside'; seen: Audience; seat: Seat; letters: string[] }
  /** Glyphlings that just got tangled, and ones that came free. */
  | { type: 'tangled'; seen: 'all'; tangled: number[]; freed: number[] }
  /** Who acts now, and what kind of step it is (a draft placement, a turn, or the refresh after a turn). */
  | { type: 'turnStarted'; seen: 'all'; seat: Seat; phase: 'draft' | 'play' | 'refresh' }
  /** The end: the whole truth (every Magic number, the tangle bonus, who won). */
  | { type: 'gameOver'; seen: 'all'; winners: Seat[]; magic: number[]; tangleMagic: number[] }

/** What stands in for a seed nobody may see (another player's hand, the bag). */
export const HIDDEN = '?'

/** A new game. Online, the bag is shuffled again and the rng re-seeded with the server's secret numbers. */
export function setupGame(setup: GameSetup): GameState {
  const made = newGame(setup)
  return {
    ...made,
    bag: setup.bagSeed === undefined ? made.bag : shuffle(setup.bagSeed, made.bag).items,
    rng: setup.rngSeed === undefined ? made.rng : setup.rngSeed,
  }
}

/** Why `seat` may not do `action` now, or null if it may. */
export function checkFor(state: GameState, seat: Seat, action: Action): string | null {
  if (state.phase === 'over') return 'The game is over.'
  if (seat !== state.current) return 'It’s not your turn.'
  return checkAction(state, action)
}

/**
 * Every action `seat` may take right now, each choice once:
 *   draft   — every legal hex
 *   play    — each of their glyphlings × each legal move × (each seed LETTER × each cast target),
 *             or the move alone when there's nothing to cast or nowhere to cast it (checkTurn's rule)
 *   refresh — every different set of LETTERS to set aside (keep all = setting aside nothing)
 * Two E's in hand are one choice: the first E stands for both.
 */
export function legalActions(state: GameState, seat: Seat): Action[] {
  if (state.phase === 'over' || seat !== state.current) return []
  if (state.phase === 'draft') return legalDraftHexes(state).map((hex) => ({ type: 'draft', hex }))
  const hand = state.hands[seat]
  if (state.phase === 'refresh') return setAsideChoices(hand).map((setAside) => ({ type: 'refresh', setAside }))

  const actions: Action[] = []
  const seeds = firstOfEachLetter(hand)
  for (const g of state.glyphlings.filter((x) => x.seat === seat)) {
    for (const to of legalMoves(state, g.id)) {
      const casts = legalCasts(state, g.id, to)
      if (hand.length === 0 || casts.length === 0) {
        actions.push({ type: 'turn', glyphling: g.id, to, seed: null, target: null })
        continue
      }
      for (const seed of seeds) for (const target of casts) actions.push({ type: 'turn', glyphling: g.id, to, seed, target })
    }
  }
  return actions
}

/** The hand index of the first seed of each letter, e.g. [E, A, E] → [0, 1]. */
function firstOfEachLetter(hand: string[]): number[] {
  return hand.flatMap((letter, i) => (hand.indexOf(letter) === i ? [i] : []))
}

/**
 * Every different set of letters that could be set aside, as hand indexes (smallest first).
 * For each letter, set aside none of it, its first one, its first two… e.g. [E, A, E] → 3 × 2 = 6 choices.
 */
function setAsideChoices(hand: string[]): number[][] {
  let choices: number[][] = [[]]
  for (const first of firstOfEachLetter(hand)) {
    const sameLetter = hand.flatMap((letter, i) => (letter === hand[first] ? [i] : []))
    const next: number[][] = []
    for (const choice of choices) {
      for (let count = 0; count <= sameLetter.length; count++) next.push([...choice, ...sameLetter.slice(0, count)])
    }
    choices = next
  }
  return choices.map((choice) => [...choice].sort((a, b) => a - b))
}

/** The game as `seat` may see it (seat -1 = someone not playing: sees no hand at all).
 *  Until the game is over: other players' seeds and the bag become '?' (you may know how many, never which), the rng,
 *  the random seed and every Magic number are zeroed, and the game log (every turn's words, Magic and running totals)
 *  is EMPTY (D47/D48). At game over everyone gets the whole truth, log and all. (Online: party/views.ts.) */
export function viewFor(game: GameState, seat: Seat): SeatView {
  if (game.phase === 'over') return game // the reveal: everything is shown
  const zeros = game.magic.map(() => 0)
  return {
    ...game,
    config: { ...game.config, seed: 0 }, // the seed + the moves would rebuild the bag
    hands: game.hands.map((hand, s) => (s === seat ? [...hand] : hand.map(() => HIDDEN))),
    bag: game.bag.map(() => HIDDEN),
    rng: 0,
    magic: zeros,
    tangleMagic: zeros,
    winners: [],
    log: emptyLog(), // the running totals + every word's Magic: never before the end (D47)
    pendingLog: null, // what a rival could have spelled with their hand (Weed toss): log-only, never before the end
    lastTurn: game.lastTurn && {
      ...game.lastTurn,
      magic: 0,
      words: game.lastTurn.words.map((word) => ({ ...word, magic: 0 })),
    },
  }
}

/** What `action` (played by `seat`) did, as events — read from the game before and after it. */
export function eventsOf(before: GameState, seat: Seat, action: Action, after: GameState): GameEvent[] {
  const events: GameEvent[] = []
  const everyoneBut = (who: Seat) => ({ seats: before.hands.map((_, s) => s).filter((s) => s !== who) })
  const drew = (who: Seat, letters: string[]) => {
    if (letters.length === 0) return
    events.push({ type: 'drew', seen: { seats: [who] }, seat: who, letters })
    events.push({ type: 'drewHidden', seen: everyoneBut(who), seat: who, count: letters.length })
  }

  if (action.type === 'draft') {
    const placed = after.glyphlings[after.glyphlings.length - 1]
    events.push({ type: 'placed', seen: 'all', seat, glyphling: placed.id, hex: { ...placed.hex } })
    if (after.phase !== 'draft') after.hands.forEach((hand, s) => drew(s, [...hand])) // the draft is over: the deal
  }

  if (action.type === 'turn') {
    const turn = after.lastTurn!
    events.push({ type: 'moved', seen: 'all', seat, glyphling: turn.glyphlingId, from: { ...turn.from }, to: { ...turn.to } })
    if (turn.letter !== null && turn.target) events.push({ type: 'cast', seen: 'all', seat, letter: turn.letter, target: { ...turn.target } })
    if (turn.words.length > 0) {
      events.push({ type: 'scored', seen: 'all', seat, words: turn.words.map((w) => ({ word: w.word, hexes: w.hexes.map((h) => ({ ...h })) })) })
    }
    // A draw lands on the end of the hand: whatever is past the seeds that were left after the cast
    const left = before.hands[seat].length - (action.seed === null ? 0 : 1)
    drew(seat, after.hands[seat].slice(left))
  }

  if (action.type === 'refresh') {
    const hand = before.hands[seat]
    events.push({ type: 'refreshed', seen: 'all', seat, count: action.setAside.length })
    if (action.setAside.length > 0) {
      events.push({ type: 'setAside', seen: { seats: [seat] }, seat, letters: action.setAside.map((i) => hand[i]) })
    }
    drew(seat, after.hands[seat].slice(hand.length - action.setAside.length)) // the refill comes after the kept seeds
  }

  const tangled = after.tangled.filter((id) => !before.tangled.includes(id))
  const freed = before.tangled.filter((id) => !after.tangled.includes(id))
  if (tangled.length > 0 || freed.length > 0) events.push({ type: 'tangled', seen: 'all', tangled, freed })

  if (after.phase === 'over') {
    events.push({ type: 'gameOver', seen: 'all', winners: [...after.winners], magic: [...after.magic], tangleMagic: [...after.tangleMagic] })
  } else {
    events.push({ type: 'turnStarted', seen: 'all', seat: after.current, phase: after.phase })
  }
  return events
}

/** Glyphtender's rules for the Table. The word list is the one thing the rules need from outside (a cast grows words). */
export function glyphtenderRules(words: WordList): Rules<GameState, Action, GameEvent, GameSetup, SeatView> {
  return {
    setup: setupGame,
    legalActions,
    check: checkFor,
    apply(state, seat, action, options?: ApplyOptions): Applied<GameState, GameEvent> {
      const problem = checkFor(state, seat, action)
      if (problem) throw new Error(problem)
      const next = applyAction(state, action, words, options) // options.fast: no game log (engine.ts)
      return { state: next, events: eventsOf(state, seat, action, next) }
    },
    isOver: (state) => state.phase === 'over',
    toAct: (state) => (state.phase === 'over' ? [] : [state.current]),
    viewFor,
  }
}

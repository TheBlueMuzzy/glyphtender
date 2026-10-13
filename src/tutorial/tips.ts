// THE FIRST-TIME TIPS (F77, design/tutorial.md §3) — which tip is due right now, if any. Pure: it only looks at the
// game (and the move you've planned), so every trigger is tested on hand-made positions (tips.test.ts).
// The layer that shows them (TutorialLayer) asks `dueTip` at quiet moments — never mid-animation — and shows at most
// one per turn (tutorial.json tipsPerTurn); each tip shows once ever on this device (the kit's tips memory), and none
// when Settings → Tips is off. The three PAUSE tips hold the game until "Got it".
// Words: en.json → tutorial.tips.<id>. Wording rule: Magic is CREATED, never "gained".
import { droppedWords } from '../engine/wordFinder'
import { movesLeft } from '../engine/tangle'
import type { GameState, LogTurn, WordList } from '../engine/types'
import { mayMoveOnly as rulesMayMoveOnly } from '../engine/rules'

export type TipId =
  | 'tangleTheirs' | 'tangleYours' | 'oneToGo' // the pauses
  | 'yourDanger' | 'theirDanger' | 'twoWords' | 'longestCounts' | 'swapAgain' | 'cantPlant' | 'reveal'

/** The tips that dim the board and wait for "Got it". */
export const PAUSE_TIPS: readonly TipId[] = ['tangleTheirs', 'tangleYours', 'oneToGo']

/** The tips the tutorial game shows EVERY time they apply, not once ever (Muzzy, 2026-10-13: "whenever a glyphling is
 *  tangled, tell the player how points are scored"). Later games: once, like the rest. */
export const REPEAT_TIPS: readonly TipId[] = ['tangleTheirs', 'tangleYours']

export interface DueTip {
  id: TipId
  /** What the callout points at: a glyphling (id), a hex (the planted seed's), or a named part of the screen. */
  target: { glyphling: number } | { hex: { q: number; r: number } } | { part: 'plant' | 'refresh' | 'tray' | 'reveal' }
  /** Numbers for the words, e.g. { n: 6 } → "+6!" */
  values?: Record<string, number | string>
}

/** What `dueTip` needs to know. `you` = the seat this device shows; `seen(id)` = already shown (or Tips off). */
export interface TipMoment {
  game: GameState
  you: number
  words: WordList | null
  /** Your planned move this turn (the store's `move`), or null. */
  move: { glyphling: number; to: { q: number; r: number } } | null
  seen: (id: TipId) => boolean
}

const lastTurnOf = (game: GameState): LogTurn | null => game.log?.turns[game.log.turns.length - 1] ?? null
const glyphlingsOf = (game: GameState, seat: number) => game.glyphlings.filter((g) => g.seat === seat)
const rivalGlyphlings = (game: GameState, you: number) => game.glyphlings.filter((g) => g.seat !== you)

/** The tip due now, in priority order (pauses first), or null. One check = one tip. */
export function dueTip({ game, you, words, move, seen }: TipMoment): DueTip | null {
  const want = (id: TipId) => !seen(id)
  const last = lastTurnOf(game)
  const yourTurn = game.current === you

  // Game over: the Magic reveal is about to show everyone's secret Magic
  if (game.phase === 'over') return want('reveal') ? { id: 'reveal', target: { part: 'reveal' } } : null

  // A glyphling just got tangled (last turn): told from your side — a rival's (your pieces beside it create Magic) or
  // yours (the rivals' pieces beside it do). In the tutorial game every time (REPEAT_TIPS), later games once.
  if (last && last.newlyTangled.length) {
    const id = last.newlyTangled[0]
    const g = game.glyphlings.find((x) => x.id === id)
    if (g && g.seat === you && want('tangleYours')) return { id: 'tangleYours', target: { glyphling: id } }
    if (g && g.seat !== you && want('tangleTheirs')) return { id: 'tangleTheirs', target: { glyphling: id }, values: { seat: g.seat } }
  }

  // Your plant just scored (shown while the next player starts): two words at once, or a shorter word that didn't count
  if (last && last.seat === you && last.target) {
    if (last.words.length >= 2 && want('twoWords')) return { id: 'twoWords', target: { hex: last.target }, values: { n: last.words.length } }
    if (words && want('longestCounts') && droppedWords(game, last.target, words).length) return { id: 'longestCounts', target: { hex: last.target } }
  }

  if (game.phase === 'refresh' && yourTurn) return want('swapAgain') ? { id: 'swapAgain', target: { part: 'refresh' } } : null
  if (game.phase !== 'play' || !yourTurn) return null

  // Your turn with exactly one glyphling tangled: one more ends the game
  if (game.tangled.length === 1 && want('oneToGo')) return { id: 'oneToGo', target: { glyphling: game.tangled[0] } }

  // You can move but can't plant (no seed fits from where you moved)
  if (move && rulesMayMoveOnly(game, move.glyphling, move.to) && want('cantPlant')) return { id: 'cantPlant', target: { part: 'plant' } }

  // Danger cues: 1 move left (yours first)
  if (!move) {
    const yours = glyphlingsOf(game, you).find((g) => !game.tangled.includes(g.id) && movesLeft(game, g.id) === 1)
    if (yours && want('yourDanger')) return { id: 'yourDanger', target: { glyphling: yours.id } }
    const theirs = rivalGlyphlings(game, you).find((g) => !game.tangled.includes(g.id) && movesLeft(game, g.id) === 1)
    if (theirs && want('theirDanger')) return { id: 'theirDanger', target: { glyphling: theirs.id }, values: { seat: theirs.seat } }
  }
  return null
}

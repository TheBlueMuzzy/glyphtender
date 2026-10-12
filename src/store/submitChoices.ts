// SUBMIT A WORD (F69) — what Pause → Submit a word offers for the planned seed (placed, not cast yet).
// Plain functions (tested): the board as it would be with the planned seed on it, then every stretch of letters
// through that seed (the engine's stretchesThrough — read the same way words are read) that isn't a word yet.
// Numbers (3+ letters, at most 8 shown): content/words/submit.json.
import { checkAction } from '../engine/engine'
import { moveAndCast } from '../engine/turn'
import { stretchesThrough } from '../engine/wordFinder'
import type { GameState, WordList } from '../engine/types'
import { turnAction, type PlannedCast, type PlannedMove } from './turnPlan'
import submit from '../../content/words/submit.json'

/** What the picker shows: a list to pick from · only short stretches (too short to submit) · nothing at all. */
export type SubmitChoices = { kind: 'list'; words: string[] } | { kind: 'tooShort' } | { kind: 'none' }

/** The stretches of letters through the planned seed — null when no seed is planned (Pause greys the row). */
export function plannedStretches(game: GameState | null, move: PlannedMove | null, cast: PlannedCast | null): string[] | null {
  if (!game || !move || !cast) return null
  const action = turnAction(move, cast)
  if (action.type !== 'turn' || checkAction(game, action)) return null
  return stretchesThrough(moveAndCast(game, action), cast.target)
}

/** The stretches worth submitting: not already words, `minLetters`+ long, longest first (then A–Z), at most `pickerMax`. */
export function submitChoices(stretches: string[], words: WordList, numbers = submit): SubmitChoices {
  const fresh = stretches.filter((s) => !words.has(s) && s.length <= numbers.maxLetters)
  const long = fresh.filter((s) => s.length >= numbers.minLetters)
  if (long.length) return { kind: 'list', words: long.sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, numbers.pickerMax) }
  return fresh.length ? { kind: 'tooShort' } : { kind: 'none' }
}

// Refresh: after a turn that made no Magic, set aside any seeds, refill to a full hand,
// then put the set-aside seeds back into the bag at random places. (The original lost them.)
import { randomInt } from './rng'
import { indexOfPiece } from '../table/zones'
import { endTurn } from './tangle'
import type { GameState } from './types'

/** Why this refresh isn't allowed, or null if it is. */
export function checkRefresh(state: GameState, setAside: string[]): string | null {
  if (state.phase !== 'refresh') return 'You can only refresh after a turn that made no Magic'
  const hand = state.hands[state.current]
  if (new Set(setAside).size !== setAside.length) return 'The same seed was set aside twice'
  if (setAside.some((id) => typeof id !== 'string' || indexOfPiece(hand, id) < 0)) return 'That seed is not in your hand'
  return null
}

/** Sets aside the chosen seeds, refills the hand from the bag, returns the set-aside seeds to the bag, ends the turn.
 *  `fast` = skip the game log (engine.ts applyAction). */
export function applyRefresh(state: GameState, setAside: string[], fast = false): GameState {
  const problem = checkRefresh(state, setAside)
  if (problem) throw new Error(problem)
  const seat = state.current
  const oldHand = state.hands[seat]
  const aside = setAside.map((id) => oldHand[indexOfPiece(oldHand, id)]) // in the order they were chosen
  const kept = oldHand.filter((p) => !setAside.includes(p.id))
  // Refill to a full hand from the front of the bag (as far as the bag goes).
  const drawCount = Math.max(0, state.config.rules.handSize - kept.length)
  const drawn = state.bag.slice(0, drawCount)
  const bag = state.bag.slice(drawn.length)
  // Only now do the set-aside seeds go back — each into a random spot in the bag.
  let rng = state.rng
  for (const seed of aside) {
    const spot = randomInt(rng, bag.length + 1)
    rng = spot.rng
    bag.splice(spot.value, 0, seed)
  }
  const hands = state.hands.map((h, s) => (s === seat ? [...kept, ...drawn] : h))
  const lastTurn = state.lastTurn ? { ...state.lastTurn, drew: drawn.length } : null
  return endTurn({ ...state, hands, bag, rng, lastTurn }, setAside.length, fast)
}

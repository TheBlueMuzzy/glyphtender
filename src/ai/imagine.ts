// IMAGINING WHAT IT CAN'T SEE — rivals' seeds and the bag are '?' in a seat's view. The AI deals itself a plausible
// version: the letters it hasn't seen (the whole box, content/data/bag.json, minus every seed planted on the board,
// minus its own hand), shuffled with its own random numbers and dealt into the rivals' hands and the bag.
// It never peeks: the real hidden seeds aren't in the view, so they can't be used. Imagined seeds get made-up ids
// ("imagined-N") so nothing can mistake one for a real seed.
import { shuffle } from './kit/random'
import { fullBag } from '../engine/setup'
import { HIDDEN, type SeatView } from '../engine/rules'
import type { GameState, SeedPiece } from '../engine/types'

/** The letters `seat` hasn't seen anywhere: the box minus the board minus its own hand (one copy each). */
export function unseenLetters(view: SeatView, seat: number): string[] {
  const left = fullBag()
  const takeOut = (letter: string) => {
    const i = left.indexOf(letter)
    if (i >= 0) left.splice(i, 1)
  }
  for (const seed of Object.values(view.seeds)) takeOut(seed.letter)
  for (const seed of view.hands[seat] ?? []) takeOut(seed.letter)
  return left
}

/** One imagined world: the view with every '?' seed (rivals' hands, the bag) dealt from the unseen letters. */
export function imagineWorld(view: SeatView, seat: number, rng: number): { world: GameState; rng: number } {
  const dealt = shuffle(unseenLetters(view, seat), rng)
  const pile = dealt.items
  let next = 0
  const deal = (seed: SeedPiece): SeedPiece => {
    if (seed.id !== HIDDEN) return seed
    // (A hand-made test position can hide more seeds than the box has letters left: those stay unknown '?'.)
    const letter = pile[next] ?? HIDDEN
    return { id: `imagined-${next++}`, letter }
  }
  const hands = view.hands.map((hand) => hand.map(deal))
  const bag = view.bag.map(deal)
  return { world: { ...view, hands, bag }, rng: dealt.rng }
}

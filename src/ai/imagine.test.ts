// Imagining never peeks: the rivals' hands and the bag are dealt only from letters this seat hasn't seen, and two
// games that differ only in their hidden seeds give exactly the same imagined worlds.
import { describe, expect, it } from 'vitest'
import { glyphtenderRules, viewFor } from '../engine/rules'
import { randomAction } from '../engine/sim'
import type { GameState } from '../engine/types'
import { imagineWorld, unseenLetters } from './imagine'
import { wordsOf } from '../engine/testkit'

const rules = glyphtenderRules(wordsOf('AT', 'TA', 'TO', 'ON', 'NO', 'EAT', 'TEA'))

/** A game a few rounds in (random legal play). */
function midGame(players: number, seed: number): GameState {
  let state = rules.setup({ players, boardName: players === 2 ? 'small' : 'large', seed })
  let rng = seed
  while (state.turnCount < 12) {
    const picked = randomAction(state, rng)
    rng = picked.rng
    state = rules.apply(state, state.current, picked.action, { fast: true }).state
  }
  return state
}

const sorted = (letters: string[]) => [...letters].sort().join('')

describe('imagine', () => {
  for (const players of [2, 3, 4]) {
    it(`${players} players: deals rivals + bag from exactly the letters it hasn't seen`, () => {
      const game = midGame(players, 40 + players)
      const seat = game.current
      const view = viewFor(game, seat)
      const { world } = imagineWorld(view, seat, 123)
      const hidden = [...world.hands.filter((_, s) => s !== seat).flat(), ...world.bag]
      expect(sorted(hidden.map((s) => s.letter))).toBe(sorted(unseenLetters(view, seat)))
      // Same sizes as the real game; its own hand and the board untouched.
      world.hands.forEach((hand, s) => expect(hand.length).toBe(game.hands[s].length))
      expect(world.bag.length).toBe(game.bag.length)
      expect(world.hands[seat]).toEqual(game.hands[seat])
      expect(world.seeds).toBe(view.seeds)
      // Never a real hidden seed id.
      const realHidden = new Set([...game.hands.filter((_, s) => s !== seat).flat(), ...game.bag].map((s) => s.id))
      for (const s of hidden) {
        expect(realHidden.has(s.id)).toBe(false)
        expect(s.id.startsWith('imagined-')).toBe(true)
      }
    })
  }

  it('the unseen letters are the box minus the board minus its own hand', () => {
    const game = midGame(2, 9)
    const seat = game.current
    const view = viewFor(game, seat)
    const truth = [...game.hands[1 - seat], ...game.bag].map((s) => s.letter)
    expect(sorted(unseenLetters(view, seat))).toBe(sorted(truth))
  })

  it('two random positions give two different deals; the same one the same deal', () => {
    const game = midGame(3, 5)
    const view = viewFor(game, game.current)
    const a = imagineWorld(view, game.current, 1)
    const b = imagineWorld(view, game.current, 2)
    expect(a.world.bag.map((s) => s.letter)).not.toEqual(b.world.bag.map((s) => s.letter))
    expect(imagineWorld(view, game.current, 1)).toEqual(a)
  })

  it("never peeks: shuffling the real hidden seeds changes nothing it imagines", () => {
    const game = midGame(3, 6)
    const seat = game.current
    // The same game with the rivals' hands and the bag dealt differently (same letters overall).
    const hiddenSeeds = [...game.hands.filter((_, s) => s !== seat).flat(), ...game.bag].reverse()
    let next = 0
    const other: GameState = {
      ...game,
      hands: game.hands.map((h, s) => (s === seat ? h : h.map(() => hiddenSeeds[next++]))),
      bag: game.bag.map(() => hiddenSeeds[next++]),
    }
    expect(other.hands).not.toEqual(game.hands)
    expect(imagineWorld(viewFor(other, seat), seat, 77)).toEqual(imagineWorld(viewFor(game, seat), seat, 77))
  })
})

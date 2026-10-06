/// <reference types="node" />
// Older saved games load today (migrate.ts): games saved before seeds had ids (F33) get ids, the same ones every time.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { idsAreUnique } from '../table/zones'
import { glyphtenderRules, HIDDEN, legalActions } from './rules'
import { migrateGame } from './migrate'
import { fullBag, newGame } from './setup'
import { lettersOf, wordsOf } from './testkit'
import type { GameState } from './types'

/** A game as it was saved before F33: every seed just a letter. */
function savedBeforeIds(game: GameState): GameState {
  const letter = (s: { letter: string }) => s.letter
  const seeds = Object.fromEntries(Object.entries(game.seeds).map(([key, s]) => [key, { letter: s.letter, seat: s.seat }]))
  return { ...game, seeds, hands: game.hands.map((h) => h.map(letter)), bag: game.bag.map(letter) } as unknown as GameState
}

const everyId = (g: GameState) => [...g.bag, ...g.hands.flat(), ...Object.values(g.seeds)].map((s) => s.id)

/** Plays the first legal action a few times: the migrated game really plays. */
function playsOn(game: GameState) {
  const rules = glyphtenderRules(wordsOf('AT', 'TA', 'TO'))
  let state = game
  for (let i = 0; i < 6 && !rules.isOver(state); i++) state = rules.apply(state, state.current, legalActions(state, state.current)[0]).state
  return state
}

describe('migrateGame — saves from before seeds had ids (F33)', () => {
  // A real game a few turns in, saved the old way
  const rules = glyphtenderRules(wordsOf('AT', 'TA', 'TO'))
  let game = rules.setup({ players: 3, seed: 12 })
  for (let i = 0; i < 12; i++) game = rules.apply(game, game.current, legalActions(game, game.current)[0]).state
  const old = savedBeforeIds(game)

  it('every seed gets an id: the same letters in the same places, each id once, each id a box seed of that letter', () => {
    const loaded = migrateGame(old)
    expect(lettersOf(loaded.bag)).toEqual(lettersOf(game.bag))
    loaded.hands.forEach((hand, seat) => expect(lettersOf(hand)).toEqual(lettersOf(game.hands[seat])))
    expect(Object.values(loaded.seeds).map((s) => [s.letter, s.seat])).toEqual(Object.values(game.seeds).map((s) => [s.letter, s.seat]))
    expect(idsAreUnique(loaded.bag, ...loaded.hands, Object.values(loaded.seeds))).toBe(true)
    const box = fullBag()
    for (const s of [...loaded.bag, ...loaded.hands.flat(), ...Object.values(loaded.seeds)]) expect(box[Number(s.id.replace('seed-', ''))]).toBe(s.letter)
    expect(everyId(loaded)).toHaveLength(120)
  })

  it('the same save always gets the same ids, and a game that already has ids is left as it is', () => {
    expect(migrateGame(old)).toEqual(migrateGame(old))
    expect(migrateGame(game)).toEqual(game)
  })

  it('the loaded game plays on', () => {
    const loaded = migrateGame(old)
    expect(playsOn(loaded).turnCount).toBeGreaterThan(loaded.turnCount)
  })

  it("a seed the save couldn't see ('?', another player's hand online) stays hidden — no id made up for it", () => {
    const fresh = newGame({ players: 2, seed: 4 })
    const seen = { ...savedBeforeIds(fresh), hands: [['E', 'A'], [HIDDEN, HIDDEN]], bag: [HIDDEN] } as unknown as GameState
    const loaded = migrateGame(seen)
    expect(loaded.hands[1]).toEqual([{ id: HIDDEN, letter: HIDDEN }, { id: HIDDEN, letter: HIDDEN }])
    expect(loaded.bag).toEqual([{ id: HIDDEN, letter: HIDDEN }])
    expect(lettersOf(loaded.hands[0])).toEqual(['E', 'A'])
  })
})

describe('the Dev Kit snapshots in content/snapshots/ (saved before F33) still load and play', () => {
  const dir = new URL('../../content/snapshots/', import.meta.url)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(file, () => {
      const snapshot = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
      const loaded = migrateGame(snapshot.state.game)
      expect(everyId(loaded)).toHaveLength(120)
      expect(idsAreUnique(loaded.bag, ...loaded.hands, Object.values(loaded.seeds))).toBe(true)
      // (a snapshot saved since F33 already names its seeds: compare letters either way)
      const savedLetters = snapshot.state.game.hands.map((hand: (string | { letter: string })[]) => hand.map((s) => (typeof s === 'string' ? s : s.letter)))
      expect(loaded.hands.map(lettersOf)).toEqual(savedLetters)
      if (loaded.phase !== 'over') expect(playsOn(loaded).turnCount).toBeGreaterThan(loaded.turnCount) // (a finished game can't play on)
    })
  }
})

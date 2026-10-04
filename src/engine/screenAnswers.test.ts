/// <reference types="node" />
// F34: the screen asks the rules instead of working the rules out again. Each answer here must equal what the screen
// computed itself before (the old screen code is copied below as `before…`), over whole sim games.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getBoard } from './boards'
import { legalCasts, legalMoves, seedMagic } from './engine'
import { hexKey, neighbours } from './hex'
import { occupancy } from './moves'
import { glyphtenderRules, mayMoveOnly, movableGlyphlings, movesLeft, seedMagicOfTurn, tanglePieces, viewFor } from './rules'
import { greedyAction, randomAction } from './sim'
import { parseWordList } from './words'
import type { GameState } from './types'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const rules = glyphtenderRules(words)

// ── What the screen worked out itself before F34 ──
/** turnPlan.mayMoveOnly */
const beforeMayMoveOnly = (game: GameState, glyphling: number, to: { q: number; r: number }) =>
  game.hands[game.current].length === 0 || legalCasts(game, glyphling, to).length === 0
/** turnPulse.pulsingGlyphlings (its rule part) */
const beforeMovable = (game: GameState) =>
  game.glyphlings.filter((g) => g.seat === game.current && legalMoves(game, g.id).length > 0).map((g) => g.id)
/** revealPlan.revealSteps' bonus steps */
function beforeBonusSteps(game: GameState) {
  const board = getBoard(game.config.boardName)
  const taken = occupancy(game)
  const steps = []
  for (const id of game.tangled) {
    const tangled = game.glyphlings.find((g) => g.id === id)
    if (!tangled) continue
    for (const hex of neighbours(board, tangled.hex)) {
      const who = taken.get(hexKey(hex))
      if (who && who.seat !== tangled.seat) steps.push({ glyphling: id, hex, seat: who.seat, amount: game.config.rules.tangleBonus })
    }
  }
  return steps
}

/** Every state of a few whole sim games (2, 3 and 4 players; random and greedy players). */
function simStates(): GameState[] {
  const states: GameState[] = []
  const games = [
    { players: 2, seed: 11, greedy: false }, { players: 3, seed: 12, greedy: false },
    { players: 4, seed: 13, greedy: false }, { players: 2, seed: 14, greedy: true },
  ]
  for (const g of games) {
    let state = rules.setup({ players: g.players, seed: g.seed })
    let rng = g.seed
    states.push(state)
    while (!rules.isOver(state)) {
      const pick = g.greedy && state.phase === 'play' ? greedyAction(state, rng, words, 4) : randomAction(state, rng)
      rng = pick.rng
      state = rules.apply(state, state.current, pick.action).state
      states.push(state)
    }
  }
  return states
}
const states = simStates()

describe('the rules answer what the screen re-worked (F34) — same answers over whole sim games', () => {
  it('mayMoveOnly = the old turnPlan rule, for every legal move of every turn', () => {
    let checked = 0
    for (const s of states.filter((x) => x.phase === 'play')) {
      for (const g of s.glyphlings.filter((x) => x.seat === s.current)) {
        for (const to of legalMoves(s, g.id)) {
          expect(mayMoveOnly(s, g.id, to)).toBe(beforeMayMoveOnly(s, g.id, to))
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('movesLeft = the number of legal moves (danger: 0 tangled, 1 warning)', () => {
    for (const s of states) for (const g of s.glyphlings) expect(movesLeft(s, g.id)).toBe(legalMoves(s, g.id).length)
  })

  it("movableGlyphlings(current) = the turn pulse's old filter; nobody else's, and none outside play", () => {
    for (const s of states) {
      expect(movableGlyphlings(s, s.current)).toEqual(s.phase === 'play' ? beforeMovable(s) : [])
      for (let seat = 0; seat < s.config.players; seat++) if (seat !== s.current) expect(movableGlyphlings(s, seat)).toEqual([])
    }
  })

  it("seedMagicOfTurn = seedMagic per seed per word, adds up to the engine's Magic — and reads the same on a rival's view", () => {
    let words = 0
    for (const s of states) {
      const turn = s.lastTurn
      if (!turn || turn.words.length === 0) continue
      const perSeed = seedMagicOfTurn(s, turn.words, turn.seat)
      expect(perSeed).toEqual(turn.words.map((w) => w.hexes.map((h) => seedMagic(s, h, turn.seat))))
      expect(perSeed.map((w) => w.reduce((a, b) => a + b, 0))).toEqual(turn.words.map((w) => w.magic))
      const rival = (turn.seat + 1) % s.config.players
      expect(seedMagicOfTurn(viewFor(s, rival), turn.words, turn.seat)).toEqual(perSeed) // online: the public board is enough
      words += turn.words.length
    }
    expect(words).toBeGreaterThan(5)
  })

  it("tanglePieces = the reveal's old bonus steps, and adds up to the engine's tangle bonus", () => {
    const ends = states.filter((s) => s.phase === 'over')
    expect(ends.length).toBe(4)
    for (const s of ends) {
      const pieces = tanglePieces(s, s.tangled)
      expect(pieces).toEqual(beforeBonusSteps(s))
      const perSeat = s.tangleMagic.map((_, seat) => pieces.filter((p) => p.seat === seat).reduce((sum, p) => sum + p.amount, 0))
      expect(perSeat).toEqual(s.tangleMagic)
    }
  })
})

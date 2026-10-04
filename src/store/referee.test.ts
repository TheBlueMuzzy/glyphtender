/// <reference types="node" />
// The drag referee (F34): one answer for the glow, the shake, the pick-up and the drop. Over whole sim games it must
// say exactly what the screen worked out before (the old screen code is copied below as `before…`).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { legalCasts, legalDraftHexes, legalMoves } from '../engine/engine'
import { hexKey, type Hex } from '../engine/hex'
import { glyphtenderRules } from '../engine/rules'
import { randomAction } from '../engine/sim'
import { parseWordList } from '../engine/words'
import type { GameState } from '../engine/types'
import type { PlannedMove } from './turnPlan'
import { boardTargets, NEW_GLYPHLING, refereeFor, targetsOf, trayTargets, type Piece } from './referee'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const rules = glyphtenderRules(words)
const yes = () => true
const keys = (hexes: Hex[]) => hexes.map(hexKey).sort()
const lit = (game: GameState, move: PlannedMove | null, piece: Piece) =>
  keys(refereeFor({ game, move }, yes).targetsFor(game.current, piece, boardTargets(game)).flatMap((t) => (t.kind === 'hex' ? [t.hex] : [])))

/** Every state of a 2-player and a 3-player sim game. */
function simStates(): GameState[] {
  const states: GameState[] = []
  for (const [players, seed] of [[2, 21], [3, 22]]) {
    let state = rules.setup({ players, seed })
    let rng = seed
    states.push(state)
    while (!rules.isOver(state)) {
      const pick = randomAction(state, rng)
      rng = pick.rng
      state = rules.apply(state, state.current, pick.action).state
      states.push(state)
    }
  }
  return states
}
const states = simStates()

describe('the drag referee says what the screen worked out before (whole sim games)', () => {
  it('the draft: a waiting glyphling may go on every legal draft hex, and only there', () => {
    for (const s of states.filter((x) => x.phase === 'draft')) expect(lit(s, null, NEW_GLYPHLING)).toEqual(keys(legalDraftHexes(s)))
  })

  it("a glyphling: its legal moves — only the current player's, and none outside play; picked up only if it can move", () => {
    let checked = 0
    for (const s of states) {
      for (const g of s.glyphlings) {
        const piece: Piece = { kind: 'glyphling', id: g.id }
        const mine = s.phase === 'play' && g.seat === s.current
        expect(lit(s, null, piece)).toEqual(mine ? keys(legalMoves(s, g.id)) : [])
        // the old shake rule: movable = my turn, play, the current player's, with a legal move
        const beforeMovable = mine && legalMoves(s, g.id).length > 0
        expect(refereeFor({ game: s, move: null }, yes).mayPickUp(s.current, piece, targetsOf(s, piece)).ok).toBe(beforeMovable)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(200)
  })

  it('a seed after the move: the cast options from where the glyphling now stands', () => {
    let checked = 0
    for (const s of states.filter((x) => x.phase === 'play' && x.hands[x.current].length > 0)) {
      const g = s.glyphlings.find((x) => x.seat === s.current && legalMoves(s, x.id).length > 0)
      if (!g) continue
      const move = { glyphling: g.id, to: legalMoves(s, g.id)[0] }
      const seed: Piece = { kind: 'seed', id: s.hands[s.current][0].id }
      expect(lit(s, move, seed)).toEqual(keys(legalCasts(s, move.glyphling, move.to)))
      expect(lit(s, null, seed)).toEqual([]) // before the move: nowhere (the turn's steps: move, then cast)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('the tray: a seed reorders only after the move (B008) or while choosing what to refresh; never someone else’s', () => {
    for (const s of states.filter((x) => x.phase === 'play' || x.phase === 'refresh')) {
      const hand = s.hands[s.current]
      if (hand.length === 0) continue
      const seed: Piece = { kind: 'seed', id: hand[0].id }
      const tray = trayTargets(s, s.current)[0]
      const judge = (move: PlannedMove | null) => refereeFor({ game: s, move }, yes).judge(s.current, seed, tray)
      const someMove = { glyphling: s.glyphlings.find((g) => g.seat === s.current)!.id, to: { q: 0, r: 0 } }
      if (s.phase === 'refresh') expect(judge(null).ok).toBe(true)
      else {
        expect(judge(null)).toEqual({ ok: false, reason: 'Move a glyphling first' })
        expect(judge(someMove).ok).toBe(true)
      }
      const rival = (s.current + 1) % s.config.players
      expect(refereeFor({ game: s, move: null }, yes).judge(rival, seed, tray).ok).toBe(false) // not in their hand
    }
  })

  it("not this seat's turn on this device (or a quiet moment): every answer is no, with the reason", () => {
    const s = states.find((x) => x.phase === 'play')!
    const g = s.glyphlings.find((x) => x.seat === s.current && legalMoves(s, x.id).length > 0)!
    const piece: Piece = { kind: 'glyphling', id: g.id }
    const ref = refereeFor({ game: s, move: null }, () => false)
    expect(ref.mayPickUp(s.current, piece, targetsOf(s, piece))).toEqual({ ok: false, reason: "It's not your turn" })
    expect(ref.targetsFor(s.current, piece, boardTargets(s))).toEqual([])
  })
})

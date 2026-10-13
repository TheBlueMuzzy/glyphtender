/// <reference types="node" />
// The rails limit (F76): while it's set, the drag referee lets ONLY the step's piece go to the step's hex (the glow
// shows just that hex), the refresh step sets aside only its seeds, and a hold stops every touch. Off: nothing changes.
import { afterEach, describe, expect, it } from 'vitest'
import { hexKey } from '../engine/hex'
import { glyphtenderRules, setupGame } from '../engine/rules'
import { legalMoves } from '../engine/engine'
import type { GameState } from '../engine/types'
import { railsHex, railsSetup, rails, seedIdOf } from '../tutorial/rails'
import { canPlayNow } from './myTurn'
import { nopeFor } from './nope'
import { boardTargets, NEW_GLYPHLING, playReferee, refereeFor, type Piece } from './referee'
import { railsAllowsRefresh, railsAllowsSetAside, setRails, type RailsLimit } from './railsLimit'
import { localSeats } from './seats'
import { highlightFor } from './turnPlan'

const rules = glyphtenderRules(new Map())
const yes = () => true
const lit = (game: GameState, piece: Piece, move: { glyphling: number; to: { q: number; r: number } } | null = null) =>
  refereeFor({ game, move }, yes).targetsFor(game.current, piece, boardTargets(game)).flatMap((t) => (t.kind === 'hex' ? [hexKey(t.hex)] : []))
const seats = localSeats(2, { yellow: 'Yellow', blue: 'Blue', purple: 'Purple', pink: 'Pink' })
const quiet = { flying: false, waiting: false, handoff: null, move: null, seats }

// The rails game after the draft: your turn 1
function afterDraft(): GameState {
  let game = setupGame(railsSetup())
  const order = [rails.draft.you[0], rails.draft.ai[0], rails.draft.ai[1], rails.draft.you[1]]
  for (const label of order) game = rules.apply(game, game.current, { type: 'draft', hex: railsHex(label) }).state
  return game
}

afterEach(() => setRails(null, false))

describe('the rails limit', () => {
  it('draft: only the step hex glows and may be dropped on', () => {
    const game = setupGame(railsSetup())
    expect(lit(game, NEW_GLYPHLING).length).toBeGreaterThan(10) // (off the rails: every legal hex)
    const to = railsHex(rails.draft.you[0])
    setRails({ piece: NEW_GLYPHLING, to, reason: 'Drag your glyphling to the glowing hex.' }, false)
    expect(lit(game, NEW_GLYPHLING)).toEqual([hexKey(to)])
    const other = boardTargets(game).find((t) => t.kind === 'hex' && hexKey(t.hex) !== hexKey(to))!
    expect(playReferee({ ...quiet, game }).judge(game.current, NEW_GLYPHLING, other)).toEqual({ ok: false, reason: 'Drag your glyphling to the glowing hex.' })
  })

  it('a move step: only that glyphling, only to that hex — its hex glows before it is picked up; the other one shakes', () => {
    const game = afterDraft()
    const mine = { kind: 'glyphling', id: 0 } as const
    const to = railsHex(rails.turn1.to)
    expect(legalMoves(game, 0).length).toBeGreaterThan(1)
    setRails({ piece: mine, to, reason: 'Drag your glyphling here.' }, false)
    expect(lit(game, mine)).toEqual([hexKey(to)])
    expect(lit(game, { kind: 'glyphling', id: 1 })).toEqual([])
    expect(highlightFor(game, null, null)?.hexes.map(hexKey)).toEqual([hexKey(to)]) // (nothing held: the step's piece)
    expect(nopeFor({ ...quiet, game }, { glyph: 1 })).toEqual({ kind: 'glyph', key: '1' })
    expect(nopeFor({ ...quiet, game }, { glyph: 0 })).toBeNull()
  })

  it('a seed step: only that seed, only to that hex', () => {
    const game = afterDraft()
    const move = { glyphling: 0, to: railsHex(rails.turn1.to) }
    const c = seedIdOf(game, rails.you, rails.turn1.seed)
    const plant = railsHex(rails.turn1.plant)
    setRails({ piece: { kind: 'seed', id: c }, to: plant, reason: 'Plant the C.' }, false)
    expect(lit(game, { kind: 'seed', id: c }, move)).toEqual([hexKey(plant)])
    const other = game.hands[rails.you].find((s) => s.id !== c)!.id
    expect(lit(game, { kind: 'seed', id: other }, move)).toEqual([])
    expect(highlightFor(game, move, null)?.hexes.map(hexKey)).toEqual([hexKey(plant)])
  })

  it('the refresh step: only its seeds may be set aside; Refresh only once they all are; never Keep all', () => {
    const limit: RailsLimit = { piece: null, to: null, setAside: ['seed-1', 'seed-2'], reason: 'Tap J and V, then Refresh.' }
    expect(railsAllowsSetAside('seed-1', limit)).toBe(true)
    expect(railsAllowsSetAside('seed-5', limit)).toBe(false)
    expect(railsAllowsRefresh(true, [], limit)).toBe(false)
    expect(railsAllowsRefresh(false, ['seed-1'], limit)).toBe(false)
    expect(railsAllowsRefresh(false, ['seed-2', 'seed-1'], limit)).toBe(true)
    expect(railsAllowsRefresh(false, ['seed-2', 'seed-1', 'seed-3'], limit)).toBe(false)
    expect(railsAllowsRefresh(true, [], null)).toBe(true) // (off the rails: anything)
    expect(railsAllowsSetAside('seed-5', null)).toBe(true)
  })

  it('a hold: nobody may act and nothing shakes', () => {
    const game = afterDraft()
    expect(canPlayNow({ ...quiet, game })).toBe(true)
    setRails(null, true)
    expect(canPlayNow({ ...quiet, game })).toBe(false)
    expect(nopeFor({ ...quiet, game }, { glyph: 2 })).toBeNull()
    setRails(null, false)
    expect(canPlayNow({ ...quiet, game })).toBe(true)
  })
})

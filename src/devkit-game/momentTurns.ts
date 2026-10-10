// THE BOARD POSITIONS GLYPHTENDER'S DEV KIT MOMENTS PLAY FROM (previews.tsx `moments`) — real positions, found by
// playing a seeded game with the engine's own sim player until the player to move has the turn a moment needs:
//   oneWord / twoWords — a cast that grows exactly 1 / 2 words (the score pop, the "two birds" flourish)
//   noWords            — a cast that grows nothing (just the throw, the landing and the sprout)
//   tangle             — a turn after which a glyphling is newly tangled (and the game goes on), growing no words if it can
//   refresh            — a player in the refresh step (their cast made no Magic): Keep all passes play on → "your turn"
// Engine code only (no store state, no screen), so it's tested in node (momentTurns.test.ts). Same seed + word list = same
// position every time; a rules change just finds another one.
import { defaultBoardFor } from '../engine/boards'
import { legalCasts, legalMoves, previewTurn } from '../engine/engine'
import type { Hex } from '../engine/hex'
import { glyphtenderRules, setupGame } from '../engine/rules'
import { greedyAction, randomAction } from '../engine/sim'
import type { Action, GameState, WordList } from '../engine/types'
import { dangers } from '../store/danger'
import { addTurn, emptyStats } from '../store/stats'
import type { SampleGame } from './sampleGames'

export type MomentWant = 'oneWord' | 'twoWords' | 'noWords' | 'tangle' | 'refresh'

/** A turn for the player to move: the glyphling's move, then the seed cast onto `target`. */
export interface MomentTurn {
  glyphling: number
  to: Hex
  seed: string
  target: Hex
}

/** Where a moment starts: the game (its stats so far) and, for a cast moment, the turn to play. */
export interface MomentStart extends SampleGame {
  turn: MomentTurn | null
}

const MIN_TURNS = 6 // past the opening: a garden with some seeds in it
const MAX_ACTIONS = 600

/** The first turn (in a fixed search order) for the player to move that does what `want` asks — or null.
 *  tangle: only where some glyphling is down to its last move (else nothing can tangle — and it keeps the search quick);
 *  a tangle that grows no words wins (the tangle is heard on its own), else the first one that grows some. */
function turnFor(game: GameState, words: WordList, want: Exclude<MomentWant, 'refresh'>): MomentTurn | null {
  const rules = glyphtenderRules(words)
  if (want === 'tangle' && ![...dangers(game).values()].includes('warning')) return null
  let tangleWithWords: MomentTurn | null = null
  const mine = game.glyphlings.filter((g) => g.seat === game.current && !game.tangled.includes(g.id))
  for (const g of mine) {
    for (const to of legalMoves(game, g.id)) {
      for (const target of legalCasts(game, g.id, to)) {
        for (const { id: seed } of game.hands[game.current]) {
          const turn = { glyphling: g.id, to, seed, target }
          const action: Action = { type: 'turn', ...turn }
          const made = previewTurn(game, action, words).words.length
          if (want !== 'tangle') {
            if (made === { oneWord: 1, twoWords: 2, noWords: 0 }[want]) return turn
            continue
          }
          const after = rules.apply(game, game.current, action).state
          const newly = after.tangled.some((id) => !game.tangled.includes(id))
          if (!newly || after.phase === 'over') continue // (the garden must go on growing)
          if (made === 0) return turn
          tangleWithWords ??= turn
        }
      }
    }
  }
  return tangleWithWords
}

/** Plays 2-player games from `seed` on (a sim player, half greedy) until a position fits `want`. */
export function momentStart(words: WordList, want: MomentWant, seed = 14, tries = 30): MomentStart | null {
  for (let s = seed; s < seed + tries; s++) {
    const found = playUntil(words, want, s)
    if (found) return found
  }
  return null
}

function playUntil(words: WordList, want: MomentWant, seed: number): MomentStart | null {
  const rules = glyphtenderRules(words)
  let game = setupGame({ players: 2, seed, boardName: defaultBoardFor(2) })
  let stats = emptyStats(2)
  let rng = seed
  for (let i = 0; i < MAX_ACTIONS && game.phase !== 'over'; i++) {
    if (game.turnCount >= MIN_TURNS) {
      if (want === 'refresh' && game.phase === 'refresh') return { game, stats, turn: null }
      if (want !== 'refresh' && game.phase === 'play') {
        const turn = turnFor(game, words, want)
        if (turn) return { game, stats, turn }
      }
    }
    // alternate greedy and random, so the garden gets words AND untidy corners (tangles, no-Magic turns)
    const pick = i % 2 ? greedyAction(game, rng, words) : randomAction(game, rng)
    rng = pick.rng
    game = rules.apply(game, game.current, pick.action).state
    if (pick.action.type === 'turn' && game.lastTurn) stats = addTurn(stats, game.lastTurn)
  }
  return null
}

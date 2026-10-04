// GOLDEN GAMES — the proof that a rebuild "plays the same" (F29).
// A golden game is a seeded sim game written down: its seed, every action, and a fingerprint of the game after each
// action. Replaying the actions through today's engine must give the same fingerprints, move for move.
//
// The fingerprint is taken from goldenView(), a hand-picked list of everything about the game that a player could
// ever notice (positions, hands, bag order, Magic, whose turn, the log the end screen reads…) — not from however the
// code happens to store it. When a rebuild reshapes GameState, update goldenView() to build the SAME view from the
// new shape; if the fingerprints still match, nothing a player can see has changed.
// Recorded and checked by scripts/golden.mjs (npm run golden:record / npm run check:golden); a sample runs in npm test.
import { hexKey } from './hex'
import { applyAction } from './engine'
import { greedyAction, randomAction, type PlayerStyle } from './sim'
import { newGame } from './setup'
import type { Action, GameState, WordList } from './types'

/** One action and the fingerprint of the game straight after it. */
export interface GoldenStep {
  action: Action
  /** For a turn that casts: the letter cast. For a refresh: the letters set aside. (So a later rebuild that names
   *  seeds by id instead of hand position can still translate the action.) */
  letters?: string[]
  print: string
}

export interface GoldenGame {
  players: number
  boardName: string
  seed: number
  player: PlayerStyle
  /** Fingerprint of the game before any action (the shuffled bag, the empty board). */
  start: string
  steps: GoldenStep[]
}

/** Everything a player could notice about the game, in a fixed order. Sorted where the engine's order means nothing. */
export function goldenView(s: GameState) {
  return {
    players: s.config.players,
    board: s.config.boardName,
    rules: s.config.rules,
    phase: s.phase,
    current: s.current,
    draft: [s.draftOrder, s.draftIndex],
    glyphlings: s.glyphlings.map((g) => [g.id, g.seat, hexKey(g.hex)]),
    seeds: Object.keys(s.seeds)
      .sort()
      .map((k) => [k, s.seeds[k].letter, s.seeds[k].seat]),
    hands: s.hands,
    bag: s.bag,
    magic: s.magic,
    tangled: [...s.tangled].sort((a, b) => a - b),
    lastTurn: s.lastTurn,
    tangleMagic: s.tangleMagic,
    winners: s.winners,
    turnCount: s.turnCount,
    rng: s.rng,
    log: s.log ?? null,
  }
}

/** A short fingerprint (16 hex characters) of goldenView — two 32-bit FNV-1a hashes of its JSON. */
export function fingerprint(s: GameState): string {
  return hashText(JSON.stringify(goldenView(s)))
}

export function hashText(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

/** The letters an action uses (see GoldenStep.letters), read from the game before the action. */
function lettersOf(before: GameState, action: Action): string[] | undefined {
  const hand = before.hands[before.current]
  if (action.type === 'turn' && action.seed !== null) return [hand[action.seed]]
  if (action.type === 'refresh') return action.setAside.map((i) => hand[i])
  return undefined
}

/** Plays one seeded sim game (the same players as npm run sim) and writes it down. */
export function recordGame(players: number, boardName: string, seed: number, player: PlayerStyle, words: WordList): GoldenGame {
  let state = newGame({ players, boardName, seed })
  let rng = seed ^ 0x5eed
  const game: GoldenGame = { players, boardName, seed, player, start: fingerprint(state), steps: [] }
  while (state.phase !== 'over') {
    if (game.steps.length > 2000) throw new Error(`Golden game never ended (${players}p ${boardName} seed ${seed})`)
    const picked = player === 'greedy' ? greedyAction(state, rng, words) : randomAction(state, rng)
    rng = picked.rng
    const letters = lettersOf(state, picked.action)
    state = applyAction(state, picked.action, words)
    game.steps.push({ action: picked.action, ...(letters ? { letters } : {}), print: fingerprint(state) })
  }
  return game
}

/** What went wrong replaying a golden game, in plain English — or null if it matched move for move. */
export function replayGame(game: GoldenGame, words: WordList): string | null {
  const name = `${game.players}p ${game.boardName} ${game.player} seed ${game.seed}`
  let state = newGame({ players: game.players, boardName: game.boardName, seed: game.seed })
  if (fingerprint(state) !== game.start) return `${name}: the game is different before the first move (setup / bag shuffle changed)`
  for (let i = 0; i < game.steps.length; i++) {
    const step = game.steps[i]
    try {
      state = applyAction(state, step.action, words)
    } catch (e) {
      return `${name}: move ${i + 1} (${describe(step)}) is no longer allowed — ${(e as Error).message}`
    }
    if (fingerprint(state) !== step.print) return `${name}: move ${i + 1} (${describe(step)}) leaves the game different`
  }
  if (state.phase !== 'over') return `${name}: the game no longer ends after its last move`
  return null
}

function describe(step: GoldenStep): string {
  const a = step.action
  if (a.type === 'draft') return `draft at ${hexKey(a.hex)}`
  if (a.type === 'refresh') return `refresh, setting aside ${step.letters?.join('') || 'nothing'}`
  const cast = a.target ? `, cast ${step.letters?.[0]} at ${hexKey(a.target)}` : ', no cast'
  return `glyphling ${a.glyphling} to ${hexKey(a.to)}${cast}`
}

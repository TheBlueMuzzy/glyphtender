// SAMPLE GAMES FOR THE DEV KIT'S SCREEN PREVIEWS (previews.tsx) — real games, played by the engine's own sim
// players from a fixed seed, so every preview shows the same believable numbers each time (and keeps working
// when the rules change — nothing here is hand-written game state).
//   finishedGame: played to the end (greedy players: they make words, so the end table has something to show)
//   tiedGame:     the first seed whose 2-player game ends in a tie
//   midGame:      a game a few turns into play
//   takeoverTurns: for an online end table — the turns of one player a bot "played for them" mid-game (F62)
import { defaultBoardFor } from '../engine/boards'
import { glyphtenderRules, setupGame } from '../engine/rules'
import { greedyAction, randomAction } from '../engine/sim'
import type { GameState, WordList } from '../engine/types'
import { addTurn, emptyStats, type PlayerStats } from '../store/stats'

export interface SampleGame {
  game: GameState
  /** The end table's numbers, gathered turn by turn like the store does. */
  stats: PlayerStats[]
}

const MAX_ACTIONS = 5000 // a game is 42–67 turns (research/sims.md); this only stops a runaway

/** Plays from `start` until `done` (or the game ends), greedy or random. */
function playOn(start: SampleGame, words: WordList, rng: number, greedy: boolean, done: (g: GameState) => boolean): SampleGame {
  let { game, stats } = start
  const rules = glyphtenderRules(words)
  for (let i = 0; i < MAX_ACTIONS && game.phase !== 'over' && !done(game); i++) {
    const pick = greedy ? greedyAction(game, rng, words) : randomAction(game, rng)
    rng = pick.rng
    game = rules.apply(game, game.current, pick.action).state // normal mode: the end screen reads the log
    if (pick.action.type === 'turn' && game.lastTurn) stats = addTurn(stats, game.lastTurn)
  }
  return { game, stats }
}

const fresh = (players: number, seed: number): SampleGame =>
  ({ game: setupGame({ players, seed, boardName: defaultBoardFor(players) }), stats: emptyStats(players) })

/** A finished game for `players` (2–4), the same every time for the same seed and word list. */
export function finishedGame(players: number, words: WordList, seed = players * 101): SampleGame {
  return playOn(fresh(players, seed), words, seed, true, () => false)
}

/** A 2-player game that ends in a tie: the first seed (from 1) that gives one. Null if none in `tries` games. */
export function tiedGame(words: WordList, tries = 200): SampleGame | null {
  for (let seed = 1; seed <= tries; seed++) {
    const sample = playOn(fresh(2, seed), words, seed, false, () => false)
    if (sample.game.winners.length > 1) return sample
  }
  return null
}

/** For the "a bot took over" end table (F62): `seat`'s log turns (turnNo) in `rounds` rounds from about a third of
 *  the way in — as if they went idle there, a bot played for them, and they came back. Like the server's results.botTurns. */
export function takeoverTurns(game: GameState, seat: number, rounds = 3): number[] {
  const turns = game.log?.turns ?? []
  const first = Math.floor((turns.at(-1)?.round ?? 0) * 0.35) + 1
  return turns.filter((t) => t.seat === seat && t.round >= first && t.round < first + rounds).map((t) => t.turnNo)
}

/** A game at least `turns` turns into the play phase (the draft done), still going — on `current`'s turn if given. */
export function midGame(players: number, words: WordList, { turns = 6, current }: { turns?: number; current?: number } = {}, seed = players * 7): SampleGame {
  const ready = (g: GameState) => g.phase === 'play' && g.turnCount >= turns && (current === undefined || g.current === current)
  const sample = playOn(fresh(players, seed), words, seed, true, ready)
  if (sample.game.phase === 'over') throw new Error(`seed ${seed} tangled before turn ${turns} — pick another seed`)
  return sample
}

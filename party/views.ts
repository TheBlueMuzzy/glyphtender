// WHAT EACH PLAYER MAY SEE (design/online.md §2). The server keeps the whole game; every player is sent
// a copy with the secrets taken OUT of the data (TDD D06) — a modified browser can't show what it never got.
// Until the game is over: other players' seeds and the bag become '?' (you may know how many, never which),
// and the rng, the random seed and every Magic number are zeroed, and the game log (every turn's words, Magic and
// running totals — src/engine/log.ts) is sent EMPTY. At game over everyone gets the whole truth, log and all.
// What's hidden is decided by the rules themselves (src/engine/rules.ts viewFor); this file wraps it for the room.
// What happened lately (the feed) comes with it, cut down to the events this seat may see (each event's `seen`) and
// naming only the seeds it can still see (rules.ts feedViewFor).
import { feedViewFor, viewFor } from '../src/engine/rules'
import type { GameState } from '../src/engine/types'
import type { GameView, Results } from './protocol'
import type { ServerGame } from './serverGame'

/** The game as `seat` may see it (seat -1 = someone not playing: sees no hand at all) — the rules' viewFor
 *  (src/engine/rules.ts), the same for every game played through the Table. */
export const hideSecrets = (game: GameState, seat: number): GameState => viewFor(game, seat)

/** One player's view: their seat, the hidden game, and the results once it's over. */
export function viewOf(state: ServerGame, seatId: string): GameView {
  const mySeat = state.seatIds.indexOf(seatId)
  const over = state.game.phase === 'over'
  const results: Results | null = over ? { stats: state.stats } : null
  return {
    gameId: state.gameId,
    version: state.version,
    mySeat,
    names: state.names,
    change: state.change,
    by: state.by,
    game: hideSecrets(state.game, mySeat),
    feed: feedViewFor(state.feed, state.game, mySeat), // (seat -1, not playing: only the events everyone sees)
    myLastAction: state.lastOwnAction[mySeat] ?? 0, // (only this seat's own number; seat -1 → 0)
    options: state.options,
    turnEndsAt: state.turnEndsAt,
    results,
  }
}

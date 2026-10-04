// THE TABLE — SEATS. A seat is the chair, not who sits in it.  (Pure.)
//
// A seat owns pieces and secrets and is what the rules talk about ("seat 2 may act"). Who sits in it can change mid-game:
// a person on this device, a person online, a bot here, a bot on the server, or nobody for a moment (reconnecting).
// One model for all of them, so the rules, the screen and the server never ask "is this an online game?" — they ask
// the seat.
//   kind   human | bot              where   local (this device) | online (somewhere else)      connected  (online)
// The VIEWER seat is whose eyes the screen shows: online, always my seat; pass-and-play, the person whose turn it is
// (it switches at the handoff); while a bot or another device plays, it stays with the last person who looked.
// A BOT only ever sees its own seat's view (viewFor) — never the whole game. It's a function: view in, action out.
// Design: framework .planning/design/table.md (Seats · Per-seat views · Built for online play and AI).
import type { Seat } from './core'

export interface TableSeat {
  kind: 'human' | 'bot'
  where: 'local' | 'online'
  /** Online: is the connection up right now? (A dropped player's seat waits for them.) Local seats are always true. */
  connected: boolean
}

export const isLocalHuman = (s: TableSeat | undefined) => s?.kind === 'human' && s.where === 'local'
export const isLocalBot = (s: TableSeat | undefined) => s?.kind === 'bot' && s.where === 'local'
/** Does THIS device make the moves for this seat (a person here, or a bot running here)? */
export const playsHere = (s: TableSeat | undefined) => s?.where === 'local'

/** A bot: given ONLY its seat's view, it picks an action. `rng` is its own repeatable random position. */
export type Bot<View, Action> = (view: View, seat: Seat, rng: number) => { action: Action; rng: number }

/** Whose eyes the screen shows.
 *  - online: my seat (`mine`), always
 *  - pass-and-play: the person whose turn it is (`acting`), if a person here sits there
 *  - otherwise (a bot's or another device's turn): the last viewer, so nothing secret flips into view */
export function viewerSeat(seats: readonly TableSeat[], acting: Seat | null, lastViewer: Seat, mine?: Seat): Seat {
  if (mine !== undefined) return mine
  if (acting !== null && isLocalHuman(seats[acting])) return acting
  return lastViewer
}

/** Pass-and-play: does the device need handing over (a "Pass to Blue" screen) when play goes from one seat to another?
 *  Only between two DIFFERENT people on this device, and only when secrets are hidden from each other.
 *  `from` null = nobody played before (the game's first turn). */
export function needsHandoff(seats: readonly TableSeat[], from: Seat | null, to: Seat, hideSecrets: boolean): boolean {
  const peopleHere = seats.filter(isLocalHuman).length
  return hideSecrets && peopleHere > 1 && from !== to && isLocalHuman(seats[to])
}

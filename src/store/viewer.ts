// WHOSE EYES THE SCREEN SHOWS — the viewer seat (F36; the Table's viewerSeat, src/table/seats.ts). The tray shows the
// viewer's seeds, the end table marks the viewer as "You". One answer, so no screen part works it out itself:
//   · online: always my seat
//   · pass-and-play: the person whose turn it is — it switches when the handoff is passed ("Show my seeds"), not
//     before: while the device is being handed over it stays with the last person who looked
//   · a bot's turn (a bot on this device): stays with the last person who looked, so nothing secret flips into view
// The store remembers that last person (lastViewer, kept up to date in gameStore.ts).
import { flowOf } from '../engine/rules'
import { seatToAct } from '../table/flow'
import type { GameState } from '../engine/types'
import { viewerSeat } from '../table/seats'
import type { GameStore } from './gameStore'
import { isLocalHuman, type Seat } from './seats'

type ViewerState = Pick<GameStore, 'game' | 'seats' | 'online' | 'handoff' | 'lastViewer'>

/** The viewer seat right now. */
export function viewerOf(s: ViewerState): number {
  // Who's acting — nobody while the device is being passed on (the viewer switches when the next player taps)
  const acting = !s.game || s.handoff ? null : seatToAct(flowOf(s.game))
  return viewerSeat(s.seats, acting, s.lastViewer, s.online?.mySeat)
}

/** A new game or a jump: the viewer starts with the player to move if they're a person here, else the first person here. */
export function firstViewer(seats: readonly Seat[], game: GameState): number {
  if (isLocalHuman(seats[game.current])) return game.current
  return Math.max(0, seats.findIndex(isLocalHuman))
}

/** The end table's "You": the viewer, when this device belongs to ONE person (online, or one person here against
 *  bots). Pass-and-play between several people there's no single "you" — null. */
export function youOf(s: ViewerState): number | null {
  if (s.online) return s.online.mySeat
  return s.seats.filter(isLocalHuman).length === 1 ? viewerOf(s) : null
}

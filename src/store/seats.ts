// SEATS — who sits in each chair (GDD §5, TDD D05). A seat is the chair, not who sits in it: the rules engine
// doesn't know or care who plays it. The ONE seat model is the framework Table's (src/table/seats.ts, F36):
//   kind   human | bot          where   local (this device) | online (somewhere else)          connected (online)
// plus what the screen shows: the seat's name and colour.
//   · pass-and-play: every seat is a person here (human / local)
//   · online: my seat is a person here; the others are a person or a bot somewhere else, connected or not —
//     exactly as the room message says (onlinePlay.ts keeps them up to date)
// The turn flow only ever asks the Table helpers: "is this seat a person on this device?" and so on.
import { SEAT_COLOURS, type SeatColour } from '../engine/types'
import type { TableSeat } from '../table/seats'

export { isLocalBot, isLocalHuman, needsHandoff, playsHere } from '../table/seats'

export interface Seat extends TableSeat {
  /** What players read, e.g. "Blue". */
  name: string
  colour: SeatColour
}

/** One person-on-this-device seat per player, in turn order (Yellow, Blue, Purple, Pink). `names` = colour → name (en.json). */
export function localSeats(players: number, names: Record<SeatColour, string>): Seat[] {
  return SEAT_COLOURS.slice(0, players).map((colour) => ({ kind: 'human', where: 'local', connected: true, name: names[colour], colour }))
}

/** What the room message says about a seat (rooms/protocol.ts Seat): a person or a bot, and is their connection up. */
type RoomSeat = { kind: 'human' | 'bot'; connected: boolean }

/** Online: my seat is a person on this device; every other seat is somewhere else — a person or a bot, connected or
 *  not, as the room says (`room` in game seat order; not known yet → a connected person). */
export function onlineSeats(names: readonly string[], mySeat: number, room: readonly RoomSeat[] = []): Seat[] {
  return names.map((name, seat) => {
    const colour = SEAT_COLOURS[seat]
    if (seat === mySeat) return { kind: 'human', where: 'local', connected: true, name, colour }
    return { kind: room[seat]?.kind ?? 'human', where: 'online', connected: room[seat]?.connected ?? true, name, colour }
  })
}

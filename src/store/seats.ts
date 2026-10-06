// SEATS — who sits in each chair (GDD §5, TDD D05). A seat is the chair, not who sits in it: the rules engine
// doesn't know or care who plays it. The ONE seat model is the framework Table's (src/table/seats.ts, F36):
//   kind   human | bot          where   local (this device) | online (somewhere else)          connected (online)
// plus what the screen shows: the seat's name and colour.
//   · pass-and-play: every seat is a person here (human / local)
//   · online: my seat is a person here; the others are a person or a bot somewhere else, connected or not —
//     exactly as the room message says (onlinePlay.ts keeps them up to date)
// The turn flow only ever asks the Table helpers: "is this seat a person on this device?" and so on.
import { SEAT_COLOURS, type SeatColour } from '../engine/types'
import type { Personality, Skill } from '../ai/kit/types'
import type { TableSeat } from '../table/seats'

export { isLocalBot, isLocalHuman, needsHandoff, playsHere } from '../table/seats'

/** Who an AI seat is (F42): ids from content/ai/personalities.json and skills.json. */
export interface AiPick {
  personality: string
  skill: string
  /** The Dev Kit's ▶ Watch: play these (unsaved) settings instead of the files' — never set by a menu. */
  custom?: { personality: Personality; skill: Skill }
}

/** The AI for a seat nobody chose for (an online player who went idle, tests, the Dev Kit): the Survivor — the
 *  gentlest of the three — at First Class. */
export const defaultAi = (): AiPick => ({ personality: 'Survivor', skill: 'FirstClass' })

export interface Seat extends TableSeat {
  /** What players read, e.g. "Blue". */
  name: string
  colour: SeatColour
  /** A bot seat on this device: which AI plays it (store/localBot.ts). */
  ai?: AiPick
}

/** One person-on-this-device seat per player, in turn order (Yellow, Blue, Purple, Pink). `names` = colour → name (en.json). */
export function localSeats(players: number, names: Record<SeatColour, string>): Seat[] {
  return SEAT_COLOURS.slice(0, players).map((colour) => ({ kind: 'human', where: 'local', connected: true, name: names[colour], colour }))
}

/** What the room message says about a seat (rooms/protocol.ts Seat): a person or a bot, and is their connection up. */
type RoomSeat = { kind: 'human' | 'bot'; connected: boolean }

/** Online: my seat is a person on this device; every other seat is somewhere else — a person or a bot, connected or
 *  not, as the room says (`room` in game seat order; not known yet → a connected person). */
/**
 * Seats from a saved moment (Dev Kit snapshot, F51), set up on THIS device: a saved AI stays an AI with its
 * personality + skill (a missing pick → defaultAi); everyone else is a person here (an online game restores offline).
 * null if they don't fit (an older snapshot has no seats, or a different player count) — then the seats stay as they are.
 */
export function restoredSeats(saved: unknown, players: number, names: Record<SeatColour, string>): Seat[] | null {
  if (!Array.isArray(saved) || saved.length !== players) return null
  return localSeats(players, names).map((seat, i): Seat => {
    const was = saved[i] as Partial<Seat> | null
    if (was?.kind !== 'bot') return seat
    const ai = typeof was.ai?.personality === 'string' && typeof was.ai?.skill === 'string' ? was.ai : defaultAi()
    return { ...seat, kind: 'bot', ai }
  })
}

export function onlineSeats(names: readonly string[], mySeat: number, room: readonly RoomSeat[] = []): Seat[] {
  return names.map((name, seat) => {
    const colour = SEAT_COLOURS[seat]
    if (seat === mySeat) return { kind: 'human', where: 'local', connected: true, name, colour }
    return { kind: room[seat]?.kind ?? 'human', where: 'online', connected: room[seat]?.connected ?? true, name, colour }
  })
}

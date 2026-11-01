// ROOM SETTINGS — the knobs a game sets for its rooms.  (Server.)
// A game keeps them in content/rooms.json (the installer makes one) and passes them to RoomServer,
// so Muzzy can change them without touching code. Anything left out uses the default below.

export interface RoomSettings {
  /** Fewest seats (players + bots) a game can start with. */
  minSeats: number
  /** Most seats in a room. */
  maxSeats: number
  /** A player on the clock (the game says whose turn it is — room.onTheClock) who does nothing this long is warned:
   *  their screen gets a draining bar until the bot takes over. 0 = no warning. */
  idleWarnAfterMs: number
  /** A player on the clock who does nothing this long gets a bot, mid-turn — any tap or key gives the seat back. 0 = never. */
  idleTakeoverAfterMs: number
  /** A player who drops out mid-game gets their seat handed to a bot after this long (0 = never). They can still come back and take it. */
  botTakesOverAfterMs: number
  /** Everyone gone mid-game: the room waits this long for someone to come back ("Rejoin match"), then it's cleared.
   *  5 minutes (Muzzy, 2026-10-20 — was 60 s): long enough to find the tab again or restart a phone.
   *  0.10.0: only for a room that isn't saved (a finished game nobody left, or a server without storage) — a match
   *  being played on a server that saves it waits keepMatchDays instead. */
  keepEmptyRoomMs: number
  /** A match being played is kept (saved on the server) this many days after its last move, then it ends — players
   *  can come back to it any time before ("Rejoin match"). A game-style choice (Muzzy, 2026-10-20): a live game ~7,
   *  an async one played over days (Scrabble-with-friends) ~30, any number (0.5 = 12 hours). */
  keepMatchDays: number
  /** A match started but with NO move by a person yet, and nobody here: it ends after this many hours and its room
   *  code is free again (0.11.0, security review) — so a script can't start a match in every room code (there are
   *  only ~6,400) and hold them all for keepMatchDays. A match a person has moved in waits keepMatchDays as before,
   *  so an async game between turns, or a live game forgotten during chores, is never cut short. 24 by default;
   *  0 = never; anything else at least 1 (a phone restart must not end a match). */
  keepUnplayedMatchHours: number
  /** May the host add bot seats in the lobby? (The game must then play for bots — see README.) */
  allowBots: boolean
  /** Messages one connection may send per second; more are dropped unread (flooding). 0 = no limit. */
  maxMessagesPerSecond: number
}

export const DEFAULT_SETTINGS: RoomSettings = {
  minSeats: 2,
  maxSeats: 4,
  idleWarnAfterMs: 30_000,
  idleTakeoverAfterMs: 60_000,
  botTakesOverAfterMs: 60_000,
  keepEmptyRoomMs: 300_000,
  keepMatchDays: 7,
  keepUnplayedMatchHours: 24,
  allowBots: false,
  maxMessagesPerSecond: 10,
}

/** The game's settings (e.g. content/rooms.json) on top of the defaults. Notes like "_help" are ignored. */
export function readSettings(fromGame: Partial<RoomSettings> & Record<string, unknown> = {}): RoomSettings {
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof RoomSettings)[]) {
    const value = fromGame[key]
    if (typeof value === typeof DEFAULT_SETTINGS[key]) (settings as Record<string, unknown>)[key] = value
  }
  if (settings.minSeats < 1) settings.minSeats = 1
  if (settings.maxSeats < settings.minSeats) settings.maxSeats = settings.minSeats
  if (!(settings.keepMatchDays > 0)) settings.keepMatchDays = DEFAULT_SETTINGS.keepMatchDays // (0, below 0 or not a number: the default)
  if (!(settings.keepUnplayedMatchHours >= 0)) settings.keepUnplayedMatchHours = DEFAULT_SETTINGS.keepUnplayedMatchHours // (below 0 or NaN)
  else if (settings.keepUnplayedMatchHours > 0 && settings.keepUnplayedMatchHours < 1) settings.keepUnplayedMatchHours = 1
  return settings
}

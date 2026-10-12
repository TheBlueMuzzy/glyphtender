// THE ONLINE SERVER — party/worker.ts hands every room to this class (Cloudflare, via PartyServer). One room code = one copy of it.
// The rooms module (src/rooms/server/) runs the room: seats, host, join, rejoin, idle players, bots.
// Glyphtender's rules are in ./glyphtenderRules.ts; what each player may see is in ./views.ts.
// Room knobs (seats, timings, turn timers) are in content/rooms.json.
//   Local:  npm run party:dev   (port 1997)   ·   Live: npm run party:deploy (see worker.ts)
// Server code only: no React, no Dev Kit, nothing that needs a browser.
import { RoomServer } from '../src/rooms/server/roomServer'
import type { PartyRoom } from '../src/rooms/server/roomServer'
import type { RoomSettings } from '../src/rooms/server/settings'
import settings from '../content/rooms.json'
import { everyWordIn, parseWordFile, wordListFor, type WordFile } from '../src/engine/words'
import { makeRules } from './glyphtenderRules'
import type { OnlineAction, OnlineOptions, GameView } from './protocol'
import type { ServerGame } from './serverGame'
// The official word list, bundled into the server as text (scripts/server-words.mjs copies it here before each build)
import wordsText from './words.gen.txt'

// Read once per server copy, the first time a game needs it (~0.9 MB of text → a few ms)
let wordFile: WordFile | null = null
const theFile = () => (wordFile ??= parseWordFile(wordsText))
/** EVERY word in the list, B / V ones too — Pause → Submit a word drops a word that's already a word in any way, whatever
 *  the player's switches (Muzzy 2026-10-12: "you can't submit words that already show up as words"). */
export const loadWords = () => everyWordIn(theFile())

// A game's moves are checked with ITS list: the official words + the B / V words the host switched on (F71)
const rules = makeRules({ words: (extras) => wordListFor(theFile(), extras) })

export default class GlyphtenderServer extends RoomServer<ServerGame, OnlineOptions, OnlineAction, GameView, never> {
  /** `testSettings`: e2e only — shorter room timings for a test server (worker.ts reads them from wrangler dev --var). */
  constructor(party: PartyRoom, testSettings: Partial<RoomSettings> = {}) {
    super(party, rules, { ...settings, ...testSettings })
  }
}

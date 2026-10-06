// IS IT MY TURN? — the screen's ONE answer to "may this device act now". It never works out whose turn it is
// itself: it asks the rules' turn flow (rules.ts flowOf → the Table's mayAct), then adds the two things only the
// screen knows:
//   • whose hands are on this device — pass-and-play: every seat; online: only my seat; a bot: never (seats.ts)
//   • the quiet moments when nothing can be touched (busy, below)
// The tray, the buttons, the prompt, the pulse, the board's gold and the "no" shake all ask here.
import { flowOf } from '../engine/rules'
import { mayAct } from '../table/flow'
import type { GameStore } from './gameStore'
import { isLocalHuman } from './seats'

type TurnState = Pick<GameStore, 'game' | 'seats'>

/** May a human on THIS device act right now? (The rules say which seat may act — nobody once the game is over —
 *  and that seat's player is here: pass-and-play, whoever's turn it is; online, only on my own seat's turn.) */
export function isMyTurn(s: TurnState): boolean {
  const game = s.game
  if (!game) return false
  const flow = flowOf(game)
  return s.seats.some((who, seat) => isLocalHuman(who) && mayAct(flow, seat))
}

type BusyState = Pick<GameStore, 'flying' | 'waiting' | 'handoff'> & Partial<Pick<GameStore, 'refreshFx' | 'scoring' | 'trail' | 'botDraft'>>

/** A quiet moment — nothing can be touched: a seed in the air, my action on its way to the server, the device being
 *  passed on, a refresh playing out on the tray, a cast's score playing out, or (online) a turn being played out on
 *  the board — its trail is up (a turn the server played for me looks like my turn, but it isn't mine to touch: B020),
 *  or an AI's draft glyphling travelling out of the tray (F50). */
export function isBusy(s: BusyState): boolean {
  return s.flying || s.waiting || s.handoff !== null || (s.refreshFx ?? null) !== null || (s.scoring ?? null) !== null || (s.trail ?? null) !== null
    || (s.botDraft ?? null) !== null
}

/** May the screen touch the game right now? It's my turn, and it isn't a quiet moment. */
export function canPlayNow(s: TurnState & BusyState): boolean {
  return isMyTurn(s) && !isBusy(s)
}

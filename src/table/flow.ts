// THE TABLE — TURNS & FLOW. Whose turn it is, who may act, and what a turn may take back.  (Pure.)
//
// A game's flow is a few named LEVELS it moves through (Glyphtender: "draft" → "play" → "over"; a refresh step sits
// inside a turn). At any moment the flow says which level the game is in and which seats may act. The rules work it
// out; the screen, the server, bots and the turn clock only ASK it — nobody re-decides "whose turn is it" on their own.
//   mayAct(flow, seat)   may this seat act right now?
//   orders               snake (1-2-2-1 drafts) and clockwise-skipping-who-can't-play
//   TurnSteps            the steps of one turn (e.g. move → cast) and how far undo may go: back through this turn's
//                        steps, never past the start of the turn.
// Design: framework .planning/design/table.md (Turns & flow).
import type { Seat } from './core'

/** Where the game is: the level's name and the seats that may act now (none = nobody, e.g. when it's over). */
export interface Flow {
  level: string
  acting: Seat[]
}

/** May this seat act right now? */
export const mayAct = (flow: Flow, seat: Seat): boolean => flow.acting.includes(seat)

/** The one seat to act in a one-at-a-time level (null when nobody, or several, may act). */
export const seatToAct = (flow: Flow): Seat | null => (flow.acting.length === 1 ? flow.acting[0] : null)

// ---- Orders (presets) ----

/** Snake order: 0,1,2 then 2,1,0, repeated `rounds` times — a fair draft (whoever picks first picks last next round).
 *  snakeOrder(2, 2) = [0,1,1,0] · snakeOrder(3, 2) = [0,1,2,2,1,0]. */
export function snakeOrder(seatCount: number, rounds: number): Seat[] {
  const forward = Array.from({ length: seatCount }, (_, i) => i)
  return Array.from({ length: rounds }, (_, r) => (r % 2 === 0 ? forward : [...forward].reverse())).flat()
}

/** The next seat clockwise after `from` that can play (the seat itself last). null if no seat can play. */
export function nextClockwise(from: Seat, seatCount: number, canPlay: (seat: Seat) => boolean): Seat | null {
  for (let k = 1; k <= seatCount; k++) {
    const seat = (from + k) % seatCount
    if (canPlay(seat)) return seat
  }
  return null
}

// ---- The steps of one turn, and undo ----

/** The steps of a turn, in order (e.g. ["move", "cast"]). A turn's steps are planned, then sent as one action. */
export type TurnSteps<Step extends string> = readonly Step[]

/** The next step to do (null when every step is done). `done` = the steps taken so far THIS turn, in order. */
export function nextStep<Step extends string>(steps: TurnSteps<Step>, done: readonly Step[]): Step | null {
  return steps[done.length] ?? null
}

/** The step Undo takes back: the last one done this turn — null at the start of a turn (undo never reaches the
 *  previous turn: that one has been played). */
export function undoStep<Step extends string>(done: readonly Step[]): Step | null {
  return done.length > 0 ? done[done.length - 1] : null
}

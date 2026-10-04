// THE TABLE — GAME CORE. The one door every change to a game goes through.  (Pure: no screen, no network.)
//
// A game plugs its rules in by filling in `Rules` below:
//   setup → a new game · legalActions → every choice a seat has now · check → may this seat do this? ·
//   apply → the new game + what happened (events) · isOver · toAct → who may act now · viewFor → what a seat may see.
// Then the same rules run everywhere: the phone, the online server, bots, sims, tests, replays.
//
// The promises every game keeps (selfTest.ts checks them):
//   - State is plain JSON (no functions, no Maps). The ONLY way it changes is apply(). apply never edits the state
//     it's given. Randomness lives IN the state (a seeded position), so the same setup + the same moves = the same game.
//   - check() says no in plain English (a string); apply() throws that same reason for a move check() refuses.
//   - Every event says who may see it. The online server sends each seat only the events it may see (eventsFor).
//   - fast mode: apply(…, { fast: true }) may skip bookkeeping only an end screen needs — the game itself plays the same.
// Design: framework .planning/design/table.md.

/** A seat number: 0, 1, 2… in seat order. A seat is the chair — a person, a bot, or nobody right now. */
export type Seat = number

/** Who may see an event: everyone, or only these seats. */
export type Audience = 'all' | { seats: Seat[] }

/** Something that happened. `type` names it ("drew", "scored"…); `seen` says who may see it; the rest is the game's. */
export interface TableEvent {
  type: string
  seen: Audience
}

export interface ApplyOptions {
  /** Skip bookkeeping that only an end screen reads (for bots and sims). The game must play out the same. */
  fast?: boolean
}

/** What apply() returns: the new game and what happened, in order. */
export interface Applied<State, Event extends TableEvent> {
  state: State
  events: Event[]
}

/** A game's rules. Setup = what a new game needs (players, seed, board…). View = what one seat is allowed to see. */
export interface Rules<State, Action, Event extends TableEvent, Setup, View> {
  setup(input: Setup): State
  /** Every action this seat may take right now, with no repeats (two choices that do exactly the same thing = one). */
  legalActions(state: State, seat: Seat): Action[]
  /** null = allowed; otherwise why not, in plain English. */
  check(state: State, seat: Seat, action: Action): string | null
  /** The new game + its events. Throws (with check()'s reason) when the action isn't allowed. */
  apply(state: State, seat: Seat, action: Action, options?: ApplyOptions): Applied<State, Event>
  isOver(state: State): boolean
  /** The seats that may act right now (one seat in a turn-by-turn game; none once it's over). */
  toAct(state: State): Seat[]
  /** What this seat may see: everything secret from them left out. */
  viewFor(state: State, seat: Seat): View
}

/** A replayable game: how it was set up + every move in order. Not the end screen's summary log — the raw moves. */
export interface MoveRecord<Setup, Action> {
  setup: Setup
  moves: { seat: Seat; action: Action }[]
}

/** May this seat see this event? */
export function canSee(event: TableEvent, seat: Seat): boolean {
  return event.seen === 'all' || event.seen.seats.includes(seat)
}

/** Only the events this seat may see (what the online server sends to that seat). */
export function eventsFor<Event extends TableEvent>(events: Event[], seat: Seat): Event[] {
  return events.filter((e) => canSee(e, seat))
}

/** The record with one more move on the end (the record itself is never edited). */
export function addMove<Setup, Action>(record: MoveRecord<Setup, Action>, seat: Seat, action: Action): MoveRecord<Setup, Action> {
  return { setup: record.setup, moves: [...record.moves, { seat, action }] }
}

/** Plays a record from its setup, move by move. Throws (saying which move) if a move is no longer allowed. */
export function replay<State, Action, Event extends TableEvent, Setup, View>(
  rules: Rules<State, Action, Event, Setup, View>,
  record: MoveRecord<Setup, Action>,
  options?: ApplyOptions,
): { state: State; events: Event[][] } {
  let state = rules.setup(record.setup)
  const events: Event[][] = []
  record.moves.forEach(({ seat, action }, i) => {
    const reason = rules.check(state, seat, action)
    if (reason) throw new Error(`Move ${i + 1} (seat ${seat}) is not allowed: ${reason}`)
    const applied = rules.apply(state, seat, action, options)
    state = applied.state
    events.push(applied.events)
  })
  return { state, events }
}

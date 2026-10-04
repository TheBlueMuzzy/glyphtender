// THE TABLE — SELF-TEST. Plays whole games through a game's Rules and checks every promise in core.ts.
// A game calls it from its own tests:  expect(selfTest(rules, setups, { seatCount })).toEqual([])
// It returns a list of problems in plain English (empty = all promises kept). It never throws for a broken promise.
import { addMove, replay, type MoveRecord, type Rules, type Seat, type TableEvent } from './core'

export interface SelfTestOptions<State> {
  /** How many seats this game has (for viewFor and "nobody else may act"). */
  seatCount: (state: State) => number
  /** Stop a game after this many moves (a problem if it isn't over by then). Default 2000. */
  maxMoves?: number
  /** Check at most this many listed actions per move with check() (all of them when fewer). Default 40. */
  checkSample?: number
  /** Is fast mode's game the same game? Default: identical JSON. A game whose fast mode skips bookkeeping compares
   *  without those fields. */
  sameGame?: (normal: State, fast: State) => boolean
}

const json = (x: unknown) => JSON.stringify(x)

/** A tiny repeatable number sequence, so the self-test picks the same moves every run. */
function picker(seed: number) {
  let n = seed >>> 0 || 1
  return (count: number) => {
    n = Math.imul(n, 1664525) + 1013904223
    return (n >>> 0) % count
  }
}

export function selfTest<State, Action, Event extends TableEvent, Setup, View>(
  rules: Rules<State, Action, Event, Setup, View>,
  setups: Setup[],
  options: SelfTestOptions<State>,
): string[] {
  const problems: string[] = []
  const maxMoves = options.maxMoves ?? 2000
  const checkSample = options.checkSample ?? 40
  const sameGame = options.sameGame ?? ((a: State, b: State) => json(a) === json(b))

  setups.forEach((setup, g) => {
    const say = (move: number, text: string) => problems.push(`game ${g + 1}, move ${move}: ${text}`)
    const pick = picker(g + 1)
    let state = rules.setup(setup)
    let record: MoveRecord<Setup, Action> = { setup, moves: [] }

    for (let move = 1; !rules.isOver(state); move++) {
      if (move > maxMoves) return say(move, `not over after ${maxMoves} moves`)
      const acting = rules.toAct(state)
      if (acting.length === 0) return say(move, 'nobody may act, but the game is not over')
      const seat = acting[pick(acting.length)]
      for (let other = 0; other < options.seatCount(state); other++) {
        if (!acting.includes(other) && rules.legalActions(state, other).length > 0) say(move, `seat ${other} has legal actions but may not act`)
      }

      const actions = rules.legalActions(state, seat)
      if (actions.length === 0) return say(move, `seat ${seat} may act but has no legal actions`)
      const seen = new Set<string>()
      for (const a of actions) {
        if (seen.has(json(a))) say(move, `legalActions lists ${json(a)} twice`)
        seen.add(json(a))
      }
      const step = Math.max(1, Math.floor(actions.length / checkSample))
      for (let i = 0; i < actions.length; i += step) {
        const reason = rules.check(state, seat, actions[i])
        if (reason) say(move, `legalActions lists ${json(actions[i])} but check() says no: ${reason}`)
      }

      const action = actions[pick(actions.length)]
      const before = json(state)
      let applied
      try {
        applied = rules.apply(state, seat, action)
      } catch (e) {
        return say(move, `apply() threw for a legal action ${json(action)}: ${(e as Error).message}`)
      }
      if (json(state) !== before) say(move, 'apply() changed the state it was given')
      const fast = rules.apply(state, seat, action, { fast: true })
      if (!sameGame(applied.state, fast.state)) say(move, 'fast mode plays a different game')
      for (const e of applied.events) {
        const ok = e.seen === 'all' || (Array.isArray(e.seen?.seats) && e.seen.seats.every((s: Seat) => Number.isInteger(s)))
        if (!ok) say(move, `event ${json(e)} doesn't say who may see it`)
      }
      for (let s = 0; s < options.seatCount(state); s++) {
        try {
          json(rules.viewFor(applied.state, s))
        } catch (e) {
          say(move, `viewFor(seat ${s}) isn't plain data: ${(e as Error).message}`)
        }
      }
      state = applied.state
      record = addMove(record, seat, action)
    }

    if (rules.toAct(state).length > 0) problems.push(`game ${g + 1}: over, but toAct still names seats`)
    try {
      if (json(replay(rules, record).state) !== json(state)) problems.push(`game ${g + 1}: replaying its move record gives a different game`)
    } catch (e) {
      problems.push(`game ${g + 1}: its move record doesn't replay — ${(e as Error).message}`)
    }
  })
  return problems
}

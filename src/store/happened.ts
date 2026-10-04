// WHAT JUST HAPPENED — read from the rules' events (src/engine/rules.ts eventsOf), never worked out by comparing one
// game with the next (F31). Every change to a game comes with its events; the store keeps the change on screen
// (store.happened: its number + its events) and the screen asks these plain functions about it:
//   turnOf      — a turn as its events tell it: who moved which glyphling from → to, the seed cast and where, the words
//                 it grew (in order) — for the glide, the throw, the trail, the score sequence
//   actorOf     — which seat made the change (a placement, a turn or a refresh)
//   drawnIds    — the seeds a seat drew (only that seat ever sees them) — the refresh's new tray places
//   startedTurn — who acts next, and at which step (the handoff)
//   showChange  — online: a change's public facts put onto the game on screen, for the moment between two changes
//                 that came in one view (the next one is played from there; the view itself replaces it at the end)
// Magic is never in an event before the game is over: the score pops work it out from the board (wordMarks.scorePops).
import { hexKey, type Hex } from '../engine/hex'
import { HIDDEN_SEED, type GameEvent } from '../engine/rules'
import type { GameState } from '../engine/types'
import type { Change } from '../table/events'

/** One change on screen: its number and its events (the framework's Change, with Glyphtender's events). */
export type Happened = Change<GameEvent>

/** One word a cast grew: the word and its hexes (its Magic stays secret until the end). */
export type GrownWord = { word: string; hexes: Hex[] }

/** One turn as its events tell it. (The engine's lastTurn has the same shape plus its Magic — so either fits.) */
export interface TurnPlay {
  seat: number
  glyphlingId: number
  from: Hex
  to: Hex
  /** The seed cast, or null for a move-only turn. */
  letter: string | null
  target: Hex | null
  /** The words the cast grew, in the order they score. */
  words: GrownWord[]
}

/** The first event of this type in a change (or undefined). */
export function eventOf<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }> | undefined {
  return events.find((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

/** The turn in these events (null when the change wasn't a turn: a placement, a refresh, nothing). */
export function turnOf(events: readonly GameEvent[] | null | undefined): TurnPlay | null {
  const moved = events && eventOf(events, 'moved')
  if (!events || !moved) return null
  const cast = eventOf(events, 'cast')
  return {
    seat: moved.seat, glyphlingId: moved.glyphling, from: moved.from, to: moved.to,
    letter: cast?.seed.letter ?? null, target: cast?.target ?? null,
    words: eventOf(events, 'scored')?.words ?? [],
  }
}

/** Which seat made this change (null if none did — e.g. no events at all). */
export function actorOf(events: readonly GameEvent[]): number | null {
  for (const e of events) if (e.type === 'placed' || e.type === 'moved' || e.type === 'refreshed') return e.seat
  return null
}

/** The ids of the seeds `seat` drew in this change (empty unless this device may see them). */
export function drawnIds(events: readonly GameEvent[], seat: number): string[] {
  return events.flatMap((e) => (e.type === 'drew' && e.seat === seat ? e.seeds.map((s) => s.id) : []))
}

/** The ids of the seeds `seat` set aside in a refresh (only that seat sees them). */
export function setAsideIds(events: readonly GameEvent[], seat: number): string[] {
  return events.flatMap((e) => (e.type === 'setAside' && e.seat === seat ? e.seeds.map((s) => s.id) : []))
}

/** Who acts next and at which step — null once the game is over. */
export function startedTurn(events: readonly GameEvent[]): { seat: number; phase: 'draft' | 'play' | 'refresh' } | null {
  const started = eventOf(events, 'turnStarted')
  return started ? { seat: started.seat, phase: started.phase } : null
}

/**
 * Online: the game on screen with one change's PUBLIC facts put on it — a glyphling placed or moved, a seed planted,
 * glyphlings tangled or freed, whose turn it is now. Used only between two changes that arrived in one view (so the
 * next one plays out from the right moment); hands, the bag and everything else wait for the real view, which always
 * replaces this at the end. Hands follow along: a cast seed leaves its caster's hand; my own drawn / set-aside seeds
 * come and go by id; a rival's hand only changes by how many ('?' seeds — nobody sees inside it).
 */
export function showChange(game: GameState, events: readonly GameEvent[], mySeat: number): GameState {
  let next = game
  for (const e of events) {
    if (e.type === 'placed') {
      next = { ...next, glyphlings: [...next.glyphlings, { id: e.glyphling, seat: e.seat, hex: e.hex }] }
    } else if (e.type === 'moved') {
      next = { ...next, glyphlings: next.glyphlings.map((g) => (g.id === e.glyphling ? { ...g, hex: e.to } : g)) }
    } else if (e.type === 'cast') {
      const hands = next.hands.map((hand, s) => {
        if (s !== e.seat) return hand
        const at = hand.findIndex((seed) => seed.id === e.seed.id)
        return at >= 0 ? hand.filter((_, i) => i !== at) : hand.slice(1) // (a rival's hand is all '?': one fewer)
      })
      next = { ...next, hands, seeds: { ...next.seeds, [hexKey(e.target)]: { ...e.seed, seat: e.seat } } }
    } else if (e.type === 'setAside' && e.seat === mySeat) {
      const gone = e.seeds.map((s) => s.id)
      next = { ...next, hands: next.hands.map((hand, s) => (s === mySeat ? hand.filter((seed) => !gone.includes(seed.id)) : hand)) }
    } else if (e.type === 'refreshed' && e.seat !== mySeat) {
      next = { ...next, hands: next.hands.map((hand, s) => (s === e.seat ? hand.slice(e.count) : hand)) }
    } else if (e.type === 'drew' && e.seat === mySeat) {
      next = { ...next, hands: next.hands.map((hand, s) => (s === mySeat ? [...hand, ...e.seeds] : hand)) }
    } else if (e.type === 'drewHidden' && e.seat !== mySeat) {
      const hidden = Array.from({ length: e.count }, () => HIDDEN_SEED)
      next = { ...next, hands: next.hands.map((hand, s) => (s === e.seat ? [...hand, ...hidden] : hand)) }
    } else if (e.type === 'tangled') {
      next = { ...next, tangled: [...next.tangled.filter((id) => !e.freed.includes(id)), ...e.tangled] }
    } else if (e.type === 'turnStarted') {
      next = { ...next, current: e.seat, phase: e.phase }
    }
  }
  return next
}

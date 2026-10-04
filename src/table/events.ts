// THE TABLE — EVENT FEED. "What just happened", delivered so nothing is missed and nothing plays twice.  (Pure.)
//
// Every change to a game (one action) gets the next CHANGE NUMBER and its events (core.ts apply). The feed keeps the
// last few changes. Online, each seat's view carries feedFor(feed, seat): the recent changes with only the events
// that seat may see. The screen remembers the last change number it played and plays newer ones, in order:
//   - a view that arrives late, twice, or after a reconnect never replays an old change
//   - views that were skipped (several arrived at once) don't lose their events: the next view still carries them
//   - a gap too old to fill (the feed moved on) is reported, so the screen can jump straight to the view
// Listeners (animations, sound, stats, achievements) subscribe by event type with a Listeners hub.
// Design: framework .planning/design/table.md (Event stream).
import { eventsFor, type Seat, type TableEvent } from './core'

/** One change: its number and its events. */
export interface Change<Event extends TableEvent> {
  change: number
  events: Event[]
}

/** The recent changes, oldest first. */
export type Feed<Event extends TableEvent> = Change<Event>[]

/** How many changes a feed keeps by default — enough to cover views skipped while a turn's animations play. */
export const FEED_LENGTH = 12

/** The feed with one more change on the end (and the oldest dropped past `keep`). The feed itself is never edited. */
export function addChange<Event extends TableEvent>(feed: Feed<Event>, change: number, events: Event[], keep = FEED_LENGTH): Feed<Event> {
  return [...feed, { change, events }].slice(-keep)
}

/** The feed as one seat may see it: every change (so the numbers stay in step), only the events it may see. */
export function feedFor<Event extends TableEvent>(feed: Feed<Event>, seat: Seat): Feed<Event> {
  return feed.map((c) => ({ change: c.change, events: eventsFor(c.events, seat) }))
}

/** What the screen should play now: the changes after `lastPlayed`, in order — and `missed` if some changes in
 *  between are no longer in the feed (then jump to the view instead of animating). */
export function newChanges<Event extends TableEvent>(feed: Feed<Event>, lastPlayed: number): { changes: Change<Event>[]; missed: boolean } {
  const changes = feed.filter((c) => c.change > lastPlayed)
  const missed = changes.length > 0 && changes[0].change > lastPlayed + 1
  return { changes, missed }
}

/** A tiny listener hub: on(type, fn) to listen, emit(event) to tell everyone listening to that type (or '*'). */
export class Listeners<Event extends TableEvent> {
  private byType = new Map<string, Set<(event: Event) => void>>()

  /** Listen to one event type ('*' = every event). Returns a function that stops listening. */
  on(type: Event['type'] | '*', listener: (event: Event) => void): () => void {
    const set = this.byType.get(type) ?? new Set()
    set.add(listener)
    this.byType.set(type, set)
    return () => set.delete(listener)
  }

  emit(event: Event): void {
    this.byType.get(event.type)?.forEach((fn) => fn(event))
    this.byType.get('*')?.forEach((fn) => fn(event))
  }
}

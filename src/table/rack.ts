// THE TABLE — RACK ORDER. The order a player keeps their hand in, on a rack (Glyphtender's seed tray).  (Pure.)
//
// A rack is a row of places. The player arranges it; the rules don't care about the order (pieces are named by id),
// so the order lives with the screen. The promise players feel: NOTHING SHIFTS ON ITS OWN. A piece that's played
// leaves an empty place (GAP); new pieces fill empty places left to right; pieces you kept stay exactly where you
// put them. Drag a piece onto another to slide it in there, onto an empty place to just move it.
// The Hand view (framework ui-kit, "rack" preset) draws a rack order.

/** An empty place on the rack. Never a real piece id. */
export const GAP = 'gap'

/** A rack order: piece ids (or GAP), left to right. */
export type RackOrder = string[]

/** A freshly dealt rack: the pieces in the order they came. */
export const rackOf = (pieces: readonly { id: string }[]): RackOrder => pieces.map((p) => p.id)

/** The order with the piece at place `from` moved to place `to` (onto an empty place: it just moves there; onto a
 *  piece: it slides in and the others make room). */
export function moveInRack(order: RackOrder, from: number, to: number): RackOrder {
  const next = [...order]
  if (next[to] === GAP) {
    ;[next[from], next[to]] = [GAP, next[from]]
    return next
  }
  const [picked] = next.splice(from, 1)
  next.splice(to, 0, picked)
  return next
}

/** The rack after pieces leave (`removed`, by id) and the hand becomes `newHand` (kept + newly drawn, in draw order).
 *  Kept pieces stay put; each new piece takes the first empty place (a removed piece's place, or an older gap); extra
 *  new pieces go on the end; leftover empty places stay empty (they never close up), except at the very end. */
export function refillRack(order: RackOrder, removed: readonly string[], newHand: readonly { id: string }[]): RackOrder {
  const inHand = new Set(newHand.map((p) => p.id))
  const stays = (id: string) => id !== GAP && !removed.includes(id) && inHand.has(id)
  const fresh = newHand.map((p) => p.id).filter((id) => !order.some((placed) => placed === id && stays(placed)))
  const next = order.map((id) => (stays(id) ? id : (fresh.shift() ?? GAP)))
  next.push(...fresh)
  while (next.length > 0 && next[next.length - 1] === GAP) next.pop()
  return next
}

/** The places (left to right) holding any of these pieces — e.g. the ones just drawn, or the ones set aside. */
export function placesOf(order: RackOrder, ids: readonly string[]): number[] {
  return order.flatMap((id, place) => (id !== GAP && ids.includes(id) ? [place] : []))
}

/** A shuffled copy of a rack order (plain random — the order isn't part of the game rules). */
export function shuffleRack<T>(order: T[], random: () => number = Math.random): T[] {
  const next = [...order]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

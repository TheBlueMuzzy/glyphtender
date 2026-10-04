// THE TABLE — ZONES & PIECES. Where things are, and who may see inside.  (Pure: no screen, no network.)
//
// A PIECE is one thing in the game (a card, a seed, a token) with a stable id that never changes, from setup to the
// end — so the screen, the server and replays can all say "THIS one", not "the 3rd one in the hand".
// A ZONE is a place that holds pieces: a hand, the bag, a discard pile, the board. A game describes each kind of zone
// once with a ZoneRule: who owns it, and who may see inside it.
//
// The secrecy promise: a seat that may not see inside a zone gets NO ids and NO contents from it — only how many
// pieces are there (hidden()). Ids are stable, so sending a hidden piece's id would let players follow it around.
// Design: framework .planning/design/table.md (Zones · Pieces · Owner).
import type { Seat } from './core'

/** Something with a stable id. Games add their own fields (a letter, a suit…). */
export interface Piece {
  id: string
}

/** Who may see inside a zone: everyone · only its owner · nobody (a shuffled bag). */
export type Inside = 'all' | 'owner' | 'nobody'

/** How a game describes one kind of zone. */
export interface ZoneRule {
  /** e.g. "hand", "bag", "board". */
  name: string
  /** Who may see inside. */
  inside: Inside
  /** Does the order of the pieces matter (a bag drawn from the front, a hand the player arranges)? */
  ordered: boolean
}

/** May this seat see inside a zone with this rule, owned by `owner` (null = nobody owns it)? */
export function canSeeInside(rule: ZoneRule, owner: Seat | null, seat: Seat): boolean {
  return rule.inside === 'all' || (rule.inside === 'owner' && owner === seat)
}

/** What a seat that may NOT see inside is told about a zone's pieces: how many — nothing else, no ids. */
export interface HiddenZone {
  hidden: true
  count: number
}

export const hidden = (pieces: readonly Piece[]): HiddenZone => ({ hidden: true, count: pieces.length })

/** The zone's pieces as this seat may see them: all of them, or only a count. */
export function zoneFor<P extends Piece>(rule: ZoneRule, owner: Seat | null, pieces: readonly P[], seat: Seat): readonly P[] | HiddenZone {
  return canSeeInside(rule, owner, seat) ? pieces : hidden(pieces)
}

/** Ids for a list of things, in order: "seed-0", "seed-1"… Give them out from a FIXED list (the box contents, not the
 *  shuffled deck), so an id never hints at the shuffle. */
export function stableIds<T>(prefix: string, items: readonly T[]): (T & { id: string })[] {
  return items.map((item, i) => ({ ...item, id: `${prefix}-${i}` }))
}

/** Where a piece is in a zone (-1 if it isn't there). */
export function indexOfPiece(pieces: readonly Piece[], id: string): number {
  return pieces.findIndex((p) => p.id === id)
}

/** Takes a piece out of a zone: the piece + the zone without it (the zone itself is never edited). Throws if it isn't there. */
export function takePiece<P extends Piece>(pieces: readonly P[], id: string): { piece: P; rest: P[] } {
  const i = indexOfPiece(pieces, id)
  if (i < 0) throw new Error(`That piece (${id}) isn't there`)
  return { piece: pieces[i], rest: [...pieces.slice(0, i), ...pieces.slice(i + 1)] }
}

/** Does every id appear once, across all these zones? (A piece is only ever in one place.) */
export function idsAreUnique(...zones: readonly (readonly Piece[])[]): boolean {
  const seen = new Set<string>()
  for (const zone of zones) for (const p of zone) {
    if (seen.has(p.id)) return false
    seen.add(p.id)
  }
  return true
}

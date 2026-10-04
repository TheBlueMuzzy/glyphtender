// THE TABLE — DRAG REFEREE. ONE answer to "may this piece go there, for this seat, now?"  (Pure.)
//
// The drop glow, the "nope" shake, the cursor and the drop itself all ask the same referee, so they can never
// disagree (a glow on a spot the drop then refuses, a shake on a piece you're allowed to move…). The referee asks,
// in order:  may this seat act now? (the flow) → may this kind of piece go in this kind of place? (accepts) → do the
// rules allow it right now? (a live check — the same rules the server re-checks every action with).
// Phones: on pick-up, show every place the referee says yes to (targetsFor) — there's no hover on a phone.
// Design: framework .planning/design/table.md (Drag referee).
import type { Seat } from './core'

/** The referee's answer: yes, or no with the reason in plain English. */
export type Verdict = { ok: true } | { ok: false; reason: string }

export const YES: Verdict = { ok: true }
export const no = (reason: string): Verdict => ({ ok: false, reason })

export interface RefereeParts<Piece, Target> {
  /** May this seat act at all right now? (Usually the flow's mayAct, plus "not while something is playing out".) */
  mayAct: (seat: Seat) => boolean
  /** The reason given when it may not (default: "It's not your turn"). */
  notNow?: string
  /** May this kind of piece go in this kind of place at all? (e.g. seeds go on hexes or tray places, never on a
   *  glyphling). Leave out to accept anything — then the check alone decides. */
  accepts?: (piece: Piece, target: Target) => boolean
  /** The reason given when it doesn't accept (default: "That can't go there"). */
  notAccepted?: string
  /** The live rules check: null = allowed, else why not. */
  check: (seat: Seat, piece: Piece, target: Target) => string | null
}

export interface Referee<Piece, Target> {
  /** May this piece go to this target, for this seat, now? */
  judge(seat: Seat, piece: Piece, target: Target): Verdict
  /** May this seat pick this piece up at all? (Yes if at least one of the candidate targets says yes.) */
  mayPickUp(seat: Seat, piece: Piece, candidates: readonly Target[]): Verdict
  /** Every candidate target the referee says yes to — what to light up on pick-up. */
  targetsFor(seat: Seat, piece: Piece, candidates: readonly Target[]): Target[]
}

export function makeReferee<Piece, Target>(parts: RefereeParts<Piece, Target>): Referee<Piece, Target> {
  const judge = (seat: Seat, piece: Piece, target: Target): Verdict => {
    if (!parts.mayAct(seat)) return no(parts.notNow ?? "It's not your turn")
    if (parts.accepts && !parts.accepts(piece, target)) return no(parts.notAccepted ?? "That can't go there")
    const reason = parts.check(seat, piece, target)
    return reason ? no(reason) : YES
  }
  const targetsFor = (seat: Seat, piece: Piece, candidates: readonly Target[]) => candidates.filter((t) => judge(seat, piece, t).ok)
  return {
    judge,
    targetsFor,
    mayPickUp(seat, piece, candidates) {
      if (!parts.mayAct(seat)) return no(parts.notNow ?? "It's not your turn")
      if (candidates.length === 0) return no("There's nowhere for it to go")
      if (targetsFor(seat, piece, candidates).length > 0) return YES
      return judge(seat, piece, candidates[0]) // no target says yes: give the first one's reason
    },
  }
}

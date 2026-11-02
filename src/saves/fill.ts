// FILL IN WHAT'S MISSING — after loading (and upgrading) a save, every field today's game expects is there:
//   - a field the save doesn't have (added in a later build) → today's default
//   - a field with the wrong kind of value (text where a number belongs) → today's default (that value is broken)
//   - everything else is the PLAYER'S and stays exactly as saved — even when today's default is different.
// So changing a default in `fresh` only reaches NEW players. A changed default that should reach old saves too is an
// upgrade step (see saves.ts) — e.g. Glyphtender turning "2-letter words" off for everyone once.
// Fields the save has but `fresh` doesn't are kept too (harmless, and nothing is thrown away by accident).

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** A deep copy of plain JSON data (so a fresh default is never shared between two saves). */
export const copyData = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)))

export interface FillResult<T> {
  value: T
  /** Fields that were missing and got today's default, e.g. ["wordIndicators", "seats.2.skill"]. */
  added: string[]
  /** Fields whose saved value was the wrong kind and got today's default. */
  replaced: string[]
}

export function fillMissing<T>(saved: unknown, fresh: T): FillResult<T> {
  const added: string[] = []
  const replaced: string[] = []
  const value = fill(saved, fresh, '', added, replaced) as T
  return { value, added, replaced }
}

/** How `replaced` names the save itself (its data wasn't even the right kind — loading treats that copy as broken). */
export const WHOLE_SAVE = '(the whole save)'

function fill(saved: unknown, fresh: unknown, path: string, added: string[], replaced: string[]): unknown {
  const here = path || WHOLE_SAVE
  if (isPlainObject(fresh)) {
    if (!isPlainObject(saved)) {
      replaced.push(here)
      return copyData(fresh)
    }
    const out: Record<string, unknown> = { ...saved }
    for (const [key, freshValue] of Object.entries(fresh)) {
      const childPath = path ? `${path}.${key}` : key
      if (!(key in saved) || saved[key] === undefined) {
        added.push(childPath)
        out[key] = copyData(freshValue)
      } else {
        out[key] = fill(saved[key], freshValue, childPath, added, replaced)
      }
    }
    return out
  }
  if (Array.isArray(fresh)) {
    // A list is the player's as a whole (their unlocks, their seats) — only a non-list is replaced.
    if (Array.isArray(saved)) return saved
    replaced.push(here)
    return copyData(fresh)
  }
  if (fresh === null) return saved // null in `fresh` = "no default: any value is fine"
  if (typeof saved === typeof fresh) return saved
  replaced.push(here)
  return fresh
}

// HOW PROGRESS COMBINES — when two copies of a save meet (two devices, later through the cloud — F96 — or a save code
// pasted on top of other progress), each progress field says how to combine:
//   highest  — keep the bigger number (best score, XP, highest level reached)
//   add-up   — each device's part adds up (games played, lifetime stats): two devices that played 5 and 3 games = 8.
//              Every save remembers each device's own part ("counts"), so the same copy met twice never counts twice.
//   collect  — keep everything from both lists (unlocks, achievements, words found)
//   newest   — the copy saved last wins (the default for any field not listed, and for settings / runs)
// Fields are the save's top-level fields. The game never sees the counts: it reads and writes plain numbers.
import type { SaveKind, SaveRecord } from './saves'
import { readKey, writeKey, type StorageLike } from './storage'

export type FieldRule = 'highest' | 'add-up' | 'collect' | 'newest'
export type FieldRules<T> = Partial<Record<keyof T & string, FieldRule>>
export const FIELD_RULES: readonly FieldRule[] = ['highest', 'add-up', 'collect', 'newest']

/** The part of an add-up total from before the save counted per device (an old save, or a save code from one). */
export const EARLIER = 'earlier'

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const sum = (parts: Record<string, number> = {}) => Object.values(parts).reduce((total, n) => total + n, 0)

/** This device's id for one save (random, made once, kept beside the save — never inside it, so a save code
 *  carried to another device doesn't bring the id along). */
export function deviceId(storage: StorageLike | null, key: string): string {
  const idKey = `${key}~device`
  const saved = readKey(storage, idKey)
  if (saved) return saved
  const id = Math.random().toString(36).slice(2, 10) || 'device'
  writeKey(storage, idKey, id)
  return id
}

/**
 * The counts to write with a new save: for each add-up field, this device's part = the new total minus every OTHER
 * device's part (from the copy being replaced). A total that went down (a reset) never makes a part negative.
 */
export function countDevices<T>({ storage, key, fields, data, previous }: {
  storage: StorageLike | null; key: string; fields: FieldRules<T>; data: T; previous: SaveRecord<T> | null
}): SaveRecord['counts'] | undefined {
  const addUp = Object.entries(fields).filter(([, rule]) => rule === 'add-up').map(([field]) => field)
  if (!addUp.length) return undefined
  const me = deviceId(storage, key)
  const counts: Record<string, Record<string, number>> = {}
  for (const field of addUp) {
    const total = (data as Record<string, unknown>)[field]
    if (!isNumber(total)) continue
    const before = { ...(previous?.counts?.[field] ?? earlierPart(previous, field)) }
    delete before[me]
    counts[field] = { ...before, [me]: Math.max(0, total - sum(before)) }
  }
  return counts
}

/** A copy with no counts for a field (written before counting): its whole value is one "earlier" part.
 *  (Two devices' "earlier" parts can't be told apart, so they combine as the higher one — never counted twice.) */
function earlierPart(record: SaveRecord | null, field: string): Record<string, number> {
  const value = (record?.data as Record<string, unknown> | undefined)?.[field]
  return isNumber(value) && value > 0 ? { [EARLIER]: value } : {}
}

/** Two lists → one, everything from both, nothing twice (compared as JSON, so objects in lists work too). */
function collect(a: unknown, b: unknown): unknown {
  if (!Array.isArray(a) || !Array.isArray(b)) return undefined
  const seen = new Set(a.map((item) => JSON.stringify(item)))
  return [...a, ...b.filter((item) => !seen.has(JSON.stringify(item)))]
}

/**
 * Two copies of the same save (both already at today's version — load them through the save first) → one.
 * settings / run / slots: the newest copy wins whole. progress: field by field, by its rule.
 */
export function mergeRecords<T>(kind: SaveKind, fields: FieldRules<T> | undefined, a: SaveRecord<T>, b: SaveRecord<T>): SaveRecord<T> {
  const [older, newer] = (a.savedAt || '') <= (b.savedAt || '') ? [a, b] : [b, a]
  if (kind !== 'progress') return newer
  const data = { ...(older.data as object), ...(newer.data as object) } as Record<string, unknown>
  const counts: Record<string, Record<string, number>> = {}
  const oldData = older.data as Record<string, unknown>
  const newData = newer.data as Record<string, unknown>
  for (const [field, rule] of Object.entries(fields ?? {})) {
    if (rule === 'highest' && isNumber(oldData[field]) && isNumber(newData[field])) {
      data[field] = Math.max(oldData[field], newData[field])
    } else if (rule === 'collect') {
      const both = collect(oldData[field], newData[field])
      if (both !== undefined) data[field] = both
    } else if (rule === 'add-up') {
      // each device's part: the bigger of the two copies' (a device's own part only ever grows) — then the total
      const partsA = older.counts?.[field] ?? earlierPart(older, field)
      const partsB = newer.counts?.[field] ?? earlierPart(newer, field)
      const parts: Record<string, number> = {}
      for (const device of new Set([...Object.keys(partsA), ...Object.keys(partsB)])) {
        // (own parts only — a device named "constructor" must not read the built-in one and turn the total into NaN)
        parts[device] = Math.max(Object.hasOwn(partsA, device) ? partsA[device] : 0, Object.hasOwn(partsB, device) ? partsB[device] : 0)
      }
      counts[field] = parts
      data[field] = sum(parts)
    }
    // newest: already the newer copy's value
  }
  return { ...newer, data: data as T, ...(Object.keys(counts).length ? { counts: { ...newer.counts, ...counts } } : {}) }
}

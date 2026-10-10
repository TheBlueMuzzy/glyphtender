// The Moments tool's thinking, kept apart from its looks so it can be tested (momentLogic.test.ts, in the framework).
// Nothing here touches the page or the files.
//   Paths:    read / write a knob's value — keys may hold dots ("sounds" › "score.pop" › "volumeDb")
//   Notes:    a knob's _labels / _help / _ranges entry, exact or by wildcard ("sounds.*.volumeDb")
//   Presets:  Soft · Balanced · Punchy — exact values, else the relative rules (design/devkit-moments.md)
//   Moments:  which belong to a screen, problems in the list, what the search looks through
import type { DevKitPreview } from '../previews/previewTypes'
import { matchesAll, readableKey, searchTerms } from '../search/searchLogic'
import { sliderRange, type Range } from '../tuning/tuningLogic'
import { FEEL_STYLES, type DevKitMoment, type FeelStyle, type KnobRole, type MomentKnob } from './momentTypes'

type Data = Record<string, unknown>
const isObject = (v: unknown): v is Data => v !== null && typeof v === 'object'

// ─── Paths ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The real keys a dotted path walks through, or null if it leads nowhere. At each step the LONGEST key that
 * exists wins, so "sounds.score.pop.volumeDb" → ["sounds", "score.pop", "volumeDb"].
 */
export function resolveKeys(data: unknown, path: string): string[] | null {
  const parts = path.split('.')
  const keys: string[] = []
  let here = data
  let at = 0
  while (at < parts.length) {
    if (!isObject(here)) return null
    let next = -1
    for (let end = parts.length; end > at; end--) {
      if (Object.hasOwn(here, parts.slice(at, end).join('.'))) {
        next = end
        break
      }
    }
    if (next === -1) return null
    const key = parts.slice(at, next).join('.')
    keys.push(key)
    here = here[key]
    at = next
  }
  return keys
}

/** A knob's value in its file (undefined when the path leads nowhere). */
export function readKnob(data: unknown, path: string): unknown {
  const keys = resolveKeys(data, path)
  if (!keys) return undefined
  let here = data
  for (const key of keys) here = (here as Data)[key]
  return here
}

/** A copy of the file with one knob changed. Everything else (_help, _ranges…) stays as it was. */
export function writeKnob<T>(data: T, path: string, value: unknown): T {
  const keys = resolveKeys(data, path)
  if (!keys) throw new Error(`"${path}" isn't in the file`)
  const copy = structuredClone(data)
  let here = copy as Data
  for (const key of keys.slice(0, -1)) here = here[key] as Data
  here[keys[keys.length - 1]] = value
  return copy
}

/** "content/tuning/feel.json" → "feel": the name live edits travel under (liveTuning.ts) */
export const liveName = (file: string) => file.split('/').pop()!.replace(/\.json$/, '')

/** One knob's id: "content/tuning/feel.json → tiers.big.grow" */
export const knobId = (knob: MomentKnob) => `${knob.file} → ${knob.path}`

// ─── Notes (_labels, _help, _ranges) ──────────────────────────────────────────────────────────────

const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/**
 * A note for these keys: the exact entry ("sounds.score.pop.volumeDb"), else the first wildcard entry that fits
 * ("sounds.*.volumeDb" — * stands for one key, dots and all). `stars` = what each * stood for (["score.pop"]).
 */
export function noteFor(notes: unknown, keys: string[]): { value: unknown; stars: string[] } | undefined {
  if (!isObject(notes)) return undefined
  const full = keys.join('.')
  if (Object.hasOwn(notes, full)) return { value: notes[full], stars: [] }
  for (const [pattern, value] of Object.entries(notes)) {
    if (!pattern.includes('*')) continue
    const found = new RegExp(`^${escape(pattern).replace(/\*/g, '(.+)')}$`).exec(full)
    if (found) return { value, stars: found.slice(1) }
  }
  return undefined
}

/** What the knob's row shows: its name, help line and slider range (from the file's notes, else made up). */
export function knobInfo(knob: MomentKnob, data: unknown, loadedValue: unknown) {
  const keys = resolveKeys(data, knob.path) ?? knob.path.split('.')
  const d = isObject(data) ? data : {}
  const label = noteFor(d._labels, keys)
  const help = noteFor(d._help, keys)
  const range = noteFor(d._ranges, keys)
  const ownLabel = typeof label?.value === 'string' ? label.value : undefined
  return {
    // From a wildcard, say which one: "score.pop: Volume (dB)"
    label: knob.label ?? (ownLabel ? [...(label?.stars ?? []), ownLabel].join(': ') : readableKey(keys[keys.length - 1])),
    help: typeof help?.value === 'string' ? help.value : undefined,
    ranges: range ? { [knob.path]: range.value } : undefined, // shaped like a file's _ranges, for FieldRow
    range: typeof loadedValue === 'number' ? sliderRange(loadedValue, knob.path, range ? { [knob.path]: range.value } : undefined) : undefined,
  }
}

// ─── Presets ───────────────────────────────────────────────────────────────────────────────────────

/** What a key most likely does (KnobRole). Order matters: "randomPitch" before "pitch", "delayMs" before "…Ms". */
export function guessRole(path: string): KnobRole {
  const key = path.split('.').pop()!.toLowerCase()
  if (key.includes('randompitch')) return 'randomPitch'
  if (key.includes('random')) return 'none' // random volume etc.: leave alone
  if (key.includes('volume') || key.endsWith('db')) return 'volume'
  if (/delay|gap|stagger|wait/.test(key)) return 'delay'
  if (key.includes('shake')) return 'shake'
  if (/overshoot|bounce/.test(key)) return 'overshoot'
  if (/grow|scale|size|squash|stretch|swell/.test(key)) return 'size'
  if (/(ms|time|duration|secs|seconds|fade|hold)$/.test(key)) return 'duration'
  return 'none'
}

/** The relative rules: how Soft and Punchy move a knob from its Balanced value. 'times' multiplies, 'plus' adds. */
export const STYLE_RULES: Record<Exclude<KnobRole, 'none'>, { how: 'times' | 'plus'; soft: number; punchy: number }> = {
  duration: { how: 'times', soft: 1.3, punchy: 0.75 },
  delay: { how: 'times', soft: 1.25, punchy: 0.8 },
  size: { how: 'times', soft: 0.6, punchy: 1.4 },
  shake: { how: 'times', soft: 0.5, punchy: 1.5 },
  overshoot: { how: 'times', soft: 0.5, punchy: 1.5 },
  volume: { how: 'plus', soft: -3, punchy: 2 },
  randomPitch: { how: 'times', soft: 0.5, punchy: 1.5 },
}

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length

/** Keep a number inside the slider's range, on its steps. */
export function fitRange(value: number, range: Range | undefined): number {
  if (!range) return Number(value.toFixed(4))
  const clamped = Math.min(range.max, Math.max(range.min, value))
  const stepped = range.step > 0 ? Math.round(clamped / range.step) * range.step : clamped
  return Number(stepped.toFixed(decimalsOf(range.step)))
}

/**
 * One knob's value in a style. `base` = its Balanced value (the file as the screen opened).
 * Exact values (knob.values) win; else the rule for its role; else it stays as it is.
 */
export function styleValue(knob: MomentKnob, style: FeelStyle, base: unknown, range?: Range): unknown {
  if (knob.values && knob.values[style] !== undefined) return knob.values[style]
  const role = knob.role ?? guessRole(knob.path)
  if (style === 'balanced' || role === 'none' || typeof base !== 'number') return base
  const rule = STYLE_RULES[role]
  const moved = rule.how === 'times' ? base * rule[style] : base + rule[style]
  return fitRange(moved, range)
}

const same = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9)

/** Which style the knobs are on now, or 'custom' (Balanced is checked first: it wins a tie). */
export function activeStyle(now: unknown[], styles: Record<FeelStyle, unknown[]>): FeelStyle | 'custom' {
  for (const style of ['balanced', 'soft', 'punchy'] as FeelStyle[]) {
    if (now.every((value, i) => same(value, styles[style][i]))) return style
  }
  return 'custom'
}

/** Every style's values for a moment's knobs (in knob order). base(knob) / range(knob) come from the files. */
export function allStyles(
  knobs: MomentKnob[],
  base: (knob: MomentKnob) => unknown,
  range: (knob: MomentKnob) => Range | undefined,
): Record<FeelStyle, unknown[]> {
  return Object.fromEntries(
    FEEL_STYLES.map((style) => [style, knobs.map((k) => styleValue(k, style, base(k), range(k)))]),
  ) as Record<FeelStyle, unknown[]>
}

// ─── Looping ───────────────────────────────────────────────────────────────────────────────────────

/** How long to wait before the next loop: the rest of the interval, or nothing if the play took longer. */
export const nextFireDelay = (startedAt: number, endedAt: number, intervalMs: number) =>
  Math.max(0, intervalMs - (endedAt - startedAt))

// ─── The list ──────────────────────────────────────────────────────────────────────────────────────

/** The moments that play on one screen, in list order. */
export const momentsFor = (moments: DevKitMoment[], screen: string) => moments.filter((m) => m.screen === screen)

/** Plain-words problems in a game's moments list ([] = fine). */
export function checkMoments(moments: DevKitMoment[], screens: string[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const m of moments) {
    if (seen.has(m.id)) problems.push(`two moments are called "${m.id}"`)
    seen.add(m.id)
    if (!screens.includes(m.screen)) problems.push(`moment "${m.id}" plays on screen "${m.screen}", which isn't in the previews list`)
    for (const k of m.knobs) {
      if (!/^content\/.+\.json$/.test(k.file)) problems.push(`moment "${m.id}": knob file "${k.file}" must be a content/…json file`)
    }
  }
  return problems
}

/** The other moments that use the same knob — changing it changes them too (same intention, same motion). */
export function sharedWith(moments: DevKitMoment[], self: DevKitMoment, knob: MomentKnob): string[] {
  const id = knobId(knob)
  return moments.filter((m) => m.id !== self.id && m.knobs.some((k) => knobId(k) === id)).map((m) => m.label)
}

/** The texts the Screens search looks through for one moment. */
export const momentTexts = (m: DevKitMoment) => [m.label, m.note, m.id]

/** Does this moment match a search? */
export const momentMatches = (m: DevKitMoment, query: string) => matchesAll(searchTerms(query), momentTexts(m))

/**
 * The Screens tab's search: each screen that matches (its name, group, note, id or a variant's name) with ALL its
 * moments, or a screen holding a matching moment with just those. Not searching = every screen, every moment.
 */
export function searchScreens(previews: DevKitPreview[], moments: DevKitMoment[], query: string) {
  const terms = searchTerms(query)
  const found: { preview: DevKitPreview; moments: DevKitMoment[] }[] = []
  for (const preview of previews) {
    const own = momentsFor(moments, preview.id)
    const texts = [preview.label, preview.group, preview.note, preview.id, ...(preview.variants ?? []).map((v) => v.label)]
    if (matchesAll(terms, texts)) found.push({ preview, moments: own })
    else {
      const hits = own.filter((m) => matchesAll(terms, momentTexts(m)))
      if (hits.length > 0) found.push({ preview, moments: hits })
    }
  }
  return found
}

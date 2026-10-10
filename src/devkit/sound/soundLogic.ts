// THE SOUND TAB'S THINKING — kept apart from its looks so it can be tested (soundLogic.test.ts, in the framework).
// Nothing here touches the page, the speakers or the files.
//
// The tab edits content/audio.json as it is written ("raw"): a sound only lists the knobs it changes, everything
// else is the audio module's default. So a knob's value = the sound's own value, else KNOBS' fallback (the same
// defaults as framework/audio/kit/config.ts — a test keeps the two the same).
// Notes for a knob (_ranges · _labels · _help) are looked up exact first ("sounds.seed.land.volumeDb"), then by the
// wildcard every sound shares ("sounds.*.volumeDb").

export type RawSound = Record<string, unknown>
export type RawAudio = Record<string, unknown>
export type Range = [min: number, max: number, step: number]

export const BUS_ORDER = ['sfx', 'ui', 'ambience', 'music'] as const
export const BUS_TITLES: Record<string, string> = { sfx: 'Effects (sfx)', ui: 'Menus & buttons (ui)', ambience: 'Ambience', music: 'Music' }

/** The folders under public/audio/, and where a new file goes for each volume group (stg = stingers, chosen by hand) */
export const AUDIO_FOLDERS = ['sfx', 'ui', 'amb', 'mus', 'stg']
const FOLDER_FOR_BUS: Record<string, string> = { sfx: 'sfx', ui: 'ui', ambience: 'amb', music: 'mus' }

export type Knob = {
  key: string
  kind: 'number' | 'boolean' | 'choice'
  fallback: number | boolean | string
  range?: Range
  choices?: string[]
  group: string
}

const n = (key: string, fallback: number, range: Range, group: string): Knob => ({ key, kind: 'number', fallback, range, group })
const b = (key: string, group: string): Knob => ({ key, kind: 'boolean', fallback: false, group })

/** Every knob of a sound, in the order the editor shows them (same defaults + ranges as audio/kit/config.ts) */
export const KNOBS: Knob[] = [
  { key: 'bus', kind: 'choice', fallback: 'sfx', choices: ['sfx', 'ui', 'ambience', 'music'], group: 'Basics' },
  { key: 'pick', kind: 'choice', fallback: 'random', choices: ['random', 'sequence', 'shuffle'], group: 'Basics' },
  // auto = music + ambience stream from the file (long files never sit whole in memory), effects + menus are decoded
  { key: 'stream', kind: 'choice', fallback: 'auto', choices: ['auto', 'always', 'never'], group: 'Basics' },
  n('volumeDb', 0, [-40, 6, 0.5], 'Basics'),
  n('pitch', 0, [-12, 12, 0.1], 'Basics'),
  n('randomPitch', 0, [0, 3, 0.1], 'Variation'),
  n('randomVolumeDb', 0, [0, 6, 0.5], 'Variation'),
  n('delayMs', 0, [0, 1000, 5], 'Timing'),
  n('trimStartMs', 0, [0, 5000, 5], 'Timing'),
  n('trimEndMs', 0, [0, 5000, 5], 'Timing'),
  n('fadeInMs', 0, [0, 5000, 5], 'Timing'),
  n('fadeOutMs', 0, [0, 5000, 5], 'Timing'),
  b('loop', 'Loop'),
  n('loopStartMs', 0, [0, 600000, 10], 'Loop'),
  n('loopEndMs', 0, [0, 600000, 10], 'Loop'),
  n('loopCrossfadeMs', 100, [0, 5000, 10], 'Loop'),
  n('maxVoices', 4, [1, 8, 1], 'Limits'),
  n('cooldownMs', 30, [0, 500, 5], 'Limits'),
  n('priority', 2, [0, 5, 1], 'Limits'),
  n('pan', 0, [-1, 1, 0.05], 'Tone'),
  n('lowpassHz', 0, [0, 20000, 10], 'Tone'),
  n('highpassHz', 0, [0, 20000, 10], 'Tone'),
  b('ladder', 'Extras'),
  b('duck', 'Extras'),
]
export const knobByKey = (key: string) => KNOBS.find((k) => k.key === key)

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The named sounds (notes like "_help" skipped) */
export function soundsOf(raw: RawAudio): Record<string, RawSound> {
  const sounds = isRecord(raw.sounds) ? raw.sounds : {}
  return Object.fromEntries(Object.entries(sounds).filter(([name, s]) => !name.startsWith('_') && isRecord(s))) as Record<string, RawSound>
}

export const filesOf = (sound: RawSound | undefined): string[] =>
  Array.isArray(sound?.files) ? (sound.files as unknown[]).filter((f): f is string => typeof f === 'string') : []

/** A knob's value for a sound: its own, else the default */
export function knobValue(raw: RawAudio, name: string, key: string): unknown {
  const own = soundsOf(raw)[name]?.[key]
  return own !== undefined ? own : knobByKey(key)?.fallback
}

/** A note for a sound's knob: "_ranges" / "_labels" / "_help" — exact ("sounds.tangle.pitch") first, then "sounds.*.pitch" */
export function noteFor(raw: RawAudio, note: '_ranges' | '_labels' | '_help', name: string, key: string): unknown {
  const notes = raw[note]
  if (!isRecord(notes)) return undefined
  return notes[`sounds.${name}.${key}`] ?? notes[`sounds.*.${key}`]
}

const isRange = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x === 'number')

/** A number knob's slider: the file's _ranges (wildcard), else the module's own range */
export function knobRange(raw: RawAudio, name: string, key: string): Range {
  const own = noteFor(raw, '_ranges', name, key)
  const fallback = knobByKey(key)?.range ?? [0, 100, 1]
  if (!isRange(own)) return fallback
  return [own[0], own[1], own[2] ?? fallback[2]]
}

/** A plain-English name: the file's _labels, else the key split into words ("randomPitch" → "random pitch") */
export function knobLabel(raw: RawAudio, name: string, key: string): string {
  const label = noteFor(raw, '_labels', name, key)
  return typeof label === 'string' && label ? label : key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

export function knobHelp(raw: RawAudio, name: string, key: string): string | undefined {
  const help = noteFor(raw, '_help', name, key)
  return typeof help === 'string' && help ? help : undefined
}

/** What a sound is for (its own _help line, e.g. "sounds.seed.land") */
export function soundHelp(raw: RawAudio, name: string): string | undefined {
  const notes = raw._help
  const help = isRecord(notes) ? notes[`sounds.${name}`] : undefined
  return typeof help === 'string' ? help : undefined
}

/** A deep copy, so an edit never changes the original */
const copy = <T>(value: T): T => structuredClone(value)

/**
 * A copy of the file with one knob of one sound changed. If the new value is what the saved file means anyway and the
 * saved sound didn't spell it out, the key is left out again — so ↺ leaves no trace in the file.
 */
export function withSoundValue(raw: RawAudio, name: string, key: string, value: unknown, saved?: RawAudio): RawAudio {
  const out = copy(raw)
  const sound = soundsOf(out)[name]
  if (!sound) return out
  const savedSound = saved ? soundsOf(saved)[name] : undefined
  const savedHasKey = savedSound !== undefined && key in savedSound
  if (saved && !savedHasKey && value === knobValue(saved, name, key)) delete sound[key]
  else sound[key] = value
  return out
}

/** A copy with a sound's file list replaced */
export function withFiles(raw: RawAudio, name: string, files: string[]): RawAudio {
  const out = copy(raw)
  const sound = soundsOf(out)[name]
  if (sound) sound.files = [...files]
  return out
}

/** A copy of a list with item i moved by delta (−1 up, +1 down). Out of bounds → unchanged. */
export function moveItem<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** A copy of a buses / master value change (the Mixer): e.g. ("buses", "music", -10) */
export function withMixValue(raw: RawAudio, group: 'buses' | 'master', key: string, value: number): RawAudio {
  const out = copy(raw)
  const holder = isRecord(out[group]) ? (out[group] as Record<string, unknown>) : (out[group] = {} as Record<string, unknown>)
  holder[key] = value
  return out
}

/**
 * The config to play ONE file of a sound with: the sound as `version` (its saved or edited self) but only `file`.
 * Used by ▶ on a file and by A/B, so both sides play the same variant.
 */
export function withOnlyFile(raw: RawAudio, name: string, file: string, version?: RawSound): RawAudio {
  const out = copy(raw)
  const sounds = soundsOf(out)
  const sound = version ? copy(version) : sounds[name]
  if (!sound) return out
  ;(out.sounds as Record<string, RawSound>)[name] = { ...sound, files: [file] }
  return out
}

/**
 * A/B: the edited file, but this sound as saved (A) or as edited (B). Everything else stays the edit, so only this
 * sound changes between the two. A sound that isn't saved yet has no A: it's left as edited.
 */
export function abConfig(edited: RawAudio, saved: RawAudio, name: string, side: 'A' | 'B'): RawAudio {
  const out = copy(edited)
  const savedSound = soundsOf(saved)[name]
  if (side === 'A' && savedSound) (out.sounds as Record<string, RawSound>)[name] = copy(savedSound)
  return out
}

/** Has this sound changed from the saved file? */
export const soundChanged = (edited: RawAudio, saved: RawAudio, name: string) =>
  JSON.stringify(soundsOf(edited)[name]) !== JSON.stringify(soundsOf(saved)[name])

/** Has anything in the file changed? */
export const fileChanged = (edited: RawAudio, saved: RawAudio) => JSON.stringify(edited) !== JSON.stringify(saved)

// ---------- the list ----------
export type SoundRow = { name: string; bus: string; files: string[]; tier?: string; help?: string }
export type BusGroup = { bus: string; title: string; sounds: SoundRow[] }

/** The search box's words, lower case */
export const termsOf = (query = '') => query.toLowerCase().split(/\s+/).filter(Boolean)

/** Which feel tier (small / medium / big) uses this sound, if any — from "tiers" */
export function tierOf(raw: RawAudio, name: string): string | undefined {
  const tiers = isRecord(raw.tiers) ? raw.tiers : {}
  return Object.keys(tiers).find((tier) => tiers[tier] === name)
}

/** Every sound grouped by volume group (sfx, ui, ambience, music), keeping the file's order; filtered by the search words */
export function soundGroups(raw: RawAudio, query = ''): BusGroup[] {
  const terms = termsOf(query)
  const rows: SoundRow[] = Object.entries(soundsOf(raw)).map(([name, sound]) => ({
    name,
    bus: String(sound.bus ?? 'sfx'),
    files: filesOf(sound),
    tier: tierOf(raw, name),
    help: soundHelp(raw, name),
  }))
  const matches = (row: SoundRow) => {
    const text = [row.name, row.bus, BUS_TITLES[row.bus] ?? '', row.tier ?? '', row.help ?? '', ...row.files].join(' ').toLowerCase()
    return terms.every((term) => text.includes(term))
  }
  const buses = [...BUS_ORDER, ...new Set(rows.map((r) => r.bus).filter((bus) => !(BUS_ORDER as readonly string[]).includes(bus)))]
  return buses
    .map((bus) => ({ bus, title: BUS_TITLES[bus] ?? bus, sounds: rows.filter((r) => r.bus === bus && matches(r)) }))
    .filter((group) => group.sounds.length > 0)
}

export const countSounds = (groups: BusGroup[]) => groups.reduce((total, g) => total + g.sounds.length, 0)

// ---------- new files ----------
/** Where a new file for this sound goes: the folder its files already use, else its volume group's folder */
export function folderFor(sound: RawSound | undefined): string {
  const first = filesOf(sound)[0]?.split('/')[0]
  if (first && AUDIO_FOLDERS.includes(first)) return first
  return FOLDER_FOR_BUS[String(sound?.bus ?? 'sfx')] ?? 'sfx'
}

/** The file name start for a sound: "seed.land" in sfx → "sfx_seed_land", "ui.tap" in ui → "ui_tap" (the naming rule category_object_action) */
export function stemFor(name: string, folder: string): string {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length > 1 && words[0] === folder) words.shift() // "amb.night" in amb/ → amb_night, not amb_amb_night
  words.splice(5)
  return [folder, ...(words.length ? words : ['sound'])].join('_')
}

/** "Pop Sound.WAV" → "wav" */
export const extensionOf = (fileName: string) => (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()

// ---------- credits (content/credits.json) ----------
export type LicenceCheck = { light: '🟢' | '🟡' | '🔴'; needsCredit: boolean; warning?: string }

/** How safe a licence is to ship: CC0 / own work 🟢 · CC-BY 🟡 (needs a credit line) · NC / ND 🔴 (warn) */
export function checkLicence(licence: string): LicenceCheck {
  const l = licence.toLowerCase().replace(/[\s_]+/g, '-')
  if (/\bnc\b|non-?commercial/.test(l)) {
    return { light: '🔴', needsCredit: true, warning: 'NC = non-commercial: it can\'t be used in a game you sell (or one with ads). Find another sound for release.' }
  }
  if (/\bnd\b|no-?deriv/.test(l)) return { light: '🔴', needsCredit: true, warning: 'ND = no changes allowed, but the Dev Kit trims and converts it. Find another sound.' }
  if (/cc0|public-domain|own-work|^own$|^mine$/.test(l)) return { light: '🟢', needsCredit: false }
  if (/cc-?by|^by\b|attribution/.test(l)) return { light: '🟡', needsCredit: true }
  return { light: '🟡', needsCredit: true, warning: 'Not a licence the Dev Kit knows — check it allows use in a game before release.' }
}

export type CreditInput = { path: string; source: string; author: string; licence: string; url: string }

/** The content/credits.json entry for a new sound file (same shape as the game's existing entries) */
export function creditEntry({ path, source, author, licence, url }: CreditInput) {
  const check = checkLicence(licence)
  const title = source.trim()
  const by = author.trim()
  return {
    paths: [`public/audio/${path}`],
    source: title,
    author: by,
    licence: licence.trim(),
    light: check.light,
    url: url.trim(),
    credit: check.needsCredit ? `${title}${by ? ` by ${by}` : ''}, ${licence.trim()}` : '',
  }
}

// ---------- the waveform ----------
/** The loudest dip and peak of each of `columns` slices of the samples (for drawing), each −1…1 */
export function peaksOf(samples: ArrayLike<number>, columns: number): [min: number, max: number][] {
  const out: [number, number][] = []
  if (columns <= 0) return out
  const per = samples.length / columns
  for (let c = 0; c < columns; c++) {
    const from = Math.floor(c * per)
    const to = Math.max(from + 1, Math.floor((c + 1) * per))
    let min = 0
    let max = 0
    for (let i = from; i < to && i < samples.length; i++) {
      if (samples[i] < min) min = samples[i]
      if (samples[i] > max) max = samples[i]
    }
    out.push([min, max])
  }
  return out
}

export const msToX = (ms: number, durationMs: number, width: number) => (durationMs > 0 ? (ms / durationMs) * width : 0)
export const xToMs = (x: number, durationMs: number, width: number) => (width > 0 ? Math.min(durationMs, Math.max(0, (x / width) * durationMs)) : 0)

export type HandleKey = 'trimStartMs' | 'trimEndMs' | 'loopStartMs' | 'loopEndMs'
export type Handle = { key: HandleKey; ms: number }

/** Where each drag handle sits, in ms into the file. Trim end counts from the end; loop end 0 = the end. Loop handles only for loops. */
export function handlesFor(values: { trimStartMs: number; trimEndMs: number; loop: boolean; loopStartMs: number; loopEndMs: number }, durationMs: number): Handle[] {
  const handles: Handle[] = [
    { key: 'trimStartMs', ms: Math.min(durationMs, values.trimStartMs) },
    { key: 'trimEndMs', ms: Math.max(0, durationMs - values.trimEndMs) },
  ]
  if (values.loop) {
    handles.push({ key: 'loopStartMs', ms: Math.min(durationMs, values.loopStartMs) })
    handles.push({ key: 'loopEndMs', ms: values.loopEndMs > 0 ? Math.min(durationMs, values.loopEndMs) : durationMs })
  }
  return handles
}

/** The handle nearest x (within `reach` pixels), or null */
export function nearestHandle(handles: Handle[], x: number, durationMs: number, width: number, reach = 10): HandleKey | null {
  let best: HandleKey | null = null
  let bestDistance = reach
  for (const h of handles) {
    const distance = Math.abs(msToX(h.ms, durationMs, width) - x)
    if (distance <= bestDistance) {
      best = h.key
      bestDistance = distance
    }
  }
  return best
}

/** A handle dragged to `ms` → the knob's value (trim end counts back from the end), rounded to the slider's step */
export function dragValue(key: HandleKey, ms: number, durationMs: number, step: number): number {
  const clamped = Math.min(durationMs, Math.max(0, ms))
  const value = key === 'trimEndMs' ? durationMs - clamped : clamped
  const rounded = step > 0 ? Math.round(value / step) * step : value
  return Math.max(0, Number(rounded.toFixed(6)))
}

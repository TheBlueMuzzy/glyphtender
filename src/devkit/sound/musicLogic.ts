// THE SOUND TAB'S MUSIC SECTION — its thinking, kept apart from its looks so it can be tested (musicLogic.test.ts).
// Edits content/audio.json "music.tracks" as written ("raw"): a track or layer lists only the knobs it changes, the
// rest is the audio module's default — the same defaults + ranges as framework/audio/kit/config.ts (a test keeps them
// the same). Notes (_labels · _help · _ranges) are looked up exact first ("music.tracks.garden.fadeInMs"), then by the
// wildcard every track shares ("music.tracks.*.fadeInMs", "music.tracks.*.layers.*.volumeDb").
import type { Range, RawAudio } from './soundLogic'
import type { SoundMusicState } from './soundTypes'

export type RawTrack = Record<string, unknown>

export type MusicKnob = {
  key: string
  kind: 'number' | 'boolean'
  fallback: number | boolean
  range?: Range
  label: string
  group: 'Rests' | 'Loop'
}

/** A track's knobs, in the order shown. restSeconds is two sliders: "restSeconds.0" (shortest) and "restSeconds.1" (longest). */
export const TRACK_KNOBS: MusicKnob[] = [
  { key: 'playsBeforeRest', kind: 'number', fallback: 2, range: [0, 20, 1], label: 'Plays before a rest (0 = never rests)', group: 'Rests' },
  { key: 'restSeconds.0', kind: 'number', fallback: 60, range: [0, 600, 1], label: 'Rest: shortest (s)', group: 'Rests' },
  { key: 'restSeconds.1', kind: 'number', fallback: 90, range: [0, 600, 1], label: 'Rest: longest (s)', group: 'Rests' },
  { key: 'fadeInMs', kind: 'number', fallback: 2000, range: [0, 20000, 50], label: 'Fade in (ms)', group: 'Rests' },
  { key: 'fadeOutMs', kind: 'number', fallback: 3000, range: [0, 20000, 50], label: 'Fade out (ms)', group: 'Rests' },
  { key: 'loop', kind: 'boolean', fallback: true, label: 'Loop (off = a piece with an ending)', group: 'Loop' },
  { key: 'loopCrossfadeMs', kind: 'number', fallback: 100, range: [0, 10000, 10], label: 'Loop crossfade (ms)', group: 'Loop' },
  { key: 'loopStartMs', kind: 'number', fallback: 0, range: [0, 600000, 10], label: 'Loop start (ms)', group: 'Loop' },
  { key: 'loopEndMs', kind: 'number', fallback: 0, range: [0, 600000, 10], label: 'Loop end (ms, 0 = the end)', group: 'Loop' },
]

/** A layer's knobs */
export const LAYER_KNOBS: MusicKnob[] = [
  { key: 'volumeDb', kind: 'number', fallback: 0, range: [-40, 6, 0.5], label: 'Volume (dB)', group: 'Rests' },
  { key: 'fromIntensity', kind: 'number', fallback: 0, range: [0, 1, 0.05], label: 'Comes in at intensity', group: 'Rests' },
  { key: 'fullAtIntensity', kind: 'number', fallback: 0, range: [0, 1, 0.05], label: 'Full at intensity', group: 'Rests' },
]

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const copy = <T>(value: T): T => structuredClone(value)

/** The named tracks (notes like "_help" skipped) */
export function tracksOf(raw: RawAudio): Record<string, RawTrack> {
  const music = isRecord(raw.music) ? raw.music : {}
  const tracks = isRecord(music.tracks) ? music.tracks : {}
  return Object.fromEntries(Object.entries(tracks).filter(([name, t]) => !name.startsWith('_') && isRecord(t))) as Record<string, RawTrack>
}

/** A track's layers by name */
export function layersOf(raw: RawAudio, track: string): Record<string, RawTrack> {
  const layers = tracksOf(raw)[track]?.layers
  if (!isRecord(layers)) return {}
  return Object.fromEntries(Object.entries(layers).filter(([name, l]) => !name.startsWith('_') && isRecord(l))) as Record<string, RawTrack>
}

/** A layer's file ("file", or the first of "files") */
export function layerFile(layer: RawTrack | undefined): string {
  if (typeof layer?.file === 'string') return layer.file
  return Array.isArray(layer?.files) && typeof layer.files[0] === 'string' ? layer.files[0] : ''
}

const trackKnob = (key: string) => TRACK_KNOBS.find((k) => k.key === key)
const layerKnob = (key: string) => LAYER_KNOBS.find((k) => k.key === key)

/** A track knob's value: its own, else the default. "restSeconds.0/1" read the [shortest, longest] pair (one number = both). */
export function trackValue(raw: RawAudio, track: string, key: string): unknown {
  const own = tracksOf(raw)[track]
  if (key.startsWith('restSeconds.')) {
    const index = Number(key.split('.')[1])
    const rest = own?.restSeconds
    if (typeof rest === 'number') return rest
    if (Array.isArray(rest) && typeof rest[index] === 'number') return rest[index]
    return trackKnob(key)?.fallback
  }
  const value = own?.[key]
  return value !== undefined ? value : trackKnob(key)?.fallback
}

export function layerValue(raw: RawAudio, track: string, layer: string, key: string): unknown {
  const value = layersOf(raw, track)[layer]?.[key]
  return value !== undefined ? value : layerKnob(key)?.fallback
}

/** A copy of the file with one track knob changed (restSeconds.N writes the pair) */
export function withTrackValue(raw: RawAudio, track: string, key: string, value: unknown): RawAudio {
  const out = copy(raw)
  const own = tracksOf(out)[track]
  if (!own) return out
  if (key.startsWith('restSeconds.')) {
    const index = Number(key.split('.')[1])
    const pair = [Number(trackValue(raw, track, 'restSeconds.0')), Number(trackValue(raw, track, 'restSeconds.1'))]
    pair[index] = Number(value)
    own.restSeconds = pair
  } else {
    own[key] = value
  }
  return out
}

/** A copy of the file with one layer knob changed */
export function withLayerValue(raw: RawAudio, track: string, layer: string, key: string, value: unknown): RawAudio {
  const out = copy(raw)
  const own = layersOf(out, track)[layer]
  if (own) own[key] = value
  return out
}

/** A note for a track knob (layer = null) or a layer knob: exact first, then the wildcard */
export function musicNote(raw: RawAudio, note: '_ranges' | '_labels' | '_help', track: string, layer: string | null, key: string): unknown {
  const notes = raw[note]
  if (!isRecord(notes)) return undefined
  const base = key.startsWith('restSeconds.') ? 'restSeconds' : key
  if (layer === null) return notes[`music.tracks.${track}.${base}`] ?? notes[`music.tracks.*.${base}`]
  return notes[`music.tracks.${track}.layers.${layer}.${base}`] ?? notes[`music.tracks.*.layers.*.${base}`]
}

const isRange = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x === 'number')

/** A knob's slider range: the file's _ranges, else the module's own */
export function musicRange(raw: RawAudio, track: string, layer: string | null, knob: MusicKnob): Range {
  const own = musicNote(raw, '_ranges', track, layer, knob.key)
  const fallback = knob.range ?? [0, 100, 1]
  return isRange(own) ? [own[0], own[1], own[2] ?? fallback[2]] : fallback
}

/** A knob's plain-English name: the file's _labels (not for the two rest sliders — they need their own), else ours */
export function musicLabel(raw: RawAudio, track: string, layer: string | null, knob: MusicKnob): string {
  const label = knob.key.startsWith('restSeconds.') ? undefined : musicNote(raw, '_labels', track, layer, knob.key)
  return typeof label === 'string' && label ? label : knob.label
}

export function musicHelp(raw: RawAudio, track: string, layer: string | null, knob: MusicKnob): string | undefined {
  const help = musicNote(raw, '_help', track, layer, knob.key)
  return typeof help === 'string' && help ? help : undefined
}

/** What a track is for (its own _help line, "music.tracks.garden") */
export function trackHelp(raw: RawAudio, track: string): string | undefined {
  const help = isRecord(raw._help) ? raw._help[`music.tracks.${track}`] : undefined
  return typeof help === 'string' ? help : undefined
}

export const trackChanged = (edited: RawAudio, saved: RawAudio, track: string) =>
  JSON.stringify(tracksOf(edited)[track]) !== JSON.stringify(tracksOf(saved)[track])

/** Track names matching the search words (name, help, layer names and files) */
export function trackNames(raw: RawAudio, query = ''): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return Object.keys(tracksOf(raw)).filter((name) => {
    const layers = layersOf(raw, name)
    const text = [name, trackHelp(raw, name) ?? '', ...Object.keys(layers), ...Object.values(layers).map(layerFile)].join(' ').toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

/** The music right now, in plain words: "garden · play 2 of 3", "garden · resting — back in 42 s", "off" */
export function musicStatusText(state: SoundMusicState | null): string {
  if (!state || state.phase === 'off' || !state.track) return 'off'
  const of = state.playsBeforeRest > 0 ? ` of ${state.playsBeforeRest}` : ''
  switch (state.phase) {
    case 'waiting': return `${state.track} · waiting for the first tap`
    case 'playing': return `${state.track} · play ${state.play}${of}`
    case 'fading': return `${state.track} · fading out to a rest`
    case 'resting': return `${state.track} · resting — back in ${Math.ceil(state.restLeftMs / 1000)} s`
    default: return `${state.track} · ${state.phase}`
  }
}

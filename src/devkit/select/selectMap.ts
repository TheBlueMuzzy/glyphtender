// SELECT MODE — the game's object → knobs list (content/devkit/select.json), kept apart from the page so it can be
// tested (selectMap.test.ts). Nothing here touches the page or the files.
//
// content/devkit/select.json (the game's — Muzzy owns it; "+ Add a knob" in the Select tab writes it too):
//   { "objects": { "glyphling": {
//       "label": "Glyphling",                 the name shown on the outline and in the panel
//       "help": "A player's piece.",          optional line under it
//       "find": ".kit-callout",               optional CSS selector, only for things the game can't tag itself
//       "knobs": { "Look": ["garden.pieceScale"], "Drag": ["drag.liftScale", "feel.tiers"] },
//                                             tuning settings by section: "<file>.<key path>"; a group brings all of it
//       "text": ["explore.glyph"],            en.json keys; a key with more inside brings all of it
//       "sounds": ["glyph.step"] } } }        content/audio.json sound names
// On screen, the game marks the thing with data-knobs="glyphling" (several ids: space-separated) — by MEANING: the
// thing Muzzy sees, not the bit of code that moves it.

export type KnobKind = 'tuning' | 'text' | 'sounds'

export type SelectObject = {
  id: string
  label: string
  help?: string
  find?: string
  knobs: { title: string; ids: string[] }[] // tuning, in the file's section order
  text: string[]
  sounds: string[]
}

export type SelectFile = Record<string, unknown> // the file as read (its _help and anything else are kept on Save)

/** Every setting the game has, for checking the file and for "+ Add a knob". */
export type Known = { tuning: string[]; text: string[]; sounds: string[] } // tuning = "<file>.<path>" leaves

/** The ids a Select tab picks and the panels show (DevKit.tsx hands each panel its part). */
export type KnobPick = { objectId: string; label: string; tuning: { title: string; ids: string[] }[]; text: string[]; sounds: string[] }

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [])
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

const objectsOf = (file: SelectFile): Record<string, unknown> => (isRecord(file.objects) ? file.objects : {})

/** The objects in the file, in its order. Anything malformed is skipped, never thrown. */
export function readSelectObjects(file: SelectFile): SelectObject[] {
  return Object.entries(objectsOf(file)).flatMap(([id, raw]) => {
    if (!isRecord(raw)) return []
    const knobs = isRecord(raw.knobs) ? Object.entries(raw.knobs).map(([title, ids]) => ({ title, ids: strings(ids) })) : []
    return [{
      id,
      label: text(raw.label) ?? id,
      help: text(raw.help),
      find: text(raw.find),
      knobs,
      text: strings(raw.text),
      sounds: strings(raw.sounds),
    }]
  })
}

/** Does this one setting belong to an id? The id itself, or a group it sits in ("feel.tiers" → "feel.tiers.big.grow"). */
export const coveredBy = (leaf: string, id: string) => leaf === id || leaf.startsWith(`${id}.`)

/** The settings an id stands for (one, or a whole group). */
export const leavesOf = (id: string, all: string[]) => all.filter((leaf) => coveredBy(leaf, id))

export function pickOf(obj: SelectObject): KnobPick {
  return { objectId: obj.id, label: obj.label, tuning: obj.knobs, text: obj.text, sounds: obj.sounds }
}

/** How many knobs an object shows (a group counts each setting in it). */
export function countKnobs(obj: SelectObject, known: Known): number {
  const count = (ids: string[], all: string[]) => new Set(ids.flatMap((id) => leavesOf(id, all))).size
  return count(obj.knobs.flatMap((k) => k.ids), known.tuning) + count(obj.text, known.text) + count(obj.sounds, known.sounds)
}

/**
 * What's wrong with the file, in plain words — a knob naming a setting, text line or sound that doesn't exist
 * (a typo, or a key renamed in code). The Select tab lists these in red; the game's test fails on them.
 */
export function checkSelectMap(file: SelectFile, known: Known): string[] {
  const problems: string[] = []
  if (!isRecord(file.objects)) return ['select.json has no "objects" — nothing can be picked']
  for (const obj of readSelectObjects(file)) {
    for (const { title, ids } of obj.knobs) {
      for (const id of ids) if (leavesOf(id, known.tuning).length === 0) problems.push(`${obj.label} · ${title}: "${id}" — no tuning setting has this name`)
    }
    for (const id of obj.text) if (leavesOf(id, known.text).length === 0) problems.push(`${obj.label} · Text: "${id}" — no text line has this key`)
    for (const id of obj.sounds) if (!known.sounds.includes(id)) problems.push(`${obj.label} · Sounds: "${id}" — no sound has this name`)
  }
  return problems
}

/** The file with one knob added to an object (tuning goes in `section`; a new section is made if needed). */
export function withKnob(file: SelectFile, objectId: string, kind: KnobKind, id: string, section = 'More'): SelectFile {
  const objects = objectsOf(file)
  const obj = isRecord(objects[objectId]) ? objects[objectId] : { label: objectId }
  let next: Record<string, unknown>
  if (kind === 'tuning') {
    const knobs = isRecord(obj.knobs) ? obj.knobs : {}
    const list = strings(knobs[section])
    if (list.includes(id)) return file
    next = { ...obj, knobs: { ...knobs, [section]: [...list, id] } }
  } else {
    const list = strings(obj[kind])
    if (list.includes(id)) return file
    next = { ...obj, [kind]: [...list, id] }
  }
  return { ...file, objects: { ...objects, [objectId]: next } }
}

/** The file with one knob taken off an object (an emptied tuning section goes too). */
export function withoutKnob(file: SelectFile, objectId: string, kind: KnobKind, id: string): SelectFile {
  const objects = objectsOf(file)
  const obj = objects[objectId]
  if (!isRecord(obj)) return file
  let next: Record<string, unknown>
  if (kind === 'tuning') {
    const knobs = isRecord(obj.knobs) ? obj.knobs : {}
    const kept = Object.entries(knobs)
      .map(([title, ids]) => [title, strings(ids).filter((k) => k !== id)] as const)
      .filter(([, ids]) => ids.length > 0)
    next = { ...obj, knobs: Object.fromEntries(kept) }
  } else {
    next = { ...obj, [kind]: strings(obj[kind]).filter((k) => k !== id) }
  }
  return { ...file, objects: { ...objects, [objectId]: next } }
}

/** The ids written on an element: data-knobs="glyphling board" → ['glyphling', 'board']. */
export const tagsOf = (value: string | null | undefined): string[] => (value ?? '').split(/\s+/).filter(Boolean)

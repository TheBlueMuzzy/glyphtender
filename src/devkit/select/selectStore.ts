// SELECT MODE — one small shared store: is select mode on, what's picked, how strong the outlines are, what's been
// seen on screen, and the object → knobs file as edited. The Select tab, the outline layer (SelectLayer.tsx) and
// the Dev Kit panel (DevKit.tsx, to show the pick's knobs) all read it.
// Picking is for a change you mean to make now: the pick is forgotten when the Dev Kit closes and never stored
// (Muzzy, 2026-10-14). Only the outline strength (how the tool looks) is remembered in this browser
// (localStorage "devkit-select:<game>"). Select mode always starts off.
import { useSyncExternalStore } from 'react'
import { getDevKitGame } from '../devkitGame'
import { selectFile } from './selectFiles'
import { readSelectObjects, type SelectFile, type SelectObject } from './selectMap'

export type SelectState = {
  on: boolean // select mode: the next click on the game picks instead of playing
  picked: string | null // the picked object's id
  pickedEl: Element | null // the very one clicked (its twins get the dashed outline); null = picked from the list
  hover: string | null // the object under the pointer while select mode is on
  outline: number // 0.2–1: how solid the pink outlines are
  seen: Record<string, number> // object id → when it was last on screen (Date.now())
  onScreen: string[] // ids showing right now
  file: SelectFile // content/devkit/select.json
  objects: SelectObject[] // readSelectObjects(file)
}

export const OUTLINE_MIN = 0.2
const DEFAULT_OUTLINE = 0.9

const storageKey = () => `devkit-select:${getDevKitGame()?.name ?? document.title}`

function rememberedOutline(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as { outline?: unknown }
    return typeof raw.outline === 'number' ? Math.min(1, Math.max(OUTLINE_MIN, raw.outline)) : DEFAULT_OUTLINE
  } catch {
    return DEFAULT_OUTLINE
  }
}

function rememberOutline(outline: number) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ outline }))
  } catch {
    // private window / storage blocked: it just won't be remembered
  }
}

let state: SelectState | null = null
const listeners = new Set<() => void>()

/** Start the store with a file (normally the game's own, on first use; tests pass their own). */
export function initSelect(file: SelectFile) {
  state = {
    on: false,
    picked: null,
    pickedEl: null,
    hover: null,
    outline: rememberedOutline(),
    seen: {},
    onScreen: [],
    file,
    objects: readSelectObjects(file),
  }
}

export function getSelect(): SelectState {
  if (!state) initSelect(selectFile ?? {})
  return state!
}

export function setSelect(change: Partial<SelectState>) {
  const before = getSelect()
  const next = { ...before, ...change }
  if (change.file) next.objects = readSelectObjects(change.file)
  state = next
  if (next.outline !== before.outline) rememberOutline(next.outline)
  for (const listener of listeners) listener()
}

/** Only for tests: forget everything. */
export function resetSelect() {
  state = null
}

export function useSelect(): SelectState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    getSelect,
  )
}

/** The picked object, if it's still in the file. */
export const pickedObject = (s: SelectState) => s.objects.find((o) => o.id === s.picked) ?? null

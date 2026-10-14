// SELECT MODE — one small shared store: is select mode on, what's picked, how strong the outlines are, what's been
// seen on screen, and the object → knobs file as edited. The Select tab, the outline layer (SelectLayer.tsx) and
// the Dev Kit panel (DevKit.tsx, to show the pick's knobs) all read it.
// The pick and the outline strength are remembered per game in this browser (localStorage "devkit-select:<game>"),
// so they survive a refresh. Select mode itself always starts off.
import { useSyncExternalStore } from 'react'
import { getDevKitGame } from '../devkitGame'
import { CAN_SAVE, saveContentFile } from '../saveContent'
import { SELECT_FILE, selectFile } from './selectFiles'
import { readSelectObjects, type SelectFile, type SelectObject } from './selectMap'

export type SelectState = {
  on: boolean // select mode: the next click on the game picks instead of playing
  picked: string | null // the picked object's id
  pickedEl: Element | null // the very one clicked (its twins get the dashed outline); null = picked from the list
  hover: string | null // the object under the pointer while select mode is on
  outline: number // 0.2–1: how solid the pink outlines are
  seen: Record<string, number> // object id → when it was last on screen (Date.now())
  onScreen: string[] // ids showing right now
  file: SelectFile // content/devkit/select.json as edited (+ Add a knob)
  savedFile: SelectFile // as saved
  objects: SelectObject[] // readSelectObjects(file)
}

export const OUTLINE_MIN = 0.2
const DEFAULT_OUTLINE = 0.9

const storageKey = () => `devkit-select:${getDevKitGame()?.name ?? document.title}`

function remembered(): { picked: string | null; outline: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as { picked?: unknown; outline?: unknown }
    return {
      picked: typeof raw.picked === 'string' ? raw.picked : null,
      outline: typeof raw.outline === 'number' ? Math.min(1, Math.max(OUTLINE_MIN, raw.outline)) : DEFAULT_OUTLINE,
    }
  } catch {
    return { picked: null, outline: DEFAULT_OUTLINE }
  }
}

function remember(s: SelectState) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ picked: s.picked, outline: s.outline }))
  } catch {
    // private window / storage blocked: it just won't be remembered
  }
}

let state: SelectState | null = null
const listeners = new Set<() => void>()

/** Start the store with a file (normally the game's own, on first use; tests pass their own). */
export function initSelect(file: SelectFile) {
  const { picked, outline } = remembered()
  const objects = readSelectObjects(file)
  state = {
    on: false,
    picked: picked && objects.some((o) => o.id === picked) ? picked : null,
    pickedEl: null,
    hover: null,
    outline,
    seen: {},
    onScreen: [],
    file,
    savedFile: file,
    objects,
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
  if (next.picked !== before.picked || next.outline !== before.outline) remember(next)
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

export type SaveStatus = { kind: 'ok' | 'error' | 'info'; text: string }

/** Write the edited object list (dev), or say how to keep it (live build). Shared with DevKit's ✕ on a knob row. */
export async function saveSelectFile(file: SelectFile): Promise<SaveStatus> {
  setSelect({ file })
  if (!CAN_SAVE) return { kind: 'info', text: 'Live build: this lasts until you refresh — Copy for Claude to keep it.' }
  try {
    await saveContentFile(SELECT_FILE, file)
    setSelect({ savedFile: file })
    return { kind: 'ok', text: `Saved ${SELECT_FILE}.` }
  } catch (e) {
    return { kind: 'error', text: `Couldn't save: ${(e as Error).message}` }
  }
}

// THE UI STYLE BEING EDITED — one shared copy for every tab that edits content/ui/style.json (Color, Fonts, and the
// Color panel under Select). Before 0.17.0 each tab kept its own copy, so a font picked in one tab was undone the next
// time another restyled the page, and one tab's Save could write back another's old values.
//   live  = what the game shows right now (every colour + shape & feel + font value, as text)
//   saved = what's in the file
// Every change restyles the game at once through the UI kit's applyStyle. Each tab saves only ITS values
// (saveStyle(tokens)); everything else in the file's "tweaks" stays exactly as saved.
// Nothing here draws anything; the tabs read it with useStyle().
import { useSyncExternalStore } from 'react'
import { saveContentFile } from '../saveContent'
import { tweaksToSave, uiColoursFrom } from './colorLogic'
import { shapesToClear, uiShapesFrom } from './styleValues'

export type StyleKit = { applyStyle: (style: { preset: string; tweaks?: Record<string, unknown> }) => void; presets: Record<string, Record<string, unknown>> }
export type StyleFileData = { preset: string; tweaks?: Record<string, unknown> }
export type StyleState = { live: Record<string, string>; saved: Record<string, string>; loaded: Record<string, string> }

export const STYLE_PATH = 'content/ui/style.json'

export function createStyleStore(
  kit: StyleKit,
  file: StyleFileData,
  save: (path: string, data: object) => Promise<void> = saveContentFile,
  // the page is looked up on first restyle, not here: a game's Node test (no document) can import the Dev Kit,
  // which builds this store as color/uiKit.ts loads (0.20.1)
  page?: HTMLElement,
) {
  const preset = kit.presets[file.preset] ?? kit.presets.clean
  const fromFile = { ...uiColoursFrom(preset, file.tweaks), ...uiShapesFrom(preset, file.tweaks) }
  let savedTweaks: Record<string, unknown> = file.tweaks ?? {}
  // loaded = as the page loaded: Copy for Claude lists the changes since then
  let state: StyleState = { live: fromFile, saved: fromFile, loaded: fromFile }
  const listeners = new Set<() => void>()

  function restyle() {
    const tweaks = tweaksToSave(preset, state.live, savedTweaks)
    kit.applyStyle({ preset: file.preset, tweaks })
    // applyStyle only sets values: a menu size put back to the kit's default is taken off the page again
    const root = page ?? document.documentElement
    for (const token of shapesToClear(preset, tweaks)) root.style.removeProperty(`--${token}`)
  }
  function update(next: Partial<StyleState>) {
    state = { ...state, ...next }
    restyle()
    for (const listener of listeners) listener()
  }
  const only = (values: Record<string, string>, tokens: string[]) => Object.fromEntries(tokens.filter((t) => t in values).map((t) => [t, values[t]]))

  return {
    preset,
    presetName: file.preset,
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Change some values (live in the game at once). */
    set(values: Record<string, string>) {
      update({ live: { ...state.live, ...values } })
    },
    /** Put these values (or all) back to what's saved. */
    undo(tokens?: string[]) {
      update({ live: tokens ? { ...state.live, ...only(state.saved, tokens) } : state.saved })
    },
    /** Write these values into style.json "tweaks" (only those differing from the preset); the rest stays as saved. */
    async save(tokens: string[]) {
      const tweaks = tweaksToSave(preset, only(state.live, tokens), savedTweaks)
      await save(STYLE_PATH, { ...file, tweaks })
      savedTweaks = tweaks
      update({ saved: { ...state.saved, ...only(state.live, tokens) } })
    },
  }
}

export type StyleStore = ReturnType<typeof createStyleStore>

/** A tab's view of the store: re-renders when any style value changes. */
export function useStyle(store: StyleStore): StyleState {
  return useSyncExternalStore(store.subscribe, store.get)
}

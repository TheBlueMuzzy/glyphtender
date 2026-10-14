// SELECT MODE — what the Dev Kit tells a panel (Tuning, Text, Sound) while it's shown under the Select tab:
// which of its rows the picked object has, in which sections, and how to take one off. null = the panel's own view.
import { createContext } from 'react'
import { coveredBy, type KnobKind, type KnobPick } from './selectMap'

export type PanelPick = { pick: KnobPick; remove: (kind: KnobKind, id: string) => void }

export const DevKitPick = createContext<PanelPick | null>(null)

/** The tuning sections of a pick: each of the object's sections with the settings its ids cover, in the ids' order. */
export function pickedSections<T extends { file: string; path: string }>(pick: KnobPick, items: T[]) {
  return pick.tuning
    .map(({ title, ids }) => ({
      id: `select:${pick.objectId}:${title}`,
      title,
      rows: ids.flatMap((id) => items.filter((item) => coveredBy(`${item.file}.${item.path}`, id)).map((item) => ({ id, item }))),
    }))
    .filter((s) => s.rows.length > 0)
}

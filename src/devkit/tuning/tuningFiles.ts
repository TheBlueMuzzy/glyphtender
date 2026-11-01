// Every content/tuning/*.json file in the game, found with import.meta.glob (a Vite feature that finds nothing,
// without breaking the build, when a game has no tuning folder — then the Tuning tab is hidden).
// Plus (0.28.0, F132) the other content files the game lists in content/devkit.json "tuningFiles" — handed over by
// the Dev Kit's Vite plugin (vite-plugins/devkit/devkitVite.ts, step 6), which checks each path first.
import extra from 'virtual:devkit-tuning-files'
import { tuningName, type TuningData } from './tuningLogic'

// name = "physics" for content/tuning/physics.json, "rooms" for a listed content/rooms.json
// path = where Save writes it · after = when a saved change reaches the game, if not at once (the file's own note)
export type TuningFile = { name: string; data: TuningData; path?: string; after?: string }

// ?devkit-file: the plain file as saved — the game's own imports of these files are made live by the Dev Kit's Vite
// plugin (liveFile), and the tab must compare edits against what's on disk, not against its own edits
const found = import.meta.glob<TuningData>('../../../content/tuning/*.json', { eager: true, import: 'default', query: '?devkit-file' })

export const tuningFiles: TuningFile[] = [
  ...Object.entries(found).map(([path, data]) => ({ name: tuningName(path), data })),
  ...extra.files.map(({ name, path, after, data }) => ({ name, path, after, data: data as TuningData })),
].sort((a, b) => a.name.localeCompare(b.name))

/** What's wrong with content/devkit.json "tuningFiles", in plain words (shown at the top of the tab). */
export const tuningFileProblems: string[] = extra.problems

/** Where a tuning file lives: its listed path, else content/tuning/<name>.json. */
export const tuningPath = (file: Pick<TuningFile, 'name' | 'path'>) => file.path ?? `content/tuning/${file.name}.json`

// content/devkit.json "sectionOrder": the order the Tuning sections are listed in (tuningSections.ts). Optional.
const settings = import.meta.glob<{ sectionOrder?: unknown }>('../../../content/devkit.json', { eager: true, import: 'default' })
const order = Object.values(settings)[0]?.sectionOrder
export const sectionOrder: string[] = Array.isArray(order) ? order.filter((t): t is string => typeof t === 'string') : []

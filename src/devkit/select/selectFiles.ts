// SELECT MODE — the game's files it needs, found with import.meta.glob (finds nothing, without breaking the build,
// when a game doesn't have one): the object → knobs file, and every setting / text line / sound / UI style value there is
// (to check the file and to offer in "+ Add a knob").
import { listFields } from '../tuning/tuningLogic'
import { tuningFiles, sectionOrder } from '../tuning/tuningFiles'
import { tuningSections } from '../tuning/tuningSections'
import { flattenText } from '../text/textLogic'
import { uiLabel, UI_STYLE_TOKENS } from '../color/colorLogic'
import { styleFile, uiKit } from '../color/uiKit'
import type { Known, SelectFile } from './selectMap'

export const SELECT_FILE = 'content/devkit/select.json'

const selectFound = import.meta.glob<SelectFile>('../../../content/devkit/select.json', { eager: true, import: 'default' })
/** content/devkit/select.json, or null when the game has none (then there's no Select tab) */
export const selectFile: SelectFile | null = Object.values(selectFound)[0] ?? null

const textFound = import.meta.glob<object>('../../../content/text/en.json', { eager: true, import: 'default' })
const audioFound = import.meta.glob<{ sounds?: Record<string, unknown> }>('../../../content/audio.json', { eager: true, import: 'default' })

/** One thing "+ Add a knob" can add. */
export type Addable = { kind: 'tuning' | 'text' | 'sounds' | 'style'; id: string; label: string; where: string }

function build(): { known: Known; addable: Addable[] } {
  const addable: Addable[] = []
  const tuning = tuningFiles.flatMap((f) => listFields(f.data).map((field) => `${f.name}.${field.path}`))
  for (const section of tuningSections(tuningFiles, sectionOrder)) {
    for (const item of section.items) addable.push({ kind: 'tuning', id: `${item.file}.${item.path}`, label: item.label, where: `Tuning · ${section.title}` })
  }
  const textData = Object.values(textFound)[0]
  const text = textData ? flattenText(textData).filter((l) => l.kind === 'text').map((l) => l.key) : []
  for (const key of text) addable.push({ kind: 'text', id: key, label: key, where: 'Text' })
  const sounds = Object.keys(Object.values(audioFound)[0]?.sounds ?? {}).filter((name) => !name.startsWith('_'))
  for (const name of sounds) addable.push({ kind: 'sounds', id: name, label: name, where: 'Sound' })
  // UI kit style values (the Color tab) — only in a game with the UI kit and its style file
  const style = uiKit && styleFile ? UI_STYLE_TOKENS : []
  for (const token of style) addable.push({ kind: 'style', id: token, label: uiLabel(token), where: 'UI style (shared)' })
  return { known: { tuning, text, sounds, style }, addable }
}

let cache: ReturnType<typeof build> | null = null
/** Every setting, text line and sound the game has (worked out once). */
export const catalog = () => (cache ??= build())

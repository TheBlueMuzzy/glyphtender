// SELECT MODE — the game's files it needs, found with import.meta.glob (finds nothing, without breaking the build,
// when a game doesn't have one): the object → knobs file, and every setting / text line / sound / UI style value there is
// (to check the file, and that every setting is on some object).
import { listFields } from '../tuning/tuningLogic'
import { tuningFiles } from '../tuning/tuningFiles'
import { flattenText } from '../text/textLogic'
import { UI_STYLE_TOKENS } from '../color/colorLogic'
import { styleFile, uiKit } from '../color/uiKit'
import type { Known, SelectFile } from './selectMap'

export const SELECT_FILE = 'content/devkit/select.json'

const selectFound = import.meta.glob<SelectFile>('../../../content/devkit/select.json', { eager: true, import: 'default' })
/** content/devkit/select.json, or null when the game has none (then there's no Select tab) */
export const selectFile: SelectFile | null = Object.values(selectFound)[0] ?? null

const textFound = import.meta.glob<object>('../../../content/text/en.json', { eager: true, import: 'default' })
const audioFound = import.meta.glob<{ sounds?: Record<string, unknown> }>('../../../content/audio.json', { eager: true, import: 'default' })

function build(): { known: Known } {
  const tuning = tuningFiles.flatMap((f) => listFields(f.data).map((field) => `${f.name}.${field.path}`))
  const textData = Object.values(textFound)[0]
  const text = textData ? flattenText(textData).filter((l) => l.kind === 'text').map((l) => l.key) : []
  const sounds = Object.keys(Object.values(audioFound)[0]?.sounds ?? {}).filter((name) => !name.startsWith('_'))
  // UI kit style values (the Color tab) — only in a game with the UI kit and its style file
  const style = uiKit && styleFile ? UI_STYLE_TOKENS : []
  return { known: { tuning, text, sounds, style } }
}

let cache: ReturnType<typeof build> | null = null
/** Every setting, text line and sound the game has (worked out once). */
export const catalog = () => (cache ??= build())

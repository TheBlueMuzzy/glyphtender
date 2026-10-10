// Reads the content/ JSON files a moment's knobs live in (content/tuning/feel.json, content/audio.json…).
// Found with import.meta.glob, loaded only when a screen with moments opens (the Screens tab is dev-only).
// A file the Dev Kit already edited this session (Tuning, Sound…) starts from that edit, not the file on disk.
import { latestTuning } from '../tuning/liveTuning'
import { liveName } from './momentLogic'

const found = import.meta.glob<unknown>('../../../content/**/*.json', { import: 'default' })

/** One content file as JSON (a copy). file = "content/audio.json". Throws a plain reason if it isn't there. */
export async function loadContentFile(file: string): Promise<{ disk: object; now: object }> {
  const load = found[`../../../${file}`]
  if (!load) throw new Error(`${file} isn't in the game`)
  const disk = structuredClone(await load()) as object
  const edited = latestTuning().find(([name]) => name === liveName(file))?.[1]
  return { disk, now: edited ? (structuredClone(edited) as object) : disk }
}

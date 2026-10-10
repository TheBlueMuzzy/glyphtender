// THE SOUND TAB, ready for a game to list in src/devkit-game/tabs.ts (framework F30):
//
//   import audioJson from '../../content/audio.json'
//   import { getAudio } from '../audio'
//   import { soundTab } from '../devkit/sound/soundTabEntry'
//   export const gameTabs = [aiTab(myGameAi), soundTab(getAudio, { file: audioJson })]
//
// The game must also hear the tab's live edits (it already does if it follows the audio README):
//   onTuning('audio', (data) => audio.setConfig(data))
// Adding sound files needs the dev server's save-audio endpoint (vite/audioSave.ts — part of the Dev Kit's Vite plugin)
// and ffmpeg on the computer (Windows: winget install Gyan.FFmpeg).
import { createElement } from 'react'
import type { DevKitTab } from '../DevKit'
import { SoundTab } from './SoundTab'
import type { RawAudio } from './soundLogic'
import type { SoundBoardAudio } from './soundTypes'

export type SoundTabOptions = {
  /** content/audio.json as the game imports it */
  file: RawAudio
  /** Where Save writes it (default "content/audio.json") */
  path?: string
  /** The name the game listens for with onTuning (default "audio") */
  tuningName?: string
  /** Where public/ is served (default import.meta.env.BASE_URL) */
  baseUrl?: string
  label?: string
}

export function soundTab(getAudio: () => SoundBoardAudio | null, options: SoundTabOptions): DevKitTab {
  const { file, path = 'content/audio.json', tuningName = 'audio', baseUrl = import.meta.env.BASE_URL ?? '/', label = 'Sound' } = options
  return {
    id: 'sound',
    label,
    // The Dev Kit hands the open tab its search text as `query` (this tab filters its own sound list and log)
    Panel: ({ query }: { query?: string }) => createElement(SoundTab, { getAudio, file, path, tuningName, baseUrl, query }),
  }
}

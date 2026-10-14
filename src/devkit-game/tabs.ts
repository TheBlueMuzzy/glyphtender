// THE GAME'S OWN DEV KIT TOOLS — one tab each, shown after the kit's own tabs (Color, …).
// This file (and everything in src/devkit-game/) belongs to the game: installing or updating the
// Dev Kit never touches it. To add a tool:
//   1. make a component in src/devkit-game/, e.g. TableTab.tsx — it edits a content/ JSON file,
//      with Save (saveContentFile) and Copy for Claude (copyText) from '../devkit/saveContent'
//   2. list it below:  { id: 'table', label: 'Table', Panel: TableTab }
// The AI tab comes from the framework (src/devkit/ai/) — Glyphtender plugs its AI into it in aiDevKit.ts.
// The Sound tab too (src/devkit/sound/): every sound in content/audio.json — play, sliders, swap files, mixer, log.
// The game already hears its live edits (src/game/sound.ts: onTuning('audio', …)).
// The Words tab (F70) = the framework's review list (src/devkit/review/) over the word files — wordsDevKit.ts.
// The Text tab (F81) = every player-facing word in content/text/en.json (src/devkit/text/) — Save, and the game shows it.
import audioJson from '../../content/audio.json'
import en from '../../content/text/en.json'
import { getAudio } from '../audio'
import type { DevKitTab } from '../devkit/DevKit'
import { aiTab } from '../devkit/ai/aiTabEntry'
import { reviewTab } from '../devkit/review/reviewTabEntry'
import { registerDevKitGame } from '../devkit/devkitGame'
import { soundTab } from '../devkit/sound/soundTabEntry'
import { textTab } from '../devkit/text/textTabEntry'
import { glyphtenderAi } from './aiDevKit'
import { glyphtenderAdapter } from './glyphtenderAdapter'
import { loadWords, saveWordMarks, WORD_TOGGLES } from './wordsDevKit'

// Plugs Glyphtender into the Dev Kit's Snapshots + Bug capture tabs (this file only loads with the Dev Kit)
registerDevKitGame(glyphtenderAdapter)

export const gameTabs: DevKitTab[] = [
  aiTab(glyphtenderAi),
  soundTab(getAudio, { file: audioJson }),
  textTab({ file: 'content/text/en.json', data: en }),
  reviewTab({ id: 'words', label: 'Words', what: 'word', load: loadWords, save: saveWordMarks, extraMarks: WORD_TOGGLES }),
]

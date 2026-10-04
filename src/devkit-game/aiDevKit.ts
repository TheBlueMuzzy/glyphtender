// GLYPHTENDER'S AI, PLUGGED INTO THE DEV KIT'S AI TAB (framework devkit/kit/ai — listed in tabs.ts).
//   personalities / skills: content/ai/personalities.json and skills.json (Save writes them back, notes kept)
//   bios:      content/text/en.json → ai.personality.<id>.bio (the one line players read on the New Game card)
//   readings:  the mood-shift readings the AI feels (src/ai/readings.ts)
//   validate:  the AI kit's personalityProblems against Glyphtender's 7 goals (goal missing, range upside down…)
//   watch:     an all-AI game on the real board, notes + beliefs (aiWatch.ts)
//   runCheck:  the Personality Check in a Web Worker → the report page (aiCheck.ts)
import personalitiesFile from '../../content/ai/personalities.json'
import skillsFile from '../../content/ai/skills.json'
import en from '../../content/text/en.json'
import { personalityProblems } from '../ai/kit/brain'
import type { Personality } from '../ai/kit/types'
import { glyphtenderPlug } from '../ai/plug'
import { READINGS } from '../ai/readings'
import type { DevKitAi } from '../devkit/ai/aiTypes'
import { runCheckInWorker } from './aiCheck'
import { startWatch } from './aiWatch'

// Only its goals (ids + traits) are used, to check personalities — so no word list is needed
const plugForChecks = glyphtenderPlug(new Map())

export const glyphtenderAi: DevKitAi = {
  personalities: { path: 'content/ai/personalities.json', data: personalitiesFile, listKey: 'personalities' },
  skills: { path: 'content/ai/skills.json', data: skillsFile, listKey: 'skills' },
  bios: { path: 'content/text/en.json', data: en, at: (id) => ['ai', 'personality', id, 'bio'] },
  readings: [...READINGS],
  validate: (p) => personalityProblems(p as unknown as Personality, plugForChecks),
  watch: startWatch,
  runCheck: runCheckInWorker,
}

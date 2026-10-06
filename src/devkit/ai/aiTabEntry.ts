// THE AI TAB, ready for a game to list in src/devkit-game/tabs.ts:
//
//   import { aiTab } from '../devkit/ai/aiTabEntry'
//   export const gameTabs = [aiTab(myGameAi)]      // myGameAi: DevKitAi (aiTypes.ts)
//
// It joins the Dev Kit's search box (countMatches): typing "nerve" or "wobble" lists the AI sections holding them.
import { createElement } from 'react'
import type { DevKitTab } from '../DevKit'
import { countFound } from '../search/searchLogic'
import { AiTab } from './AiTab'
import { aiSections, searchAi } from './aiLogic'
import type { DevKitAi } from './aiTypes'

export function aiTab(ai: DevKitAi, label = 'AI'): DevKitTab {
  const sections = aiSections(ai)
  return {
    id: 'ai',
    label,
    Panel: () => createElement(AiTab, { ai }),
    countMatches: (query) => countFound(searchAi(sections, query)),
  }
}

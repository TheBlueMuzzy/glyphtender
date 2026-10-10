// THE AI TAB, ready for a game to list in src/devkit-game/tabs.ts:
//
//   import { aiTab } from '../devkit/ai/aiTabEntry'
//   export const gameTabs = [aiTab(myGameAi)]      // myGameAi: DevKitAi (aiTypes.ts)
//
// The Dev Kit's search box searches it while it's open: typing "nerve" or "wobble" lists the AI sections holding them.
import { createElement } from 'react'
import type { DevKitTab } from '../DevKit'
import { AiTab } from './AiTab'
import type { DevKitAi } from './aiTypes'

export function aiTab(ai: DevKitAi, label = 'AI'): DevKitTab {
  return {
    id: 'ai',
    label,
    Panel: ({ query }) => createElement(AiTab, { ai, query }),
  }
}

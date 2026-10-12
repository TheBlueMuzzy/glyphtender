// THE REVIEW LIST TAB, ready for a game to list in src/devkit-game/tabs.ts (Dev Kit 0.11.0, Glyphtender F70):
//
//   import { reviewTab } from '../devkit/review/reviewTabEntry'
//   import { loadWords, saveWordMarks } from './wordsReview'
//   export const gameTabs = [reviewTab({ id: 'words', label: 'Words', what: 'word', load: loadWords, save: saveWordMarks })]
//
// load() gives every row as saved now ({ id, label, status: 'open' | 'yes' | 'no', detail? }, reviewTypes.ts);
// save(changes) gets only the rows Muzzy changed ({ id, status }[]) and writes them however the game keeps them.
// Both throw (or reject) with a plain reason if they can't — the tab shows it.
import { createElement } from 'react'
import type { DevKitTab } from '../DevKit'
import { ReviewTab } from './ReviewTab'
import type { ReviewTabOptions } from './reviewTypes'

export function reviewTab(options: ReviewTabOptions): DevKitTab {
  const { id, label, load, save, what } = options
  return {
    id,
    label,
    // The Dev Kit hands the open tab its search text as `query` (this tab filters its rows by label and detail)
    Panel: ({ query }) => createElement(ReviewTab, { label, load, save, what, query }),
  }
}

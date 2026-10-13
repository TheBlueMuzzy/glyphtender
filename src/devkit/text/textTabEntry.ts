// THE TEXT TAB, ready for a game to list in src/devkit-game/tabs.ts (Dev Kit 0.13.0):
//
//   import en from '../../content/text/en.json'
//   import { textTab } from '../devkit/text/textTabEntry'
//   export const gameTabs = [textTab({ file: 'content/text/en.json', data: en })]
//
// Every string in the file becomes a text box (TextTab.tsx); Save writes the file back and the game hot-reloads its
// words — nothing else for the game to do, as long as it reads its words from the file (import en from '…/en.json').
// Options: label (the tab's name, default "Text"), id (default "text" — give a second text file its own, e.g. "text-fr").
import { createElement } from 'react'
import type { DevKitTab } from '../DevKit'
import { TextTab } from './TextTab'

export type TextTabOptions = {
  /** Where Save writes it, e.g. "content/text/en.json" */
  file: string
  /** The file as the game imports it */
  data: object
  label?: string
  id?: string
}

export function textTab({ file, data, label = 'Text', id = 'text' }: TextTabOptions): DevKitTab {
  return {
    id,
    label,
    searchable: true,
    // The Dev Kit hands the open tab its search text as `query` (this tab filters its strings by key and words)
    Panel: ({ query }) => createElement(TextTab, { file, data, label, query }),
  }
}

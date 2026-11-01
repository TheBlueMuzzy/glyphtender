// The Color tab edits the game's UI kit colours: it needs the UI kit (src/ui/kit) and its style file
// (content/ui/style.json). A game without the UI kit has neither — so instead of plain imports, which would
// break that game's build, they're looked up with import.meta.glob (a Vite feature that simply finds
// nothing when a file is missing). No UI kit → the Color tab shows only the colour-blind preview.
import { createStyleStore } from './styleStore'

type StyleFile = { preset: string; tweaks?: Record<string, unknown> }
export type KitFont = { name: string; file: string; licence: string; licenceNote?: string; note?: string; pixelSize?: number }
type UiKit = {
  applyStyle: (style: StyleFile) => void
  presets: Record<string, Record<string, unknown>>
  // UI kit 0.16.0 and newer (the Fonts tab): the kit's own fonts, and declaring a game's fonts on the page
  kitFonts?: KitFont[]
  loadGameFonts?: (file: { fonts?: KitFont[] }, baseUrl?: string) => void
}

const kitFiles = import.meta.glob<UiKit>('../../ui/kit/index.ts', { eager: true })
const styleFiles = import.meta.glob<StyleFile>('../../../content/ui/style.json', { eager: true, import: 'default' })

export const uiKit: UiKit | undefined = Object.values(kitFiles)[0]
export const styleFile: StyleFile | undefined = Object.values(styleFiles)[0]

/** The style values the Color and Fonts tabs edit together (styleStore.ts) — only when the game has the UI kit. */
export const styleStore = uiKit && styleFile ? createStyleStore(uiKit, styleFile) : undefined

// The game's own fonts (UI kit 0.16.0: content/ui/fonts.json, files in public/fonts/) — optional, like the rest
const fontFiles = import.meta.glob<{ fonts?: KitFont[] }>('../../../content/ui/fonts.json', { eager: true, import: 'default' })
export const gameFontsFile: { fonts?: KitFont[] } | undefined = Object.values(fontFiles)[0]

// All style presets, by name. A game's content/ui/style.json picks one: { "preset": "clean" }.
// Every preset fills in exactly the same setting names (styles.test.ts checks this, and contrast).
import clean from './clean.json'
import cozy from './cozy.json'
import cartoon from './cartoon.json'
import pixel from './pixel.json'
import neon from './neon.json'
// (imported as darkConsole: a plain `console` would hide the browser's console in this file)
import darkConsole from './console.json' // 0.34.0: "Dark console" — a games console's own menus (sketch S1, Console 1)
import fantasy from './fantasy.json' // 0.34.0: "Fantasy" — dark wood and gold (sketch S1, Fantasy 2)
import type { StylePreset } from '../style/tokens'

export const presets: Record<string, StylePreset> = { clean, cozy, cartoon, pixel, neon, console: darkConsole, fantasy }

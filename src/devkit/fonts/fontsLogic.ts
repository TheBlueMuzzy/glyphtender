// The Fonts tab's thinking, kept apart from its looks so it can be tested (fontsLogic.test.ts, in the framework).
// Nothing here touches the page or the files.
import type { KitFont } from '../color/uiKit'

/** The four text roles a game picks a font for (UI kit 0.16.0), with the text size each is shown at in the game. */
export const FONT_ROLES = [
  { id: 'title', token: 'font-title', label: 'Title', size: 'text-title', what: "Big titles — a screen's name, big HUD words", caps: true },
  { id: 'heading', token: 'font-heading', label: 'Heading', size: 'text-heading', what: 'Headings, card titles, HUD status words, big art buttons', caps: true },
  { id: 'body', token: 'font-body', label: 'Body', size: 'text-body', what: 'Everything else — buttons, lists, small HUD tags, words on art', caps: false },
  { id: 'numbers', token: 'font-numbers', label: 'Numbers', size: 'text-heading', what: 'Scores, timers, counters', caps: false },
] as const

export type FontRole = (typeof FONT_ROLES)[number]
export const FONT_TOKENS: string[] = FONT_ROLES.map((r) => r.token)

/** The line each role is tried with when the game's fonts.json gives none ("samples": { "title": "…", … }). */
export const DEFAULT_SAMPLES: Record<FontRole['id'], string> = {
  title: 'Game title',
  heading: 'Settings',
  body: 'Tap to start — a quick brown fox',
  numbers: '12,345 · 3 / 10 · 0:59',
}
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789'
/** For titles and headings (often all capitals in a style): just the capitals and digits */
export const ALPHABET_CAPS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'

/** One font you can pick. source: the UI kit's own, the game's (fonts.json), or one from the font library (not in the game yet). */
export type FontChoice = {
  name: string
  source: 'kit' | 'game' | 'library'
  licence: string
  licenceNote?: string
  note?: string
  pixelSize?: number
  libraryPath?: string // where it is in the library (library fonts only)
}

/** 🟢 🟡 🔴 for a fonts.json licence, and what it means in plain words (same as the UI kit's licenceLight). */
export function licenceChip(licence: string): { light: '🟢' | '🟡' | '🔴'; words: string } {
  if (licence === 'commercial-ok') return { light: '🟢', words: 'Fine in a game you sell' }
  if (licence === 'credit-needed') return { light: '🟡', words: 'Fine in a game you sell — credit it' }
  if (licence === 'non-commercial') return { light: '🔴', words: 'Not for a game you sell' }
  return { light: '🔴', words: 'Licence unknown — check it before shipping' }
}

/** The CSS value saved for a font: "'Press Start DX', system-ui, sans-serif" (the rest shows while it loads). */
export const fontValue = (name: string) => `'${name.replace(/'/g, '')}', system-ui, sans-serif`

/** The first font named in a CSS value: "'Orbitron', 'Exo 2', sans-serif" → "Orbitron". */
export const firstFontName = (value: string) => (value.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')

/** What a role's value reads as, in words: "Orbitron", or "Style default (Orbitron)" for var(--font-display). */
export function fontWords(value: string, styleValues: Record<string, string>): string {
  const ref = /^var\(--([a-z-]+)\)$/.exec(value.trim())
  if (ref) return `Style default (${firstFontName(styleValues[ref[1]] ?? ref[1])})`
  return firstFontName(value)
}

/** Every font to pick from: the kit's, the game's, then any library fonts being tried — no name twice (the game's wins over the kit's). */
export function fontChoices(kitFonts: KitFont[], gameFonts: KitFont[], trying: FontChoice[]): FontChoice[] {
  const out: FontChoice[] = []
  const add = (f: FontChoice) => {
    if (!out.some((o) => o.name === f.name)) out.push(f)
  }
  for (const f of gameFonts) add({ ...f, source: 'game' })
  for (const f of kitFonts) add({ ...f, source: 'kit' })
  for (const f of trying) add(f)
  return out
}

/** Is a role's value this font? */
export const isFont = (value: string, name: string) => firstFontName(value) === name

/**
 * A pixel font is crisp at its native size and whole multiples of it, soft (blurred) in between.
 * → null for a font with no pixelSize; else { crisp, words } e.g. "crisp (8 px × 3)" or "soft at 21.5 px — crisp at 16 · 24 · 32 px".
 */
export function crispness(pixelSize: number | undefined, px: number): { crisp: boolean; words: string } | null {
  if (!pixelSize || !(px > 0)) return null
  const times = px / pixelSize
  const whole = Math.round(times)
  if (whole >= 1 && Math.abs(times - whole) < 0.04) return { crisp: true, words: `crisp (${trim(pixelSize)} px × ${whole})` }
  const near = [Math.max(1, Math.floor(times)), Math.floor(times) + 1, Math.floor(times) + 2].filter((n, i, all) => all.indexOf(n) === i)
  return { crisp: false, words: `soft at ${trim(px)} px — crisp at ${near.map((n) => trim(n * pixelSize)).join(' · ')} px` }
}
const trim = (n: number) => String(Math.round(n * 10) / 10)

/** A CSS size ("1.674rem", "18px") in pixels, given the page's rem in pixels. */
export function cssPixels(size: string, remPx = 16): number {
  const m = /^\s*(-?\d*\.?\d+)\s*(rem|px)?\s*$/.exec(size)
  if (!m) return 0
  return m[2] === 'px' ? Number(m[1]) : Number(m[1]) * remPx
}

/** Library fonts' names: their file name made readable ("press_start-dx.ttf" → "Press start dx") — matches the dev server's. */
export function prettyFontName(file: string): string {
  const base = file.split(/[/:]/).pop() ?? file
  const words = base.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Font'
}

/** Is a library path one of the computer's installed fonts ("installed1:arial.ttf") rather than the designer's folder ("folder:…")? */
export const isInstalledPath = (libraryPath: string) => /^installed\d+:/.test(libraryPath)

/** The one-line warning an installed font comes with. */
export function installedNote(platform?: string): string {
  const system = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'a Mac' : 'the computer'
  return `Most fonts that come with ${system} can't ship in a game — check its licence.`
}

/** Is this library font already in the game? (A game font whose file has the same name.) */
export function gameFontFor(libraryPath: string, gameFonts: KitFont[]): KitFont | undefined {
  const file = (libraryPath.split(/[/:]/).pop() ?? '').toLowerCase()
  return gameFonts.find((f) => (f.file.split('/').pop() ?? '').toLowerCase() === file)
}

/** The roles whose value points at a font that isn't in the game yet (Save waits for those). */
export function rolesOnLibraryFonts(values: Record<string, string>, choices: FontChoice[]): FontRole[] {
  const libraryOnly = new Set(choices.filter((c) => c.source === 'library').map((c) => c.name))
  return FONT_ROLES.filter((r) => libraryOnly.has(firstFontName(values[r.token] ?? '')))
}

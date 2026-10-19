// THE FONT LIBRARY — the Fonts tab's dev-server side (npm run dev only, never in a build). Lets the Fonts tab try any
// font in the designer's own font folder, and copy the one he picks into the game.
//   GET  /__devkit/font-library                 → { folder, found, fonts: [{ path, name, folder }], more }
//   GET  /__devkit/font-library/file?path=…     → that font file's bytes (for a live preview)
//   POST /__devkit/font-library/add  { path }   → copies it into public/fonts/<folder>/ (+ the licence / readme files
//        beside it), adds it to content/ui/fonts.json (licence "unknown" 🔴 until someone checks) and content/credits.json
// The folder: DEVKIT_FONT_LIBRARY (an environment variable), else "fontLibrary" in devkit.local.json at the game's root
// (git-ignored — each computer has its own; e.g. { "fontLibrary": "D:/Fonts" }), else <home>/Downloads/Font.
// Read-only toward the library: nothing there is ever run, changed or deleted; only font files are listed or served,
// and only from inside that folder (no "..", no links leading out).
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { formatJson } from './formatJson'

export const FONT_LIBRARY_URL = '/__devkit/font-library'
export const FONT_TYPES: Record<string, string> = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' }
/** Files copied along with a font when they sit right beside it: licences, readmes, the sample picture some licences ask for */
export const COMPANION_TYPES = ['.txt', '.md', '.html', '.htm', '.pdf', '.png', '.jpg', '.jpeg', '.rtf']
export const MAX_LISTED = 5000
const MAX_DEPTH = 8

export type LibraryFont = { path: string; name: string; folder: string }

/** Where the font library is (see the top of this file). */
export function libraryFolder(root: string, env = process.env.DEVKIT_FONT_LIBRARY): string {
  if (env) return resolve(env)
  const local = join(root, 'devkit.local.json')
  if (existsSync(local)) {
    try {
      const folder = JSON.parse(readFileSync(local, 'utf8')).fontLibrary
      if (typeof folder === 'string' && folder.trim()) return resolve(root, folder.replace(/^~(?=$|[\\/])/, homedir()))
    } catch { /* a broken local file → the default */ }
  }
  return join(homedir(), 'Downloads', 'Font')
}

/** "Press_Start-DX" → "Press Start DX", "gbb__" → "Gbb" — the name a font gets in the game. */
export function prettyFontName(file: string): string {
  const words = basename(file, extname(file)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Font'
}

const isFont = (name: string) => extname(name).toLowerCase() in FONT_TYPES

/** Every font file under the folder (links skipped), as paths relative to it with forward slashes. */
export function listLibrary(folder: string): { fonts: LibraryFont[]; more: boolean } {
  const fonts: LibraryFont[] = []
  let more = false
  const walk = (dir: string, depth: number) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) walk(full, depth + 1)
      } else if (isFont(entry.name)) {
        if (fonts.length >= MAX_LISTED) { more = true; return }
        const path = relative(folder, full).split(sep).join('/')
        fonts.push({ path, name: prettyFontName(entry.name), folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' })
      }
    }
  }
  if (existsSync(folder)) walk(folder, 0)
  return { fonts, more }
}

/** The real file for a library path — or a plain reason it's refused (outside the folder, not a font, missing). */
export function libraryFile(folder: string, path: unknown): string | { refused: string } {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) return { refused: 'no font path' }
  const parts = path.split(/[\\/]/)
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return { refused: 'that path leaves the font library' }
  if (!isFont(path)) return { refused: 'only font files (.ttf .otf .woff .woff2)' }
  const file = resolve(folder, ...parts)
  if (!existsSync(file) || !lstatSync(file).isFile()) return { refused: `no such font: ${path}` }
  // A link inside the library could still point outside it: check where the file really is
  const realFolder = realpathSync(folder)
  if (!realpathSync(file).startsWith(realFolder + sep)) return { refused: 'that path leaves the font library' }
  return file
}

/** "After Burner Neue" (a folder name) → "after_burner_neue" — the folder a font gets in public/fonts/ */
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'font'

export type FontEntry = { name: string; file: string; licence: string; licenceNote?: string; note?: string; pixelSize?: number }

/**
 * Copy a library font into the game: public/fonts/<its folder>/<file> plus the licence / readme files beside it,
 * then list it in content/ui/fonts.json and content/credits.json. Never overwrites a file already in the game; adding
 * the same font twice just returns its entry. Returns the fonts.json entry and every game file it wrote.
 */
export function addLibraryFont(root: string, folder: string, path: string): { font: FontEntry; wrote: string[]; already: boolean } {
  const source = libraryFile(folder, path)
  if (typeof source !== 'string') throw new Error(source.refused)
  const fontsPath = join(root, 'content', 'ui', 'fonts.json')
  if (!existsSync(dirname(fontsPath))) throw new Error('No such folder: content/ui (does the game have the UI kit?)')
  const oldFontsText = existsSync(fontsPath) ? readFileSync(fontsPath, 'utf8') : undefined
  const fontsFile = oldFontsText ? JSON.parse(oldFontsText) : { fonts: [] }
  if (!Array.isArray(fontsFile.fonts)) fontsFile.fonts = []
  const fonts = fontsFile.fonts as FontEntry[]

  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).split('/').pop()! : basename(path, extname(path))
  const dirName = slug(parent)
  const gameFile = `${dirName}/${basename(source)}`
  const known = fonts.find((f) => f.file === gameFile)
  if (known) return { font: known, wrote: [], already: true }

  const wrote: string[] = []
  const targetDir = join(root, 'public', 'fonts', dirName)
  mkdirSync(targetDir, { recursive: true })
  const copy = (from: string) => {
    const to = join(targetDir, basename(from))
    if (existsSync(to)) return // never overwrite
    copyFileSync(from, to)
    wrote.push(relative(root, to).split(sep).join('/'))
  }
  copy(source)
  for (const entry of readdirSync(dirname(source), { withFileTypes: true })) {
    if (entry.isFile() && !entry.isSymbolicLink() && COMPANION_TYPES.includes(extname(entry.name).toLowerCase())) copy(join(dirname(source), entry.name))
  }

  // A name no other font in the game has
  let name = prettyFontName(source)
  for (let n = 2; fonts.some((f) => f.name === name); n++) name = `${prettyFontName(source)} ${n}`
  const font: FontEntry = {
    name,
    file: gameFile,
    licence: 'unknown',
    licenceNote: `Added from the font library (${path}) — check its licence (the files beside it in public/fonts/${dirName}/)`,
  }
  fontsFile.fonts = [...fonts, font]
  writeFileSync(fontsPath, formatJson(fontsFile, oldFontsText))
  wrote.push('content/ui/fonts.json')

  const creditsPath = join(root, 'content', 'credits.json')
  const oldCredits = existsSync(creditsPath) ? readFileSync(creditsPath, 'utf8') : undefined
  const credits: unknown = oldCredits ? JSON.parse(oldCredits) : []
  const fontPath = `public/fonts/${gameFile}`
  if (Array.isArray(credits) && !credits.some((c) => Array.isArray(c?.paths) && c.paths.includes(fontPath))) {
    const entry = { paths: [fontPath], source: `Font library: ${path}`, author: '', licence: 'unknown — check its licence', light: '🔴', url: '', credit: '' }
    writeFileSync(creditsPath, formatJson([...credits, entry], oldCredits))
    wrote.push('content/credits.json')
  }
  return { font, wrote, already: false }
}

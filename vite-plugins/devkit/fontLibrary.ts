// THE FONT LIBRARY — the Fonts tab's dev-server side (npm run dev only, never in a build). Lets the Fonts tab try any
// font in the designer's own font folder or installed on the computer, and copy the one he picks into the game.
//   GET  /__devkit/font-library[?refresh=1]     → { folder, found, fonts, more, installed: { on, folders, fonts, more, skipped } }
//   GET  /__devkit/font-library/file?path=…     → that font file's bytes (for a live preview)
//   POST /__devkit/font-library/add  { path }   → copies it into public/fonts/<folder>/ (+ the licence / readme files
//        beside it — not for an installed font), adds it to content/ui/fonts.json (licence "unknown" 🔴 until someone
//        checks) and content/credits.json
// The ROOTS (Dev Kit 0.27.0) — the folders the library reads, each with a key:
//   "folder"      the designer's folder: DEVKIT_FONT_LIBRARY (an environment variable), else "fontLibrary" in
//                 devkit.local.json at the game's root (git-ignored — each computer has its own; e.g.
//                 { "fontLibrary": "D:/Fonts" }), else <home>/Downloads/Font.
//   "installed1"… the computer's installed-font folders that exist (installedFontFolders below). Off with
//                 "installedFonts": false in devkit.local.json, or DEVKIT_INSTALLED_FONTS=0 for one run.
// A library path is "<key>:<path inside that root>" ("folder:pixel/Tiny.ttf", "installed1:arial.ttf"): the key picks ONE
// root and the rest is checked against that root alone, so a path can never reach another root or outside them.
// Installed folders are listed once and kept for the dev server's life (?refresh=1 looks again); they show one row per
// font family (Windows keeps Arial as arial.ttf, arialbd.ttf, … — the family's regular is the one tried and added).
// Read-only toward every root: nothing there is ever run, changed or deleted; only font files are listed or served,
// and only from inside their root (no "..", no links leading out).
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, posix, relative, resolve, sep, win32 } from 'node:path'
import { formatJson } from './formatJson'

export const FONT_LIBRARY_URL = '/__devkit/font-library'
export const FONT_TYPES: Record<string, string> = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' }
/** Font files a browser can't load from a page — never listed, only counted so the tab can say so */
export const SKIPPED_TYPES: Record<string, string> = { '.ttc': 'ttc', '.otc': 'ttc', '.fon': 'fon', '.fnt': 'fon' }
/** Files copied along with a font when they sit right beside it: licences, readmes, the sample picture some licences ask for */
export const COMPANION_TYPES = ['.txt', '.md', '.html', '.htm', '.pdf', '.png', '.jpg', '.jpeg', '.rtf']
export const MAX_LISTED = 5000 // per root
const MAX_DEPTH = 8

/** One row of the library. path = "<root key>:<file inside the root>" (what the tab sends back); file = the readable part. */
export type LibraryFont = { path: string; name: string; folder: string; file: string; styles?: number }
export type LibraryRoot = { key: string; dir: string; label: string; installed: boolean }
type Env = Record<string, string | undefined>

/** Where the designer's font folder is (see the top of this file). */
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

/** The computer's installed-font folders for an operating system (existing or not), each with a label that names no user. */
export function installedFontFolders(platform: string = process.platform, env: Env = process.env, home = homedir()): { dir: string; label: string }[] {
  if (platform === 'win32') {
    const windows = env.WINDIR || env.SystemRoot || 'C:/Windows'
    const local = env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local')
    return [
      { dir: win32.join(windows, 'Fonts'), label: 'Windows Fonts' },
      { dir: win32.join(local, 'Microsoft', 'Windows', 'Fonts'), label: 'your Windows fonts' },
    ]
  }
  if (platform === 'darwin') {
    return [
      { dir: '/System/Library/Fonts', label: '/System/Library/Fonts' },
      { dir: '/Library/Fonts', label: '/Library/Fonts' },
      { dir: posix.join(home, 'Library', 'Fonts'), label: '~/Library/Fonts' },
    ]
  }
  return [
    { dir: '/usr/share/fonts', label: '/usr/share/fonts' },
    { dir: '/usr/local/share/fonts', label: '/usr/local/share/fonts' },
    { dir: posix.join(home, '.local', 'share', 'fonts'), label: '~/.local/share/fonts' },
    { dir: posix.join(home, '.fonts'), label: '~/.fonts' },
  ]
}

/** Are installed fonts in the library? Yes, unless DEVKIT_INSTALLED_FONTS is 0 / false / off / no, or devkit.local.json says "installedFonts": false. */
export function installedFontsOn(root: string, env = process.env.DEVKIT_INSTALLED_FONTS): boolean {
  if (env !== undefined && env.trim() !== '') return !/^(0|false|off|no)$/i.test(env.trim())
  const local = join(root, 'devkit.local.json')
  if (!existsSync(local)) return true
  try {
    return JSON.parse(readFileSync(local, 'utf8')).installedFonts !== false
  } catch {
    return true // a broken local file → the default
  }
}

export type RootOptions = { folderEnv?: string; installedEnv?: string; platform?: string; env?: Env; home?: string }

/** Every root the library reads: the designer's folder first (even when it doesn't exist yet), then the installed folders that exist. */
export function libraryRoots(root: string, options: RootOptions = {}): LibraryRoot[] {
  const folder = libraryFolder(root, 'folderEnv' in options ? options.folderEnv : process.env.DEVKIT_FONT_LIBRARY)
  const roots: LibraryRoot[] = [{ key: 'folder', dir: folder, label: 'Your font folder', installed: false }]
  if (!installedFontsOn(root, 'installedEnv' in options ? options.installedEnv : process.env.DEVKIT_INSTALLED_FONTS)) return roots
  const same = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
  installedFontFolders(options.platform, options.env, options.home).forEach(({ dir, label }, i) => {
    if (roots.some((r) => same(r.dir, dir))) return
    try {
      if (!lstatSync(dir).isDirectory()) return // a link standing in for the folder is not followed either
    } catch {
      return // not on this computer
    }
    roots.push({ key: `installed${i + 1}`, dir, label, installed: true })
  })
  return roots
}

/** "installed1:arial.ttf" → the installed1 root + "arial.ttf" — or a plain reason it's refused. */
export function splitLibraryPath(roots: LibraryRoot[], path: unknown): { root: LibraryRoot; inside: string } | { refused: string } {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) return { refused: 'no font path' }
  const colon = path.indexOf(':')
  const root = colon > 0 ? roots.find((r) => r.key === path.slice(0, colon)) : undefined
  if (!root) return { refused: 'that path names no font library folder' }
  return { root, inside: path.slice(colon + 1) }
}

/** "Press_Start-DX" → "Press Start DX", "gbb__" → "Gbb" — the name a font gets in the game. */
export function prettyFontName(file: string): string {
  const words = basename(file, extname(file)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Font'
}

const isFont = (name: string) => extname(name).toLowerCase() in FONT_TYPES

/**
 * Every font file under the folder (links skipped), as "<key>:<path relative to it>" with forward slashes. At most `max`
 * files (more = there were more); skipped counts the font files a browser can't load (.ttc collections, old .fon).
 */
export function listLibrary(folder: string, key = 'folder', max = MAX_LISTED): { fonts: LibraryFont[]; more: boolean; skipped: Record<string, number> } {
  const fonts: LibraryFont[] = []
  const skipped: Record<string, number> = {}
  let more = false
  const walk = (dir: string, depth: number) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (more) return
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) walk(full, depth + 1)
      } else if (isFont(entry.name)) {
        if (fonts.length >= max) { more = true; return }
        const file = relative(folder, full).split(sep).join('/')
        fonts.push({ path: `${key}:${file}`, name: prettyFontName(entry.name), folder: file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '', file })
      } else {
        const kind = SKIPPED_TYPES[extname(entry.name).toLowerCase()]
        if (kind) skipped[kind] = (skipped[kind] ?? 0) + 1
      }
    }
  }
  if (existsSync(folder)) walk(folder, 0)
  return { fonts, more, skipped }
}

export type FontNames = { family?: string; style?: string; weight?: number; italic?: boolean }

/** A font file's own names, read from its "name" table (and OS/2 for weight / italic) — {} when it can't be read. Reads a few KB, never the whole file. */
export function readFontNames(file: string): FontNames {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const read = (at: number, length: number) => {
      const buf = Buffer.alloc(length)
      return buf.subarray(0, readSync(fd!, buf, 0, length, at))
    }
    const head = read(0, 12)
    if (head.length < 12) return {}
    const version = head.readUInt32BE(0)
    // TrueType (0x00010000 or "true") / OpenType ("OTTO") only — a .woff is packed, its file name stands in
    if (version !== 0x00010000 && version !== 0x4f54544f && version !== 0x74727565) return {}
    const dir = read(12, Math.min(head.readUInt16BE(4), 512) * 16)
    const table = (name: string) => {
      for (let i = 0; i + 16 <= dir.length; i += 16) if (dir.toString('latin1', i, i + 4) === name) return { at: dir.readUInt32BE(i + 8), length: dir.readUInt32BE(i + 12) }
      return undefined
    }
    const out: FontNames = {}
    const os2 = table('OS/2')
    if (os2 && os2.length >= 64) {
      const t = read(os2.at, 64)
      if (t.length >= 64) {
        out.weight = t.readUInt16BE(4)
        out.italic = (t.readUInt16BE(62) & 1) === 1
      }
    }
    const nameTable = table('name')
    if (!nameTable) return out
    const t = read(nameTable.at, Math.min(nameTable.length, 256 * 1024))
    if (t.length < 6) return out
    const records = t.readUInt16BE(2)
    const strings = t.readUInt16BE(4)
    const best: Record<number, { rank: number; text: string }> = {}
    for (let i = 0; i < records; i++) {
      const r = 6 + i * 12
      if (r + 12 > t.length) break
      const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => t.readUInt16BE(r + o))
      if (id !== 1 && id !== 2 && id !== 16 && id !== 17) continue
      // Windows English first, then any Windows / Unicode name, then the old Mac Roman one
      const rank = platform === 3 && language === 0x409 ? 0 : platform === 3 ? 1 : platform === 0 ? 2 : platform === 1 && encoding === 0 && language === 0 ? 3 : 9
      if (rank === 9 || (best[id] && best[id].rank <= rank)) continue
      const bytes = t.subarray(strings + offset, strings + offset + length)
      const text = platform === 1 ? bytes.toString('latin1') : bytes.length % 2 === 0 ? Buffer.from(bytes).swap16().toString('utf16le') : ''
      const clean = text.split('\0').join('').trim()
      if (clean) best[id] = { rank, text: clean }
    }
    out.family = best[16]?.text ?? best[1]?.text
    out.style = best[17]?.text ?? best[2]?.text
    return out
  } catch {
    return {} // a broken file → the file name stands in
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** How far a style is from its family's plain regular (lower = more regular): weight away from 400, italic, "Regular". */
export function regularness(names: FontNames): number {
  const style = (names.style ?? '').toLowerCase()
  let score = Math.abs((names.weight ?? 400) - 400) / 100
  if (names.italic || /italic|oblique/.test(style)) score += 10
  if (/^(regular|normal|book|roman)$/.test(style)) score -= 1
  return score
}

type ListedRoot = { files: (LibraryFont & { score: number })[]; more: boolean; skipped: Record<string, number> }
const installedCache = new Map<string, ListedRoot>()

/**
 * The installed folders as font families, one row each: the family's name (read from the font itself), its most regular
 * file (the one Try and Add use) and how many styles it has. Each folder is read once and kept; refresh = look again.
 */
export function listInstalled(roots: LibraryRoot[], refresh = false, max = MAX_LISTED): { fonts: LibraryFont[]; more: boolean; skipped: Record<string, number> } {
  const byFamily = new Map<string, { font: LibraryFont & { score: number }; styles: number }>()
  const skipped: Record<string, number> = {}
  let more = false
  for (const root of roots.filter((r) => r.installed)) {
    const cacheKey = `${root.key}|${root.dir}|${max}`
    let listed = refresh ? undefined : installedCache.get(cacheKey)
    if (!listed) {
      const found = listLibrary(root.dir, root.key, max)
      const files = found.fonts.map((f) => {
        const names = readFontNames(join(root.dir, ...f.file.split('/')))
        return { ...f, name: names.family || f.name, folder: root.label, score: regularness(names) }
      })
      listed = { files, more: found.more, skipped: found.skipped }
      installedCache.set(cacheKey, listed)
    }
    more ||= listed.more
    for (const [kind, n] of Object.entries(listed.skipped)) skipped[kind] = (skipped[kind] ?? 0) + n
    for (const f of listed.files) {
      const known = byFamily.get(f.name.toLowerCase())
      if (!known) byFamily.set(f.name.toLowerCase(), { font: f, styles: 1 })
      else {
        known.styles++
        // the most regular style; a tie → the shorter file name (Windows keeps copies like arial.ttf + Arial_0.ttf)
        if (f.score < known.font.score || (f.score === known.font.score && f.file.length < known.font.file.length)) known.font = f
      }
    }
  }
  const fonts = [...byFamily.values()]
    .map(({ font, styles }): LibraryFont => ({ path: font.path, name: font.name, folder: font.folder, file: font.file, styles }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { fonts, more, skipped }
}

/** The real file for a path inside ONE root folder — or a plain reason it's refused (outside the folder, not a font, missing). */
export function libraryFile(folder: string, path: unknown): string | { refused: string } {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) return { refused: 'no font path' }
  const parts = path.split(/[\\/]/)
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.includes(':'))) return { refused: 'that path leaves the font library' }
  if (!isFont(path)) return { refused: 'only font files (.ttf .otf .woff .woff2)' }
  const file = resolve(folder, ...parts)
  if (!existsSync(file) || !lstatSync(file).isFile()) return { refused: `no such font: ${path}` }
  // A link inside the library could still point outside it: check where the file really is
  const realFolder = realpathSync(folder)
  if (!realpathSync(file).startsWith(realFolder + sep)) return { refused: 'that path leaves the font library' }
  return file
}

/** The real file for a library path ("<key>:<path inside that root>") — checked against that one root only. */
export function libraryPathFile(roots: LibraryRoot[], path: unknown): { file: string; root: LibraryRoot; inside: string } | { refused: string } {
  const split = splitLibraryPath(roots, path)
  if ('refused' in split) return split
  const file = libraryFile(split.root.dir, split.inside)
  return typeof file === 'string' ? { file, ...split } : file
}

/** "After Burner Neue" (a folder name) → "after_burner_neue" — the folder a font gets in public/fonts/ */
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'font'

export type FontEntry = { name: string; file: string; licence: string; licenceNote?: string; note?: string; pixelSize?: number }

/** The one-line warning an installed font comes with (the tab shows it too). */
export function installedNote(platform: string = process.platform): string {
  const system = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'a Mac' : 'the computer'
  return `most fonts that come with ${system} can't ship in a game: check its licence`
}

/**
 * Copy a library font into the game: public/fonts/<its folder>/<file> plus the licence / readme files beside it (from
 * the designer's folder only — an installed-font folder's other files aren't its), then list it in content/ui/fonts.json
 * and content/credits.json, always licence "unknown" 🔴. Never overwrites a file already in the game; adding the same
 * font twice just returns its entry. Returns the fonts.json entry and every game file it wrote.
 */
export function addLibraryFont(root: string, roots: LibraryRoot[], path: string): { font: FontEntry; wrote: string[]; already: boolean } {
  const found = libraryPathFile(roots, path)
  if ('refused' in found) throw new Error(found.refused)
  const { file: source, root: from, inside } = found
  const fontsPath = join(root, 'content', 'ui', 'fonts.json')
  if (!existsSync(dirname(fontsPath))) throw new Error('No such folder: content/ui (does the game have the UI kit?)')
  const oldFontsText = existsSync(fontsPath) ? readFileSync(fontsPath, 'utf8') : undefined
  const fontsFile = oldFontsText ? JSON.parse(oldFontsText) : { fonts: [] }
  if (!Array.isArray(fontsFile.fonts)) fontsFile.fonts = []
  const fonts = fontsFile.fonts as FontEntry[]

  // An installed font is named by its family (arialbd.ttf → "Arial") and gets that family's folder in the game
  const family = from.installed ? readFontNames(source).family : undefined
  const parent = family ?? (inside.includes('/') ? inside.slice(0, inside.lastIndexOf('/')).split('/').pop()! : basename(inside, extname(inside)))
  const dirName = slug(parent)
  const gameFile = `${dirName}/${basename(source)}`
  const known = fonts.find((f) => f.file === gameFile)
  if (known) return { font: known, wrote: [], already: true }

  const wrote: string[] = []
  const targetDir = join(root, 'public', 'fonts', dirName)
  mkdirSync(targetDir, { recursive: true })
  const copy = (file: string) => {
    const to = join(targetDir, basename(file))
    if (existsSync(to)) return // never overwrite
    copyFileSync(file, to)
    wrote.push(relative(root, to).split(sep).join('/'))
  }
  copy(source)
  if (!from.installed) {
    for (const entry of readdirSync(dirname(source), { withFileTypes: true })) {
      if (entry.isFile() && !entry.isSymbolicLink() && COMPANION_TYPES.includes(extname(entry.name).toLowerCase())) copy(join(dirname(source), entry.name))
    }
  }

  // A name no other font in the game has
  const base = family ?? prettyFontName(source)
  let name = base
  for (let n = 2; fonts.some((f) => f.name === name); n++) name = `${base} ${n}`
  const where = from.installed ? `installed on this computer (${from.label}: ${inside})` : `the font library (${inside})`
  const font: FontEntry = {
    name,
    file: gameFile,
    licence: 'unknown',
    licenceNote: from.installed
      ? `Added from the fonts ${where} — ${installedNote()}`
      : `Added from ${where} — check its licence (the files beside it in public/fonts/${dirName}/)`,
  }
  fontsFile.fonts = [...fonts, font]
  writeFileSync(fontsPath, formatJson(fontsFile, oldFontsText))
  wrote.push('content/ui/fonts.json')

  const creditsPath = join(root, 'content', 'credits.json')
  const oldCredits = existsSync(creditsPath) ? readFileSync(creditsPath, 'utf8') : undefined
  const credits: unknown = oldCredits ? JSON.parse(oldCredits) : []
  const fontPath = `public/fonts/${gameFile}`
  if (Array.isArray(credits) && !credits.some((c) => Array.isArray(c?.paths) && c.paths.includes(fontPath))) {
    const source = from.installed ? `Installed on this computer (${from.label}): ${inside}` : `Font library: ${inside}`
    const entry = { paths: [fontPath], source, author: '', licence: 'unknown — check its licence', light: '🔴', url: '', credit: '' }
    writeFileSync(creditsPath, formatJson([...credits, entry], oldCredits))
    wrote.push('content/credits.json')
  }
  return { font, wrote, already: false }
}

// THE DEV KIT'S VITE PLUGIN — from the Game Framework (devkit/), copied into the game's vite-plugins/devkit/.
// In vite.config.ts:   import { devkit } from './vite-plugins/devkit/devkitVite'
//                      plugins: [react(), devkit()]
// It does two jobs:
//   1. The on/off switch for release builds: reads content/devkit.json "inReleaseBuilds" and bakes it into the
//      code as __DEVKIT_IN_RELEASE__ (main.tsx reads it). DEVKIT_IN_RELEASE=true|false overrides it for one build —
//      the release check (src/devkit/check-devkit.mjs) uses that to test both ways.
//   2. The Save endpoint, dev server only (never in a build):
//        POST /__devkit/save   body: { "path": "content/ui/style.json", "data": { ... } }
//      Safety: only .json files inside content/ — nothing else in the project can be written — plus one
//      exception: bug captures (the Bug capture tab) go in .planning/bugs/, where /bug keeps them.
//      A missing folder is refused, except the two the Dev Kit's own tools fill (MADE_ON_FIRST_SAVE).
//      Files are written like hand-written JSON (formatJson.ts: 2 spaces, short objects / lists on one line), and a "_help" note already
//      in the file is kept even if the tool didn't send it. A save that changes nothing doesn't touch the file.
//      The game is not hot-reloaded for a saved file (it already shows the tool's live values) — unless the body
//      says "reload": true (the Text tab: the game reads its words at load time, so Vite's reload shows them).
//   4. The Fonts tab's font library, dev server only (fontLibrary.ts — the designer's font folder + the computer's
//      installed fonts, 0.27.0): GET /__devkit/font-library (list),
//      GET /__devkit/font-library/file?path= (one font, for a preview), POST /__devkit/font-library/add (copy one into the game).
//   5. Live tuning by default (0.18.0): content/tuning/*.json imports come back live (liveTuningName / liveJsonModule).
//   3. The Sound tab's two endpoints, dev server only (audioSave.ts): POST /__devkit/save-audio (a dropped-in sound →
//      MP3 in public/audio/<folder>/, nowhere else) and POST /__devkit/add-credit (appends to content/credits.json).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import { ADD_CREDIT_URL, MAX_UPLOAD_BYTES, SAVE_AUDIO_URL, readAudioTarget, readCreditEntry, saveAudioFile } from './audioSave'
import { FONT_LIBRARY_URL, FONT_TYPES, addLibraryFont, installedFontsOn, libraryPathFile, libraryRoots, listInstalled, listLibrary } from './fontLibrary'
import { formatJson } from './formatJson'

// How files are written (one-line short objects and lists, like hand-written files): formatJson.ts
export { formatJson }

export const SAVE_URL = '/__devkit/save'

/** Folders the Save endpoint makes if missing: Snapshots' files, and Bug capture's (where /bug looks). */
export const MADE_ON_FIRST_SAVE = ['content/snapshots', '.planning/bugs']

/** Is the Dev Kit in release builds? The DEVKIT_IN_RELEASE override, else content/devkit.json, else off. */
export function devkitInReleaseBuilds(root: string, override = process.env.DEVKIT_IN_RELEASE): boolean {
  if (override === 'true') return true
  if (override === 'false') return false
  if (override !== undefined) throw new Error(`DEVKIT_IN_RELEASE must be true or false (got "${override}")`)
  const file = join(root, 'content', 'devkit.json')
  if (!existsSync(file)) return false
  return JSON.parse(readFileSync(file, 'utf8')).inReleaseBuilds === true
}

/** Is this a path the Dev Kit may write? e.g. "content/ui/style.json" yes; "src/App.tsx", "../x.json" no. */
export function isAllowedContentPath(path: unknown): path is string {
  if (typeof path !== 'string') return false
  if (!path.startsWith('content/')) return false // relative, forward slashes, inside content/
  if (!path.endsWith('.json')) return false
  if (path.includes('\\') || path.includes('\0')) return false
  const parts = path.split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

/** A bug capture's file: ".planning/bugs/capture-2026-09-30-23-15-07.json" yes; anything deeper or else, no. */
export function isAllowedBugCapturePath(path: unknown): path is string {
  return typeof path === 'string' && /^\.planning\/bugs\/[A-Za-z0-9_-]+\.json$/.test(path)
}

/** Keep the file's "_help" note (first, as it was) if the new data doesn't bring its own. */
export function keepHelp(existing: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  const help = (existing as Record<string, unknown> | null)?._help
  if (help === undefined || '_help' in incoming) return incoming
  return { _help: help, ...incoming }
}

// Same file, same key — whatever slashes or drive-letter case the path came with (Windows)
const fileKey = (file: string) => resolve(file).toLowerCase()

/** Where the game's copy of liveTuning.ts is (install-devkit puts kit/ in src/devkit/). */
export const LIVE_TUNING_MODULE = 'src/devkit/tuning/liveTuning.ts'

/** "<root>/content/tuning/tank.json" → "tank" (the name live edits travel under); anything else → null.
 *  Only files directly in content/tuning/, with no query (?raw, ?devkit-file keep the plain file). */
export function liveTuningName(id: string, root: string): string | null {
  if (id.includes('?') || id.startsWith('\0')) return null
  const slashes = (p: string) => p.replace(/\\/g, '/')
  const base = `${slashes(root).replace(/\/$/, '')}/content/tuning/`
  const path = slashes(id)
  if (!path.toLowerCase().startsWith(base.toLowerCase())) return null // (Windows: the drive letter's case varies)
  const rest = path.slice(base.length)
  return /^[^/]+\.json$/.test(rest) ? rest.slice(0, -'.json'.length) : null
}

/** The module a live tuning file becomes: the file's data, handed back through liveFile. */
export function liveJsonModule(name: string, jsonText: string, liveTuningPath: string): string {
  JSON.parse(jsonText) // a broken file fails here, with the file named by Vite
  const from = JSON.stringify(liveTuningPath.replace(/\\/g, '/'))
  return `import { liveFile } from ${from}\nexport default liveFile(${JSON.stringify(name)}, JSON.parse(${JSON.stringify(jsonText)}))\n`
}

// ---- 6. More files in the Tuning tab (0.28.0, F132) ----
// content/devkit.json "tuningFiles" lists other content files a designer tunes, beside content/tuning/:
//   "tuningFiles": ["content/rooms.json", { "file": "content/ai/pace.json", "after": "a bot's next turn" }]
// "after" = when a saved change reaches the game, if not at once (rooms.json: "the room server reads it when it
// starts — restart npm run party:dev"). Each is named by its path without content/ and .json ("rooms", "ai/pace") —
// the name its live edits travel under, like a tuning file's. Only the listed files are loaded (never all of content/:
// a game's word lists are megabytes). The tab gets them from this virtual module; the game's own imports of them are
// made live like tuning files (step 5).
export const TUNING_FILES_MODULE = 'virtual:devkit-tuning-files'
const RESOLVED_TUNING_FILES = `\0${TUNING_FILES_MODULE}`

export type ExtraTuningFile = { name: string; path: string; after?: string }

/** content/devkit.json "tuningFiles", checked: the files to show, and what's wrong with the rest in plain words. */
export function readTuningFileList(root: string): { files: ExtraTuningFile[]; problems: string[] } {
  const file = join(root, 'content', 'devkit.json')
  if (!existsSync(file)) return { files: [], problems: [] }
  let list: unknown
  try { list = JSON.parse(readFileSync(file, 'utf8')).tuningFiles } catch {
    return { files: [], problems: ['content/devkit.json isn’t valid JSON, so its "tuningFiles" can’t be read'] }
  }
  if (list === undefined) return { files: [], problems: [] }
  if (!Array.isArray(list)) return { files: [], problems: ['content/devkit.json "tuningFiles" should be a list of paths, e.g. ["content/rooms.json"]'] }
  const files: ExtraTuningFile[] = []
  const problems: string[] = []
  for (const entry of list) {
    const path = typeof entry === 'string' ? entry : (entry as { file?: unknown } | null)?.file
    const after = typeof entry === 'object' && entry && typeof (entry as { after?: unknown }).after === 'string' ? (entry as { after: string }).after : undefined
    const said = JSON.stringify(path ?? entry)
    if (!isAllowedContentPath(path)) { problems.push(`"tuningFiles": ${said} isn’t a .json file inside content/ (like "content/rooms.json") — left out`); continue }
    if (path.startsWith('content/tuning/')) { problems.push(`"tuningFiles": ${path} is already in the Tuning tab (every content/tuning/ file is) — left out`); continue }
    if (path === 'content/ui/style.json') { problems.push('"tuningFiles": content/ui/style.json is the Color tab’s — left out'); continue }
    if (!existsSync(join(root, ...path.split('/')))) { problems.push(`"tuningFiles": ${path} doesn’t exist — left out`); continue }
    const name = path.slice('content/'.length, -'.json'.length)
    if (existsSync(join(root, 'content', 'tuning', `${name}.json`))) { problems.push(`"tuningFiles": ${path} has the same name as content/tuning/${name}.json, so their live edits would mix — left out`); continue }
    if (files.some((f) => f.path === path)) continue // listed twice: once is enough
    files.push(after ? { name, path, after } : { name, path })
  }
  return { files, problems }
}

/** The virtual module's code: each listed file's data as it is on disk now, with its name and note
 *  (`read` = the file's text; a broken file is said as a problem, not a crash). */
export function tuningFilesModule(list: { files: ExtraTuningFile[]; problems: string[] }, read: (path: string) => string): string {
  const files: string[] = []
  const problems = [...list.problems]
  for (const f of list.files) {
    try { files.push(JSON.stringify({ ...f, data: JSON.parse(read(f.path)) })) } catch (e) {
      problems.push(`"tuningFiles": ${f.path} isn’t valid JSON (${String((e as Error).message).split('\n')[0]}) — left out`)
    }
  }
  return `export default { files: [${files.join(', ')}], problems: ${JSON.stringify(problems)} }\n`
}

/** A listed file's live name ("rooms") when `id` is that file, imported plainly; else null. */
export function liveExtraName(id: string, root: string, files: ExtraTuningFile[]): string | null {
  if (id.includes('?') || id.startsWith('\0')) return null
  const path = id.replace(/\\/g, '/').toLowerCase()
  const base = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/`.toLowerCase()
  return files.find((f) => path === `${base}${f.path}`.toLowerCase())?.name ?? null
}

/** Both jobs in one plugin — see the top of this file. */
export function devkit(): Plugin {
  let root = process.cwd()
  // Files we just wrote: Vite would hot-reload the game for them, but the game already shows
  // those values live, so we skip that reload (it would reset the game under Muzzy's feet).
  const justWrote = new Map<string, number>()

  return {
    name: 'bmuz-devkit',
    // 1. The release-build switch. When it's false, main.tsx's Dev Kit import is dead code
    //    and none of src/devkit/ reaches the live build.
    config(config) {
      const inRelease = devkitInReleaseBuilds(resolve(config.root ?? process.cwd()))
      return { define: { __DEVKIT_IN_RELEASE__: JSON.stringify(inRelease) } }
    },
    configResolved(config) {
      root = config.root
    },
    // 2. The Save endpoint (configureServer only runs for the dev server)
    configureServer(server) {
      // "null" or junk in the Origin header → no host, so the request is refused instead of crashing
      const originHost = (origin: string) => {
        try { return new URL(origin).host } catch { return '' }
      }
      const replier = (res: ServerResponse) => (status: number, body: object) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      }
      // Only the game's own page may save: the dev server is on the Wi-Fi (--host), and any web page
      // could otherwise POST here. A same-page fetch sends Origin = this server; JSON (or raw bytes) forces that check.
      const refused = (req: IncomingMessage, contentType: string): [number, string] | null => {
        if (req.method !== 'POST') return [405, 'POST only']
        const origin = req.headers.origin
        const host = req.headers.host
        if (!origin || !host || originHost(origin) !== host) return [403, 'Save only from the game page']
        if (!String(req.headers['content-type'] ?? '').startsWith(contentType)) return [415, `${contentType} only`]
        return null
      }

      // 3a. A sound file dropped into the Sound tab → MP3 in public/audio/<folder>/ (audioSave.ts)
      server.middlewares.use(SAVE_AUDIO_URL, (req, res) => {
        const reply = replier(res)
        const no = refused(req, 'application/octet-stream')
        if (no) return reply(no[0], { error: no[1] })
        const params = new URL(req.url ?? '/', 'http://x').searchParams
        const target = readAudioTarget({ folder: params.get('folder'), stem: params.get('stem'), bus: params.get('bus'), ext: params.get('ext') })
        if (typeof target === 'string') return reply(400, { error: `Not allowed: ${target}` })
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size <= MAX_UPLOAD_BYTES) chunks.push(chunk)
        })
        req.on('end', () => {
          if (size > MAX_UPLOAD_BYTES) return reply(413, { error: `That file is too big (over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` })
          saveAudioFile(root, target, Buffer.concat(chunks)).then(
            (saved) => {
              justWrote.set(fileKey(resolve(root, saved.file)), Date.now())
              server.config.logger.info(`[devkit] saved ${saved.file} (start trimmed ${saved.trimmedMs} ms)`, { timestamp: true })
              reply(200, { ok: true, ...saved })
            },
            (e: Error) => reply(500, { error: e.message }),
          )
        })
      })

      // 3b. Where a dropped-in sound came from → content/credits.json (a list)
      server.middlewares.use(ADD_CREDIT_URL, (req, res) => {
        const reply = replier(res)
        const no = refused(req, 'application/json')
        if (no) return reply(no[0], { error: no[1] })
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            const entry = readCreditEntry(JSON.parse(Buffer.concat(chunks).toString('utf8')).entry)
            if (typeof entry === 'string') return reply(400, { error: `Not allowed: ${entry}` })
            const file = resolve(root, 'content', 'credits.json')
            if (!existsSync(dirname(file))) return reply(400, { error: 'No such folder: content' })
            const oldText = existsSync(file) ? readFileSync(file, 'utf8') : undefined
            const list: unknown = oldText === undefined ? [] : JSON.parse(oldText)
            if (!Array.isArray(list)) return reply(400, { error: 'content/credits.json should be a list [ … ] — not changed' })
            justWrote.set(fileKey(file), Date.now())
            writeFileSync(file, formatJson([...list, entry], oldText))
            server.config.logger.info(`[devkit] credits: added ${entry.paths.join(', ')}`, { timestamp: true })
            reply(200, { ok: true })
          } catch (e) {
            reply(500, { error: String(e) })
          }
        })
      })

      // 4. The Fonts tab's font library (fontLibrary.ts). Reads: only from this page (a browser marks a request from
      //    another site "cross-site" — refused; it couldn't read the answer anyway). Adding: same rules as Save.
      const otherSite = (req: IncomingMessage) => {
        const site = req.headers['sec-fetch-site']
        return site !== undefined && site !== 'same-origin' && site !== 'none'
      }
      server.middlewares.use(FONT_LIBRARY_URL, (req, res) => {
        const reply = replier(res)
        const url = new URL(req.url ?? '/', 'http://x')
        const roots = libraryRoots(root) // the designer's folder + the installed-font folders (each path names one)
        const folder = roots[0].dir
        if (url.pathname === '/add') {
          const no = refused(req, 'application/json')
          if (no) return reply(no[0], { error: no[1] })
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const { path } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
              // Its files land in public/ and content/ — the game already shows the font, so no reload for them
              for (const name of ['content/ui/fonts.json', 'content/credits.json']) justWrote.set(fileKey(resolve(root, name)), Date.now())
              const added = addLibraryFont(root, roots, path)
              for (const file of added.wrote) justWrote.set(fileKey(resolve(root, file)), Date.now())
              server.config.logger.info(`[devkit] fonts: ${added.already ? 'already had' : 'added'} ${added.font.file}`, { timestamp: true })
              reply(200, { ok: true, ...added })
            } catch (e) {
              reply(400, { error: (e as Error).message })
            }
          })
          return
        }
        if (req.method !== 'GET') return reply(405, { error: 'GET only' })
        if (otherSite(req)) return reply(403, { error: 'Only from the game page' })
        if (url.pathname === '/file') {
          const found = libraryPathFile(roots, url.searchParams.get('path'))
          if ('refused' in found) return reply(400, { error: `Not allowed: ${found.refused}` })
          const { file } = found
          res.statusCode = 200
          res.setHeader('Content-Type', FONT_TYPES[extname(file).toLowerCase()])
          res.setHeader('Cache-Control', 'no-store')
          res.end(readFileSync(file))
          return
        }
        if (url.pathname !== '/' && url.pathname !== '') return reply(404, { error: 'No such font library request' })
        const { fonts, more } = listLibrary(folder)
        const installedRoots = roots.filter((r) => r.installed)
        const installed = { on: installedFontsOn(root), folders: installedRoots.map((r) => r.label), ...listInstalled(installedRoots, url.searchParams.has('refresh')), platform: process.platform }
        reply(200, { folder, found: existsSync(folder), fonts, more, installed })
      })

      server.middlewares.use(SAVE_URL, (req, res) => {
        const reply = replier(res)
        const no = refused(req, 'application/json')
        if (no) return reply(no[0], { error: no[1] === 'application/json only' ? 'JSON only' : no[1] })

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            // Join the raw bytes first, so a character split across two chunks (like "—") stays whole
            const { path, data, reload } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const isCapture = isAllowedBugCapturePath(path)
            if (!isAllowedContentPath(path) && !isCapture) return reply(400, { error: `Not allowed: only .json files inside content/, or bug captures in .planning/bugs/ (got ${path})` })
            if (typeof data !== 'object' || data === null || Array.isArray(data)) return reply(400, { error: 'data must be a JSON object' })

            const allowedDir = resolve(root, isCapture ? '.planning/bugs' : 'content')
            const file = resolve(root, path)
            if (!file.startsWith(allowedDir + sep)) return reply(400, { error: 'Not allowed: outside content/' })
            if (!existsSync(dirname(file))) {
              if (!MADE_ON_FIRST_SAVE.includes(dirname(path))) return reply(400, { error: `No such folder: ${dirname(path)}` })
              mkdirSync(dirname(file), { recursive: true })
            }

            // The file as it is now: its _help note is kept, and so is its layout (formatJson.ts)
            const oldText = existsSync(file) ? readFileSync(file, 'utf8') : undefined
            const existing = oldText === undefined ? null : JSON.parse(oldText)
            const newText = formatJson(keepHelp(existing, data), oldText)
            if (newText === oldText) return reply(200, { ok: true, path, unchanged: true }) // nothing to write
            // reload: true (the Text tab) = let Vite hot-reload the game for it, like a hand edit; else skip that reload
            if (reload === true) justWrote.delete(fileKey(file))
            else justWrote.set(fileKey(file), Date.now())
            writeFileSync(file, newText)
            server.config.logger.info(`[devkit] saved ${path}`, { timestamp: true })
            reply(200, { ok: true, path })
          } catch (e) {
            reply(500, { error: String(e) })
          }
        })
      })
    },
    // 5. LIVE BY DEFAULT (0.18.0): `import tank from '…/content/tuning/tank.json'` hands the game liveFile('tank', …) — an
    //    object that reads the Dev Kit's latest edit on every property access (src/devkit/tuning/liveTuning.ts), so a
    //    game's tuning follows the sliders with no wrapping. In every build and in vitest (with nothing sending edits it
    //    is just the file). Imports with a query (?raw, the Dev Kit's own ?devkit-file) are left alone. Runs after
    //    Vite's own JSON step ('post'), replacing its output.
    // 6. The Tuning tab's extra files (F132): `import extra from 'virtual:devkit-tuning-files'` (kit/tuning/tuningFiles.ts)
    resolveId(id) {
      return id === TUNING_FILES_MODULE ? RESOLVED_TUNING_FILES : null
    },
    load(id) {
      if (id !== RESOLVED_TUNING_FILES) return null
      // the list and each listed file are watched: a change → the tab gets it on the next page load
      this.addWatchFile(join(root, 'content', 'devkit.json'))
      const list = readTuningFileList(root)
      for (const f of list.files) this.addWatchFile(join(root, ...f.path.split('/')))
      return tuningFilesModule(list, (path) => readFileSync(join(root, ...path.split('/')), 'utf8'))
    },
    transform: {
      order: 'post',
      handler(_code, id) {
        // (a listed extra file is live too — read the list only for .json files, so other files cost nothing)
        const name = liveTuningName(id, root) ?? (/\.json$/i.test(id) ? liveExtraName(id, root, readTuningFileList(root).files) : null)
        const live = join(root, ...LIVE_TUNING_MODULE.split('/'))
        if (!name || !existsSync(live)) return null
        const file = id.replace(/[?#].*$/, '')
        this.addWatchFile(file)
        // (imported as /src/…: Vite reads a leading / as the game's folder, in dev, builds and vitest alike)
        return { code: liveJsonModule(name, readFileSync(file, 'utf8'), `/${LIVE_TUNING_MODULE}`), map: null }
      },
    },
    handleHotUpdate({ file }) {
      const wroteAt = justWrote.get(fileKey(file))
      if (wroteAt !== undefined && Date.now() - wroteAt < 3000) {
        justWrote.delete(fileKey(file))
        return [] // no reload — see justWrote above
      }
    },
  }
}

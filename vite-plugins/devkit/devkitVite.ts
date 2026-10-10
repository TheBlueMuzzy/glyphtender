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
//      in the file is kept even if the tool didn't send it.
//   3. The Sound tab's two endpoints, dev server only (audioSave.ts): POST /__devkit/save-audio (a dropped-in sound →
//      MP3 in public/audio/<folder>/, nowhere else) and POST /__devkit/add-credit (appends to content/credits.json).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import { ADD_CREDIT_URL, MAX_UPLOAD_BYTES, SAVE_AUDIO_URL, readAudioTarget, readCreditEntry, saveAudioFile } from './audioSave'
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

      server.middlewares.use(SAVE_URL, (req, res) => {
        const reply = replier(res)
        const no = refused(req, 'application/json')
        if (no) return reply(no[0], { error: no[1] === 'application/json only' ? 'JSON only' : no[1] })

        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => {
          try {
            // Join the raw bytes first, so a character split across two chunks (like "—") stays whole
            const { path, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
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
            justWrote.set(fileKey(file), Date.now())
            writeFileSync(file, formatJson(keepHelp(existing, data), oldText))
            server.config.logger.info(`[devkit] saved ${path}`, { timestamp: true })
            reply(200, { ok: true, path })
          } catch (e) {
            reply(500, { error: String(e) })
          }
        })
      })
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

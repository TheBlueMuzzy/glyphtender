// THE ROOMS MODULE'S VITE PLUGIN (0.13.0, F155) — one line in the game's vite.config.ts:
//   import { roomsPort } from './src/rooms/vitePlugin.mjs'
//   plugins: [react(), roomsPort(), …]
// What it does: reads the port the game's local room server uses — wrangler.json "dev" → "port", the ONE place it's
// written (wrangler dev reads the same line) — and bakes it into the page as import.meta.env.PARTY_PORT. roomClient.ts's
// partyHost() then connects to <the page's own address>:<that port>, so a phone on the Wi-Fi still reaches the PC.
// No wrangler file, or no dev.port in it → 1999, the port every game used before 0.13.0. A game without this plugin also
// keeps 1999. Dev server: when wrangler.json changes, the server restarts, so the page never waits on the old port.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const DEFAULT_PARTY_PORT = 1999
export const DEFINE_KEY = 'import.meta.env.PARTY_PORT'
export const WRANGLER_FILES = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']

// wrangler.jsonc allows // and /* */ comments — drop them, but never inside a "string" (a URL's // stays)
function withoutJsonComments(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 1
    } else out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1') // jsonc's trailing commas
}

const isPort = (value) => Number.isInteger(value) && value > 0 && value < 65536

/**
 * The game's local room port: { port, file } — file = the wrangler file it came from (null: none, so the default).
 * Throws when the wrangler file can't be read as JSON (a broken wrangler.json would break `wrangler dev` too).
 */
export function readPartyPort(root = process.cwd()) {
  const file = WRANGLER_FILES.find((name) => existsSync(join(root, name)))
  if (!file) return { port: DEFAULT_PARTY_PORT, file: null }
  const text = readFileSync(join(root, file), 'utf8')
  let port
  if (file.endsWith('.toml')) {
    // [dev] … port = 6499   (only the [dev] table — another table's port is something else)
    const dev = /^\s*\[dev\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m.exec(text)?.[1] ?? ''
    port = Number(/^\s*port\s*=\s*(\d+)/m.exec(dev)?.[1])
  } else {
    let config
    try { config = JSON.parse(file.endsWith('.jsonc') ? withoutJsonComments(text) : text) } catch (error) {
      throw new Error(`rooms: ${file} isn't valid JSON (${error.message}) — wrangler dev can't read it either`)
    }
    port = config?.dev?.port
  }
  return { port: isPort(port) ? port : DEFAULT_PARTY_PORT, file }
}

/** @param {{ root?: string }} [options] root = the folder with wrangler.json (default: Vite's root) */
export function roomsPort(options = {}) {
  let root = null
  return {
    name: 'framework-rooms-port',
    config(config) {
      root = resolve(options.root ?? config.root ?? process.cwd())
      const { port } = readPartyPort(root)
      // define: the dev server + builds. test.env: Vitest gives tests its own import.meta.env and skips define's
      // import.meta.env.* keys (as the version plugin found) — so the game's tests get it from there.
      return { define: { [DEFINE_KEY]: JSON.stringify(String(port)) }, test: { env: { PARTY_PORT: String(port) } } }
    },
    configureServer(server) {
      const files = WRANGLER_FILES.map((name) => join(root, name))
      server.watcher.add(files)
      server.watcher.on('change', (changed) => {
        if (files.includes(resolve(changed))) server.restart()
      })
    },
  }
}

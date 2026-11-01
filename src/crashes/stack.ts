// READING A STACK — the browser's "where in the code" text → at most 10 frames from the game's own files.
// Chrome / Edge write "    at tick (https://game.site/assets/index-Bx12.js:1:48211)",
// Firefox / Safari write "tick@https://game.site/assets/index-Bx12.js:1:48211".
// Only frames from the game's own address are kept (in-game frames), and only the path inside the site travels:
// never the full URL, its ?query or #part.
import { MAX_FRAMES, withoutHidden, type Frame } from './report'

const CHROME_LINE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/
const FIREFOX_LINE = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/
const EXTENSION = /^(chrome|moz|safari|safari-web)-extension:\/\//

export interface ReadStack {
  /** In-game frames, top first, at most 10. */
  frames: Frame[]
  /** true when the stack had frames and EVERY one was in a browser extension — not the game's problem. */
  allExtension: boolean
}

/** The path inside the game for a file of the game's own, or null for anything else (another site, an extension,
 *  "<anonymous>" — eval, a console or a test tool: a stack names real files by their full address, so nothing else is
 *  read relative to the page). base = the game's folder on its site ("/GOOPS/alpha/"): the path is inside it, the
 *  way the build's maps are filed (assets/index-Bx12.js), so the game moving folder keeps every fingerprint. */
export function sitePath(url: string, origin: string, base = '/'): string | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.origin !== origin) return null
  const path = parsed.pathname.startsWith(base) ? parsed.pathname.slice(base.length) : parsed.pathname
  return safeFile(path.replace(/^\/+/, ''))
}

/** What the server accepts as a file: 1–200 characters, no spaces, no ? # or :, no ".." part. */
export function safeFile(path: string): string | null {
  if (path === '' || path.length > 200 || /[\s?#:]/.test(path) || path.split('/').includes('..')) return null
  return path
}

/** A function name as the server takes it: at most 100 characters, nothing invisible. "async tick" → "tick". */
function cleanFn(name: string | undefined): string | undefined {
  const fn = withoutHidden((name ?? '').replace(/^async\s+/, '')).trim().slice(0, 100)
  return fn === '' || fn === '<anonymous>' ? undefined : fn
}

export function readStack(stack: string | undefined, origin: string, base = '/'): ReadStack {
  const frames: Frame[] = []
  let seen = 0
  let inExtension = 0
  for (const text of (stack ?? '').split('\n')) {
    const match = CHROME_LINE.exec(text) ?? FIREFOX_LINE.exec(text)
    if (!match) continue // the "TypeError: …" first line Chrome repeats, or a line we can't read
    const [, fn, url, line, col] = match
    seen++
    if (EXTENSION.test(url)) { inExtension++; continue }
    const file = sitePath(url, origin, base)
    if (!file || frames.length >= MAX_FRAMES) continue
    const frame: Frame = { file, line: Number(line), col: Number(col) }
    const name = cleanFn(fn)
    if (name) frame.fn = name
    frames.push(frame)
  }
  return { frames, allExtension: seen > 0 && inExtension === seen }
}

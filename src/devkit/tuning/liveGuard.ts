// THE LIVE GUARD (0.18.0) — finds game code that would NOT follow the Dev Kit's Tuning sliders.
// The Vite plugin already makes every content/tuning/*.json import live (liveFile, liveTuning.ts), so what's left to
// catch is code that takes a COPY once and never looks again:
//   - `import x from '…/content/tuning/a.json?raw'`        (a string: not live — import the file itself)
//   - `import { speed } from '…/content/tuning/a.json'`    (a named import is a copy — import the default)
//   - at the top of a file: `const speed = tank.cameraSpeed`, `const STEPS = { laser: breakdowns.laser.steps }`,
//     `const PALETTE = JSON.parse(raw)`  (runs once, when the file loads — read it where it's used instead)
// It reads source text with simple rules, no compiler, so it's quick and plain. What it can't see (do these by eye, and
// prove a few knobs live in an e2e): copies made inside a constructor or a factory (`{ ...file }`, `cfg = hud.chevrons`
// as a default parameter of something made once), and values cached in a closure.
// Allowed: type-only imports (`import type x from …`), test files, the Dev Kit's own folder, and anything in `allow`
// (path → the reason, e.g. "read once at start-up on purpose").
//
//   // a game test (vitest, node) — read src/ with node:fs (see the README's install steps for the 10-line walk):
//   import { copiedAtLoad } from '../src/devkit/tuning/liveGuard'
//   expect(copiedAtLoad(filesIn('src'), { allow: { 'src/x.ts': 'why' } })).toEqual([])

export type SourceFile = { path: string; text: string }
export type GuardOptions = {
  /** Folders whose JSON is Dev Kit-editable and read live. Default: content/tuning/. */
  folders?: string[]
  /** path → why it may copy at load. */
  allow?: Record<string, string>
}

const IMPORT = /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm
const DECLARATION = /^(?:export\s+)?(?:const|let|var)\s+([^=]+?)=\s*([\s\S]*)$/

/** Plain-English problems, one per line found ("src/a.ts:12 — copies tank at load: const speed = tank.cameraSpeed"). */
export function copiedAtLoad(files: SourceFile[], { folders = ['content/tuning/'], allow = {} }: GuardOptions = {}): string[] {
  const problems: string[] = []
  for (const { path, text } of files) {
    const p = path.replace(/\\/g, '/')
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)devkit\//.test(p) || allow[p] !== undefined) continue
    const live = new Set<string>()
    for (const m of text.matchAll(IMPORT)) {
      const [, typeOnly, what, from] = m
      if (!folders.some((f) => from.includes(f)) || !/\.json(\?|$)/.test(from)) continue
      const line = lineOf(text, m.index ?? 0)
      if (typeOnly) continue
      if (from.includes('?')) { problems.push(`${p}:${line} — imports ${from} with a query (${from.split('?')[1]}): that's a copy, not live — import the .json itself`); continue }
      const def = what.match(/^([A-Za-z_$][\w$]*)/)?.[1]
      if (what.includes('{')) problems.push(`${p}:${line} — a named import from ${from} is a copy — import the default and read .key where it's used`)
      if (def) live.add(def)
    }
    if (live.size === 0) continue
    // top-level declarations (they start at column 0) that read a live import while the file loads
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const d = lines[i].match(DECLARATION)
      if (!d) continue
      let rhs = d[2]
      for (let j = i + 1; j < lines.length && /^(\s|[)\]}])/.test(lines[j]); j++) rhs += '\n' + lines[j] // its following lines
      if (/^\s*(async\s+)?(function\b|\([^)]*\)\s*(:[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/.test(rhs)) continue // a function: reads when called
      if (/^\s*(use)?liveTuning\s*\(/.test(rhs)) continue
      const alias = rhs.trim().replace(/;$/, '').replace(/\s+as\s+[\w$<>[\],\s|.]+$/, '').trim()
      if (live.has(alias)) continue // another name for the live object itself (`const PALETTE = file as Palette`) is still live
      const body = stripStrings(rhs.split('=>')[0]) // a value made by calling a function written inline still copies; an arrow's body doesn't run now
      for (const name of live) {
        if (new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}\\b(?!\\s*:)`).test(body)) {
          problems.push(`${p}:${i + 1} — copies ${name} when the file loads (\`${lines[i].trim().slice(0, 80)}\`) — read it where it's used, so the Dev Kit's edits reach it`)
          break
        }
      }
    }
  }
  return problems
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length
const stripStrings = (code: string) => code.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/\/\/.*$/gm, '')


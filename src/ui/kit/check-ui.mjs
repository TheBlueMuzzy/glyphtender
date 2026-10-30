// RULE CHECKER — keeps UI code built only from style names. Ships inside the kit, so a game runs:
//   node src/ui/kit/check-ui.mjs src/ui          (point it at the folders that hold UI code)
//   node src/ui/kit/check-ui.mjs src/ui --css src   (also: warn about game CSS that restyles kit parts)
// With no folders it checks the kit itself. In the framework: npm run check-ui (kit + gallery).
// Fails on:
//   1. raw colours (#hex, rgb(), hsl())       → use a colour name: var(--primary)
//   2. px sizes                                → use gap names / rem
//   3. font names                              → use var(--font-body) / var(--font-display)
//   4. position:absolute/fixed outside Screen (and the stack's overlay, the HUD's dock — 0.17.0) → use Screen slots, Stack, Row, Grid
//   5. inline style= (except setting --css-variables)
//   6. var(--something) that isn't a style name from kit/style/tokens.ts (or a --kit-… helper)
// --css <folders>: every .css file in them (outside the kit's own folder) is also checked for rules that
// restyle kit parts — a selector naming a .kit-… class. Those are WARNINGS (they don't fail the check):
// the look belongs in the style file, and a kit update may quietly break them. A rule that only sets
// CSS variables (--kit-frame-w, --kit-overlay-z…) is fine.
// The style engine (kit/style/), the presets (kit/styles/), the font files (kit/fonts/ — their
// @font-face rules must name each font) and tests are allowed raw values.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// Node 22.18+ reads .ts files directly (type stripping), so no build step is needed
import { allVariableNames } from './style/tokens.ts'

const EXEMPT = [/kit[\\/]style[\\/]/, /kit[\\/]styles[\\/]/, /kit[\\/]fonts[\\/]/, /\.test\./]

// Replace comments with spaces (keeping line breaks) so notes like "44px" don't count.
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\/|(?<![:'"])\/\/.*$/gm, (c) => c.replace(/[^\n]/g, ' '))

const lineOf = (text, index) => text.slice(0, index).split('\n').length

// Split CSS text on `mark` (";" between declarations, ":" after a property) — but never inside quotes or brackets:
// a picture written into the CSS, url("data:image/svg+xml;utf8,<svg xmlns='http://…'>"), is ONE value (0.33.3, F135).
function splitOutside(text, mark) {
  const parts = []
  let depth = 0, quote = '', start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === mark && depth === 0) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts
}

// A CSS value without what's inside url(…) and quotes: that's a picture or text, not a style value
// (an SVG's fill='#fff' is the picture's own colour)
// (the last branch leaves out quotes, so a broken url( full of "" can't make the pattern try every split — review)
const cssStyleValue = (value) => value.replace(/url\((?:"[^"]*"|'[^']*'|[^)"'])*\)/g, 'url()').replace(/"[^"]*"|'[^']*'/g, '""')

function valueProblems(value) {
  const found = []
  if (/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/.test(value)) found.push('raw colour — use a colour name like var(--primary)')
  if (/\d(\.\d+)?px\b/.test(value)) found.push('px size — use a gap name or rem')
  for (const [, name] of value.matchAll(/var\(--([\w-]+)/g)) {
    if (!allVariableNames.includes(name) && !name.startsWith('kit-')) found.push(`unknown style name --${name}`)
  }
  return found
}

function checkCss(text) {
  const problems = []
  // Each innermost "selector { declarations }" block
  for (const rule of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim()
    let offset = rule.index + rule[1].length + 1
    for (const decl of splitOutside(rule[2], ';')) {
      const [property = '', ...rest] = splitOutside(decl, ':')
      const prop = property.trim(), value = rest.join(':').trim()
      const at = lineOf(text, offset + decl.search(/\S|$/))
      offset += decl.length + 1
      if (!prop || prop.startsWith('--')) continue // CSS variable definitions are allowed
      const report = (message) => problems.push({ line: at, message, snippet: `${prop}: ${value}` })
      valueProblems(cssStyleValue(value)).forEach(report)
      if (/^font(-family)?$/.test(prop) && !/^(var\(|inherit)/.test(value)) report('font name — use var(--font-body) or var(--font-display)')
      if (prop === 'position' && /absolute|fixed/.test(value) && !/\.kit-(screen|overlay|layer|hud-dock)\b/.test(selector)) report('position:absolute/fixed — only Screen slots (and the stack\'s overlay / layers) may do this')
    }
  }
  return problems
}

function checkScript(text) {
  const problems = []
  text.split('\n').forEach((line, i) => {
    const report = (message) => problems.push({ line: i + 1, message, snippet: line.trim() })
    valueProblems(line).forEach(report)
    if (/fontFamily/.test(line)) report('font name — use var(--font-body) or var(--font-display)')
    if (/position:\s*['"](absolute|fixed)/.test(line)) report('position:absolute/fixed — only Screen slots may do this')
  })
  // Inline styles: only style={{ '--name': value }} is allowed
  for (const m of text.matchAll(/style=\{(\{[^}]*\})?/g)) {
    const keys = m[1] ? [...m[1].matchAll(/([\w'"-]+)\s*:/g)].map((k) => k[1]) : ['(not an object)']
    if (keys.some((k) => !/^['"]--/.test(k))) {
      problems.push({ line: lineOf(text, m.index), message: 'inline style — only setting CSS variables is allowed', snippet: m[0] })
    }
  }
  return problems
}

// Check one file's text. Returns [{ line, message, snippet }].
export function checkSource(path, text) {
  if (EXEMPT.some((rule) => rule.test(path))) return []
  const clean = stripComments(text)
  if (path.endsWith('.css')) return checkCss(clean)
  if (/\.(tsx?|jsx?)$/.test(path)) return checkScript(clean)
  return []
}

// Game CSS that restyles kit parts: rules whose selector names a .kit-… class. Returns [{ line, message, snippet }].
export function findKitRestyles(path, text) {
  if (/(^|[\\/])kit[\\/]/.test(path) ||!path.endsWith('.css')) return [] // the kit's own CSS may style itself
  const clean = stripComments(text)
  const warnings = []
  for (const rule of clean.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const kitClasses = [...new Set(rule[1].match(/\.kit-[\w-]+/g) ?? [])]
    if (!kitClasses.length) continue
    const properties = splitOutside(rule[2], ';').map((d) => splitOutside(d, ':')[0].trim()).filter(Boolean)
    if (properties.every((p) => p.startsWith('--'))) continue // only sets CSS variables
    const selector = rule[1].trim()
    const line = lineOf(clean, rule.index + rule[1].search(/\S/))
    warnings.push({ line, message: `restyles kit part ${kitClasses.join(' ')} — change the style file or a kit option instead`, snippet: selector })
  }
  return warnings
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) return []
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

// Check every file in these folders, print each problem, and return how many there were.
// cssFolders: also warn about CSS in these folders that restyles kit parts (warnings don't count as problems).
export function checkFolders(folders, cssFolders = []) {
  const files = folders.flatMap(listFiles)
  let count = 0
  for (const file of files) {
    for (const p of checkSource(file, readFileSync(file, 'utf8'))) {
      count++
      console.log(`${relative('.', file)}:${p.line}  ${p.message}
    ${p.snippet}`)
    }
  }
  let warningCount = 0
  const cssFiles = cssFolders.flatMap(listFiles).filter((file) => file.endsWith('.css'))
  for (const file of cssFiles) {
    for (const w of findKitRestyles(file, readFileSync(file, 'utf8'))) {
      warningCount++
      console.log(`${relative('.', file)}:${w.line}  ⚠ ${w.message}
    ${w.snippet}`)
    }
  }
  console.log(count ? `
✗ ${count} rule problem(s) in UI code` : `✓ UI rules pass (${files.length} files checked)`)
  if (cssFolders.length) console.log(warningCount ? `⚠ ${warningCount} warning(s): game CSS restyling kit parts` : `✓ no game CSS restyles kit parts (${cssFiles.length} CSS files checked)`)
  return count
}

// Splits the command line into UI folders and, after --css, the folders whose CSS gets the kit-restyle warnings.
export function readArguments(args) {
  const split = args.indexOf('--css')
  if (split === -1) return { folders: args, cssFolders: [] }
  return { folders: args.slice(0, split), cssFolders: args.slice(split + 1) }
}

// Run from the command line
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { folders, cssFolders } = readArguments(process.argv.slice(2))
  process.exit(checkFolders(folders.length ? folders : [dirname(fileURLToPath(import.meta.url))], cssFolders) ? 1 : 0)
}

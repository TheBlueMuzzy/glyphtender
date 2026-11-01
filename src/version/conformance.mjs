// THE VERSION MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Version": one source (version.json, which /save bumps), one format ("vX.Y.Z.B"), the same
// places in every game:
//   - the build reads version.json: versionPlugin() in vite.config (bakes the version in + the app-version meta tag)
//   - the main-menu footer and the bottom of Settings show versionLabel (UI kit: <MainMenu version> + <Settings version>;
//     a screen the game draws itself: data-version-spot="main-menu" / "settings" on the element showing versionLabel)
//   - nothing else in the game reads version.json or builds its own version words (one format everywhere)
//   - the Dev Kit adapter stamps versionLabel on snapshots and bug files
//   - an e2e script calls checkVersion(page), so no test runs against a stale build or a cached service worker
//   - (browser) the page's <meta name="app-version"> equals version.json
import { checkVersion, expectedVersion } from './e2e.mjs'
import { readAppVersion } from './versionFile.mjs'

export const title = 'Version'

export const CHECKS = {
  plugin: 'the build reads version.json (versionPlugin in vite.config)',
  shown: 'the main menu and Settings show the version (version={versionLabel})',
  oneSource: 'only the version module reads version.json (one format everywhere)',
  devkit: 'the Dev Kit stamps the same version (adapter version: versionLabel)',
  e2e: 'an e2e script refuses a stale build (checkVersion)',
  page: 'the page carries the version version.json says (<meta name="app-version">)',
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
/** A line that reads version.json: `… from '../version.json'` (also the last line of an import split over lines) or a
 *  bare `import '../version.json'`. The installer uses the same pattern. */
export const READS_VERSION_FILE = /\bfrom\s*['"][^'"]*version\.json['"]|^\s*import\s*['"][^'"]*version\.json['"]/m
const IMPORT_FILE = READS_VERSION_FILE
/** Where e2e scripts live and what they're written in — check:framework and the installer look in the same places. */
export const E2E_DIRS = ['e2e', 'tests', 'scripts']
export const E2E_EXTS = /\.(m?[jt]sx?)$/
const FROM_MODULE = /from\s*['"][^'"]*\/version(\/index(\.ts)?)?['"]/

/** Comments out, so a how-to comment never counts as wiring (strings stay). */
export function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Every <Tag …> opening tag in the code, as its text (braces and => inside props are skipped over). */
export function openingTags(text, tag) {
  const out = []
  const start = new RegExp(`<${tag}(?![\\w$.])`, 'g')
  let m
  while ((m = start.exec(text))) {
    // A JSX tag never follows a name, ) or ] — that's a TypeScript type: useState<Settings>(…), Partial<Settings>
    if (m.index > 0 && /[\w$)\]]/.test(text[m.index - 1])) continue
    let depth = 0
    let i = m.index + m[0].length
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break
    }
    out.push(text.slice(m.index, i + 1))
  }
  return out
}

/** The value of a prop in an opening tag: version={versionLabel} → "versionLabel", version="v1" → '"v1"', or null. */
export function propValue(tagText, prop) {
  const m = tagText.match(new RegExp(`\\s${prop}\\s*=\\s*(?=[{"'])`))
  if (!m) return null
  const from = m.index + m[0].length
  if (tagText[from] !== '{') return tagText.slice(from).match(/^("[^"]*"|'[^']*')/)?.[1] ?? null
  let depth = 0
  for (let i = from; i < tagText.length; i++) {
    if (tagText[i] === '{') depth++
    else if (tagText[i] === '}' && --depth === 0) return tagText.slice(from + 1, i).trim()
  }
  return null
}

/** The adapter's `version:` values (every one — an earlier nested `meta: { version: 2 }` mustn't hide the real one):
 *  ok when one of them is versionLabel. */
export function adapterVersion(text) {
  // each value up to its , } or line end — so `meta: { version: 2 }, version: versionLabel` on one line is two values
  const values = [...withoutComments(text).matchAll(/\bversion\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim())
  return { ok: values.some((v) => /^versionLabel\b/.test(v)), values }
}

/** Where a tag is used, and whether each use passes versionLabel as `version`: [{ where, value }]. */
export function versionProps(files, tag) {
  const out = []
  for (const { path, text } of files) {
    const code = withoutComments(text)
    for (const t of openingTags(code, tag)) {
      const line = code.slice(0, code.indexOf(t)).split('\n').length
      out.push({ where: `${path}:${line}`, value: propValue(t, 'version') })
    }
  }
  return out
}

/** Files that draw a version spot themselves (a game's own main menu, e.g. console art): an element marked
 *  data-version-spot="<spot>" in a file that shows versionLabel from the version module → their paths. */
export function ownSpots(files, spot) {
  const marked = new RegExp(`\\bdata-version-spot\\s*=\\s*(["'])${spot}\\1|\\bdata-version-spot\\s*=\\s*\\{\\s*(["'])${spot}\\2\\s*\\}`)
  const shows = (code) => /\bversionLabel\b/.test(code.replace(/^\s*import\b[^;]*?\bfrom\s*['"][^'"]*['"]/gm, '')) // not just imported
  return files
    .filter(({ text }) => FROM_MODULE.test(text) && marked.test(withoutComments(text)) && shows(withoutComments(text)))
    .map(({ path }) => path)
}

export async function check(t) {
  // 1. versionPlugin in vite.config, and a version.json it can read
  {
    const name = CHECKS.plugin
    const config = VITE_CONFIGS.find((f) => t.exists(f))
    const problems = []
    if (!config) problems.push('The game has no vite.config.ts.')
    else if (!/\bversionPlugin\s*\(/.test(withoutComments(t.read(config)))) problems.push(`${config} doesn't use versionPlugin().`)
    let version = null
    try { version = readAppVersion(t.root) } catch (e) { problems.push(e.message) }
    if (problems.length) {
      t.fail(name, problems, `${config ?? 'vite.config.ts'}: import { versionPlugin } from './src/version/vitePlugin.mjs'   and add versionPlugin() to plugins: [ … ]. version.json: { "version": "0.1.0", "build": 0 } (/save bumps the build).`)
    } else t.pass(name, `${config} · version.json = v${version}`)
  }

  const code = t.gameCode()
  // 2. the main-menu footer and the bottom of Settings
  {
    const name = CHECKS.shown
    if (!t.has('ui')) {
      const uses = code.filter((f) => /\bversionLabel\b/.test(withoutComments(f.text)) && FROM_MODULE.test(f.text))
      if (uses.length) t.pass(name, `no UI kit — versionLabel shown from ${uses.map((f) => f.path).join(', ')}`)
      else t.fail(name, ['Nothing in the game shows versionLabel (the game has no UI kit, so its own menu must).'], 'Show versionLabel (import { versionLabel } from \'../version\') on the main menu and in Settings.')
    } else {
      const problems = []
      const own = []
      for (const [tag, place, spot] of [['MainMenu', 'the main-menu footer', 'main-menu'], ['Settings', 'the bottom of Settings', 'settings']]) {
        const uses = versionProps(code, tag)
        const mine = ownSpots(code, spot)
        if (!uses.length && mine.length) { own.push(`${spot} in ${mine.join(', ')}`); continue } // the game draws this screen itself
        if (!uses.length) problems.push(`No <${tag}> in the game's code, so ${place} can't show the version (a screen the game draws itself: data-version-spot="${spot}" on the element showing versionLabel).`)
        for (const u of uses) {
          if (u.value === null) problems.push(`${u.where}  <${tag}> has no version prop — ${place} shows nothing.`)
          else if (!/\bversionLabel\b/.test(u.value)) problems.push(`${u.where}  <${tag} version=${u.value}> — not versionLabel, so it can say something else than the other places.`)
        }
      }
      if (problems.length) t.fail(name, problems, 'import { versionLabel } from \'../version\'   then   <MainMenu version={versionLabel} …>   and   <Settings version={versionLabel} …> (UI kit 0.24.0: one line at the bottom of every tab).')
      else t.pass(name, own.length ? `versionLabel shown — the game's own spots: ${own.join(' · ')}` : 'MainMenu + Settings get versionLabel')
    }
  }

  // 3. nothing else reads version.json
  {
    const name = CHECKS.oneSource
    const adapter = t.adapterFile()
    const files = [...code, ...(adapter && t.exists(adapter) ? [{ path: adapter, text: t.read(adapter) }] : [])]
    const own = t.linesMatching(files, IMPORT_FILE)
    if (own.length) t.fail(name, ['The game reads version.json itself (its own words for the version, maybe without the build or the v):', ...own.map((l) => '  ' + l)],
      'Use versionLabel from the version module (import { versionLabel } from \'../version\') instead — it already reads version.json, with the build number and the v.')
    else t.pass(name, 'version.json is read only by the version module')
  }

  // 4. the Dev Kit adapter
  {
    const name = CHECKS.devkit
    const adapter = t.adapterFile()
    if (!t.has('devkit') || !adapter || !t.exists(adapter)) t.skip(name, 'no Dev Kit adapter in this game')
    else {
      const { ok } = adapterVersion(t.read(adapter))
      const value = withoutComments(t.read(adapter)).match(/\bversion\s*:\s*(.+?)\s*,?\s*$/m)?.[1]?.trim() // shown whole, to the end of its line
      if (ok) t.pass(name, `${adapter}: version: versionLabel`)
      else t.fail(name, [value ? `${adapter}: version: ${value} — not versionLabel, so snapshots and bug files can say something else than the menu.` : `${adapter} has no version.`],
        `${adapter}: import { versionLabel } from '../version'   then   version: versionLabel,`)
    }
  }

  // 5. an e2e script calls checkVersion
  {
    const name = CHECKS.e2e
    const scripts = t.files({ dirs: E2E_DIRS, exts: E2E_EXTS })
    const callers = scripts.filter((f) => /\bcheckVersion\s*\(/.test(withoutComments(f.text)))
    if (callers.length) t.pass(name, callers.map((f) => f.path).join(', '))
    else t.fail(name, ['No e2e script calls checkVersion(page), so a test can run against a stale build or a cached service worker without saying so.'],
      'In the e2e script every test opens the game with (or each one): import { checkVersion } from \'../src/version/e2e.mjs\'   then, after page.goto(…):   await checkVersion(page)')
  }

  // 6. (browser) the page's meta tag = version.json
  {
    const name = CHECKS.page
    if (t.staticOnly) return t.skip(name, 'browser check (not with --static)')
    let page
    try {
      const want = expectedVersion(t.root) // (VERSION_BUILD, if set, reaches the dev server's plugin the same way)
      page = await t.page({ width: 1280, height: 800 })
      const shown = await checkVersion(page, want)
      t.pass(name, shown)
    } catch (e) {
      t.fail(name, [e.message], 'Add versionPlugin() to vite.config (it puts the tag in), then restart the dev server.')
    } finally { await page?.close() }
  }
}

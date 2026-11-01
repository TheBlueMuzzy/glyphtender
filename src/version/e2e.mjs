// THE VERSION MODULE'S E2E HELPER — plain Node, for the game's Playwright scripts (e2e/*.mjs):
//   import { checkVersion } from '../src/version/e2e.mjs'
//   await page.goto(url)
//   await checkVersion(page)       // the page is the build version.json says, or the test stops right here
// Why: a test that runs against an old build (a dev server started before /save bumped the build, a stale dist/, a
// service worker's cached copy) fails later in strange ways. This stops it at the door, by name.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { labelOf, readAppVersion, versionInHtml } from './versionFile.mjs'

export { versionInHtml } from './versionFile.mjs'
export const META_SELECTOR = 'meta[name="app-version"]'

/** What the page should say: "vX.Y.Z.B" from the game folder's version.json (+ VERSION_BUILD, as in the build). */
export const expectedVersion = (gameDir = process.cwd(), env = process.env) => labelOf(readAppVersion(gameDir, env))

/** The plain message for a page that isn't the build version.json says. */
export const staleMessage = (shown, want) => shown
  ? `the page is version ${shown}, but version.json says ${want} — a stale build or a cached service worker? (restart the dev server / rebuild, or clear the site's data)`
  : `the page has no <meta name="app-version"> — the build wasn't made with versionPlugin() (vite.config.ts), or this isn't the game's page (version.json says ${want})`

/**
 * The page's <meta name="app-version"> must equal version.json. Returns the version it shows; throws the plain
 * message otherwise. want = what it should say (default: expectedVersion() from the folder the test runs in).
 */
export async function checkVersion(page, want = expectedVersion()) {
  const meta = page.locator(META_SELECTOR)
  const shown = (await meta.count()) ? await meta.first().getAttribute('content', { timeout: 10_000 }) : null
  if (shown !== want) throw new Error(staleMessage(shown, want))
  return shown
}

/** For a deploy script: the version a build in dist/ carries ("vX.Y.Z.B"), or null. */
export function builtVersion(distDir = 'dist') {
  try { return versionInHtml(readFileSync(join(resolve(distDir), 'index.html'), 'utf8')) } catch { return null }
}

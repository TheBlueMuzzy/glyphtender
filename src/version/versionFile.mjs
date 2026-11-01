// THE GAME'S VERSION, READ FROM version.json — plain Node, shared by the Vite plugin (vitePlugin.mjs) and the e2e
// helper (e2e.mjs), so the build and the tests can never disagree about what "this version" is.
//   version.json: { "version": "X.Y.Z", "build": N, … }   (BMUZ versioning: /save bumps "build", /deliver "version")
//   → "X.Y.Z.B" (appVersion) → "vX.Y.Z.B" (the label every place shows — one format in every game)
// VERSION_BUILD=<n> in the environment overrides the build number for one build or test run (an update test makes a
// "next release" without touching version.json).
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const VERSION_FILE = 'version.json'
export const BUILD_ENV = 'VERSION_BUILD'

/** "0.11.0" + build 7 → "0.11.0.7" */
export function versionOf(file, buildOverride) {
  const where = `${VERSION_FILE}`
  if (!file || typeof file !== 'object') throw new Error(`${where} isn't a JSON object — it should look like { "version": "0.1.0", "build": 0 }`)
  if (typeof file.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(file.version)) {
    throw new Error(`${where} "version" should be three numbers like "0.1.0" (got ${JSON.stringify(file.version)})`)
  }
  const raw = buildOverride ?? file.build ?? 0
  const build = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : raw
  if (!Number.isInteger(build) || build < 0) {
    const from = buildOverride !== undefined ? `${BUILD_ENV}=${buildOverride}` : `${where} "build" (${JSON.stringify(file.build)})`
    throw new Error(`${from} should be a whole number like 12`)
  }
  return `${file.version}.${build}`
}

/** The game folder's version.json → "X.Y.Z.B" (the build number from VERSION_BUILD when it's set). */
export function readAppVersion(gameDir = process.cwd(), env = process.env) {
  const path = join(resolve(gameDir), VERSION_FILE)
  let text
  try { text = readFileSync(path, 'utf8') } catch {
    throw new Error(`${path} is missing — the version module reads the game's version from it: { "version": "0.1.0", "build": 0 }`)
  }
  let file
  try { file = JSON.parse(text) } catch (e) { throw new Error(`${path} isn't valid JSON (${e.message})`) }
  const override = env[BUILD_ENV]
  return versionOf(file, override === undefined || override === '' ? undefined : override)
}

/** "0.11.0.7" → "v0.11.0.7" (already "v…" stays as it is). */
export const labelOf = (version) => (/^v/i.test(version) ? version : `v${version}`)

/** The version a built page carries: <meta name="app-version" content="v…"> in its HTML → "v…" (or null). */
export function versionInHtml(html) {
  const tag = String(html).match(/<meta\b[^>]*\bname=["']app-version["'][^>]*>/i)?.[0]
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? null
}

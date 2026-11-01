// THE VERSION MODULE'S VITE PLUGIN — one line in the game's vite.config.ts:
//   import { versionPlugin } from './src/version/vitePlugin.mjs'
//   plugins: [react(), versionPlugin(), …]
// What it does, from version.json alone (versionFile.mjs):
//   - bakes the version into the code: import.meta.env.APP_VERSION = "X.Y.Z.B" (src/version's appVersion / versionLabel
//     read it — the main-menu footer, the bottom of Settings, the Dev Kit's snapshots and bug files)
//   - puts <meta name="app-version" content="vX.Y.Z.B"> in the page's <head> — what tests read (e2e.mjs checkVersion
//     refuses a stale build or a cached service worker) and what a deploy script can print (versionInHtml)
//   - dev server: when /save bumps version.json, the server restarts, so the page never shows the old number
// VERSION_BUILD=<n> overrides the build number for one build (an update test's "next release").
import { join, resolve } from 'node:path'
import { VERSION_FILE, labelOf, readAppVersion } from './versionFile.mjs'

export const META_NAME = 'app-version'
export const DEFINE_KEY = 'import.meta.env.APP_VERSION'

/** @param {{ root?: string }} [options] root = the folder with version.json (default: Vite's root) */
export function versionPlugin(options = {}) {
  let version = null
  let file = null
  return {
    name: 'framework-version',
    config(config) {
      const root = resolve(options.root ?? config.root ?? process.cwd())
      file = join(root, VERSION_FILE)
      version = readAppVersion(root)
      // define: the dev server + builds. test.env: Vitest gives tests its own import.meta.env and skips define's
      // import.meta.env.* keys (found in the F102 proof: the game's tests saw "dev") — so the tests get it from there.
      return { define: { [DEFINE_KEY]: JSON.stringify(version) }, test: { env: { APP_VERSION: version } } }
    },
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: META_NAME, content: labelOf(version) }, injectTo: 'head' }]
    },
    configureServer(server) {
      server.watcher.add(file)
      server.watcher.on('change', (changed) => {
        if (resolve(changed) === file) server.restart()
      })
    },
  }
}

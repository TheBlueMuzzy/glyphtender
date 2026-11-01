// THE CRASHES MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Crashes":
//   - the game starts catching its errors (startCrashes) with its content/crashes.json
//   - the player can turn it off: the "Send crash reports" switch is in Settings and reaches the module (applyCrashSetting / setOn)
//   - a React game hands React's errors over (createRoot(…, crashRootOptions())), so a broken screen says "Something broke"
//   - no source map ships to players: the build keeps them out of dist/ (crashesMaps() in vite.config) and none sit in public/
//   - (a note, never a failure) where reports go: content/crashes.json client.url — empty until going live (Muzzy's call)
export const title = 'Crashes'

export const CHECKS = {
  started: 'the game catches its errors (startCrashes)',
  switch: 'the player can turn crash reports off (Settings)',
  react: 'React errors reach the module (createRoot with crashRootOptions)',
  maps: 'no source map ships to players',
  server: 'where reports go',
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
const SHIPPED = ['public', 'dist']

/** Comments out, so a how-to comment never counts as wiring (strings stay). */
export function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const calls = (name, text) => new RegExp(`\\b${name}\\s*\\(`).test(withoutComments(text))

export async function check(t) {
  const code = t.gameCode().filter((f) => !f.path.startsWith(`${t.rel}/`))
  const callers = (name) => code.filter((f) => calls(name, f.text)).map((f) => f.path)
  const settings = t.json('content/crashes.json')

  {
    const name = CHECKS.started
    const where = callers('startCrashes')
    const problems = []
    if (!settings) problems.push('content/crashes.json is missing (or isn\'t valid JSON) — the installer gives a starter once.')
    if (!where.length) problems.push('Nothing in the game\'s code calls startCrashes(…).')
    if (problems.length) t.fail(name, problems, "At start-up (src/main.tsx): import crashesJson from '../content/crashes.json'   import { startCrashes, readCrashesConfig } from './crashes'   then   startCrashes({ config: readCrashesConfig(crashesJson), version: versionLabel })")
    else t.pass(name, where.join(', '))
  }

  {
    const name = CHECKS.switch
    const settingsJson = t.json('content/ui/settings.json')
    const rows = (settingsJson?.tabs ?? []).flatMap((tab) => tab?.rows ?? [])
    const inFile = rows.some((row) => row?.id === 'crashReports' && row.on !== false)
    const inCode = code.some((f) => /\bCRASH_SETTINGS_ROWS\b/.test(withoutComments(f.text)))
    const applied = [...callers('applyCrashSetting'), ...callers('setOn')]
    const problems = []
    if (!inFile && !inCode) problems.push('Settings has no "Send crash reports" switch (no crashReports row in content/ui/settings.json, no CRASH_SETTINGS_ROWS in the code).')
    if (!applied.length) problems.push('Nothing passes the Settings value to the module (applyCrashSetting(values) or setOn(on)) — the switch would do nothing.')
    if (problems.length) t.fail(name, problems, "Paste the crashReports toggle (CRASH_SETTINGS_ROWS in src/crashes/settingsRow.ts) into a tab's rows in content/ui/settings.json, then call applyCrashSetting(values) at start-up (with loadSettings(…)) and in <Settings onChange>. The privacy page says how to turn it off.")
    else t.pass(name, `${inFile ? 'content/ui/settings.json' : 'CRASH_SETTINGS_ROWS'} · ${[...new Set(applied)].join(', ')}`)
  }

  {
    const name = CHECKS.react
    const roots = callers('createRoot')
    if (!roots.length) t.skip(name, 'no createRoot in the game\'s code (not a React game, or it renders elsewhere)')
    else {
      const handed = code.filter((f) => roots.includes(f.path) && calls('crashRootOptions', f.text)).map((f) => f.path)
      if (handed.length) t.pass(name, handed.join(', '))
      else t.fail(name, [`${roots.join(', ')} calls createRoot without crashRootOptions() — a React error would leave a blank page and never be reported.`],
        "import { crashRootOptions } from './crashes/ui/crashRoot'   then   createRoot(element, crashRootOptions())")
    }
  }

  {
    const name = CHECKS.maps
    const config = VITE_CONFIGS.find((f) => t.exists(f))
    const shipped = t.files({ dirs: SHIPPED, exts: /\.map$/ }).map((f) => f.path)
    const problems = []
    if (shipped.length) problems.push(`Source maps where players can download them (anyone could read the game's original code): ${shipped.slice(0, 8).join(', ')}${shipped.length > 8 ? ` and ${shipped.length - 8} more` : ''}`)
    if (!config) problems.push('No vite.config — the build can\'t keep its maps out of dist/.')
    else if (!calls('crashesMaps', t.read(config))) problems.push(`${config} doesn't use crashesMaps() — without it a crash's file lines can't be read back (no maps), or the maps ship with the game.`)
    const wired = Boolean(config) && calls('crashesMaps', t.read(config))
    if (problems.length) t.fail(name, problems, wired
      ? 'Delete the .map files named (a map in public/ is copied into every build), then build again — crashesMaps() moves the build\'s own maps out after every other plugin; one still left means a plugin wrote it later still (name it in the sprint notes).'
      : `${config ?? 'vite.config.ts'}: import { crashesMaps } from './src/crashes/vitePlugin.mjs'   and add crashesMaps() to plugins: [ … ] — it builds hidden maps and moves them to releases/<version>/maps/. Delete any .map in public/ or dist/, then build again.`)
    else t.pass(name, `${config}: crashesMaps() — maps go to releases/<version>/maps/`)
  }

  {
    const name = CHECKS.server
    const url = typeof settings?.client?.url === 'string' ? settings.client.url : ''
    if (!url) t.skip(name, 'not live yet — content/crashes.json client.url is empty, so errors are caught but not sent (going live is Muzzy\'s call: npm run crashes:deploy)')
    else if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?/.test(url)) t.fail(name, [`content/crashes.json client.url is "${url}" — reports must go over https.`], 'Use the https address npm run crashes:deploy printed.')
    else t.pass(name, url)
  }
}

// THE UI KIT'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "UI kit", tested on the REAL game:
//   Code:    the kit's rule checker (check-ui.mjs) passes on the game's UI code — words, looks, sizes and layout from
//            the kit's names, page-wide game CSS in @layer game-base
//   Browser: at every size (phones both ways, a short landscape, laptop, desktop, HD) — on the first screen and in
//            live play (the Dev Kit adapter's conformance.startPlay): nothing overlaps, nothing is clipped or wider than
//            the screen, every tap target is 44 px, no focus ring without the keyboard (uiProblems.mjs)
export const title = 'UI kit'

export const SIZES = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'small phone', width: 360, height: 780, mobile: true },
  { name: 'phone on its side', width: 844, height: 390, mobile: true },
  { name: 'short landscape', width: 768, height: 343, mobile: true },
  { name: 'laptop', width: 1100, height: 800, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'HD', width: 1920, height: 1080, mobile: false },
]

const KINDS = [
  { kind: 'overlap', name: 'nothing overlaps', fix: 'Give each part its own slot (Screen slots, Row, Stack, the HUD slots) instead of placing it on top of another; an overlap that\'s on purpose → data-ui-check="skip" on it.' },
  { kind: 'clipped', also: ['wider'], name: 'nothing is clipped or wider than the screen', fix: 'Leave room inside scroll areas and panels (padding, not a tighter box); let text wrap or shrink (the kit\'s text sizes), and keep the page inside the screen width.' },
  { kind: 'small', name: 'every tap target is at least 44 px', fix: 'Use the kit\'s Button / IconButton (they\'re 44 px) or give the control min-width / min-height of the kit\'s tap size.' },
  { kind: 'focus', name: 'no focus ring without the keyboard', fix: 'Focus rings only on :focus-visible (the kit\'s controls do this) — don\'t call focus() on a control at start-up without { focusVisible: false }.' },
]

/** problems per screen ("phone · menu" → ["small: 30×30 px — "Close"", …]) → one row per kind: each problem + where. */
export function groupProblems(found) {
  const byKind = {}
  for (const [where, problems] of Object.entries(found)) {
    for (const p of problems) {
      const kind = p.slice(0, p.indexOf(':'))
      const text = p.slice(p.indexOf(':') + 1).trim()
      const k = KINDS.find((x) => x.kind === kind || x.also?.includes(kind))?.kind ?? kind
      byKind[k] ??= new Map()
      byKind[k].set(text, [...(byKind[k].get(text) ?? []), where])
    }
  }
  return byKind
}

/** ["phone 390×844 · in play", …] → "in play, every size" when it showed at all sizes of one phase (or of both). */
export function whereText(where, screens) {
  if (where.length === screens) return 'every screen, every size'
  const phases = [...new Set(where.map((w) => w.split(' · ')[1]))]
  if (phases.length === 1 && where.length === SIZES.length) return `${phases[0]}, every size`
  return where.join('; ')
}

/** The folders the game's own check:ui script gives check-ui.mjs — up to the next command (&&, ;, |) — or the default. */
export function checkUiArgs(script = '') {
  if (!script.includes('check-ui.mjs')) return ['src/ui', '--css', 'src']
  return script.split('check-ui.mjs')[1].split(/&&|\|\||;|\|/)[0].trim().split(/\s+/).filter(Boolean)
}

// ---- credits (PROJECT-FILES "content/credits.json") ----
// Every font / picture / sound / model the game ships is listed in content/credits.json (our own work too, as 🟢 "own
// work", so the check can tell it apart from a forgotten download); nothing 🔴 ships; every 🟡 has its credit line,
// and the game shows the file on its Credits screen (the kit's Credits reads it).
export const ASSET_EXTS = /\.(png|jpe?g|webp|gif|svg|avif|ico|mp3|ogg|wav|m4a|flac|webm|mp4|woff2?|ttf|otf|glb|gltf|fbx|obj|hdr|ktx2)$/i
const NOT_SHIPPED = ['node_modules', 'dist', 'e2e-shots', 'test-results', '.planning', '.claude', 'src/devkit', 'src/devkit-game', 'e2e', 'tests', 'scripts']

/** The asset files the game ships (public/, src/, content/), as "public/art/a.png". */
export function listAssets(root, readdir, dirs = ['public', 'src', 'content']) {
  const out = []
  const walk = (rel) => {
    let entries
    try { entries = readdir(rel) } catch { return }
    for (const entry of entries) {
      const path = `${rel}/${entry.name}`
      if (NOT_SHIPPED.some((s) => path === s || path.startsWith(`${s}/`))) continue
      if (entry.isDirectory()) walk(path)
      else if (ASSET_EXTS.test(entry.name)) out.push(path)
    }
  }
  for (const d of dirs) walk(d)
  return out
}

/** What's wrong with the credits: { unlisted: [paths], red: [lines], noCredit: [lines] } (empty lists = fine). */
export function creditProblems(assets, entries) {
  const listed = (path) => entries.some((e) => (e.paths ?? []).some((p) => p === path || (p.endsWith('/') && path.startsWith(p))))
  const name = (e) => `${e.source ?? '?'} (${(e.paths ?? []).join(', ')})`
  return {
    unlisted: assets.filter((a) => !listed(a)),
    red: entries.filter((e) => e.light === '🔴').map(name),
    noCredit: entries.filter((e) => e.light === '🟡' && !String(e.credit ?? '').trim()).map(name),
  }
}

export async function checkCreditsForTest(t) { return checkCredits(t) }
async function checkCredits(t) {
  const { readdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const assets = listAssets(t.root, (rel) => readdirSync(join(t.root, rel), { withFileTypes: true }))
  const entries = t.json('content/credits.json')
  if (!entries) {
    if (!assets.length) return t.pass('every asset is credited', 'no art, sound or font files')
    return t.fail('every asset is credited', [`content/credits.json is missing (or not valid JSON) — ${assets.length} asset file(s) to list, e.g. ${assets.slice(0, 3).join(', ')}`],
      'Make content/credits.json (format: ~/.claude/config/bmuz/PROJECT-FILES.md) and list every file — our own work too, as 🟢 "own work".')
  }
  const { unlisted, red, noCredit } = creditProblems(assets, Array.isArray(entries) ? entries : [])
  if (unlisted.length) t.fail('every asset is credited', [...unlisted.slice(0, 12), ...(unlisted.length > 12 ? [`…and ${unlisted.length - 12} more`] : [])],
    'List each file (or its folder, ending in /) in content/credits.json with source, author, licence and light (indie-toolkit.md) — our own work too, as 🟢 "own work".')
  else t.pass('every asset is credited', `${assets.length} files`)
  if (red.length) t.fail('nothing 🔴 ships', red, 'A 🔴 licence can\'t ship: swap the asset for one we may use (placeholder ladder in indie-toolkit.md).')
  else t.pass('nothing 🔴 ships')
  const yellow = (Array.isArray(entries) ? entries : []).filter((e) => e.light === '🟡')
  if (!yellow.length) return t.pass('every 🟡 credit is shown', 'none needed')
  const shown = t.gameCode().some((f) => /content\/credits\.json['"]/.test(f.text))
  const problems = [...noCredit.map((n) => `no "credit" line: ${n}`), ...(shown ? [] : ['no game code reads content/credits.json, so the Credits screen can\'t show the 🟡 lines'])]
  if (problems.length) t.fail('every 🟡 credit is shown', problems, 'Give each 🟡 entry its "credit" text, and pass the file to the kit\'s Credits screen: import credits from \'../../content/credits.json\' → <Credits assets={credits} />.')
  else t.pass('every 🟡 credit is shown', `${yellow.length} on the Credits screen`)
}

// ---- Settings rows (0.20.0) ----
// Every row that's switched on in content/ui/settings.json must DO something: a Settings screen full of switches that
// change nothing is worse than a short one (Glyphtender once shipped 12 dead rows). A row counts as read when the game's
// own code (not the framework's copies, not tests) names its id in a read:
//   values.tips · values?.tips · settings['tips'] · id === 'resetTips' · case 'credits': · info={{ version: … }}
//   · const { aiSpeed } = values · hide={['fullscreenTip']}
// Not counted: comments, the JSON files themselves (settings.json, en.json labels), and words objects imported from a
// .json file (text.tutorial.tips is a sentence, not the Tips setting).
// Rows the kit or the audio module handle are skipped: headings · text size + reduce motion (the kit applies them) ·
// link rows (the kit opens them — but a placeholder example.com address fails) · info rows with their own text (except
// version, whose text must come from the game: info={{ version }}) · the Audio rows once the game passes the values to
// the audio module (applyAudioSettings / useAudioSettings / readAudioSettings).
export const SETTINGS_FILE = 'content/ui/settings.json'
export const SETTINGS_CHECK = 'every Settings row that\'s switched on is read by the game'
export const KIT_ROWS = ['textSize', 'reduceMotion']
export const AUDIO_ROWS = ['masterVolume', 'musicVolume', 'ambienceVolume', 'sfxVolume', 'uiVolume', 'sound', 'muteInBackground', 'mono']
const AUDIO_WIRING = /\b(applyAudioSettings|useAudioSettings|readAudioSettings)\s*\(/
const VALUE_TYPES = ['slider', 'toggle', 'selector', 'stepper']

/** The rows a player can see: switched on ("on" isn't false) and not headings — [{ id, type, label, tab, url, default }]. */
export function liveRows(schema) {
  const tabs = Array.isArray(schema?.tabs) ? schema.tabs : []
  return tabs.flatMap((tab) => (Array.isArray(tab.rows) ? tab.rows : [])
    .filter((row) => row && typeof row.id === 'string' && row.on !== false && row.type !== 'heading')
    .map((row) => ({ ...row, tab: tab.label ?? tab.id })))
}

/** Code without its comments (a // inside 'https://…' stays). */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does this one file read the row id? (see the list above) */
export function fileReadsRow(text, id) {
  const code = stripComments(text)
  const name = escapeRe(id)
  if (new RegExp(`(['"\`])${name}\\1`).test(code)) return true // 'tips' — compared, a key, a case, a hide list
  if (new RegExp(`[{,]\\s*${name}\\s*[:,}=]`).test(code)) return true // { version: … } · const { aiSpeed } = values
  // values.tips / values?.tips — but not text.tutorial.tips when `text` came from a .json file
  const fromJson = new Set([...code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]+\.json['"]/g)].map((m) => m[1]))
  for (const m of code.matchAll(new RegExp(`(?<!\\.)\\??\\.${name}(?![\\w$])`, 'g'))) {
    const before = code.slice(0, m.index)
    const root = before.match(/([A-Za-z_$][\w$]*)(?:\??\.[A-Za-z_$][\w$]*)*\??$/)?.[1] // the start of the chain: text in text.tutorial
    if (!root || !fromJson.has(root)) return true
  }
  return false
}

/** Does this file give an info row its text? <Settings info={{ version: … }} /> (or an info: { … } object passed on).
 *  Stricter than fileReadsRow: ids like "version" show up all over a game's code for other reasons. */
export function fileFeedsInfo(text, id) {
  return new RegExp(`\\binfo\\s*[=:]\\s*\\{\\{?[^}]*?(?<![\\w$.])${escapeRe(id)}(?![\\w$])`).test(stripComments(text))
}

/** Which rows nothing reads → { dead: [rows], placeholder: [rows], read, kit } (code = [{ path, text }]). */
export function settingsProblems(schema, code) {
  const audioWired = code.some((f) => AUDIO_WIRING.test(stripComments(f.text)))
  const dead = []
  const placeholder = []
  let read = 0
  let kit = 0
  for (const row of liveRows(schema)) {
    if (row.type === 'link') {
      if (!/^(https?:|mailto:)/i.test(row.url ?? '') || /\bexample\.(com|org|net)\b/i.test(row.url ?? '')) placeholder.push(row)
      else kit++
      continue
    }
    const handled = KIT_ROWS.includes(row.id)
      || (row.type === 'info' && row.id !== 'version' && String(row.default ?? '').trim() !== '')
      || (audioWired && AUDIO_ROWS.includes(row.id))
    if (handled) { kit++; continue }
    const reads = row.type === 'info' ? fileFeedsInfo : fileReadsRow // an info row's text only comes in through info={{ … }}
    if (code.some((f) => reads(f.text, row.id))) read++
    else dead.push(row)
  }
  return { dead, placeholder, read, kit }
}

/** Where to wire a dead row, by its type — plain words for the failure. */
function wireHint(row) {
  if (VALUE_TYPES.includes(row.type)) return `read values.${row.id} in the Settings onChange (and loadSettings(…) at start-up)`
  if (row.type === 'button' || row.type === 'destructive') return `handle it in the Settings onAction: if (id === '${row.id}') …`
  if (row.type === 'info') return `give its text: <Settings info={{ ${row.id}: … }} />`
  return 'read its id where it should act'
}

export function checkSettingsForTest(t) { return checkSettings(t) }
function checkSettings(t) {
  const schema = t.json(SETTINGS_FILE)
  if (!schema) return t.pass(SETTINGS_CHECK, `no ${SETTINGS_FILE}`)
  const { dead, placeholder, read, kit } = settingsProblems(schema, t.gameCode())
  const where = (row) => `${row.tab} → ${row.label ?? row.id} ("${row.id}", a ${row.type})`
  const problems = [
    ...dead.map((row) => `${where(row)}: nothing in the game reads it — ${wireHint(row)}`),
    ...placeholder.map((row) => `${where(row)}: opens ${row.url ? `a placeholder address (${row.url})` : 'no address'} — give it the real url`),
  ]
  if (problems.length) {
    return t.fail(SETTINGS_CHECK, problems,
      `Each row above shows in Settings but changes nothing. Wire it where the line says (the game's own code, not src/ui/kit), or switch it off with "on": false in ${SETTINGS_FILE} until it does something.`)
  }
  return t.pass(SETTINGS_CHECK, `${read + kit} rows on: ${read} read by the game, ${kit} handled by the kit / audio module`)
}

export async function check(t) {
  await checkCredits(t)
  checkSettings(t)

  // ---- code: the kit's rule checker ----
  {
    const name = 'the game\'s UI code keeps the kit\'s rules (check-ui)'
    const script = t.scripts()['check:ui'] ?? ''
    const args = checkUiArgs(script)
    const run = t.run('node', [`${t.rel}/check-ui.mjs`, ...args])
    if (run.code === 0) t.pass(name, `node ${t.rel}/check-ui.mjs ${args.join(' ')}`)
    else t.fail(name, run.out.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('✓')).slice(0, 15),
      'Each line names a file and the rule: use the kit\'s style names (var(--primary), gap names, Screen slots) instead of raw values.')
    if (!script) t.fail('check-ui runs in check:fast', ['package.json has no "check:ui" script, so the rules aren\'t checked on every change.'],
      `package.json "scripts": "check:ui": "node ${t.rel}/check-ui.mjs src/ui --css src"  — and add npm run check:ui to check:fast`)
  }

  if (t.staticOnly) return t.skip('the game at every size', '--static')

  // ---- browser: the real game at every size ----
  const { findProblems } = await import('./uiProblems.mjs')
  const found = {}
  let playReason = ''
  for (const size of SIZES) {
    const page = await t.page(size)
    try {
      const label = `${size.name} ${size.width}×${size.height}`
      await page.waitForTimeout(700) // entrances settle
      found[`${label} · first screen`] = [...page.errors.map((e) => `error: ${e}`), ...(await page.evaluate(findProblems, { screenWidth: size.width, checkFocus: true }))]
      if (playReason) continue
      playReason = await t.startPlay(page)
      if (playReason) continue
      await page.waitForTimeout(500)
      found[`${label} · in play`] = await page.evaluate(findProblems, { screenWidth: size.width, checkFocus: false })
    } finally {
      await page.close()
    }
  }
  const grouped = groupProblems(found)
  const screens = Object.keys(found).length
  for (const { kind, name, fix } of KINDS) {
    const list = grouped[kind]
    if (!list?.size) { t.pass(name, `${screens} screens, ${SIZES.length} sizes`); continue }
    const lines = [...list].map(([text, where]) => `${text}  [${whereText(where, screens)}]`)
    t.fail(name, lines.length > 12 ? [...lines.slice(0, 12), `…and ${lines.length - 12} more`] : lines, fix)
  }
  if (grouped.error?.size) t.fail('no errors in the console', [...grouped.error.keys()].slice(0, 8), 'Fix the errors above (they happened while the screens loaded).')
  if (playReason) t.needsPlay('the game at every size — in play', playReason)
}

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
// own code (not the framework's copies, not tests) names its id in a read (full list at fileReadsRow):
//   values.tips · values?.tips · settings['tips'] · const { aiSpeed } = values · id === 'resetTips' · case 'credits':
//   · info={{ version: … }} · useSetting('tips')
// Not counted: comments, the JSON files themselves (settings.json, en.json labels), and the id as a plain word anywhere
// else (text.tutorial.tips, assets.sound, { theme: 'dark' } — 0.20.1: common-word ids used to pass while dead).
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

// A slash starts a regex (not a division) after one of these, or after a word like return / typeof.
const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^'])
const REGEX_AFTER_WORDS = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await|delete|new|throw)$/

/** Code without its comments. Strings ('…', "…", `…` with ${…} inside) and regexes are stepped over, so the // in
 *  'https://…' and the /* in import.meta.glob('./sfx/*.mp3') stay code. A '…' or "…" string ends at the line's end
 *  even if it isn't closed (an apostrophe in JSX text like <p>Don't</p> can't swallow the rest of the file). */
export function stripComments(text) {
  let out = ''
  let i = 0
  const braces = [] // one counter per open ${ … } inside a template string
  let prev = '' // the last character of code that wasn't a space (for "is this slash a regex?")
  const n = text.length
  const skipString = (quote) => { // from the opening quote; returns the index after the string
    let j = i + 1
    while (j < n && text[j] !== quote && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
    return text[j] === quote ? j + 1 : j
  }
  const skipTemplate = (from) => { // from just after ` or }; stops after the closing ` or after a ${
    let j = from
    while (j < n) {
      if (text[j] === '\\') { j += 2; continue }
      if (text[j] === '`') return { end: j + 1, opened: false }
      if (text[j] === '$' && text[j + 1] === '{') return { end: j + 2, opened: true }
      j++
    }
    return { end: n, opened: false }
  }
  const skipRegex = () => { // from the opening slash; returns the index after the flags, or -1 if it isn't one
    let j = i + 1
    let inClass = false
    while (j < n && text[j] !== '\n') {
      const c = text[j]
      if (c === '\\') { j += 2; continue }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) { j++; while (j < n && /[a-z]/i.test(text[j])) j++; return j }
      j++
    }
    return -1
  }
  while (i < n) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '/') { // line comment: drop to the end of the line
      while (i < n && text[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') { // block comment: drop it, keep its line breaks
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      out += text.slice(i, stop).replace(/[^\n]/g, '')
      i = stop
      continue
    }
    if (c === "'" || c === '"') { const end = skipString(c); out += text.slice(i, end); i = end; prev = c; continue }
    if (c === '`') { const { end, opened } = skipTemplate(i + 1); out += text.slice(i, end); i = end; prev = '`'; if (opened) braces.push(1); continue }
    if (c === '/' && (prev === '' || REGEX_AFTER.has(prev) || REGEX_AFTER_WORDS.test(out.slice(-40).trimEnd()))) {
      const end = skipRegex()
      if (end !== -1) { out += text.slice(i, end); i = end; prev = '/'; continue }
    }
    if (braces.length && c === '{') braces[braces.length - 1]++
    if (braces.length && c === '}' && --braces[braces.length - 1] === 0) { // back inside the template string
      braces.pop()
      const { end, opened } = skipTemplate(i + 1)
      out += text.slice(i, end); i = end; prev = '`'
      if (opened) braces.push(1)
      continue
    }
    out += c
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The game's settings values live in an object whose name says so: values, settings, gameSettings, prefs, savedPrefs…
const SETTINGS_NAME = /setting|values|prefs/i

/** The names along the chain that ends just before `at`: for useGameSettings.getState().aiSpeed → [getState, useGameSettings].
 *  Call brackets and index brackets are stepped over (loadSettings(schema).tips → [loadSettings]). */
function chainNames(code, at) {
  const names = []
  let j = at
  for (;;) {
    while (j > 0 && /\s/.test(code[j - 1])) j--
    if (code[j - 1] === ')' || code[j - 1] === ']') { // step back over ( … ) or [ … ]
      const close = code[j - 1]
      const open = close === ')' ? '(' : '['
      let depth = 0
      while (j > 0) {
        j--
        if (code[j] === close) depth++
        else if (code[j] === open && --depth === 0) break
      }
      continue
    }
    const word = code.slice(0, j).match(/[A-Za-z_$][\w$]*$/)
    if (!word) return names
    names.push(word[0])
    j -= word[0].length
    while (j > 0 && /\s/.test(code[j - 1])) j--
    if (code[j - 1] === '.') { j--; if (code[j - 1] === '?') j--; continue }
    return names
  }
}

/** Does this one file read the row id? Only the ways games really read a setting count — a common word like "sound" or
 *  "theme" elsewhere in the code (assets.sound, { theme: 'dark' }) doesn't:
 *    values.tips · values?.tips · settings['tips'] · loadSettings(schema).tips   (a member of a settings-named object)
 *    const { tips } = values · ({ tips }: SettingsValues) =>                       (destructured from one)
 *    id === 'resetTips' · 'resetTips' === id · changed !== 'fullscreen' · case 'credits':   (an action row's id)
 *    info={{ version }} · info={{ version: … }}                                    (an info row's text)
 *    useSetting('tips') · getSetting('tips')                                       (a settings call named by the id) */
export function fileReadsRow(text, id) {
  const code = stripComments(text)
  const name = escapeRe(id)
  const q = `(['"\`])${name}\\1` // the id in quotes (group 1 is the quote)
  // a member of a settings-named object: values.tips · values?.tips · values['tips'] · loadSettings(s).tips
  for (const m of code.matchAll(new RegExp(`\\??\\.\\s*${name}(?![\\w$])|\\??\\.?\\[\\s*${q}\\s*\\]`, 'g'))) {
    if (code[m.index - 1] === '.' && m[0][0] === '.') continue // ...tips is a spread, not a member
    if (chainNames(code, m.index).some((w) => SETTINGS_NAME.test(w))) return true
  }
  // destructured: const { tips, aiSpeed: speed = 'Normal' } = values  ·  ({ tips }: SettingsValues) =>
  for (const m of code.matchAll(/\{([^{}]*)\}\s*(=|:)\s*([A-Za-z_$][\w$.?]*)/g)) {
    const keys = m[1].split(',').map((part) => part.trim().split(/[\s:=]/)[0])
    if (keys.includes(id) && SETTINGS_NAME.test(m[3])) return true
  }
  // an action row's id compared: id === 'resetTips' · 'resetTips' === id · changed !== 'fullscreen' · case 'credits':
  const who = '(?:\\b(?:id|key|changed|action)|[\\w$]Id|\\.id)'
  if (new RegExp(`${who}\\s*[!=]==?\\s*${q}`).test(code)) return true
  if (new RegExp(`${q}\\s*[!=]==?\\s*${who}(?![\\w$])`).test(code)) return true
  if (new RegExp(`\\bcase\\s+${q}\\s*:`).test(code)) return true
  if (fileFeedsInfo(code, id)) return true
  // a settings call named by the id: useSetting('tips') · getSetting('tips') · readPref('tips')
  return new RegExp(`[\\w$]*(?:setting|pref)[\\w$]*\\s*\\(\\s*${q}`, 'i').test(code)
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

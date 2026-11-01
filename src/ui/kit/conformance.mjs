// THE UI KIT'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "UI kit", tested on the REAL game:
//   Code:    the kit's rule checker (check-ui.mjs) passes on the game's UI code — words, looks, sizes and layout from
//            the kit's names, page-wide game CSS in @layer game-base
//   Browser: at every size (phones both ways, a short landscape, laptop, desktop, HD — minus the ones the game's
//            content/ui/style.json "orientation" rules out, 0.26.0) — on the first screen and in
//            live play (the Dev Kit adapter's conformance.startPlay): nothing overlaps, nothing is clipped or wider than
//            the screen, every tap target is 44 px, no focus ring without the keyboard (uiProblems.mjs) — and (0.21.0)
//            text is easy to read, nothing touches its box's edge, cards keep their size while they fill in
//   Settings: every row that's on is read by the game; reduce motion is on (and master volume, with the audio module)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  { kind: 'clipped', also: ['wider', 'squeezed'], name: 'nothing is clipped or wider than the screen', fix: 'Leave room inside scroll areas and panels (padding, not a tighter box); let text wrap or shrink (the kit\'s text sizes), and keep the page inside the screen width.' },
  { kind: 'small', name: 'every tap target is at least 44 px', fix: 'Use the kit\'s Button / IconButton (they\'re 44 px) or give the control min-width / min-height of the kit\'s tap size.' },
  { kind: 'focus', name: 'no focus ring without the keyboard', fix: 'Focus rings only on :focus-visible (the kit\'s controls do this) — don\'t call focus() on a control at start-up without { focusVisible: false }.' },
  // 0.21.0 — quality bars a player notices (Muzzy's rules, now checked)
  { kind: 'faint', name: 'text is easy to read (contrast)', fix: 'Put text in the style\'s colour for its background (on-surface on surface, on-primary on primary…), not a faded or see-through one — 4.5:1, or 3:1 for big text. Quieter text = smaller (caption), not paler.' },
  { kind: 'edge', name: 'nothing touches the edge of its box', fix: 'Give the box padding on every side (the kit\'s gap names) so its text, icons, avatars and badges never touch its edge. Something meant to run edge to edge (a cover picture, a divider) → data-ui-bleed on it.' },
  { kind: 'grows', name: 'cards keep their size while they fill in', fix: 'Make the card its final size from the start — room for everything it can hold (a min size from the kit\'s sizes, numbers in a slot wide enough for their biggest value) — so filling in never pushes things around.' },
  // 0.34.1 (F141)
  { kind: 'split', name: 'no word is broken in the middle', fix: 'Give the word room on its line: wrap whole words (overflow-wrap: break-word, not anywhere), and don\'t let a neighbour squeeze it (a min size of its longest word, or the row wrapping) — big text (200%) shows it first.' },
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

// ---- which way up the game plays (0.26.0, F104) ----
// content/ui/style.json "orientation": "any" (default) · "portrait" (a phone on its side is never checked — Goops:
// "the game is not expected to function in horizontal/landscape mode. ever.") · "landscape" (an upright phone isn't).
// Desktop windows stay either way: a portrait game still runs in a desktop browser.
export const ORIENTATIONS = ['any', 'portrait', 'landscape']
const sideways = (s) => s.mobile && s.width > s.height
const upright = (s) => s.mobile && s.height > s.width

/** style.json's value → { orientation, problem } (a value the kit doesn't know → "any", and a problem to warn about). */
export function readOrientation(style) {
  const value = style?.orientation
  if (value === undefined) return { orientation: 'any', problem: null }
  if (ORIENTATIONS.includes(value)) return { orientation: value, problem: null }
  return { orientation: 'any', problem: `content/ui/style.json "orientation": ${JSON.stringify(value)} isn't one of ${ORIENTATIONS.map((o) => `"${o}"`).join(', ')} — checking every size.` }
}

/** The sizes to check for that orientation, and the ones left out. */
export function sizesFor(orientation = 'any') {
  const keep = orientation === 'portrait' ? (s) => !sideways(s) : orientation === 'landscape' ? (s) => !upright(s) : () => true
  return { sizes: SIZES.filter(keep), skipped: SIZES.filter((s) => !keep(s)) }
}

/** ["phone 390×844 · in play", …] → "in play, every size" when it showed at all sizes of one phase (or of both). */
export function whereText(where, screens, sizeCount = SIZES.length) {
  if (where.length === screens) return 'every screen, every size'
  const phases = [...new Set(where.map((w) => w.split(' · ')[1]))]
  if (phases.length === 1 && where.length === sizeCount) return `${phases[0]}, every size`
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

// A non-commercial licence (CC-BY-NC, "non-commercial use only") counts as 🔴 whatever light it was given (0.22.0, F85):
// it forbids any money — tips, ads, a store page — and Steam won't take it. Only the `licence` field is read (a credit
// line can say "Asheville, NC"), and a licence that allows commercial use too ("free for commercial and non-commercial
// use") is fine (review, 0.22.1).
const NC_CODE = /\bCC[\s-]*BY(?:[\s-]*(?:SA|ND))*[\s-]*NC\b/i // CC-BY-NC, CC BY-NC-SA 4.0, CC-BY-ND-NC…
const NC_WORDS = /\bnon-?commercial(?:\s+use)?\s+only\b|\bfor\s+non-?commercial\b|\bpersonal\s+use\s+only\b|\bnot\s+for\s+commercial\b/i
const COMMERCIAL_OK = /\bcommercial\s+(?:and|&|or)\s+non-?commercial\b|\bcommercial\s+use\s+(?:is\s+)?(?:allowed|ok|permitted)\b|\bfree\s+for\s+commercial\b/i
export function isNonCommercialLicence(licence = '') {
  const text = String(licence)
  if (COMMERCIAL_OK.test(text)) return false
  return NC_CODE.test(text) || NC_WORDS.test(text)
}
const isNonCommercial = (e) => isNonCommercialLicence(e.licence ?? '')

/** What's wrong with the credits: { unlisted: [paths], red: [lines], noCredit: [lines] } (empty lists = fine). */
export function creditProblems(assets, entries) {
  const listed = (path) => entries.some((e) => (e.paths ?? []).some((p) => p === path || (p.endsWith('/') && path.startsWith(p))))
  const name = (e) => `${e.source ?? '?'} (${(e.paths ?? []).join(', ')})`
  return {
    unlisted: assets.filter((a) => !listed(a)),
    red: entries.filter((e) => e.light === '🔴' || isNonCommercial(e)).map((e) => (e.light !== '🔴' ? `${name(e)} — "${e.licence}" is non-commercial: no tips, ads or store sales with it` : name(e))),
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
// the audio module (applyAudioSettings / useAudioSettings / readAudioSettings) · a module's own row (the crashes switch,
// Hide emotes, Bot chatter…) once the game passes it on — what counts comes from the module's settings-rows.json (0.30.0).
export const SETTINGS_FILE = 'content/ui/settings.json'
export const SETTINGS_CHECK = 'every Settings row that\'s switched on is read by the game'
export const KIT_ROWS = ['textSize', 'reduceMotion']
export const AUDIO_ROWS = ['masterVolume', 'musicVolume', 'ambienceVolume', 'sfxVolume', 'uiVolume', 'sound', 'muteInBackground', 'mono']
const AUDIO_WIRING = /\b(applyAudioSettings|useAudioSettings|readAudioSettings)\s*\(/
// The modules' own rows (crashes, emotes, ai…) come from their settings-rows.json (0.30.0, F110) — see ROW_MANIFEST.
const VALUE_TYPES = ['slider', 'toggle', 'selector', 'stepper']

// ---- a module's own Settings rows (0.30.0, F110) ----
// A module that adds a Settings row ships settings-rows.json in its kit/; its installer copies it into the game next to
// the module's VERSION (src/crashes/, src/emotes/, src/ai/kit/ …). The shape:
//   { "about": "…",
//     "rows": [ { "id": "hideEmotes",                                  ← the row's id in content/ui/settings.json
//                 "readBy": ["\\b(applyEmoteSetting|setHideAll)\\s*\\("], ← regex sources: a match in the game's own code
//                                                                        (comments stripped) = the row is passed on
//                 "hint": "pass it to the emotes module: …" } ] }       ← what to do when nothing matches (optional)
// The Settings check reads every installed one, so a new module with a row needs no UI kit change. The patterns come
// from a file, so each is compiled with a try/catch: a broken file or pattern is a plain-English failure naming the
// module, never a crash.
export const ROW_MANIFEST = 'settings-rows.json'
const MAX_PATTERN = 300 // a pattern longer than this isn't a wiring call's name

/** Could this regex source run for minutes on a long file? A repeated group with a repeat inside — (a+)+, (\w+\s?)*,
 *  ((ab)*)+, (x|y+){2,} — is the classic case (JavaScript can't time a regex out, so the check would just hang).
 *  Escapes and [classes] are skipped; a wiring pattern (a group of names, then \s*\() never has one. */
export function slowPattern(source) {
  const groups = [] // one per open ( : does it hold a repeat?
  const quantifierAt = (j) => source[j] === '+' || source[j] === '*' || (source[j] === '{' && /\d/.test(source[j + 1] ?? ''))
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') { i++; continue }
    if (c === '[') { // to the class's closing ]
      for (i++; i < source.length && source[i] !== ']'; i++) if (source[i] === '\\') i++
      continue
    }
    if (c === '(') { groups.push(false); continue }
    if (c === ')') {
      const inner = groups.pop() ?? false
      const repeated = quantifierAt(i + 1)
      if (inner && repeated) return true
      if (groups.length) groups[groups.length - 1] ||= inner || repeated || source[i + 1] === '?'
      continue
    }
    const isRepeat = quantifierAt(i) || (c === '?' && source[i - 1] !== '(' && !'+*?}'.includes(source[i - 1] ?? '('))
    if (isRepeat && groups.length) groups[groups.length - 1] = true
  }
  return false
}

/** One module's settings-rows.json text → { module, file, rows: [{ id, readBy: [RegExp], hint }], problems: [plain words] }. */
export function readRowManifest(text, { module, file = `src/${module}/${ROW_MANIFEST}` }) {
  const fix = `reinstall the module (node ~/.claude/config/bmuz/scripts/install-module.mjs ${module} .) — the game's copy isn't meant to be edited`
  const broken = (why) => ({ module, file, rows: [], problems: [`${file} ${why}, so the ${module} module's Settings rows can't be checked — ${fix}`] })
  let data
  try { data = JSON.parse(text) } catch (e) { return broken(`isn't valid JSON (${String(e?.message ?? e).split('\n')[0]})`) }
  if (!data || typeof data !== 'object' || !Array.isArray(data.rows)) return broken('has no "rows" list')
  const rows = []
  const problems = []
  data.rows.forEach((row, i) => {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) {
      problems.push(`${file} row ${i + 1} has no "id", so the ${module} module's row can't be matched to Settings — ${fix}`)
      return
    }
    const sources = Array.isArray(row.readBy) ? row.readBy : []
    if (!sources.length) problems.push(`${file} "${row.id}" has no "readBy" patterns, so the ${module} module can't say what passes it on — ${fix}`)
    const readBy = []
    for (const source of sources) {
      if (typeof source !== 'string' || !source || source.length > MAX_PATTERN) {
        problems.push(`${file} "${row.id}": a "readBy" entry isn't a short pattern (text, 1–${MAX_PATTERN} characters) — ${fix}`)
        continue
      }
      if (slowPattern(source)) {
        problems.push(`${file} "${row.id}": the pattern ${JSON.stringify(source)} could take minutes to check (a repeated group with a repeat inside), so it isn't run — ${fix}`)
        continue
      }
      try { readBy.push(new RegExp(source)) } catch (e) {
        problems.push(`${file} "${row.id}": the pattern ${JSON.stringify(source)} isn't one the check can use (${String(e?.message ?? e).split('\n')[0]}) — ${fix}`)
      }
    }
    rows.push({ id: row.id, readBy, hint: typeof row.hint === 'string' ? row.hint : '' })
  })
  return { module, file, rows, problems }
}

// ONE-RELEASE FALLBACK (0.30.0, F110 — take it out in 0.36.0 (0.34.0 went to the two new looks, 0.35.0 went to What's new); kept through 0.34.0 because Glyphtender hadn't
// reinstalled crashes / emotes / ai yet, decided 2026-10-23): module copies older than their settings-rows.json
// (crashes ≤ 0.1.0, emotes ≤ 0.3.0, ai ≤ 0.7.0) still get their row counted, exactly as the kit's old hard-coded lists
// did. Used ONLY for one of these folders installed (a VERSION) WITHOUT the file — updating the module makes it unused.
// Don't add to it: a new module ships its own settings-rows.json instead.
export const OLD_MODULE_ROWS = {
  // (the hints are the ones each module's settings-rows.json gives, so an old copy's failure line names the right call)
  crashes: [{ id: 'crashReports', readBy: [/\b(applyCrashSetting|setOn)\s*\(/], hint: 'pass it to the crashes module: applyCrashSetting(loadSettings(settingsJson)) at start-up and applyCrashSetting(values) in the Settings onChange (src/crashes/settingsRow.ts)' }], // F89
  emotes: [{ id: 'hideEmotes', readBy: [/\b(applyEmoteSetting|setHideAll)\s*\(/], hint: 'pass it to the emotes module: applyEmoteSetting(emotes, loadSettings(settingsJson)) at start-up and applyEmoteSetting(emotes, values) in the Settings onChange (src/emotes/settingsRow.ts)' }], // F107
  ai: [{ id: 'botChatter', readBy: [/\b(applyBanterSetting|setChatter)\s*\(/], hint: 'pass it to the bots\' voice: applyBanterSetting(banter, loadSettings(settingsJson)) when the banter is made and applyBanterSetting(banter, values) in the Settings onChange (src/ai/kit/settingsRow.ts)' }], // F22
}
const oldSource = (module) => ({ module, file: null, old: true, rows: OLD_MODULE_ROWS[module], problems: [] })

/** Every installed module's Settings rows: src/<name>/ or src/<name>/kit/ with a VERSION (where install-module puts
 *  module copies — the same places check-framework looks), reading its settings-rows.json — or, for an older copy of
 *  crashes / emotes / ai without one, the fallback above. node_modules and links are never looked in. */
export function findRowSources(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return []
  const sources = []
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue
    for (const sub of ['', 'kit']) {
      const dir = join(src, entry.name, sub)
      if (!existsSync(join(dir, 'VERSION'))) continue
      const path = join(dir, ROW_MANIFEST)
      const folder = ['src', entry.name, sub].filter(Boolean).join('/')
      if (existsSync(path)) {
        let text = ''
        try { text = readFileSync(path, 'utf8') } catch { /* unreadable → "isn't valid JSON" below */ }
        sources.push({ ...readRowManifest(text, { module: entry.name, file: `${folder}/${ROW_MANIFEST}` }), folder })
      } else if (Object.hasOwn(OLD_MODULE_ROWS, entry.name)) sources.push({ ...oldSource(entry.name), folder })
      break // src/x/VERSION wins over src/x/kit/VERSION (there's only ever one)
    }
  }
  return sources
}

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
  const code = stripComments(text)
  // 0.24.0: <Settings version={versionLabel} …> fills the "version" row too (and the line at the bottom of every tab)
  if (id === 'version' && /<Settings\b(?:=>|[^<>])*?\sversion\s*=\s*[{"']/.test(code)) return true
  return new RegExp(`\\binfo\\s*[=:]\\s*\\{\\{?[^}]*?(?<![\\w$.])${escapeRe(id)}(?![\\w$])`).test(code)
}

/** Which rows nothing reads → { dead: [rows], placeholder: [rows], read, kit } (code = [{ path, text }]).
 *  sources = the installed modules' rows (findRowSources); left out → the old modules' fallback rows (as before 0.30.0).
 *  A dead row a module owns carries { module, hint } for the failure line. */
export function settingsProblems(schema, code, sources = Object.keys(OLD_MODULE_ROWS).map(oldSource)) {
  const stripped = code.map((f) => stripComments(f.text))
  const audioWired = stripped.some((c) => AUDIO_WIRING.test(c))
  const moduleRows = sources.flatMap((s) => s.rows.map((r) => ({ ...r, module: s.module })))
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
    const owners = moduleRows.filter((r) => r.id === row.id)
    const handled = KIT_ROWS.includes(row.id)
      || (row.type === 'info' && row.id !== 'version' && String(row.default ?? '').trim() !== '')
      || (audioWired && AUDIO_ROWS.includes(row.id))
      || owners.some((r) => r.readBy.some((re) => stripped.some((c) => re.test(c))))
    if (handled) { kit++; continue }
    const reads = row.type === 'info' ? fileFeedsInfo : fileReadsRow // an info row's text only comes in through info={{ … }}
    if (code.some((f) => reads(f.text, row.id))) read++
    else dead.push(owners.length ? { ...row, module: owners[0].module, hint: owners.find((r) => r.hint)?.hint ?? '' } : row)
  }
  return { dead, placeholder, read, kit }
}

/** Where to wire a dead row, by its type — plain words for the failure. */
function wireHint(row) {
  if (row.module) return `it's the ${row.module} module's row: ${row.hint || wireHint({ ...row, module: undefined })}`
  if (VALUE_TYPES.includes(row.type)) return `read values.${row.id} in the Settings onChange (and loadSettings(…) at start-up)`
  if (row.type === 'button' || row.type === 'destructive') return `handle it in the Settings onAction: if (id === '${row.id}') …`
  if (row.type === 'info') return row.id === 'version' ? 'give it the version: <Settings version={versionLabel} /> (the version module)' : `give its text: <Settings info={{ ${row.id}: … }} />`
  return 'read its id where it should act'
}

export function checkSettingsForTest(t) { return checkSettings(t) }
function checkSettings(t) {
  const schema = t.json(SETTINGS_FILE)
  if (!schema) return t.pass(SETTINGS_CHECK, `no ${SETTINGS_FILE}`)
  const sources = t.root ? findRowSources(t.root) : undefined // (a test's made-up tester may have no game folder)
  // A module's own code never counts as the game passing its row on (its settingsRow.ts DEFINES applyXSetting(…)) —
  // the Dev Kit's gameCode() leaves out only the modules it knows by name, so a new module's folder is left out here.
  const inModule = (path) => (sources ?? []).some((s) => s.folder && path.startsWith(`${s.folder}/`))
  const code = t.gameCode().filter((f) => !inModule(f.path))
  const { dead, placeholder, read, kit } = settingsProblems(schema, code, sources)
  const where = (row) => `${row.tab} → ${row.label ?? row.id} ("${row.id}", a ${row.type})`
  const problems = [
    ...dead.map((row) => `${where(row)}: nothing in the game reads it — ${wireHint(row)}`),
    ...placeholder.map((row) => `${where(row)}: opens ${row.url ? `a placeholder address (${row.url})` : 'no address'} — give it the real url`),
  ]
  const broken = (sources ?? []).flatMap((s) => s.problems)
  if (problems.length || broken.length) {
    const fix = problems.length
      ? `Each row above shows in Settings but changes nothing. Wire it where the line says (the game's own code, not src/ui/kit), or switch it off with "on": false in ${SETTINGS_FILE} until it does something.`
      : ''
    const fixBroken = broken.length ? `A module's ${ROW_MANIFEST} (how it tells this check what passes its rows on) is broken — reinstall that module; the line says which.` : ''
    return t.fail(SETTINGS_CHECK, [...problems, ...broken], [fix, fixBroken].filter(Boolean).join(' '))
  }
  return t.pass(SETTINGS_CHECK, `${read + kit} rows on: ${read} read by the game, ${kit} handled by the kit / audio module`)
}

// ---- comfort rows (0.21.0) ----
// Two Settings rows aren't optional: Reduce motion (motion makes some players ill — the kit applies it everywhere) is
// always switched on, and with the audio module installed, Master volume (one slider that turns the whole game down).
export const COMFORT_CHECK = 'Settings has the comfort rows (reduce motion, and volume with sound)'
export const COMFORT_ROWS = {
  reduceMotion: { tab: 'Accessibility', row: '{ "id": "reduceMotion", "type": "toggle", "label": "Reduce motion", "detail": "Fewer moving and flashing effects", "default": false }', why: 'players that motion makes ill can\'t calm it down' },
  masterVolume: { tab: 'Audio', row: '{ "id": "masterVolume", "type": "slider", "label": "Master volume", "default": 80 }', why: 'players can\'t turn the whole game down in one go', audio: true },
}

/** The comfort rows that aren't switched on: ['reduceMotion', …] (masterVolume only counts when audio is installed). */
export function missingComfortRows(schema, { audio = false } = {}) {
  const on = new Set(liveRows(schema).map((row) => row.id))
  return Object.entries(COMFORT_ROWS).filter(([id, rule]) => (!rule.audio || audio) && !on.has(id)).map(([id]) => id)
}

export function checkComfortForTest(t) { return checkComfort(t) }
function checkComfort(t) {
  const schema = t.json(SETTINGS_FILE)
  const audio = t.has?.('audio') ?? false
  const missing = missingComfortRows(schema, { audio })
  if (!missing.length) return t.pass(COMFORT_CHECK, audio ? 'reduce motion + master volume' : 'reduce motion (no audio module, so no volume needed)')
  const problems = missing.map((id) => `"${id}" isn't switched on in ${SETTINGS_FILE}${schema ? '' : ' (the file is missing)'} — ${COMFORT_ROWS[id].why}`)
  const rows = missing.map((id) => `${COMFORT_ROWS[id].tab} tab: ${COMFORT_ROWS[id].row}`).join('\n')
  t.fail(COMFORT_CHECK, problems, `Add the row to ${SETTINGS_FILE} (or take away its "on": false):\n${rows}\nThe kit applies reduce motion by itself; the audio module reads master volume once the game passes the values to applyAudioSettings.`)
}

export async function check(t) {
  await checkCredits(t)
  checkSettings(t)
  checkComfort(t)

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
  const { orientation, problem } = readOrientation(t.json('content/ui/style.json'))
  if (problem) (t.warn ?? t.fail)('content/ui/style.json "orientation" is one the kit knows', [problem], `"orientation": "any" · "portrait" · "landscape"`)
  const { sizes, skipped } = sizesFor(orientation)
  if (skipped.length) t.skip(`the game ${orientation === 'portrait' ? 'on a phone on its side' : 'on an upright phone'}`, `${orientation} only (content/ui/style.json "orientation") — ${skipped.map((s) => `${s.width}×${s.height}`).join(', ')} not checked`)
  const found = {}
  let playReason = ''
  for (const size of sizes) {
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
    if (!list?.size) { t.pass(name, `${screens} screens, ${sizes.length} sizes`); continue }
    const lines = [...list].map(([text, where]) => `${text}  [${whereText(where, screens, sizes.length)}]`)
    t.fail(name, lines.length > 12 ? [...lines.slice(0, 12), `…and ${lines.length - 12} more`] : lines, fix)
  }
  if (grouped.error?.size) t.fail('no errors in the console', [...grouped.error.keys()].slice(0, 8), 'Fix the errors above (they happened while the screens loaded).')
  if (playReason) t.needsPlay('the game at every size — in play', playReason)
  await checkPseudo(t, findProblems, sizes)
}

// ---- browser: the first screen in the long fake language (F91) ----
// The game reopened with ?pseudo (dev only: applyStyle rewrites every word accented and ~40% longer, kit 0.36.0+),
// and the same page check run on it — only what a longer translation breaks: cut off, wider than the screen, a word
// broken mid-line, things on top of each other. A WARNING, not a failure: nothing is wrong in English today; it's
// what to fix before the game is translated (the screens that need room for longer words).
// edge: is in: a word longer than its button doesn't get cut off, it runs out past the button's sides, and the page
// check names that "touches the edge of its box — 0 px" (sprint 45: a planted German menu word ran past both sides of
// its button on a 360-wide phone and only edge: saw it).
export const PSEUDO_CHECK = 'words still fit when they\'re ~40% longer (a translation — the fake language, ?pseudo)'
const PSEUDO_KINDS = /^(clipped|wider|squeezed|split|overlap|edge):/
async function checkPseudo(t, findProblems, sizes) {
  const found = {}
  for (const size of sizes) {
    const page = await t.page(size)
    try {
      const url = new URL(page.url())
      url.searchParams.set('pseudo', '')
      await page.goto(url.href, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts?.ready)
      const on = await page.waitForFunction(() => document.documentElement.hasAttribute('data-pseudo'), null, { timeout: 5000 }).then(() => true, () => false)
      if (!on) return t.skip(PSEUDO_CHECK, 'the game\'s UI kit copy is older than 0.36.0, or it never calls applyStyle — no fake language')
      await page.waitForTimeout(700) // entrances settle
      const problems = (await page.evaluate(findProblems, { screenWidth: size.width, checkFocus: false })).filter((p) => PSEUDO_KINDS.test(p))
      found[`${size.name} ${size.width}×${size.height} · first screen, fake language`] = problems
    } finally {
      await page.close()
    }
  }
  const lines = new Map()
  for (const [where, problems] of Object.entries(found)) for (const p of problems) lines.set(p, [...(lines.get(p) ?? []), where.split(' · ')[0]])
  if (!lines.size) return t.pass(PSEUDO_CHECK, `${sizes.length} sizes`)
  const list = [...lines].map(([p, where]) => `${p}  [${where.length === sizes.length ? 'every size' : where.join(', ')}]`)
  const warn = t.warn ?? t.fail
  warn(PSEUDO_CHECK, list.length > 12 ? [...list.slice(0, 12), `…and ${list.length - 12} more`] : list,
    'Give those words room to grow: let the text wrap (no fixed width or nowrap on words), let its box grow, or shrink it with the kit\'s fit (MenuHeader / title fit). Look at it with ?pseudo in the game\'s address (dev only).')
}

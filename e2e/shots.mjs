// BEFORE / AFTER SCREENSHOTS — the proof that a rebuild "looks the same" (F29 safety net).
// Every screen at 8 window sizes: phones tall (390×844, 360×780) and on their side (844×390), a short browser window
// (768×343), and desktops (1066×1192, 1099×846, 1440×900, 1920×1080).
// Screens (24): main menu · Settings · Credits · Play online · New game · a 2-player game: draft, the device passed on
// (Pass to …), a turn starting, a move + cast planned, the refresh step (a cast with no Magic) · Pause · Rules ·
// the online lobby (host and guest — from the Dev Kit's preview, no server needed) · the end of a 2-player and a
// 4-player game (e2e/fixtures/end-2p.json, end-4p.json): the Magic reveal held at its middle step, Results, Story,
// Scorecard, See board.
//
//   npm run shots:record   shoot the BEFORE set into e2e/shots-before/<screen>@<w>x<h>.png (committed to git).
//                          Re-record only when a change is MEANT to look different, and look at the new pictures first.
//   npm run check:shots    shoot them again into e2e-shots/shots-now/ and compare with the before set, pixel by pixel.
//                          Each picture that differs gets e2e-shots/shots-diff/<name>.png (the changed pixels in red).
//                          Exit 0 = everything looks the same; 1 = something differs, is missing or is new.
//
// How exact: a pixel counts as different when its colour moved more than pixelmatch's threshold 0.1 (its default —
// tiny anti-aliasing wobble inside one pixel doesn't count), and NO differing pixels are allowed. If a picture ever
// flakes, find what moved and hold it still — don't raise the tolerance.
//
// Holding the screen still (so every run is identical): the page opens with ?freeze (src/game/freeze.ts, dev only) —
// fixed "random" numbers (new-game seed, tray shuffle), no transitions, the Highlights carousel and the Magic reveal
// don't move on by themselves. Before each picture the script waits for the fonts, the store's moves / scoring /
// refresh to finish and every animation that ends to end (a score pop's end is invisible — B007); anything that loops
// forever (a glyphling's pulse, an SVG blink) is stopped at its start for the picture; and it only keeps a picture once two in a
// row come out the same.
//
// Starts its OWN dev server (port 5250 — never Muzzy's 5180) and closes only that one at the end.
//   node e2e/shots.mjs [record|check]
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const MODE = process.argv[2] ?? 'check'
if (!['record', 'check'].includes(MODE)) throw new Error(`Mode must be record or check, got ${MODE}`)
const PORT = 5250
const BEFORE = 'e2e/shots-before'
const NOW = 'e2e-shots/shots-now'
const DIFF = 'e2e-shots/shots-diff'
const THRESHOLD = 0.1 // pixelmatch: how far a pixel's colour may move and still count as the same
const ALLOWED = 0 // how many differing pixels a picture may have
const SIZES = [
  { width: 390, height: 844, mobile: true },
  { width: 360, height: 780, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 768, height: 343, mobile: false },
  { width: 1066, height: 1192, mobile: false },
  { width: 1099, height: 846, mobile: false },
  { width: 1440, height: 900, mobile: false },
  { width: 1920, height: 1080, mobile: false },
]
const END_GAMES = [{ name: 'end2', file: 'end-2p' }, { name: 'end4', file: 'end-4p' }]
const LOBBIES = [{ name: 'lobby-host', variant: 'host4' }, { name: 'lobby-guest', variant: 'guest4' }]

const OUT = MODE === 'record' ? BEFORE : NOW
// Start clean, so a screen that's gone doesn't linger
for (const dir of MODE === 'record' ? [BEFORE] : [NOW, DIFF]) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
const problems = []
const problem = (why) => { problems.push(why); console.log(`  PROBLEM ${why}`) }
let shotCount = 0

/** A fresh page (its own storage — no remembered choices) at this size, opened with ?freeze. */
async function openPage(size, query = '') {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
  page.on('pageerror', (e) => problem(`${size.width}x${size.height}: page error: ${e.message}`))
  await page.goto(`http://127.0.0.1:${PORT}/?freeze${query}`)
  return page
}

/** Wait until nothing is moving that will stop by itself: fonts loaded, the store's moves / scoring / refresh done,
 *  every animation that ends has ended (the ones that loop forever are stopped for the picture by Playwright). */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => {
    const s = window.__glyphtender?.store.getState()
    if (s && (s.flying || s.scoring !== null || s.refreshFx !== null)) return false
    if ([...document.images].some((img) => !img.complete)) return false
    return document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity)
  }, null, { timeout: 20000, polling: 50 })
  // SVG's own looping blinks (<animate> on a planned seed / a tangled hex) aren't page animations: hold them at their start
  await page.evaluate(() => document.querySelectorAll('svg').forEach((svg) => { svg.pauseAnimations(); svg.setCurrentTime(0) }))
  await page.mouse.move(0, 0) // no button left looking hovered
}

/** Take the picture — kept once two in a row are the same (anything still changing shows up as a difference). */
async function shot(page, size, name) {
  await settle(page)
  const file = `${OUT}/${name}@${size.width}x${size.height}.png`
  let last = await page.screenshot({ animations: 'disabled' })
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const next = await page.screenshot({ animations: 'disabled' })
    if (next.equals(last)) {
      writeFileSync(file, next)
      shotCount++
      console.log(`shot ${name}@${size.width}x${size.height}`)
      return
    }
    last = next
  }
  problem(`${name}@${size.width}x${size.height}: the screen never held still (two pictures in a row always differed)`)
}

const store = (page, fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
const tapper = (page, size) => (loc) => (size.mobile ? loc.tap() : loc.click())

// ---- The menus, then a 2-player game through the real screen ----
async function menusAndGame(size) {
  const page = await openPage(size)
  const tap = tapper(page, size)
  // A glyphling whose turn it is pulses (it never holds still), so Playwright's "wait until stable" would wait forever
  const tapGlyph = (loc) => (size.mobile ? loc.tap({ force: true }) : loc.click({ force: true }))
  try {
    await page.waitForFunction(() => window.__glyphtender?.store, null, { timeout: 15000 })
    await page.getByRole('button', { name: 'Settings' }).waitFor()
    await shot(page, size, 'menu')

    await tap(page.getByRole('button', { name: 'Settings' }))
    await shot(page, size, 'settings')
    // Credits is in the About tab (wide screens show tabs; narrow ones a ◀ tab ▶ picker)
    if (await page.getByRole('tab', { name: 'About' }).count()) await tap(page.getByRole('tab', { name: 'About' }))
    else for (let i = 0; i < 10 && !(await page.locator('.kit-picker').first().textContent()).includes('About'); i++) await tap(page.locator('.kit-picker').first().locator('button').last())
    await tap(page.getByRole('button', { name: 'Credits' }))
    await shot(page, size, 'credits')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Play online' }).waitFor()

    await tap(page.getByRole('button', { name: 'Play online' }))
    await shot(page, size, 'online')
    await page.keyboard.press('Escape')

    await tap(page.getByRole('button', { name: 'Play', exact: true }))
    await page.getByRole('button', { name: 'Start' }).waitFor()
    await shot(page, size, 'new-game')
    // Hide seeds on, so the device is passed between turns (the handoff)
    await tap(page.getByRole('switch', { name: 'Hide seeds between turns' }))
    await tap(page.getByRole('button', { name: 'Start' }))
    await page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready', null, { timeout: 15000 })

    // The draft: 2 glyphlings each, spread across the garden (the same picks every run)
    const option = (kind, pick) => page.locator(`[data-option="${kind}"] circle`).nth(pick)
    const optionCount = (kind) => page.locator(`[data-option="${kind}"] circle`).count()
    for (let i = 0; i < 4; i++) {
      if (i === 2) await shot(page, size, 'game-draft')
      await tap(option('move', Math.floor(((await optionCount('move')) * (i + 1)) / 6)))
    }
    await page.getByRole('button', { name: 'Show my seeds' }).waitFor({ timeout: 8000 })
    await shot(page, size, 'handoff')
    await tap(page.getByRole('button', { name: 'Show my seeds' }))
    await shot(page, size, 'game-play')

    // A move and a cast that makes NO Magic, planned → Cast → the refresh step
    const mine = await store(page, (s) => s.game.glyphlings.filter((g) => g.seat === s.game.current).map((g) => g.id))
    await tapGlyph(page.locator(`[data-glyph="${mine[0]}"]`))
    await tap(option('move', Math.floor((await optionCount('move')) / 2)))
    const pick = await page.evaluate(() => window.__glyphtender.findCast(false))
    if (!pick) throw new Error('no cast without Magic from this move (the fixed game changed?)')
    const pos = await store(page, `(s) => s.trayOrder[s.game.current].indexOf(${pick.seed})`)
    await tap(page.locator(`[data-tray-pos="${pos}"]`))
    await tap(page.locator(`[data-option="cast"] circle[data-hex="${pick.hex}"]`))
    await shot(page, size, 'game-planned')
    await tap(page.locator('.game-actions button').last()) // Cast
    await page.waitForFunction(() => window.__glyphtender.store.getState().game.phase === 'refresh', null, { timeout: 8000 })
    await shot(page, size, 'game-refresh')

    // The ☰ Menu: Pause, then Rules
    // (a click straight on the button: in a short window, 768×343, the prompt's words run over ☰ and would catch a real tap)
    await page.getByRole('button', { name: 'Menu' }).first().dispatchEvent('click')
    await page.getByRole('button', { name: 'Rules' }).waitFor()
    await shot(page, size, 'pause')
    await tap(page.getByRole('button', { name: 'Rules' }))
    await shot(page, size, 'rules')
  } catch (e) {
    problem(`${size.width}x${size.height} menus + game: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

// ---- The online lobby, from the Dev Kit's preview (a pretend room — no server needed) ----
async function lobby(size, { name, variant }) {
  const page = await openPage(size, `&devkit-preview=lobby&variant=${variant}`)
  try {
    await page.waitForFunction(() => window.__devkitPreview?.ready, null, { timeout: 15000 })
    await shot(page, size, name)
  } catch (e) {
    problem(`${size.width}x${size.height} ${name}: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

// ---- The end of a finished game (a fixture): reveal → Results → Story → Scorecard → See board ----
async function endOfGame(size, { name, file }) {
  const game = JSON.parse(readFileSync(`e2e/fixtures/${file}.json`, 'utf8')).state.game
  const page = await openPage(size)
  const tap = tapper(page, size)
  try {
    await page.waitForFunction(() => window.__glyphtender?.store, null, { timeout: 15000 })
    await page.evaluate((g) => window.__glyphtender.store.getState().loadState(g), game)
    // Frozen, the reveal waits at its first step; hold it at the middle step instead
    await page.waitForFunction(() => window.__glyphtender.store.getState().revealAt === 0, null, { timeout: 15000 })
    await page.evaluate(() => window.__glyphtender.store.getState().setRevealAt(Math.floor(window.__glyphtender.revealStepCount() / 2)))
    await shot(page, size, `${name}-reveal`)
    await tap(page.getByRole('button', { name: 'Skip' }))
    const dialog = page.getByRole('dialog', { name: /Grand Glyphtender/ })
    await dialog.waitFor({ timeout: 5000 })
    await shot(page, size, `${name}-results`)
    await tap(page.getByRole('tab', { name: 'Story' }))
    await page.locator('.game-end-chart-svg').waitFor({ timeout: 3000 })
    await shot(page, size, `${name}-story`)
    await tap(page.getByRole('tab', { name: 'Scorecard' }))
    await page.locator('.game-scorecard').waitFor({ timeout: 3000 })
    await shot(page, size, `${name}-scorecard`)
    await tap(dialog.getByRole('button', { name: 'See board' }))
    await page.getByRole('button', { name: 'See results' }).waitFor({ timeout: 3000 })
    await shot(page, size, `${name}-board`)
  } catch (e) {
    problem(`${size.width}x${size.height} ${name}: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

try {
  for (const size of SIZES) {
    await menusAndGame(size)
    for (const l of LOBBIES) await lobby(size, l)
    for (const g of END_GAMES) await endOfGame(size, g)
  }
} finally {
  await browser.close()
  await server.close()
}

if (MODE === 'record') {
  console.log(`\nRecorded ${shotCount} before-screenshots in ${BEFORE}/.`)
  if (problems.length) console.log(`${problems.length} problem(s) — the before set is incomplete:\n  ${problems.join('\n  ')}`)
  process.exit(problems.length ? 1 : 0)
}

// ---- Compare: every before picture against the one just taken ----
const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [])
const before = pngs(BEFORE)
const now = new Set(pngs(NOW))
const differences = []
const describe = (f) => { const [screen, at] = f.replace('.png', '').split('@'); return `${screen} at ${at.replace('x', '×')}` }
for (const f of before) {
  if (!now.has(f)) { differences.push(`MISSING  ${describe(f)}: in the before set but couldn't be shot now`); continue }
  now.delete(f)
  const a = PNG.sync.read(readFileSync(`${BEFORE}/${f}`))
  const b = PNG.sync.read(readFileSync(`${NOW}/${f}`))
  if (a.width !== b.width || a.height !== b.height) { differences.push(`SIZE     ${describe(f)}: ${a.width}×${a.height} before, ${b.width}×${b.height} now`); continue }
  const diff = new PNG({ width: a.width, height: a.height })
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD })
  if (changed > ALLOWED) {
    mkdirSync(DIFF, { recursive: true })
    writeFileSync(`${DIFF}/${f}`, PNG.sync.write(diff))
    differences.push(`DIFFERS  ${describe(f)}: ${changed} pixel${changed === 1 ? '' : 's'} differ (${((changed / (a.width * a.height)) * 100).toFixed(2)}% of the picture) — see ${DIFF}/${f}`)
  }
}
for (const f of now) differences.push(`NEW      ${describe(f)}: shot now but not in the before set (re-record if it's meant to be there)`)

console.log('')
problems.forEach((p) => console.log(`PROBLEM  ${p}`))
differences.forEach((d) => console.log(d))
writeReport(before, differences, problems)
if (!problems.length && !differences.length) {
  console.log(`Same: all ${before.length} screenshots match the before set exactly (0 pixels differ).`)
  process.exit(0)
}
console.log(`\nNot the same: ${differences.length} of ${before.length} screenshot(s) differ${problems.length ? `, ${problems.length} problem(s) while shooting` : ''}.`)
process.exit(1)

/** e2e-shots/report.html — the result as a page Muzzy can open (dev server: /e2e-shots/report.html): the verdict on top,
 *  then every screen at every size as before | now | the changed pixels in red (only where something changed). */
function writeReport(files, differences, problems) {
  const same = !differences.length && !problems.length
  const changed = new Set(differences.map((d) => d.split(':')[0].slice(9).trim()))
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const rows = files.map((f) => {
    const name = describe(f)
    const bad = changed.has(name)
    const diff = bad && existsSync(`${DIFF}/${f}`) ? `<a href="shots-diff/${f}"><img src="shots-diff/${f}" loading="lazy"><span>Changed (red)</span></a>` : ''
    return `<section class="${bad ? 'bad' : ''}"><h3>${bad ? '✗' : '✓'} ${esc(name)}</h3><div class="row">` +
      `<a href="../${BEFORE}/${f}"><img src="../${BEFORE}/${f}" loading="lazy"><span>Before</span></a>` +
      `<a href="shots-now/${f}"><img src="shots-now/${f}" loading="lazy"><span>Now</span></a>${diff}</div></section>`
  })
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Screenshot check</title><style>
body{font:16px system-ui;background:#0f1729;color:#eee;margin:0;padding:16px}h1{margin:0 0 4px}p{margin:0 0 16px;color:#aab}
.ok{color:#7d7}.no{color:#f77}section{margin:0 0 20px}h3{margin:0 0 6px;font-size:15px}.bad h3{color:#f77}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));max-width:820px;gap:8px}
.row a{color:#aab;text-decoration:none;font-size:13px;text-align:center}
.row img{display:block;width:100%;height:auto;max-height:260px;object-fit:contain;background:#000;border:1px solid #334;border-radius:4px}
pre{white-space:pre-wrap;color:#f99}</style>
<h1 class="${same ? 'ok' : 'no'}">${same ? `Same — all ${files.length} screenshots match the before set exactly` : `Not the same — ${differences.length} of ${files.length} differ`}</h1>
<p>Checked ${new Date().toLocaleString()} · each row: before | now${same ? '' : ' | changed pixels in red'} · tap a picture to see it full size</p>
${problems.length || differences.length ? `<pre>${esc([...problems.map((p) => 'PROBLEM ' + p), ...differences].join('\n'))}</pre>` : ''}
${[...rows.filter((r) => r.startsWith('<section class="bad"')), ...rows.filter((r) => !r.startsWith('<section class="bad"'))].join('\n')}`
  writeFileSync('e2e-shots/report.html', html)
  console.log('Report page: e2e-shots/report.html')
}

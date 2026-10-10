// DEV KIT SOUND TAB + MOMENTS (Sprint 20: framework F30 Sound Board, F32 Moments + feel presets, Dev Kit 0.8.0) —
// Muzzy tunes sound and feel by ear: "fire or loop a moment… with a 3-style preset picker that sets all its sliders".
// Over a real game, at desktop 1440×900:
//   1. ` → Sound: every sound listed (by bus) → open "no" → its volume 6 dB down → the game's engine has it at once
//      (audio.config(), no save) → ▶ plays it (window.__audioLog) → ↺ puts it back.
//   2. A small test WAV (made here: 0.1 s of silence, then a 0.3 s tone) → the file input → a new MP3 lands in
//      public/audio/ui/, its silent start trimmed → ▶ plays it (the page loads it: 200) → Add to credits → Save →
//      content/audio.json lists it. Then the test MP3 is DELETED and content/audio.json + credits.json are put back
//      (whatever happens), so the repo stays clean.
//   3. Screens → Board → each board moment ▶ (score pop, seed lands, two birds, tangle, "no" shake, your turn) and
//      Magic reveal → its two (count-up, Grand Glyphtender): each one's own sounds show up in the FRAME's __audioLog
//      (the sandbox plays them; the real game's log gets none) → Score pop: Punchy → its sliders change (shorter pop,
//      bigger swell, louder) → Balanced → back to the saved values → Undo unsaved.
// Phone 390×844 too (no functional run — the same code): screenshots of the Sound tab and a Moments panel, and
// nothing in the Dev Kit scrolls sideways. No console errors anywhere.
// Starts its OWN dev server (default port 5418 — never Muzzy's) with sound allowed to start on its own
// (--autoplay-policy), and closes only that one. check:full runs it ALONE (it writes game files).
//   npm run e2e:devkit-sound [outDir] [port]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/devkit-sound'
const PORT = Number(process.argv[3] ?? 5418)
mkdirSync(OUT, { recursive: true })

const AUDIO = 'content/audio.json'
const CREDITS = 'content/credits.json'
const UI_FOLDER = 'public/audio/ui'
const originals = { [AUDIO]: readFileSync(AUDIO, 'utf8'), [CREDITS]: readFileSync(CREDITS, 'utf8') }
const TUNING = ['content/tuning/anim.json', 'content/tuning/feel.json']
const tuningBefore = TUNING.map((f) => readFileSync(f, 'utf8'))
const filesBefore = new Set(readdirSync(UI_FOLDER))
const newFiles = () => readdirSync(UI_FOLDER).filter((f) => !filesBefore.has(f))
/** Put the repo back as it was: the two JSON files, and no test MP3. */
function putBack() {
  for (const [file, text] of Object.entries(originals)) if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text)
  for (const f of newFiles()) rmSync(`${UI_FOLDER}/${f}`)
}

/** A tiny WAV: `silence` s of nothing, then `tone` s of a 660 Hz tone (16-bit mono, 22 050 Hz). */
function testWav(silence = 0.1, tone = 0.3) {
  const rate = 22050
  const n = Math.round((silence + tone) * rate)
  const data = Buffer.alloc(n * 2)
  for (let i = Math.round(silence * rate); i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 660 * i) / rate) * 12000), i * 2)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

// Each moment, its screen, and the sounds that must be heard when it plays
const MOMENTS = [
  { id: 'score-pop', label: 'Score pop', screen: 'board', sounds: ['seed.land', 'score.pop', 'score.arrive'] },
  { id: 'seed-lands', label: 'Seed lands + sprout', screen: 'board', sounds: ['cast.throw', 'seed.land', 'sprout.grow'] },
  { id: 'two-birds', label: 'Two birds (2-word cast)', screen: 'board', sounds: ['score.pop', 'cast.flourish'] },
  { id: 'tangle', label: 'Tangle', screen: 'board', sounds: ['seed.land', 'tangle'] },
  { id: 'no-shake', label: '"No" shake', screen: 'board', sounds: ['no'] },
  { id: 'your-turn', label: 'Your turn', screen: 'board', sounds: ['turn.yours'] },
  { id: 'reveal-count', label: 'Reveal count-up', screen: 'reveal', sounds: ['reveal.count'] },
  { id: 'grand-glyphtender', label: 'New Grand Glyphtender', screen: 'reveal', sounds: ['reveal.winner'] },
]

/** Dev Kit parts that scroll sideways (there should be none). Runs in the page. */
function sideways() {
  const out = []
  for (const el of document.querySelectorAll('aside.devkit *, dialog.devkit-preview *')) {
    if (el.tagName === 'IFRAME') continue
    const x = getComputedStyle(el).overflowX
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push(el.className)
  }
  return out
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const ok = (good, what) => (good ? console.log(`  ok   ${what}`) : fail(what))

/** The real game, with the Dev Kit open on `tab`. */
async function openGame(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
  await context.addInitScript(() => { // (full screen off: nothing to do with this)
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${PORT}/`)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.waitForFunction(() => window.__glyphtender?.store.getState().game !== null)
  await page.keyboard.press('Backquote')
  return { context, page, errors }
}

/** Open a Dev Kit tab (on a phone the tabs row is a carousel: ▶ to its page first, like a person would). */
async function pickTab(page, name) {
  const inView = () => page.evaluate((name) => {
    const view = document.querySelector('.devkit-tabs .dk-carousel-view')?.getBoundingClientRect()
    const tab = [...document.querySelectorAll('.devkit-tab')].find((t) => t.textContent === name)?.getBoundingClientRect()
    return !view || !tab || (tab.left >= view.left - 1 && tab.right <= view.right + 1)
  }, name)
  for (let i = 0; i < 6 && !(await inView()); i++) {
    await page.getByRole('button', { name: 'Next tools' }).click()
    await page.waitForTimeout(250)
  }
  await page.getByRole('tab', { name }).click()
}

/** The game's sound engine, read in the page (the same module the game uses). */
const engineValue = (page, path) => page.evaluate(async (path) => {
  const { getAudio } = await import('/src/audio/shared.ts')
  return path.split('|').reduce((o, k) => o?.[k], getAudio()?.config())
}, path)
const played = (page, id) => page.evaluate((id) => (window.__audioLog?.entries() ?? []).filter((e) => e.id === id && e.result === 'played').length, id)

/** Screens → open `screen` through one of its moments' buttons; resolves with the frame once it is ready. */
async function openMomentScreen(page, momentId) {
  await pickTab(page, 'Screens')
  await page.locator(`.pv-moment[data-moment="${momentId}"]`).click()
  await page.waitForSelector('dialog.devkit-preview[open] iframe')
  const frame = page.frameLocator('dialog.devkit-preview iframe')
  const handle = await page.locator('dialog.devkit-preview iframe').elementHandle()
  const content = await handle.contentFrame()
  await content.waitForFunction(() => window.__devkitPreview?.ready === true, null, { timeout: 30000 })
  return { frame, content }
}

/** ▶ a moment in the open panel; resolves once the frame says it played, with the frame's audio log of THIS play. */
async function playMoment(page, content, label) {
  const before = await content.evaluate(() => window.__devkitPreview.played)
  await content.evaluate(() => window.__audioLog?.clear()) // (the log keeps 200: start this play's from empty)
  await page.getByRole('button', { name: `Play ${label}`, exact: true }).click()
  await content.waitForFunction((n) => window.__devkitPreview.played > n || window.__devkitPreview.problems.length > 0, before, { timeout: 30000 })
  const problems = await content.evaluate(() => window.__devkitPreview.problems)
  const log = await content.evaluate(() => window.__audioLog?.entries() ?? [])
  return { problems, log }
}

try {
  // ─── Desktop: the whole thing ──────────────────────────────────────────────────────────────────────
  {
    console.log('--- desktop 1440×900')
    const { context, page, errors } = await openGame({ width: 1440, height: 900, mobile: false })
    const panel = page.locator('aside.devkit')

    // 1. Sound tab: list, a live volume change, a play
    await pickTab(page, 'Sound')
    const names = await panel.locator('.sb-sound-name').count()
    ok(names >= 30, `Sound tab lists ${names} sounds`)
    const buses = await panel.locator('.sb-bus .tt-group').allTextContents()
    ok(buses.length >= 3, `grouped by bus (${buses.map((b) => b.replace(/\s*\d+$/, '')).join(', ')})`)
    await panel.locator('.sb-sound-name', { hasText: /^no$/ }).click()
    const volume = panel.getByRole('spinbutton', { name: 'sounds.no.volumeDb', exact: true }).or(panel.locator('input[aria-label="sounds.no.volumeDb"]')).first()
    const savedDb = Number(await volume.inputValue())
    await volume.fill(String(savedDb - 6))
    await volume.press('Enter')
    await page.waitForTimeout(200)
    const liveDb = await engineValue(page, 'sounds|no|volumeDb')
    ok(liveDb === savedDb - 6, `"no" volume ${savedDb} → ${savedDb - 6} dB: the game's engine has ${liveDb} at once (no save)`)
    const before = await played(page, 'no')
    await panel.getByRole('button', { name: 'Play no', exact: true }).click()
    await page.waitForFunction((n) => (window.__audioLog?.entries() ?? []).filter((e) => e.id === 'no' && e.result === 'played').length > n, before, { timeout: 5000 }).catch(() => {})
    ok((await played(page, 'no')) > before, '▶ plays it with the new volume (logged "played")')
    await page.screenshot({ path: `${OUT}/desktop-1-sound-tab.png` })
    await panel.getByRole('button', { name: `Reset sounds.no.volumeDb to the saved value (${savedDb})` }).click()
    ok((await engineValue(page, 'sounds|no|volumeDb')) === savedDb, '↺ puts it back (live)')

    // 2. Add a file: WAV → MP3 in public/audio/ui/, trimmed, plays, credited, saved
    const wav = `${OUT}/test-tone.wav`
    writeFileSync(wav, testWav())
    const mp3Loaded = page.waitForResponse((r) => /\/audio\/ui\/.*\.mp3/.test(r.url()) && r.request().method() === 'GET', { timeout: 20000 }).catch(() => null)
    await panel.locator('.sb-drop input[type=file]').setInputFiles(wav)
    await panel.locator('.devkit-status', { hasText: /Added |Couldn't add/ }).waitFor({ timeout: 30000 })
    const status = await panel.locator('.devkit-status').textContent()
    ok(/^Added /.test(status), `drop: "${status}"`)
    ok(/trimmed/.test(status), 'its silent start was trimmed')
    const added = newFiles()
    ok(added.length === 1 && added[0].endsWith('.mp3'), `a new MP3 in ${UI_FOLDER}/: ${added.join(', ') || 'none'}`)
    const response = await mp3Loaded
    ok(response?.status() === 200, `the page loads it (${response?.status() ?? 'never asked'})`)
    if (added[0]) {
      const name = `ui/${added[0]}`
      const beforeFile = await played(page, 'no')
      await panel.getByRole('button', { name: `Play ${name}`, exact: true }).click()
      await page.waitForTimeout(600)
      const entries = await page.evaluate(() => window.__audioLog?.entries() ?? [])
      ok(entries.some((e) => e.file?.includes(added[0]) && e.result === 'played') || (await played(page, 'no')) > beforeFile, `▶ ${name} plays`)
      await panel.getByRole('button', { name: 'Add to credits' }).click()
      await panel.locator('.devkit-status', { hasText: /Credit added|Couldn't add the credit/ }).waitFor({ timeout: 10000 })
      ok(readFileSync(CREDITS, 'utf8').includes(name), 'Add to credits → content/credits.json has it')
      await panel.getByRole('button', { name: 'Save', exact: true }).click()
      await panel.locator('.devkit-status', { hasText: /Saved|Couldn't save/ }).waitFor({ timeout: 10000 })
      ok(JSON.parse(readFileSync(AUDIO, 'utf8')).sounds.no.files.includes(name), 'Save → content/audio.json lists it under "no"')
      await page.screenshot({ path: `${OUT}/desktop-2-file-added.png` })
    }
    putBack() // (the finally does it too)
    ok(newFiles().length === 0 && readFileSync(AUDIO, 'utf8') === originals[AUDIO], 'test MP3 deleted, audio.json + credits.json put back')
    // The page heard its own files change back: reload it so the next part starts clean
    await context.close()
    if (errors.length) fail(`console errors (Sound tab): ${errors.slice(0, 5).join(' | ')}`)
  }
  {
    const { context, page, errors } = await openGame({ width: 1440, height: 900, mobile: false })
    const momentSounds = [...new Set(MOMENTS.flatMap((m) => m.sounds))]
    const gameSounds = () => page.evaluate((ids) => (window.__audioLog?.entries() ?? []).filter((e) => ids.includes(e.id)).length, momentSounds)
    const realBefore = await gameSounds() // (the real game sits in its draft: none of these should ever play in it)

    // 3. Moments: each plays in the sandbox frame and its sounds are heard there
    let open = null
    for (const m of MOMENTS) {
      if (open?.screen !== m.screen) {
        if (open) await page.getByRole('button', { name: 'Close the preview' }).click()
        open = { screen: m.screen, ...(await openMomentScreen(page, m.id)) }
      }
      const label = m.label
      const { problems, log } = await playMoment(page, open.content, label)
      const heard = (id) => log.some((e) => e.id === id && e.result === 'played')
      const missing = m.sounds.filter((id) => !heard(id))
      const dropped = log.filter((e) => e.result === 'dropped' && m.sounds.includes(e.id)).map((e) => `${e.id} (${e.reason})`)
      ok(!problems.length && !missing.length, `${m.id} (${m.screen}): ${m.sounds.join(' + ')} heard in the frame${missing.length ? ` — MISSING ${missing.join(', ')}` : ''}${dropped.length ? ` · dropped: ${[...new Set(dropped)].join(', ')}` : ''}${problems.length ? ` · problems: ${problems.join(' | ')}` : ''}`)
      await page.screenshot({ path: `${OUT}/desktop-moment-${m.id}.png` }) // (as it ends: the vine stays, the pops have faded)
      if (m.id === 'score-pop') {
        // ▶ again: it sets itself up every time, so round 2 sounds like round 1
        const again = await playMoment(page, open.content, label)
        const pops = (l) => l.filter((e) => e.id === 'score.pop' && e.result === 'played').length
        ok(pops(again.log) === pops(log) && pops(log) > 0, `▶ again: the same pops again (${pops(log)}, then ${pops(again.log)})`)
        await page.screenshot({ path: `${OUT}/desktop-3-moment-score-pop.png` })

        // Presets: Punchy moves every slider, Balanced puts the saved values back
        const row = page.locator('.mo-moment[data-moment="score-pop"]')
        if ((await row.locator('.mo-name').getAttribute('aria-expanded')) !== 'true') await row.locator('.mo-name').click()
        const read = () => row.locator('.mo-knob input[type=number]').evaluateAll((inputs) => Object.fromEntries(inputs.map((i) => [i.getAttribute('aria-label'), Number(i.value)])))
        const balanced = await read()
        await row.getByRole('button', { name: 'Punchy', exact: true }).click()
        await page.waitForTimeout(200)
        const punchy = await read()
        const moved = Object.keys(balanced).filter((k) => balanced[k] !== punchy[k])
        ok(punchy.scorePopTime < balanced.scorePopTime, `Punchy: pop-in time ${balanced.scorePopTime} → ${punchy.scorePopTime} s (quicker)`)
        ok(punchy['sounds.score.pop.volumeDb'] > balanced['sounds.score.pop.volumeDb'], `Punchy: score.pop ${balanced['sounds.score.pop.volumeDb']} → ${punchy['sounds.score.pop.volumeDb']} dB (louder)`)
        ok(moved.length >= 6, `Punchy moved ${moved.length} of ${Object.keys(balanced).length} sliders (random pitch on the ladder stays)`)
        ok((await row.getByRole('button', { name: 'Punchy', exact: true }).getAttribute('aria-pressed')) === 'true', 'the picker shows Punchy')
        const frameAnim = await open.content.evaluate(async () => (await import('/src/devkit/tuning/liveTuning.ts')).latestTuning().find(([f]) => f === 'anim')?.[1]?.scorePopTime)
        ok(frameAnim === punchy.scorePopTime, `the frame's game got it live (scorePopTime ${frameAnim})`)
        const punchyRun = await playMoment(page, open.content, label)
        ok(!punchyRun.problems.length, 'plays in Punchy')
        await page.screenshot({ path: `${OUT}/desktop-4-moment-punchy.png` })
        await row.getByRole('button', { name: 'Balanced', exact: true }).click()
        await page.waitForTimeout(200)
        const back = await read()
        ok(Object.keys(balanced).every((k) => balanced[k] === back[k]), 'Balanced: every slider back at its saved value')
        await page.getByRole('button', { name: 'Undo unsaved' }).click().catch(() => {})
      }
    }
    if (open) await page.getByRole('button', { name: 'Close the preview' }).click()
    const realAfter = await gameSounds()
    ok(realAfter === realBefore, `the real game's log got none of the moments' sounds (${realBefore} → ${realAfter} game sounds)`)
    ok(TUNING.every((f, i) => readFileSync(f, 'utf8') === tuningBefore[i]), 'nothing saved (anim.json, feel.json as they were)')
    ;(await page.evaluate(sideways)).forEach((p) => fail(`scrolls sideways: ${p}`))
    if (errors.length) fail(`console errors (Moments): ${errors.slice(0, 5).join(' | ')}`)
    await context.close()
  }

  // ─── Phone: screenshots + nothing sideways ─────────────────────────────────────────────────────────
  {
    console.log('--- phone 390×844')
    const { context, page, errors } = await openGame({ width: 390, height: 844, mobile: true })
    await pickTab(page, 'Sound')
    await page.locator('aside.devkit .sb-sound-name', { hasText: /^score\.pop$/ }).click()
    await page.screenshot({ path: `${OUT}/phone-1-sound-tab.png` })
    ;(await page.evaluate(sideways)).forEach((p) => fail(`phone, Sound tab scrolls sideways: ${p}`))
    const { content } = await openMomentScreen(page, 'score-pop')
    const row = page.locator('.mo-moment[data-moment="score-pop"]')
    if ((await row.locator('.mo-name').getAttribute('aria-expanded')) !== 'true') await row.locator('.mo-name').click()
    const { problems } = await playMoment(page, content, 'Score pop')
    ok(!problems.length, 'phone: Score pop plays')
    await page.screenshot({ path: `${OUT}/phone-2-moments.png` })
    ;(await page.evaluate(sideways)).forEach((p) => fail(`phone, Moments scrolls sideways: ${p}`))
    if (errors.length) fail(`console errors (phone): ${errors.slice(0, 5).join(' | ')}`)
    await context.close()
  }
} finally {
  putBack()
  if (existsSync(`${OUT}/test-tone.wav`)) rmSync(`${OUT}/test-tone.wav`)
  await browser.close()
  await server.close()
}
console.log(failures ? `FAIL — ${failures} problem(s)` : `PASS — Sound tab (live edit, play, add a file) + 8 moments with their sounds + presets; screenshots in ${OUT}/`)
process.exit(failures ? 1 : 0)

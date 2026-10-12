// SUBMIT A WORD (F69) THROUGH THE REAL SCREENS AND A REAL LOCAL SERVER — a phone (390×844) in a pass-and-play game:
// 1. no seed planned → Pause's "Submit a word" row still opens; its screen says to place a seed first
// 2. a seed planned whose letters aren't a word → the row works → the picker lists exactly the stretches the engine
//    finds (3+ letters, not words, longest first) → Pause + picker shot at 390×844, 844×390, 768×343, 1440×900
//    (nothing clipped, buttons ≥ 44 px)
// 3. tap a word → "Word submitted" → the server's /words/list (with the admin key) has it as open, category player
// 4. the same word again → "Word submitted" again, the list doesn't grow
// 5. offline (the browser cut off) → "Word submitted", the word waits on the device, not on the server → back online →
//    it's sent by itself (the `online` event) → on the server
// 6. a seed with only 2-letter stretches → the picker says "Submitted words must be 3 or more letters", no word buttons
// Console clean. Starts its OWN `wrangler dev` (default port 1989, a fresh .wrangler/state-e2e-<port>, a test admin key)
// and Vite (default 5435) and stops only those.
// Shots: e2e-shots/submit-<size>-<step>.png
//   npm run e2e:submit-word [outDir] [vitePort] [partyPort]
import { mkdirSync, rmSync } from 'node:fs'
import { problems, startServers } from './online-kit.mjs'
import submit from '../content/words/submit.json' with { type: 'json' }

const OUT = process.argv[2] ?? 'e2e-shots'
const VITE_PORT = Number(process.argv[3] ?? 5435)
const PARTY_PORT = Number(process.argv[4] ?? 1989)
const KEY = 'e2e-submit-word-key' // this test server's WORDS_ADMIN_KEY (never the real one)
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const check = (what, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++ }

// A fresh submitted list every run (it fills itself from content/words/submitted.csv on first use)
try { rmSync(`.wrangler/state-e2e-${PARTY_PORT}`, { recursive: true, force: true }) } catch { /* in use: the list just carries on */ }
const { browser, stop } = await startServers(VITE_PORT, PARTY_PORT, 'npm run e2e:submit-word e2e-shots <vitePort> <partyPort>', { WORDS_ADMIN_KEY: KEY })

/** The server's list, as Muzzy's Dev Kit sees it: { WORD: row }. */
async function serverList() {
  const response = await fetch(`http://127.0.0.1:${PARTY_PORT}/words/list`, { headers: { Authorization: `Bearer ${KEY}` } })
  if (!response.ok) { fail(`/words/list answered ${response.status}`); return {} }
  return Object.fromEntries((await response.json()).words.map((row) => [row.word, row]))
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => { // (Full screen off: this check resizes the window)
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  const act = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
  const tap = (loc) => loc.tap()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const toastSays = (words) => page.locator('.kit-toasts').getByText(words, { exact: true }).waitFor({ timeout: 5000 }).then(() => true, () => false)
  const glidesDone = () => page.waitForFunction(() => [...document.querySelectorAll('[data-glide]')].every((g) => g.getAnimations().length === 0), null, { timeout: 4000 }).catch(() => {})
  const shot = async (label) => {
    await page.waitForTimeout(400)
    const { width, height } = page.viewportSize()
    await page.screenshot({ path: `${OUT}/submit-${width}x${height}-${label}.png` })
    const found = await page.evaluate(problems)
    found.forEach((p) => fail(`${width}x${height} ${label}: ${p}`))
    console.log(`${found.length ? 'FAIL' : 'ok  '} shot ${width}x${height} ${label}`)
  }
  const openPause = async () => { await tap(button('Menu')); await button('Back to the garden').waitFor({ timeout: 3000 }) }
  const closeAll = async () => {
    if (await button('Back').count()) await tap(button('Back'))
    if (await button('Back to the garden').count()) await tap(button('Back to the garden'))
    await page.waitForTimeout(300)
  }
  // Finds a turn whose picker shows `kind` (a list: at least 3 words — the offline step needs a second new one), jumps
  // there and plans it (move + aimed seed) through the store's real actions
  async function planSubmitTurn(kind) {
    await act(`(s) => s.startGame({ players: 2, seed: 11, hideSeeds: false })`)
    let pick = null
    for (let seed = 1; seed <= 30 && !pick; seed++) pick = await page.evaluate(([kind, seed]) => window.__glyphtender.findSubmitTurn(kind, seed, 3), [kind, seed])
    if (!pick) { fail(`found no turn whose picker shows "${kind}"`); return null }
    await page.waitForTimeout(200)
    await act(`(s) => s.tapGlyphling(${pick.glyphling})`)
    const [q, r] = pick.to.split(',').map(Number)
    await act(`(s) => s.tapHex({ q: ${q}, r: ${r} })`)
    await glidesDone()
    await act(`(s) => s.tapSeed('${pick.seed}')`)
    const [tq, tr] = pick.target.split(',').map(Number)
    await act(`(s) => s.tapHex({ q: ${tq}, r: ${tr} })`)
    if (!(await act('(s) => s.cast !== null'))) { fail('the seed was not aimed'); return null }
    return pick
  }

  await page.goto(`http://127.0.0.1:${VITE_PORT}/`)
  await tap(button('Play'))
  await tap(button('Start'))
  await page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 })
  await act(`(s) => s.startGame({ players: 2, seed: 11, hideSeeds: false })`)
  await page.waitForTimeout(300)

  // ---- 1. no seed planned: the row opens a screen that says to place a seed first (a greyed row's hint wrapped) ----
  await openPause()
  check('no seed planned → the row is there and pressable', (await button('Submit a word').count()) === 1 && (await button('Submit a word').isEnabled()))
  await shot('1-pause-no-seed')
  await tap(button('Submit a word'))
  await page.waitForTimeout(300)
  check('… and its screen says "Place a seed first"', await page.getByText(/Place a seed first/).isVisible())
  await shot('1b-submit-no-seed')
  await closeAll()

  // ---- 2. a seed planned: the picker lists the engine's stretches ----
  const pick = await planSubmitTurn('list')
  if (pick) {
    console.log(`     planned ${pick.seed} → ${pick.target}: picker ${pick.words.join(' ')}`)
    const before = await serverList()
    check(`the list fills itself from submitted.csv (${Object.keys(before).length} rows)`, Object.keys(before).length > 0)
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 343 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(size)
      await page.waitForTimeout(300)
      await openPause()
      check(`${size.width}x${size.height}: the row works with a seed planned`, await button('Submit a word').isEnabled())
      await shot('2-pause')
      await tap(button('Submit a word'))
      await page.getByText('Not a word yet? Pick the one you meant.').waitFor({ timeout: 3000 })
      const shown = await page.locator('section[role=dialog][aria-label="Submit a word"] .kit-button').evaluateAll((list) => list.map((b) => b.textContent.trim()).filter((t) => t !== 'Back'))
      check(`${size.width}x${size.height}: the picker lists ${shown.join(' ')} (= the engine's, ≤ ${submit.pickerMax}, longest first)`,
        shown.join() === pick.words.join() && shown.length <= submit.pickerMax && shown.every((w, i) => i === 0 || shown[i - 1].length >= w.length))
      await shot('3-picker')
      await closeAll()
    }
    await page.setViewportSize({ width: 390, height: 844 })

    // ---- 3. tap a word → "Word submitted" → open on the server ----
    const fresh = pick.words.filter((w) => !before[w])
    const [first, second] = fresh
    if (!first) fail(`every picker word was already on the list (${pick.words}) — try another game seed`)
    else {
      const submitFrom = async (word) => {
        await openPause()
        await tap(button('Submit a word'))
        await tap(button(word))
        return toastSays('Word submitted')
      }
      check(`tap ${first} → "Word submitted"`, await submitFrom(first))
      check('the picker closed (back on Pause)', (await button(first).count()) === 0 && (await button('Back to the garden').count()) === 1)
      await shot('4-submitted')
      await closeAll()
      const after = await serverList()
      check(`the server has ${first} as open · player (${JSON.stringify(after[first])})`, after[first]?.status === 'open' && after[first]?.category === 'player')
      check('exactly one row was added', Object.keys(after).length === Object.keys(before).length + 1)

      // ---- 4. the same word again: same answer, nothing added ----
      await page.waitForTimeout(3200) // (the first toast fades)
      check(`${first} again → "Word submitted" again`, await submitFrom(first))
      await closeAll()
      check('…and the list did not grow', Object.keys(await serverList()).length === Object.keys(after).length)

      // ---- 5. offline: kept on the device, sent when back online ----
      if (!second) fail(`only one new word in this picker (${pick.words}) — the offline step needs two`)
      else {
        await page.waitForTimeout(3200)
        await context.setOffline(true)
        check(`offline: ${second} → "Word submitted"`, await submitFrom(second))
        await closeAll()
        const waiting = await page.evaluate(() => window.__glyphtender.queuedWords())
        check(`…it waits on the device (${waiting})`, waiting.includes(second))
        check('…and is not on the server', !(await serverList())[second])
        await context.setOffline(false)
        const sent = await page.waitForFunction(() => window.__glyphtender.queuedWords().length === 0, null, { timeout: 8000 }).then(() => true, () => false)
        check('back online → sent by itself (nothing waiting)', sent)
        check(`…and ${second} is on the server as open`, (await serverList())[second]?.status === 'open')
      }
    }
  }

  // ---- 6. only 2-letter stretches: the "too short" message ----
  const short = await planSubmitTurn('tooShort')
  if (short) {
    await openPause()
    await tap(button('Submit a word'))
    const message = `Submitted words must be ${submit.minLetters} or more letters`
    const said = await page.getByText(message, { exact: true }).waitFor({ timeout: 3000 }).then(() => true, () => false)
    const wordButtons = await page.locator('section[role=dialog][aria-label="Submit a word"] .kit-button').evaluateAll((list) => list.filter((b) => b.textContent.trim() !== 'Back').length)
    check(`only 2-letter stretches → "${message}", no word to pick`, said && wordButtons === 0)
    await shot('5-too-short')
    await closeAll()
  }

  check(`console clean${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`, errors.length === 0)
  await context.close()
} catch (e) {
  fail(`crashed: ${e.stack ?? e}`)
} finally {
  await stop()
}
console.log(failures ? `\n${failures} problem(s) — see above` : '\nPASS — Submit a word works end to end')
process.exit(failures ? 1 : 0)

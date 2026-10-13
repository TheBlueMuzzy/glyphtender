// WORD SWITCHES (F71) — British spelling / Vulgar words are TABLE options, like 2-letter words (Muzzy 2026-10-12: "it's
// just like the 2-letter option"): New Game and the online host's lobby, never Settings. Through the real screens and a
// real local server:
// 1. New Game shows both switches, off — shots at 390×844, 844×390, 768×343, 1440×900 (nothing clipped); Settings has
//    neither (and no Difficulty row)
// 2. British on → Start → the game's config + word list have it → a hand-made turn (devHook castWord) spells COLOUR:
//    the Plant button previews Magic, and after the throw COLOUR is one of the turn's words, Magic scored
// 3. the next New Game remembers British on; switched off → the same turn does NOT make COLOUR
// 4. online: the host turns Vulgar words on in the lobby → Start → both games have it (config + word list: COCK) and
//    the guest's Pause says so
// Console clean. Starts its OWN `wrangler dev` (default port 1984, its own .wrangler/state-e2e-<port>) and Vite
// (default 5437) and stops only those.
//   npm run e2e:word-switches [outDir] [vitePort] [partyPort]
import { mkdirSync } from 'node:fs'
import { makePlayer, problems, startServers } from './online-kit.mjs'

const OUT = process.argv[2] ?? 'e2e-shots'
const VITE_PORT = Number(process.argv[3] ?? 5437)
const PARTY_PORT = Number(process.argv[4] ?? 1984)
const SETTINGS_KEY = 'kit-settings:' // the kit's Settings slot for a page at "/"
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const check = (what, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++ }

const { browser, stop } = await startServers(VITE_PORT, PARTY_PORT, 'npm run e2e:word-switches e2e-shots <vitePort> <partyPort>')

/** A context with Full screen off in its saved Settings (this check resizes the window). */
async function newContext(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: !!size.mobile, hasTouch: !!size.mobile })
  await context.addInitScript((key) => {
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  }, SETTINGS_KEY)
  return context
}

const watchErrors = (page) => {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

try {
  // ───────────── pass-and-play: New Game → British spelling ─────────────
  {
    const context = await newContext({ width: 390, height: 844, mobile: true })
    const page = await context.newPage()
    const errors = watchErrors(page)
    const store = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
    const hook = (fn) => page.evaluate(`(${fn})(window.__glyphtender)`)
    const button = (name) => page.getByRole('button', { name, exact: true })
    const switchOf = (name) => page.getByRole('switch', { name })
    const setSwitch = async (name, on) => {
      await switchOf(name).scrollIntoViewIfNeeded()
      if ((await switchOf(name).getAttribute('aria-checked')) !== String(on)) await switchOf(name).click()
      check(`New Game → ${name} is ${on ? 'on' : 'off'}`, (await switchOf(name).getAttribute('aria-checked')) === String(on))
    }
    const start = async () => {
      await page.getByRole('button', { name: 'Start' }).click()
      await page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready' && window.__glyphtender.store.getState().game, null, { timeout: 15000 })
    }
    // Plays the hand-made COLOUR turn by the store's real actions; gives back the turn's words
    const playColour = async () => {
      const turn = await hook(`(h) => h.castWord('COLOUR')`)
      if (!turn) { fail('castWord found no COLOUR turn'); return { words: [], cast: '' } }
      const hex = (key) => { const [q, r] = key.split(',').map(Number); return `{ q: ${q}, r: ${r} }` }
      await store(`(s) => s.tapGlyphling(${turn.glyphling})`)
      await store(`(s) => s.tapHex(${hex(turn.to)})`)
      await page.waitForTimeout(600)
      await store(`(s) => s.tapSeed('${turn.seed}')`)
      await store(`(s) => s.tapHex(${hex(turn.target)})`)
      await page.waitForTimeout(400)
      const cast = (await page.getByRole('button', { name: /^Plant/ }).first().textContent().catch(() => '')) ?? ''
      const before = await store((s) => s.game.turnCount)
      await store(`(s) => s.startCast()`)
      await page.waitForFunction((n) => window.__glyphtender.store.getState().game.turnCount > n, before, { timeout: 10000 }).catch(() => fail('the cast never landed'))
      return { words: await store((s) => s.game.lastTurn?.words.map((w) => w.word) ?? []), magic: await store((s) => s.game.lastTurn?.magic ?? 0), cast }
    }

    await page.goto(`http://127.0.0.1:${VITE_PORT}/`)
    // Settings: neither switch (they're table options now), no Difficulty
    await button('Settings').click()
    const nextTab = page.locator('.kit-screen .kit-picker').first().getByRole('button').last()
    for (let i = 0; i < 8 && (await page.locator('.kit-picker-value', { hasText: /^Gameplay$/ }).count()) === 0; i++) await nextTab.click()
    check('Settings → Gameplay: no word switches, no Difficulty row',
      (await page.getByRole('switch', { name: /British|Vulgar/ }).count()) === 0 && (await page.getByText('Difficulty', { exact: true }).count()) === 0)
    await page.keyboard.press('Escape')

    await button('Play').click()
    check('New Game: British spelling + Vulgar words, both off at first',
      (await switchOf('British spelling').getAttribute('aria-checked')) === 'false' && (await switchOf('Vulgar words').getAttribute('aria-checked')) === 'false')
    for (const [width, height] of [[390, 844], [844, 390], [768, 343], [1440, 900]]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(400)
      await switchOf('Vulgar words').scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${OUT}/word-switches-new-game@${width}x${height}.png` })
      const found = await page.evaluate(problems)
      found.forEach((p) => fail(`new game ${width}x${height}: ${p}`))
      console.log(`${found.length ? 'FAIL' : 'ok  '} shot New Game ${width}x${height}`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await setSwitch('British spelling', true)
    await start()
    check('the new game started with British on (config.extraWords)', await store((s) => JSON.stringify(s.game.config.extraWords) === '{"british":true}'))
    check('the game’s word list has COLOUR, not COCK', await store((s) => s.words.has('COLOUR') && !s.words.has('COCK')))
    const on = await playColour()
    check(`British on: the cast preview shows Magic ("${on.cast.trim()}")`, /\+\d/.test(on.cast))
    check(`British on: COLOUR scored (${on.words.join(', ')}; ${on.magic} Magic)`, on.words.includes('COLOUR') && on.magic > 0)
    await page.screenshot({ path: `${OUT}/word-switches-colour.png` })

    // The next game: New Game remembers British on; switched off, COLOUR isn't a word
    await page.goto(`http://127.0.0.1:${VITE_PORT}/`)
    await button('Play').click()
    check('New Game remembers British spelling on', (await switchOf('British spelling').getAttribute('aria-checked')) === 'true')
    await setSwitch('British spelling', false)
    await start()
    check('the next game: British off (no extraWords)', await store((s) => s.game.config.extraWords === undefined && !s.words.has('COLOUR')))
    const off = await playColour()
    check(`British off: the same turn does not make COLOUR (${off.words.join(', ') || 'no words'})`, !off.words.includes('COLOUR'))
    if (errors.length) fail(`pass-and-play: console errors: ${errors.join(' | ')}`)
    await context.close()
  }

  // ───────────── online: the host's lobby option rules the room ─────────────
  {
    const size = { width: 390, height: 844, mobile: true }
    const ada = makePlayer('Ada', await newContext(size), size, { vitePort: VITE_PORT, out: OUT, fail })
    const bo = makePlayer('Bo', await newContext(size), size, { vitePort: VITE_PORT, out: OUT, fail })
    await ada.open()
    await ada.tap(ada.page.getByRole('button', { name: 'Play online' }))
    await ada.page.getByRole('textbox', { name: 'Your name' }).fill('Ada')
    await ada.tap(ada.page.getByRole('button', { name: 'Create a room' }))
    await ada.page.getByText(/^Room [A-Z]{4}$/).waitFor({ timeout: 10000 })
    const code = await ada.room((s) => s.code)
    const vulgar = ada.page.getByRole('switch', { name: 'Vulgar words' })
    await vulgar.scrollIntoViewIfNeeded()
    check('the host’s lobby has both switches, off', (await vulgar.getAttribute('aria-checked')) === 'false'
      && (await ada.page.getByRole('switch', { name: 'British spelling' }).getAttribute('aria-checked')) === 'false')
    await ada.tap(vulgar)
    check('the host turns Vulgar words on in the lobby', (await vulgar.getAttribute('aria-checked')) === 'true')
    await ada.shot('host-lobby', 400, 'word-switches')

    await bo.open()
    await bo.tap(bo.page.getByRole('button', { name: 'Play online' }))
    await bo.page.getByRole('textbox', { name: 'Your name' }).fill('Bo')
    await bo.page.locator('.kit-roomcode-box').first().click()
    await bo.page.keyboard.type(code.toLowerCase())
    await bo.tap(bo.page.getByRole('button', { name: 'Join', exact: true }))
    await bo.page.getByRole('button', { name: 'I’m ready' }).waitFor({ timeout: 10000 })
    await bo.tap(bo.page.getByRole('button', { name: 'I’m ready' }))
    await ada.page.waitForFunction(() => !document.querySelector('.kit-modal button:last-child')?.disabled, null, { timeout: 10000 })
    await ada.tap(ada.page.getByRole('button', { name: 'Start game' }))
    for (const p of [ada, bo]) await p.page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready' && window.__glyphtender.store.getState().game, null, { timeout: 15000 })
    for (const p of [ada, bo]) {
      check(`${p.name}'s game has the host's Vulgar words on`, await p.store((s) => JSON.stringify(s.game.config.extraWords) === '{"vulgar":true}'))
      check(`${p.name}'s word list counts COCK (and not COLOUR)`, await p.store((s) => s.words.has('COCK') && !s.words.has('COLOUR')))
    }
    await bo.tap(bo.page.getByRole('button', { name: 'Menu', exact: true }))
    await bo.page.getByRole('button', { name: 'Back to the garden' }).waitFor({ timeout: 3000 })
    check('the guest’s Pause says "Vulgar words on"', (await bo.page.getByRole('dialog').getByText(/Vulgar words on/).count()) > 0)
    await bo.shot('guest-pause', 400, 'word-switches')
    for (const p of [ada, bo]) if (p.errors.length) fail(`${p.name}: console errors: ${p.errors.join(' | ')}`)
  }
} catch (error) {
  fail(String(error))
} finally {
  await stop()
}

console.log(failures ? `\n✗ word switches e2e: ${failures} failed` : '\n✓ word switches e2e passed')
process.exit(failures ? 1 : 0)

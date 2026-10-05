// PLAY AGAINST THE AI THROUGH THE REAL SCREEN (F42).
//   1. Solo vs 1 AI, to the end (phone 390×844): New game → Blue = AI (the Strategist, Apprentice) → Settings → AI speed
//      Instant → Start. The person's turns are tapped like e2e:pass does; the AI thinks in its Web Worker and plays by
//      itself (its prompt says "… is thinking…", a robot badge on the turn bar). No handoff ever (one person). The end
//      screen opens; its Results and Story pages still work after an AI game.
//   2. 2 people + 2 AIs, hide seeds ON, to the end (desktop 1440×900): Yellow person · Blue AI · Purple person · Pink AI.
//      The device is passed only to people — never to an AI, and the AI's seeds never show.
//   3. Screenshots at 7 sizes (390×844, 360×780, 844×390, 768×343, 1100×800, 1440×900, 1920×1080): New Game with AI seats
//      (4 players, Blue + Pink AI, their personality cards) and a game during an AI's turn (AI speed Slow, "is thinking…").
//      Each is checked: no sideways scroll, nothing past a screen edge, nothing touching the inside edge of an AI card,
//      and every AI card the same size whichever personality it shows.
// Starts its OWN dev server (default port 5431 — never Muzzy's 5180) and closes only that one at the end.
//   node e2e/ai-play.mjs [outDir] [port]          (npm run e2e:ai)
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots'
const PORT = Number(process.argv[3] ?? 5431)
mkdirSync(OUT, { recursive: true })
const URL_ = `http://127.0.0.1:${PORT}/`
const SETTINGS_KEY = 'kit-settings:' // the kit's Settings slot for a page at "/" (kit settingsStorageKey)

const SIZES = [
  { name: 'phone-tall', width: 390, height: 844, mobile: true },
  { name: 'phone-small', width: 360, height: 780, mobile: true },
  { name: 'phone-wide', width: 844, height: 390, mobile: true },
  { name: 'short-wide', width: 768, height: 343, mobile: true },
  { name: 'laptop', width: 1100, height: 800, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'big', width: 1920, height: 1080, mobile: false },
]

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }

/** What's wrong on screen: sideways scroll, things past an edge (outside scroll boxes), things touching an AI card's edge. */
function problems() {
  const out = []
  if (document.documentElement.scrollWidth > innerWidth + 0.5) out.push(`sideways scroll (${document.documentElement.scrollWidth} > ${innerWidth})`)
  for (const el of document.querySelectorAll('.game button, .game-tray, .kit-screen button, .kit-text, .kit-card')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const name = (el.textContent || el.getAttribute('class') || '').trim().slice(0, 30)
    const scroll = el.closest('.kit-scroll')
    const box = scroll ? scroll.getBoundingClientRect() : { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
    // in a scroll box only left/right count (it scrolls up and down on purpose)
    if (r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`clipped sideways: ${name}`)
    if (!scroll && (r.top < -0.5 || r.bottom > innerHeight + 0.5)) out.push(`clipped: ${name}`)
  }
  // Breathing room: nothing inside an AI card touches its edge
  for (const card of document.querySelectorAll('.kit-card')) {
    const c = card.getBoundingClientRect()
    for (const el of card.querySelectorAll('.kit-avatar, .kit-text, .kit-picker, .kit-card-title')) {
      const r = el.getBoundingClientRect()
      if (!r.width) continue
      const room = Math.min(r.left - c.left, c.right - r.right, r.top - c.top, c.bottom - r.bottom)
      if (room < 4) out.push(`touches its card's edge (${Math.round(room)} px): ${(el.textContent || el.className).trim().slice(0, 30)}`)
    }
  }
  return out
}

try {
  // ───────────── 1. Solo vs 1 AI, to the end ─────────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const errors = watchErrors(page)
    const h = helpers(page, true, 'solo')
    await page.goto(URL_)
    // Settings → Gameplay → AI speed: Normal → Instant (Normal · Fast · Instant: 2 steps on)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    // (a phone shows the tabs as one ◀ Audio ▶ picker: step it on to Gameplay)
    const nextTab = page.locator('.kit-screen .kit-picker').first().getByRole('button').last()
    for (let i = 0; i < 3; i++) await nextTab.click()
    h.check('Settings is on Gameplay', (await page.locator('.kit-picker-value', { hasText: 'Gameplay' }).count()) === 1)
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next AI speed' }).click()
    h.check('Settings → AI speed is Instant', (await page.locator('.kit-picker-value', { hasText: 'Instant' }).count()) === 1)
    await page.keyboard.press('Escape')
    // New game: Blue = AI → its card (Surprise me at First Class) → the Strategist, Apprentice
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Next Blue', exact: true }).click()
    h.check('Blue switched to AI shows its personality card', (await page.locator('.kit-card').count()) === 1)
    h.check('a new AI seat starts as "Surprise me" at First Class',
      (await page.locator('.kit-card .kit-picker-value', { hasText: 'Surprise me' }).count()) === 1
      && (await page.locator('.kit-card .kit-picker-value', { hasText: 'First Class' }).count()) === 1)
    await page.getByRole('button', { name: 'Next Blue: Personality' }).click()
    await page.getByRole('button', { name: 'Previous Blue: Skill' }).click()
    h.check('picked the Strategist at Apprentice', (await page.locator('.kit-card .kit-picker-value', { hasText: 'the Strategist' }).count()) === 1
      && (await page.locator('.kit-card .kit-picker-value', { hasText: 'Apprentice' }).count()) === 1)
    await page.getByRole('button', { name: 'Start' }).click()
    await h.ready()
    h.check('Blue is the AI: the Strategist at Apprentice', await h.store((s) => s.seats[1].kind === 'bot' && s.seats[1].ai.personality === 'Strategist' && s.seats[1].ai.skill === 'Apprentice'))
    const seen = await h.playToTheEnd({ maxHandoffs: 0 })
    h.check('the AI said it was thinking on its turn', seen.thinking > 0)
    h.check('the robot badge showed on the AI\'s turn', seen.badge > 0)
    h.check('the AI played turns of its own', await h.store((s) => s.game.log.turns.some((t) => t.seat === 1)))
    await h.endScreen(2)
    // New game remembers the AI seat and its picks
    await page.getByRole('dialog', { name: /Grand Glyphtender/ }).getByRole('button', { name: 'New game' }).click()
    await page.getByRole('button', { name: 'Start' }).waitFor({ timeout: 3000 })
    h.check('New game remembers Blue = AI, the Strategist, Apprentice',
      (await page.locator('.kit-card .kit-picker-value', { hasText: 'the Strategist' }).count()) === 1
      && (await page.locator('.kit-card .kit-picker-value', { hasText: 'Apprentice' }).count()) === 1)
    if (errors.length) fail(`solo: console errors: ${errors.join(' | ')}`)
    await page.close()
  }

  // ───────────── 2. 2 people + 2 AIs, hide seeds on, to the end ─────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ aiSpeed: 'Instant' })), [SETTINGS_KEY])
    const errors = watchErrors(page)
    const h = helpers(page, false, 'mixed')
    await page.goto(URL_)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    for (let n = 2; n < 4; n++) await page.getByRole('button', { name: 'Next Players' }).click()
    await page.getByRole('button', { name: 'Next Blue', exact: true }).click()
    await page.getByRole('button', { name: 'Next Pink', exact: true }).click()
    await page.getByRole('switch', { name: 'Hide seeds between turns' }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await h.ready()
    h.check('Yellow person · Blue AI · Purple person · Pink AI', await h.store((s) => s.seats.map((x) => x.kind).join() === 'human,bot,human,bot'))
    h.check('"Surprise me" became a real personality at Start', await h.store((s) => s.seats[1].ai.personality !== 'surprise' && s.seats[3].ai.personality !== 'surprise'))
    const seen = await h.playToTheEnd({ maxHandoffs: Infinity })
    h.check('the device was passed between the people', seen.handoffs > 0)
    h.check('both AIs played', await h.store((s) => [1, 3].every((seat) => s.game.log.turns.some((t) => t.seat === seat))))
    await h.endScreen(4)
    if (errors.length) fail(`mixed: console errors: ${errors.join(' | ')}`)
    await page.close()
  }

  // ───────────── 3. Screenshots at every size ─────────────
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    await page.addInitScript(([key]) => {
      localStorage.setItem(key, JSON.stringify({ aiSpeed: 'Slow' }))
      // 4 players: Blue = AI (Surprise me, First Class), Pink = AI (the Scholar, Archmage)
      const seat = (ai, personality = 'surprise', skill = 'FirstClass') => ({ ai, personality, skill })
      localStorage.setItem('glyphtender:new-game', JSON.stringify({
        players: 4, boardName: 'large', twoLetterWords: true, hideSeeds: false, wordIndicators: true,
        seats: [seat(false), seat(true), seat(false), seat(true, 'Scholar', 'Archmage')],
      }))
    }, [SETTINGS_KEY])
    const errors = watchErrors(page)
    const h = helpers(page, size.mobile, size.name)
    await page.goto(URL_)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    h.check('two AI cards', (await page.locator('.kit-card').count()) === 2)
    await h.shot('1-new-game-ai')
    // the cards hold one size whatever personality shows: flip Blue's through all 8 (Surprise me + 7)
    const cardSize = () => page.evaluate(() => [...document.querySelectorAll('.kit-card')].map((c) => `${Math.round(c.getBoundingClientRect().width)}×${Math.round(c.getBoundingClientRect().height)}`).join(' '))
    const sizes = new Set()
    for (let i = 0; i < 8; i++) {
      sizes.add(await cardSize())
      await page.getByRole('button', { name: 'Next Blue: Personality' }).click()
    }
    h.check(`the AI cards keep one size through every personality (${[...sizes].join(' | ')})`, sizes.size === 1)
    // scroll to the bottom of the options (the Pink card) for a second look
    await page.locator('.kit-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await h.shot('2-new-game-ai-scrolled')
    // Start with Yellow first: once Yellow places, Blue (AI, Slow) thinks — the shot is taken during its thinking
    await page.getByRole('button', { name: 'Start' }).click()
    await h.ready()
    await h.tap(page.locator('[data-option="move"] circle').nth(5))
    await page.waitForFunction(() => document.querySelector('.game-prompt')?.textContent.includes('is thinking…'), null, { timeout: 5000 })
    h.check('the robot badge is on the turn bar', (await page.locator('[data-seat-status="ai"]').count()) === 1)
    await h.shot('3-ai-thinking', 100)
    if (errors.length) fail(`${size.name}: console errors: ${errors.join(' | ')}`)
    await page.close()
  }
} catch (error) {
  fail(`crashed: ${error.stack ?? error}`)
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} problem(s)` : '\nAll AI checks passed')
process.exit(failures ? 1 : 0)

// ─── helpers ───

function watchErrors(page) {
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

function helpers(page, mobile, tag) {
  const tap = (loc) => (mobile ? loc.tap() : loc.click())
  const tapGlyph = (loc) => (mobile ? loc.tap({ force: true }) : loc.click({ force: true })) // (a pulsing glyphling never holds still)
  const store = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
  const check = (what, ok) => { if (!ok) fail(`${tag}: ${what}`); else console.log(`ok   ${tag}: ${what}`) }
  const option = (kind, pick) => page.locator(`[data-option="${kind}"] circle`).nth(pick)
  const optionCount = (kind) => page.locator(`[data-option="${kind}"] circle`).count()

  return {
    tap, store, check,
    ready: () => page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 }),

    async shot(name, settle = 400) {
      await page.waitForTimeout(settle)
      await page.screenshot({ path: `${OUT}/ai-${tag}-${name}.png` })
      const out = await page.evaluate(problems)
      out.forEach((p) => fail(`${tag} ${name}: ${p}`))
      console.log(`${out.length ? 'FAIL' : 'ok  '} ${tag} ${name}`)
    },

    /** Plays to the end: people tap their turns (like e2e:pass), the AIs play themselves. Counts what was seen. */
    async playToTheEnd({ maxHandoffs }) {
      const seen = { thinking: 0, badge: 0, handoffs: 0, personTurns: 0 }
      const started = Date.now()
      while (!(await store((s) => s.game.phase === 'over'))) {
        if (Date.now() - started > 600_000) { fail(`${tag}: the game didn't end in 10 minutes`); break }
        const now = await store((s) => ({
          bot: s.seats[s.game.current].kind === 'bot', handoff: s.handoff?.seat ?? null, phase: s.game.phase,
          busy: s.flying || s.handoff !== null || s.refreshFx !== null || s.scoring !== null || s.move !== null && s.seats[s.game.current].kind === 'bot',
          seatKinds: s.seats.map((x) => x.kind), viewerBot: s.handoff === null && s.seats[s.lastViewer]?.kind === 'bot',
        }))
        if (now.viewerBot) fail(`${tag}: the screen shows an AI's seeds`)
        if (now.handoff !== null) {
          if (now.seatKinds[now.handoff] === 'bot') fail(`${tag}: the device was passed to an AI`)
          seen.handoffs++
          await tap(page.getByRole('button', { name: 'Show my seeds' }))
          continue
        }
        if (now.bot) {
          const prompt = await page.locator('.game-prompt-row:not(.game-prompt-sizer)').textContent()
          if (prompt.includes('is thinking…')) seen.thinking++
          if (await page.locator('[data-seat-status="ai"]').count()) seen.badge++
          await page.waitForTimeout(60)
          continue
        }
        if (now.busy) { await page.waitForTimeout(60); continue }
        // A person's turn
        seen.personTurns++
        if (now.phase === 'draft') { await tap(option('move', Math.floor((await optionCount('move')) / 2))); continue }
        if (now.phase === 'refresh') { await tap(page.getByRole('button', { name: 'Keep all' })); continue }
        const mine = await store((s) => s.game.glyphlings.filter((g) => g.seat === s.game.current && !s.game.tangled.includes(g.id)).map((g) => g.id))
        // a glyphling that can move (a hemmed-in one shows no move options)
        let moved = false
        for (const id of mine) {
          await tapGlyph(page.locator(`[data-glyph="${id}"]`))
          if (await optionCount('move')) { moved = true; break }
        }
        if (!moved) { fail(`${tag}: a person's turn with nothing to move`); break }
        await tap(option('move', Math.floor((await optionCount('move')) / 2)))
        const pick = await page.evaluate(() => window.__glyphtender.findCast(true) ?? window.__glyphtender.findCast(false))
        if (pick) {
          const pos = await store(`(s) => s.trayOrder[s.game.current].indexOf('${pick.seed}')`)
          await tap(page.locator(`[data-tray-pos="${pos}"]`))
          await tap(page.locator(`[data-option="cast"] circle[data-hex="${pick.hex}"]`))
        }
        await tap(page.locator('.game-actions button').last()) // Cast (or End turn)
        await page.waitForFunction(() => !window.__glyphtender.store.getState().flying, null, { timeout: 8000 })
      }
      if (seen.handoffs > maxHandoffs) fail(`${tag}: ${seen.handoffs} handoffs (expected at most ${maxHandoffs})`)
      check(`played to the end (${seen.personTurns} person actions, ${seen.handoffs} handoffs, ${Math.round((Date.now() - started) / 1000)} s)`, await store((s) => s.game.phase === 'over'))
      return seen
    },

    /** The end screen after an AI game: the reveal, then Results (every player) and the Story chart. */
    async endScreen(players) {
      const skip = page.getByRole('button', { name: 'Skip' })
      if (await skip.isVisible().catch(() => false)) await tap(skip)
      const table = page.getByRole('dialog', { name: /Grand Glyphtender/ })
      await table.waitFor({ timeout: 30000 })
      await this.shot('9-end-results', 700)
      check(`the end screen shows ${players} players`, (await table.locator('.game-end-player').count()) === players)
      await tap(table.getByRole('tab', { name: 'Story' }))
      await page.waitForTimeout(500)
      check('the Story page draws its chart', (await table.locator('.game-end-story svg').count()) > 0)
      await this.shot('9-end-story', 300)
      await tap(table.getByRole('tab', { name: 'Results' }))
    },
  }
}

// THE TUTORIAL SHELL (F74, design/tutorial.md §0–1) — who gets the tutorial game, and how it unlocks.
//   · a brand-new device (?tutorial=fresh): Play online is locked (looks disabled); a tap on it shows the callout
//     "Finish your first game to unlock this."; Play opens the 3 overview cards (Skip on the first two), the last
//     card's "Let's play!" deals the tutorial game (you vs Sprout)
//   · in it, Pause says Leave tutorial; its confirm → the main menu with everything unlocked, remembered on reload,
//     and Play now opens New Game
//   · Skip on the first card also deals the tutorial game
//   · a device that played before the tutorial existed (glyphtender:new-game saved) sees no lock
//   · Settings → Replay tutorial game opens the overview again
// Screenshots at a phone and a desktop size go to the out folder. Starts its OWN dev server (default port 5440).
//   npm run e2e:tutorial-shell [outDir] [port]
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/tutorial-shell'
const PORT = Number(process.argv[3] ?? 5440)
const URL = `http://127.0.0.1:${PORT}/?tutorial=fresh`
const SIZES = [{ width: 390, height: 844, mobile: true }, { width: 1440, height: 900, mobile: false }]
mkdirSync(OUT, { recursive: true })

let failures = 0
const ok = (good, what) => { if (!good) { failures++; console.log(`  FAIL ${what}`) } else console.log(`ok   ${what}`) }
const settle = (page) => page.waitForTimeout(600) // (screens fade in: let them finish before a picture)
const button = (page, name) => page.getByRole('button', { name, exact: true })

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
const errors = []
async function fresh(size, init) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
  await context.addInitScript(() => { // (full screen off: it would change the window's size)
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  if (init) await context.addInitScript(init)
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(URL)
  await button(page, 'Play').waitFor()
  return { context, page }
}

try {
  for (const size of SIZES) {
    const name = `${size.width}x${size.height}`
    console.log(`— ${name}`)
    // A brand-new device
    {
      const { context, page } = await fresh(size)
      const online = button(page, 'Play online')
      ok(await online.getAttribute('aria-disabled') === 'true', 'new device: Play online is locked')
      await online.click({ force: true }) // (aria-disabled: Playwright waits for 'enabled'; a real tap still lands)
      const hint = page.getByText('Finish your first game to unlock this.')
      ok(await hint.isVisible().catch(() => false) || (await hint.waitFor({ timeout: 2000 }).then(() => true, () => false)), 'a tap on it shows the callout')
      await settle(page)
      await page.screenshot({ path: `${OUT}/locked-${name}.png` })
      ok(await page.getByRole('heading', { name: 'Online' }).count() === 0 && await button(page, 'Create a room').count() === 0, 'it does not open Play online')
      await button(page, 'Play').click()
      await page.getByText('Move, then plant').waitFor()
      ok(await hint.count() === 0, 'tapping Play closes the locked callout')
      ok(await button(page, 'Skip').isVisible(), 'overview card 1 has Skip')
      await settle(page)
      await page.screenshot({ path: `${OUT}/overview-${name}.png` })
      await button(page, 'Next').click()
      await page.getByText('Words make Magic').waitFor()
      await button(page, 'Next').click()
      await page.getByText('A tangled garden').waitFor()
      ok(await button(page, 'Skip').count() === 0, 'the last card has no Skip')
      await button(page, "Let's play!").click()
      await page.locator('[data-hex]').first().waitFor()
      ok(await page.locator('[data-hex]').count() > 50, "Let's play! deals the tutorial game")
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${OUT}/tutorial-game-${name}.png` })
      await button(page, 'Menu').click()
      await button(page, 'Leave tutorial').waitFor()
      await settle(page)
      await page.screenshot({ path: `${OUT}/pause-${name}.png` })
      await button(page, 'Leave tutorial').click()
      await page.getByText('Leave the tutorial game?').waitFor()
      ok(await page.getByText('Everything unlocks. You can replay it from Settings.').isVisible(), 'the confirm says leaving unlocks everything')
      await settle(page)
      await page.screenshot({ path: `${OUT}/leave-confirm-${name}.png` })
      await page.getByRole('dialog').getByRole('button', { name: 'Leave tutorial' }).click()
      await button(page, 'Play online').waitFor()
      ok(await button(page, 'Play online').getAttribute('aria-disabled') === null, 'after leaving: Play online is unlocked')
      ok(await page.evaluate(() => localStorage.getItem('glyphtender:tutorial')) === 'done', 'it is remembered (glyphtender:tutorial = done)')
      await page.reload()
      await button(page, 'Play online').waitFor()
      ok(await button(page, 'Play online').getAttribute('aria-disabled') === null, 'still unlocked after a reload')
      await button(page, 'Play').click()
      ok(await button(page, 'Start game').waitFor({ timeout: 5000 }).then(() => true, () => false) || await page.getByText('Players').first().isVisible(), 'Play now opens New Game')
      await context.close()
    }
    // Skip on the first card
    {
      const { context, page } = await fresh(size)
      await button(page, 'Play').click()
      await button(page, 'Skip').click()
      ok(await page.locator('[data-hex]').first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'Skip deals the tutorial game')
      await context.close()
    }
    // A device that played before the tutorial existed
    {
      const { context, page } = await fresh(size, () => localStorage.setItem('glyphtender:new-game', '{}'))
      ok(await button(page, 'Play online').getAttribute('aria-disabled') === null, 'returning device: nothing locked')
      await button(page, 'Settings').click()
      if (size.mobile) { // (a phone shows the tabs as one ◀ Audio ▶ picker: step it on to Gameplay)
        const nextTab = page.locator('.kit-screen .kit-picker').first().getByRole('button').last()
        for (let i = 0; i < 6 && !(await page.locator('.kit-picker-value', { hasText: 'Gameplay' }).count()); i++) await nextTab.click()
      } else await page.getByRole('tab', { name: 'Gameplay' }).click()
      const replay = page.getByText('Replay tutorial game')
      await replay.scrollIntoViewIfNeeded()
      await settle(page)
      await page.screenshot({ path: `${OUT}/settings-${name}.png` })
      await replay.click()
      ok(await page.getByText('Move, then plant').waitFor({ timeout: 5000 }).then(() => true, () => false), 'Settings → Replay tutorial game opens the overview')
      await context.close()
    }
  }
  ok(errors.length === 0, `console clean${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
process.exit(failures ? 1 : 0)

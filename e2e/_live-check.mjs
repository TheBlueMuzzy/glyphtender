// One-off live check for v0.9.0 (deleted by cleanup.sh: e2e/_*.mjs)
import { chromium } from 'playwright-core'

const URL = `https://thebluemuzzy.github.io/glyphtender/?v=${Date.now()}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(URL)
await page.getByRole('button', { name: 'Play', exact: true }).tap()
await page.getByRole('switch', { name: 'British spelling' }).waitFor({ timeout: 15000 })
console.log('New Game has British spelling + Vulgar words:', (await page.getByRole('switch', { name: 'Vulgar words' }).count()) === 1)
await page.getByRole('button', { name: 'Main menu' }).tap()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Play online' }).tap()
await page.getByRole('textbox', { name: 'Your name' }).fill('Claude')
await page.getByRole('button', { name: 'Create a room' }).tap()
const code = await page.getByText(/^Room [A-Z]{4}$/).textContent({ timeout: 20000 }).catch(() => null)
console.log('Online room created:', code)
console.log('Lobby has the word switches:', (await page.getByRole('switch', { name: 'Vulgar words' }).count()) === 1)
await page.screenshot({ path: 'e2e-shots/live-lobby.png' })
console.log('console errors:', errors.length ? errors.join(' | ') : 'none')
await browser.close()

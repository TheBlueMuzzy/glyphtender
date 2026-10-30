// TURN YOUR PHONE (src/ui/TurnPhone.tsx, F97 — Portrait only; Muzzy 2026-10-30: "glyphtender should be a vertical game
// only"): a touch screen held on its side and shorter than content/tuning/layout.json turnPhoneHeight shows
// "Turn your phone upright" over everything; an upright phone, a sideways tablet and a short desktop window never do;
// turning the phone while the game is open shows / hides it at once.
// Starts its OWN dev server (port 5449) and closes only that one.   node e2e/turn-phone.mjs [out] [port]
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import layout from '../content/tuning/layout.json' with { type: 'json' }
import text from '../content/text/en.json' with { type: 'json' }

const OUT = `${process.argv[2] ?? 'e2e-shots'}/turn-phone`
const PORT = Number(process.argv[3] ?? 5449)
mkdirSync(OUT, { recursive: true })
const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
let failed = 0
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++ }
const title = text.turnPhone.title
const ready = (page) => page.getByRole('heading', { name: 'Glyphtender' }).or(page.getByText(title)).first().waitFor()

// a phone on its side is shorter than the setting; a sideways tablet is taller (read from the file, never restated)
const cases = [
  { name: 'phone on its side', viewport: { width: 844, height: 390 }, touch: true, shown: 390 < layout.turnPhoneHeight },
  { name: 'phone upright', viewport: { width: 390, height: 844 }, touch: true, shown: false },
  { name: 'short desktop window (no touch)', viewport: { width: 768, height: 343 }, touch: false, shown: false },
  { name: 'tablet on its side', viewport: { width: 1024, height: 768 }, touch: true, shown: 768 < layout.turnPhoneHeight },
]

try {
  for (const c of cases) {
    const context = await browser.newContext({ viewport: c.viewport, hasTouch: c.touch, isMobile: c.touch })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await ready(page)
    const shown = await page.getByText(title).isVisible()
    await page.screenshot({ path: `${OUT}/${c.viewport.width}x${c.viewport.height}.png` })
    check(`${c.name} (${c.viewport.width}×${c.viewport.height}): ${shown ? 'shows' : 'no'} "${title}"${errors.length ? ` — errors: ${errors.join(' | ')}` : ''}`, shown === c.shown && !errors.length)
    if (shown) {
      // over everything: what's under the middle of the screen is the turn screen, not the menu
      const onTop = await page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.turn-phone'))
      check(`${c.name}: the turn screen is on top (the menu can't be tapped through it)`, onTop)
    }
    await context.close()
  }

  // turning the phone while the game is open
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${PORT}/`)
  await ready(page)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.getByText(title).waitFor({ timeout: 5000 }).catch(() => {})
  check('turned on its side while open → the turn screen shows', await page.getByText(title).isVisible())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByText(title).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  check('turned back upright → the turn screen goes, the menu is back', !(await page.getByText(title).isVisible()) && await page.getByRole('button', { name: 'Play', exact: true }).isVisible())
  await context.close()
} finally {
  await browser.close()
  await server.close()
}
if (failed) { console.log(`\n✗ ${failed} problem(s)`); process.exit(1) }
console.log(`\n✓ turn-your-phone e2e passed — screenshots in ${OUT}/`)

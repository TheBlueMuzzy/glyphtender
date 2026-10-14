// NEW GAME OPENS CENTRED, THEN ONLY GROWS DOWN (F58 — Muzzy 2026-10-10: "it should start in the center and only
// expand downwards"). Since UI kit 0.10.0 (sprint 28) it's a menu card: the header (‹ · New game · Start) stays, the
// rows scroll INSIDE the card (no scroll bar) once it's as tall as it may get (Screen grow="down"). At 5 sizes, a fresh
// New Game (2 players, both people):
//   · on open the card is in the middle: the gap above it = the gap below it (±4 px)
//   · Players + to the most (2 → 4) and then the 2nd seat Person → AI (its picker rows appear): the Players + button
//     stays at the same y every time (±1 px) — the card grows underneath it, its top never moves; at its max height
//     the rows scroll inside, and growing never scrolls them by itself
//   · phones: a finger swipe up on the rows scrolls them (B027: a swipe must never be eaten by the wrong box)
//   · AI → Person and Players − back to 2: rows go away underneath, + still at the same y
//   · desktop: the window made 150 px shorter → the card is placed in the middle again
// Screenshots (open + grown) of each size go to the out folder.
// Starts its OWN dev server (default port 5419) and closes only that one.
//   npm run e2e:new-game [outDir] [port]
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/new-game'
const PORT = Number(process.argv[3] ?? 5419)
const CENTRE_SLACK = 4 // px: top gap vs bottom gap on open
const STILL_SLACK = 1 // px: how far the + may move
const SIZES = [
  { width: 390, height: 844, mobile: true },
  { width: 360, height: 780, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 1440, height: 900, mobile: false },
  { width: 1920, height: 1080, mobile: false },
]
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const ok = (good, what) => { if (!good) fail(what); else console.log(`ok   ${what}`) }
const round = (n) => Math.round(n * 10) / 10

/** The New Game card against the window, and its rows' scroller (runs in the page). */
function measure() {
  const panel = document.querySelector('.new-game-panel')
  const p = panel.getBoundingClientRect()
  const rows = panel.querySelector('.kit-scroll')
  const plus = document.querySelector('[aria-label="Next Players"]').getBoundingClientRect()
  return {
    top: p.top, bottom: innerHeight - p.bottom, plusY: plus.top,
    scrolls: rows.scrollHeight > rows.clientHeight + 1, scrollTop: rows.scrollTop,
    bar: rows.offsetWidth - rows.clientWidth, // a native scroll bar's width (0 = none)
  }
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
try {
  for (const size of SIZES) {
    const name = `${size.width}x${size.height}`
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    await context.addInitScript(() => { // (full screen off: it would change the window's size)
      const key = 'kit-settings:'
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const tap = async (loc) => {
      await (size.mobile ? loc.tap() : loc.click())
      await page.waitForTimeout(500) // (rows' entrance plays out)
    }
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await tap(page.getByRole('button', { name: 'Play', exact: true }))
    await page.getByRole('button', { name: 'Start' }).waitFor()
    await page.waitForTimeout(800) // (the panel's entrance plays out)
    const open = await page.evaluate(measure)
    await page.screenshot({ path: `${OUT}/${name}-1-open.png` })

    ok(Math.abs(open.top - open.bottom) <= CENTRE_SLACK, `${name}: opens centred — gap above ${round(open.top)} · below ${round(open.bottom)}${open.scrolls ? ' (rows scroll inside)' : ''}`)
    ok(open.bar === 0, `${name}: no scroll bar on the rows (${open.bar} px)`)

    // Grow: Players + until the most, then the 2nd seat → AI. The + must not move.
    const plusYs = [open.plusY]
    const plus = page.getByRole('button', { name: 'Next Players' })
    for (let i = 0; i < 3 && await plus.isEnabled(); i++) {
      await tap(plus)
      plusYs.push((await page.evaluate(measure)).plusY)
    }
    await tap(page.getByRole('button', { name: 'Next Player 2', exact: true })) // Person ▶ AI
    const grown = await page.evaluate(measure)
    plusYs.push(grown.plusY)
    await page.screenshot({ path: `${OUT}/${name}-2-grown.png` })
    const players = await page.locator('[aria-label="Players"]').first().textContent()
    ok(plusYs.every((y) => Math.abs(y - open.plusY) <= STILL_SLACK),
      `${name}: Players + (${plusYs.length - 2} presses → ${players.replace(/\D/g, '')} players) then a seat → AI: the + stays put (y ${plusYs.map(round).join(' → ')})`)
    ok(grown.scrollTop === 0, `${name}: growing didn't scroll the rows (scrollTop ${grown.scrollTop})`)
    ok(grown.bottom >= -0.5, `${name}: grown, the card still ends inside the window (${round(grown.bottom)} px to spare)`)

    // A finger swipe that starts ON the rows scrolls them (B027: a scroll box that can't take the swipe must never keep
    // it — UI kit 0.8.2; since 0.10.0 the rows are the card's one scroller)
    if (size.mobile && grown.scrolls) {
      const rows = await page.locator('.new-game-panel .kit-scroll').boundingBox()
      const x = rows.x + rows.width / 2, y0 = rows.y + rows.height * 0.85, y1 = rows.y + rows.height * 0.15
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 10 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(600)
      const swiped = await page.evaluate(measure)
      ok(swiped.scrollTop > 40, `${name}: a swipe up on the rows scrolls them (scrollTop ${round(swiped.scrollTop)})`)
      await page.evaluate(() => { document.querySelector('.new-game-panel .kit-scroll').scrollTop = 0 })
      await page.waitForTimeout(100)
    }

    // Shrink back: AI → Person, Players − to 2. Still put.
    const backYs = []
    await tap(page.getByRole('button', { name: 'Previous Player 2', exact: true })) // ◀ Person
    backYs.push((await page.evaluate(measure)).plusY)
    const minus = page.getByRole('button', { name: 'Previous Players' })
    for (let i = 0; i < 3 && await minus.isEnabled(); i++) {
      await tap(minus)
      backYs.push((await page.evaluate(measure)).plusY)
    }
    ok(backYs.every((y) => Math.abs(y - open.plusY) <= STILL_SLACK), `${name}: seat → Person, Players − back to 2: the + stays put (y ${backYs.map(round).join(' → ')})`)

    // The window changes size (a desktop window dragged taller): placed in the middle again
    if (!size.mobile) {
      await page.setViewportSize({ width: size.width, height: size.height - 150 })
      await page.waitForTimeout(300)
      const resized = await page.evaluate(measure)
      ok(Math.abs(resized.top - resized.bottom) <= CENTRE_SLACK, `${name}: window resized to ${size.width}x${size.height - 150} → centred again (gap above ${round(resized.top)} · below ${round(resized.bottom)})`)
    }

    if (errors.length) fail(`${name}: console errors: ${errors.join(' | ')}`)
    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n✗ ${failures} failure(s)` : '\n✓ New Game opens centred and grows down')
process.exit(failures ? 1 : 0)

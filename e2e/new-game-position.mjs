// NEW GAME OPENS CENTRED, THEN ONLY GROWS DOWN (F58 — Muzzy 2026-10-10: "it should start in the center and only
// expand downwards"; UI kit 0.4.4 <Screen scroll>). At 5 sizes, a fresh New Game (2 players, both people):
//   · on open the panel is in the middle: the gap above it = the gap below it (±4 px) — or, when it's taller than the
//     window (small phone, phone on its side), it starts at the top (the screen's padding + the empty top row's gap;
//     on a short screen — 30rem tall or less — just the padding: there a card takes the empty rows too, UI kit 0.7.0)
//     and the screen scrolls
//   · Players + to the most (2 → 4) and then the 2nd seat Person → AI (its picker rows appear): the Players + button
//     stays at the same y every time (±1 px) — the rows grow underneath it, the top never moves
//   · AI → Person and Players − back to 2: rows go away underneath, + still at the same y
//   · desktop: the window made 150 px shorter → the panel is placed in the middle again
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

/** The New Game panel against its screen (runs in the page). */
function measure() {
  const screen = document.querySelector('.kit-screen[data-scroll]')
  const s = screen.getBoundingClientRect()
  const p = screen.querySelector('.kit-panel').getBoundingClientRect()
  const plus = document.querySelector('[aria-label="Next Players"]').getBoundingClientRect()
  const style = getComputedStyle(screen)
  return {
    top: p.top - s.top, bottom: s.bottom - p.bottom, plusY: plus.top,
    padTop: parseFloat(style.paddingTop), rowGap: parseFloat(style.rowGap), short: matchMedia('(max-height: 30rem)').matches,
    margin: parseFloat(getComputedStyle(screen.querySelector('[data-slot="center"]')).marginTop), scrolls: screen.scrollHeight > screen.clientHeight + 1, scrollTop: screen.scrollTop,
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

    if (open.scrolls) {
      const rowGap = open.short ? 0 : open.rowGap // (a short screen: the card takes the empty top row and its gap)
      ok(open.margin === 0 && Math.abs(open.top - open.padTop - rowGap) <= 1,
        `${name}: taller than the window → starts at the top (gap ${round(open.top)} = padding ${open.padTop} + row gap ${rowGap}) and scrolls`)
    } else {
      ok(Math.abs(open.top - open.bottom) <= CENTRE_SLACK, `${name}: opens centred — gap above ${round(open.top)} · below ${round(open.bottom)}`)
    }

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
    ok(grown.scrollTop === 0, `${name}: growing didn't scroll the screen (scrollTop ${grown.scrollTop})`)

    // A finger swipe that starts ON the card scrolls the screen (phones: the card was a scroll box of its own and kept
    // the swipe — only the strip round it scrolled, so Start was out of reach; UI kit 0.8.2, B-lobby-scroll 2026-10-12)
    if (size.mobile && grown.scrolls) {
      const card = await page.locator('.kit-screen[data-scroll] .kit-panel').boundingBox()
      const x = card.x + card.width / 2, y0 = size.height * 0.8, y1 = size.height * 0.2
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 10 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(600)
      const swiped = await page.evaluate(measure)
      ok(swiped.scrollTop > 100, `${name}: a swipe up on the card scrolls the screen (scrollTop ${round(swiped.scrollTop)})`)
      await page.evaluate(() => { document.querySelector('.kit-screen[data-scroll]').scrollTop = 0 })
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
      if (resized.scrolls) { // (taller than the shorter window — F71's two rows did it at 1440x750: top + scroll, as on open)
        const rowGap = resized.short ? 0 : resized.rowGap
        ok(Math.abs(resized.top - resized.padTop - rowGap) <= 1,
          `${name}: window resized to ${size.width}x${size.height - 150} → taller than it, so it starts at the top (gap ${round(resized.top)}) and scrolls`)
      } else {
        ok(Math.abs(resized.top - resized.bottom) <= CENTRE_SLACK, `${name}: window resized to ${size.width}x${size.height - 150} → centred again (gap above ${round(resized.top)} · below ${round(resized.bottom)})`)
      }
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

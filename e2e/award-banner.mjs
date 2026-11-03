// AWARD BANNER (v0.18 Awards during the game, F101): a finished turn that SETS an award's record, then one that TAKES
// it, at phone 390×844, phone on its side 844×390 and desktop 1440×900. The turns are put in the game's log through
// the dev hook (the measures + the store's news are proven by unit tests — stats / gameStore / server); this checks the
// banner itself: it shows the award, who and the proof · a record taken shows the old holder first, who shrinks away
// while the new one grows past full size and settles in the same spot · the banner doesn't change size while it
// plays · the news shows one at a time, in order · it goes by itself · reduce motion: no swap, the new holder is simply
// there · no console errors.
// Pictures: award-<size>-1-set · 2-taken-old · 3-taken-settled · 5-gone.
// Starts its OWN dev server (default port 5449) and closes only that one.
//   npm run e2e:awards [outDir] [port]
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import endscreen from '../content/tuning/endscreen.json' with { type: 'json' }

const OUT = process.argv[2] ?? 'e2e-shots'
const PORT = Number(process.argv[3] ?? 5449)
const SIZES = [
  { name: 'phone-tall', width: 390, height: 844, mobile: true },
  { name: 'phone-wide', width: 844, height: 390, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
]
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const ok = (good, what) => { if (!good) fail(what); else console.log(`ok   ${what}`) }
const ms = (s) => Math.round(s * 1000)

// A logged turn where `seat` made one word of its own seeds (enough for the Long word measure) — as the store test does
const TURN = `(turnNo, seat, word) => ({ turnNo, round: turnNo, seat, glyphlingId: seat * 2, from: { q: 0, r: 0 }, to: { q: 0, r: 1 },
  letter: 'A', target: null, words: [{ word, letters: [...word], owners: [...word].map(() => seat), magic: word.length * 2, ownMagic: word.length }],
  magic: word.length * 2, refreshed: 0, refresh: false, totalsAfter: [0, 0], tangledAfter: [], newlyTangled: [], freed: [] })`

try {
  for (const motion of ['full', 'reduce']) for (const size of SIZES) {
    if (motion === 'reduce' && size.name !== 'phone-tall') continue
    const tag = `${size.name}${motion === 'reduce' ? ' (reduce motion)' : ''}`
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile, reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' })
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    const shot = (name) => motion === 'full' && page.screenshot({ path: `${OUT}/award-${size.name}-${name}.png` })

    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 })
    const logTurns = (turns) => page.evaluate(([turnSrc, turns]) => {
      const turn = eval(turnSrc) // (the TURN maker above, sent as source)
      const store = window.__glyphtender.store
      const game = store.getState().game
      store.setState({ game: { ...game, log: { turns: turns.map(([seat, word], i) => turn(i + 1, seat, word)), end: null } } })
    }, [TURN, turns])
    const banner = () => page.locator('.game-award-banner')
    const scales = () => page.evaluate(() => [...document.querySelectorAll('.game-award-banner-slot-avatar')]
      .map((el) => ({ part: el.dataset.part, scale: el.getBoundingClientRect().width })))

    // 1. Yellow sets the Long word record: Yellow's glyphling, the award, the proof
    await logTurns([[0, 'GARDEN']])
    await banner().waitFor({ timeout: 3000 })
    const first = await banner().innerText()
    ok(/Long word/.test(first) && /GARDEN/.test(first) && (await banner().getAttribute('data-holder')) === '0' && !(await banner().getAttribute('data-taken')),
      `${tag}: a record set → the banner names Long word, GARDEN, Yellow (no swap): "${first.replace(/\s+/g, ' ')}"`)
    await page.waitForTimeout(ms(0.4))
    await shot('1-set')
    // the panel keeps the board's breathing room: inside the board, not touching its edges
    const inBoard = await page.evaluate(() => {
      const b = document.querySelector('.game-award-banner').getBoundingClientRect(), g = document.querySelector('.game-board').getBoundingClientRect()
      return b.left > g.left && b.right < g.right && b.top > g.top
    })
    ok(inBoard, `${tag}: the banner sits inside the board with room round it`)

    // 2. Blue takes it (queued behind Yellow's): it waits for the first banner to go, then shows the swap
    await logTurns([[0, 'GARDEN'], [1, 'GARDENS']])
    ok((await page.evaluate(() => window.__glyphtender.store.getState().awardNews.length)) === 2, `${tag}: the second record waits its turn (2 queued)`)
    await page.waitForFunction(() => document.querySelector('.game-award-banner')?.dataset.holder === '1', null, { timeout: 8000 })
    const taken = await banner().innerText()
    ok(/takes it from/.test(taken) && /GARDENS/.test(taken), `${tag}: a record taken → "Blue takes it from Yellow" + the proof: "${taken.replace(/\s+/g, ' ')}"`)
    const box0 = await banner().boundingBox()
    if (motion === 'full') {
      await page.waitForTimeout(ms(0.3 + endscreen.liveSwapDelay * 0.5))
      const early = await scales()
      ok(early.length === 2 && early.find((a) => a.part === 'old').scale > 10 && early.find((a) => a.part === 'new').scale < 1,
        `${tag}: first the old holder sits in the slot (new one not grown yet): ${JSON.stringify(early)}`)
      await shot('2-taken-old')
      const full = early.find((a) => a.part === 'old').scale
      // watch the swap in the page (every frame): the old holder shrinks to nothing, the new one peaks past full size
      const watched = await page.evaluate((seconds) => new Promise((done) => {
        const seen = { oldMin: Infinity, newMax: 0 }
        const t0 = performance.now()
        const look = () => {
          for (const el of document.querySelectorAll('.game-award-banner-slot-avatar')) {
            const width = el.getBoundingClientRect().width
            if (el.dataset.part === 'old') seen.oldMin = Math.min(seen.oldMin, width)
            else seen.newMax = Math.max(seen.newMax, width)
          }
          if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(look)
          else done(seen)
        }
        requestAnimationFrame(look)
      }), endscreen.liveSwapDelay + endscreen.liveSwapSeconds + 0.2)
      await shot('3-taken-settled')
      const settled = await scales()
      const newAt = (list) => list.find((a) => a.part === 'new').scale
      ok(watched.oldMin < 1 && watched.newMax > full * 1.05, `${tag}: the old holder shrinks away; the new one grows past full size (peak ${watched.newMax.toFixed(1)} px vs ${full.toFixed(1)})`)
      ok(Math.abs(newAt(settled) - full) < 0.5, `${tag}: …and settles at full size in the same spot (${newAt(settled).toFixed(1)} px)`)
    } else {
      const parts = await scales()
      ok(parts.length === 1 && parts[0].part === 'new', `${tag}: no swap — only the new holder: ${JSON.stringify(parts)}`)
    }
    const box1 = await banner().boundingBox()
    ok(box0 && box1 && Math.abs(box0.width - box1.width) < 0.5 && Math.abs(box0.height - box1.height) < 0.5, `${tag}: the banner never changes size while it plays`)

    // 3. It goes by itself
    await banner().waitFor({ state: 'detached', timeout: 8000 })
    ok((await page.evaluate(() => window.__glyphtender.store.getState().awardNews.length)) === 0, `${tag}: gone by itself, nothing left waiting`)
    await shot('5-gone')
    ok(errors.length === 0, `${tag}: console clean ${errors.join(' | ')}`)
    await page.close()
  }
} catch (e) {
  fail(e.stack ?? String(e))
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} FAILED` : '\nPASS — award banner')
process.exit(failures ? 1 : 0)

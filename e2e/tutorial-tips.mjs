// TIPS + NUDGES (F77 + F78, design/tutorial.md §3–4) — in free play of the tutorial game, through the real screen at a
// phone (390×844, a finger) and a desktop (1440×900, a mouse). No Dev Kit: hand-made positions are loaded straight into
// the store (window.__glyphtender — dev only), the tutorial game is switched on, and the idle timings are shortened
// through the live-tuning event the Dev Kit's sliders use.
//   (a) a rival glyphling with 1 move → the theirDanger tip shows once (not covering it, clear of the edges), fades on a
//       tap, and doesn't show again a turn later
//   (e) one tangle on the board → the oneToGo PAUSE: dims, holds the game (Sprout waits), Got it lets go
//   (b) idle: moved, nothing planted → the tray breathes (the whose-turn pulse), then the words; a tap clears both
//   (c) wrong action: a tray seed before the move → "Move a glyphling first…"; a rival's glyphling → whose it is;
//       Plant tapped with nothing aimed → "Drag a seed…"
//   (d) Settings → Tips off → no tip, no nudge
// Screenshots → e2e-shots/tutorial-tips/. Starts its OWN dev server (default port 5446).
//   npm run e2e:tutorial-tips [outDir] [port]   (SIZE=phone|desktop: one size only · DEBUG=1: the page's console too)
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import text from '../content/text/en.json' with { type: 'json' }
import tutorialTuning from '../content/tuning/tutorial.json' with { type: 'json' }

const OUT = process.argv[2] ?? 'e2e-shots/tutorial-tips'
const PORT = Number(process.argv[3] ?? 5446)
const URL = `http://127.0.0.1:${PORT}/?tips=on`
const SIZES = [{ name: 'phone', width: 390, height: 844, mobile: true }, { name: 'desktop', width: 1440, height: 900, mobile: false }]
const TIPS = text.tutorial.tips
const NUDGES = text.tutorial.nudges
mkdirSync(OUT, { recursive: true })

let failures = 0
const ok = (good, what) => { if (!good) { failures++; console.log(`  FAIL ${what}`) } else console.log(`ok   ${what}`) }

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()

try {
  for (const size of SIZES.filter((s) => !process.env.SIZE || s.name === process.env.SIZE)) {
    console.log(`— ${size.name} ${size.width}×${size.height}`)
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    await context.addInitScript(() => {
      const key = 'kit-settings:'
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false, aiSpeed: 'Fast' }))
    })
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    if (process.env.DEBUG) page.on('console', (m) => console.log('   [page]', m.text()))
    await page.goto(URL)
    await page.waitForFunction(() => !!window.__glyphtender)

    // ─── the page's own modules ───
    await page.evaluate(async () => {
      window.__t = {
        testkit: await import('/src/engine/testkit.ts'), hex: await import('/src/engine/hex.ts'), boards: await import('/src/engine/boards.ts'),
        tangle: await import('/src/engine/tangle.ts'), engine: await import('/src/engine/engine.ts'),
        progress: await import('/src/tutorial/progress.ts'), rails: await import('/src/store/railsLimit.ts'),
        tuning: await import('/src/devkit/tuning/liveTuning.ts'), tips: await import('/src/ui/kit/blocks/tips.ts'),
      }
      // A hand-made position: your glyphlings left and right, Blue's in the middle. hem: [glyphling, walled by seat,
      // open direction or null] — its neighbours walled with that seat's seeds except one way (1 hex free, then a wall).
      window.__t.position = ({ hem = [], tangled = [], turnCount = 10 } = {}) => {
        const { testkit, hex, boards } = window.__t
        let game = testkit.position({
          glyphlings: { 0: 'C3-4', 1: 'C9-4', 2: 'C6-3', 3: 'C6-7' },
          hands: [['C', 'A', 'T', 'S', 'E', 'R', 'O', 'N'], ['D', 'I', 'L', 'E', 'A', 'M', 'P', 'U']],
          bag: [...'EEEAAIIOONNRRSSTTLLDDGMPBC'],
        })
        const board = boards.getBoard(game.config.boardName)
        const onBoard = (h) => board.cells.some((c) => c.q === h.q && c.r === h.r)
        const seeds = { ...game.seeds }
        let n = 0
        for (const [id, seat, open] of hem) {
          const g = game.glyphlings.find((x) => x.id === id)
          hex.DIRECTIONS.forEach((d, i) => {
            const near = hex.addHex(g.hex, d)
            const wall = i === open ? hex.addHex(near, d) : near
            if (onBoard(wall) && !game.glyphlings.some((x) => hex.sameHex(x.hex, wall))) seeds[hex.hexKey(wall)] = { id: `wall-${n++}`, letter: 'E', seat }
          })
        }
        game = { ...game, seeds, tangled, turnCount, current: 0 }
        return game
      }
    })
    const load = (opts) => page.evaluate((opts) => {
      const game = window.__t.position(opts)
      window.__glyphtender.store.getState().loadState(game)
      return game
    }, opts)
    const state = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
    const bubble = page.locator('.kit-callout-layer[data-ready] .kit-callout')
    const shows = (words, timeout = 6000) => bubble.filter({ hasText: words }).waitFor({ timeout }).then(() => true, () => false)
    const none = async (ms) => { await page.waitForTimeout(ms); return (await page.locator('.kit-callout-layer').count()) === 0 }
    let shotNo = 0
    const shot = (name) => page.screenshot({ path: `${OUT}/${size.name}-${String(++shotNo).padStart(2, '0')}-${name}.png` })
    /** The callout: one only, not over its target, clear of the screen's edges (≥ 8 px). */
    async function placed(target, what) {
      await page.waitForTimeout(350) // (its entrance)
      const geo = await page.evaluate((sel) => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
        const over = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5
        const bubbles = [...document.querySelectorAll('.kit-callout-layer[data-ready] .kit-callout')]
        const target = document.querySelector(sel)
        const b = box(bubbles[0])
        return { count: bubbles.length, covers: !!target && over(b, box(target)), edge: Math.round(Math.min(b.l, b.t, innerWidth - b.r, innerHeight - b.b)) }
      }, target)
      ok(geo.count === 1, `  ${what}: one callout (${geo.count})`)
      ok(!geo.covers, `  ${what}: it doesn't cover ${target}`)
      ok(geo.edge >= 8, `  ${what}: clear of the screen's edge (${geo.edge} px)`)
    }
    const cdp = size.mobile ? await context.newCDPSession(page) : null
    const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    const tapAt = async ({ x, y }) => {
      if (!size.mobile) return page.mouse.click(x, y)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await page.waitForTimeout(60)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(120)
    }
    const tap = async (loc) => tapAt(await centre(loc))
    /** A tap on nothing: the board's empty corner. */
    const tapEmpty = async () => { const b = await page.locator('.game-board').boundingBox(); await tapAt({ x: b.x + 6, y: b.y + 6 }) }

    // ─── the tutorial game, past its rails: you (Yellow) vs Sprout (Blue) ───
    await page.evaluate(() => window.__glyphtender.store.getState().startGame({ players: 2, seed: 7, bots: [1], hideSeeds: false }))
    await page.locator('.game-garden > polygon[data-hex]').first().waitFor()
    await page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready', null, { timeout: 20000 })

    // (a) Their danger: Blue's glyphling 2 has 1 move left
    const danger = await load({ hem: [[2, 0, 0]] })
    await page.evaluate(() => window.__t.progress.setTutorialActive(true))
    const moves = await page.evaluate((g) => [0, 1, 2].map((id) => window.__t.tangle.movesLeft(g, id)), danger)
    ok(moves[2] === 1 && moves[0] > 1 && moves[1] > 1, `(a) the position: Blue's glyphling has 1 move, yours more (${moves})`)
    const theirs = TIPS.theirDanger.replace('{player}', text.game.players.blue)
    ok(await shows(theirs), `(a) tip: "${theirs}"`)
    await placed('[data-glyph="2"]', '(a)')
    ok(await page.locator('.kit-callout-layer[data-dim]').count() === 0 && !(await page.evaluate(() => window.__t.rails.railsHold())), '(a) a plain tip: no dim, no hold')
    ok(await page.locator('.game-prompt').evaluate((el) => getComputedStyle(el).visibility) === 'hidden', '(a) it takes the prompt\'s place')
    await shot('theirDanger')
    await tap(bubble)
    ok(await none(400), '(a) a tap on it: gone')
    ok(await page.evaluate(() => window.__t.tips.tipsMemory().seen('theirDanger')), '(a) remembered as seen')
    await load({ hem: [[2, 0, 0]], turnCount: 12 }) // (a turn later, the same danger)
    ok(await none(2500), '(a) a turn later: not again')

    // (e) One tangle on the board, your turn → the oneToGo PAUSE
    await load({ hem: [[2, 0, null]], tangled: [2], turnCount: 14 })
    ok(await shows(TIPS.oneToGo), `(e) pause tip: "${TIPS.oneToGo}"`)
    await placed('[data-glyph="2"]', '(e)')
    ok(await page.locator('.kit-callout-layer[data-dim] .kit-callout-dim').count() === 1, '(e) it dims the game')
    ok(await page.evaluate(() => window.__t.rails.railsHold()), '(e) it holds the game')
    await shot('oneToGo-pause')
    await tap(bubble.getByRole('button', { name: text.tutorial.rails.gotIt, exact: true }))
    ok(await none(400), '(e) Got it: gone')
    ok(!(await page.evaluate(() => window.__t.rails.railsHold())), '(e) the hold is off')

    // (b) Idle: the timings shortened (the Dev Kit's live-tuning event) — moved, nothing planted
    await page.evaluate((file) => window.__t.tuning.sendTuning('tutorial', { ...file, idleGlow: 1, idleText: 2.5 }), tutorialTuning)
    await load({ turnCount: 16 })
    await none(800)
    await page.evaluate(() => {
      const s = window.__glyphtender.store.getState()
      const to = window.__t.engine.legalMoves(s.game, 0)[0]
      s.tapGlyphling(0)
      window.__glyphtender.store.getState().tapHex(to)
    })
    ok(await state('(s) => s.move?.glyphling === 0'), '(b) moved, nothing planted')
    const glowing = () => page.evaluate(() => [...document.querySelectorAll('.game-tray [data-hand]')].filter((el) => el.getAnimations().length > 0).length)
    await page.waitForTimeout(1400)
    ok(await glowing() > 0 && (await page.locator('.kit-callout-layer').count()) === 0, `(b) after idleGlow: the tray breathes (${await glowing()} seeds), no words yet`)
    ok(await shows(NUDGES.idle.plant, 3000), `(b) after idleText: "${NUDGES.idle.plant}"`)
    await placed('.game-tray', '(b)')
    await shot('idle-plant')
    await tapEmpty()
    ok(await none(300), '(b) a tap: the words go')
    ok(await glowing() === 0, '(b) …and the glow stops')
    await page.evaluate((file) => window.__t.tuning.sendTuning('tutorial', file), tutorialTuning)

    // (c) Wrong actions
    await load({ turnCount: 18 })
    await none(800)
    const seed = await state('(s) => s.game.hands[0][0].id')
    await tap(page.locator(`[data-hand="${seed}"]`))
    ok(await shows(NUDGES.wrong.seedFirst, 2000), `(c) a seed before the move: "${NUDGES.wrong.seedFirst}"`)
    await placed(`[data-hand="${seed}"]`, '(c)')
    await shot('wrong-seedFirst')
    await tap(page.locator('[data-glyph="3"]'))
    const rival = NUDGES.wrong.rival.replace('{player}', text.game.players.blue).replace('{colour}', text.game.players.yellow.toLowerCase())
    ok(await shows(rival, 2000), `(c) a rival's glyphling: "${rival}"`)
    await placed('[data-glyph="3"]', '(c)')
    await shot('wrong-rival')
    await page.evaluate(() => {
      const s = window.__glyphtender.store.getState()
      s.tapGlyphling(0)
      window.__glyphtender.store.getState().tapHex(window.__t.engine.legalMoves(s.game, 0)[0])
    })
    await tap(page.locator('[data-action="plant"]'))
    ok(await shows(NUDGES.wrong.plantNothing, 2000), `(c) Plant with nothing aimed: "${NUDGES.wrong.plantNothing}"`)
    await shot('wrong-plantNothing')

    // (d) Settings → Tips off: nothing
    // (what the Settings screen's Tips switch calls: src/ui/gameSettings.ts settingsChanged)
    await page.evaluate(async () => {
      const { settingsChanged } = await import('/src/ui/gameSettings.ts')
      const { loadSettings } = await import('/src/ui/kit/index.ts')
      const settings = (await import('/content/ui/settings.json')).default
      settingsChanged({ ...loadSettings(settings), tips: false }, 'tips')
    })
    ok(!(await page.evaluate(() => window.__t.tips.tipsMemory().tipsOn)), '(d) Tips is off')
    await page.evaluate((file) => window.__t.tuning.sendTuning('tutorial', { ...file, idleGlow: 1, idleText: 2 }), tutorialTuning)
    await load({ hem: [[0, 1, 0]], turnCount: 20 }) // (your own glyphling with 1 move: yourDanger, never seen)
    await tap(page.locator(`[data-hand="${await state('(s) => s.game.hands[0][0].id')}"]`))
    ok(await none(3500), '(d) no tip, no nudge, no idle words')
    await shot('tips-off')
    ok(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} FAILED` : '\nAll tips + nudges checks passed')
process.exit(failures ? 1 : 0)

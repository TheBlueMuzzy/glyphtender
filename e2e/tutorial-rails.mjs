// THE RAILS (F76, design/tutorial.md §2) — the tutorial game's draft and your first 2 turns, played through the real
// screen by drags and taps at a phone (390×844, a finger) and a desktop (1440×900, a mouse):
//   ?tutorial=fresh → Play → Skip → draft ×2 → turn 1 (Next · Next · move · Next · plant the C · Plant) → the refresh
//   (Next · Got it · tap J and V · Refresh) → Sprout's scripted turn → turn 2 (move · plant the A · Plant +5) →
//   Next · Next · Play → free play.
// At every step: the ONE callout says the step's words; a wrong drop / tap is refused (the piece goes home, nothing
// changes); the callout never covers its target or the live hex, and stays inside the screen. Sprout's scripted moves
// land where content/tutorial/rails.json says; CAT makes +5; then free play — no callout, Sprout plays a real turn.
// Screenshots of every step → e2e-shots/tutorial-rails/. Starts its OWN dev server (default port 5445).
//   npm run e2e:tutorial-rails [outDir] [port]   (SIZE=phone|desktop: one size only · DEBUG=1: the page's console too)
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import layout from '../content/tuning/layout.json' with { type: 'json' }
import rails from '../content/tutorial/rails.json' with { type: 'json' }
import text from '../content/text/en.json' with { type: 'json' }

const OUT = process.argv[2] ?? 'e2e-shots/tutorial-rails'
const PORT = Number(process.argv[3] ?? 5445)
const URL = `http://127.0.0.1:${PORT}/?tutorial=fresh`
const SIZES = [{ name: 'phone', width: 390, height: 844, mobile: true }, { name: 'desktop', width: 1440, height: 900, mobile: false }]
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
    await context.addInitScript(() => { // (full screen off: it would change the window's size; the AI at Fast so the check is quick)
      const key = 'kit-settings:'
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false, aiSpeed: 'Fast' }))
    })
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    if (process.env.DEBUG) page.on('console', (m) => console.log('   [page]', m.text()))
    await page.goto(URL)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await page.locator('.game-garden > polygon[data-hex]').first().waitFor()

    // ─── what the page knows (the same modules the game runs) ───
    const state = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
    const keyOf = (label) => page.evaluate(async (label) => {
      const { railsHex } = await import('/src/tutorial/rails.ts')
      const h = railsHex(label)
      return `${h.q},${h.r}`
    }, label)
    await page.evaluate(async () => { window.__rails = { director: await import('/src/tutorial/railsDirector.ts'), limit: await import('/src/store/railsLimit.ts') } })
    const stepNow = () => page.evaluate(() => window.__rails.director.useRailsDirector.getState().step?.id ?? null)
    const limitNow = () => page.evaluate(() => window.__rails.limit.useRails.getState())
    const words = await page.evaluate(async () => {
      const m = await import('/src/tutorial/railsSteps.ts')
      return Object.fromEntries(m.RAILS_STEPS.filter((s) => s.text).map((s) => [s.id, m.railsText(s)]))
    })
    const seedId = (letter) => state(`(s) => s.game.hands[${rails.you}].find((p) => p.letter === '${letter}').id`)
    const hex = (key) => page.locator(`.game-garden > polygon[data-hex="${key}"]`)
    const bubble = page.locator('.kit-callout-layer[data-ready] .kit-callout')

    // ─── input: a finger on the phone (the piece floats dragLift above it), the mouse on the desktop ───
    const cdp = size.mobile ? await context.newCDPSession(page) : null
    const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    const dropDone = () => page.waitForFunction(() => document.querySelector('[data-carry]')?.style.visibility !== 'visible', null, { timeout: 4000 })
    async function drag(from, to) {
      const a = await centre(from), b = await centre(to)
      if (size.mobile) {
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
        const by = b.y + layout.dragLift
        await touch('touchStart', a.x, a.y)
        for (let i = 1; i <= 4; i++) await touch('touchMove', a.x + i * 5, a.y)
        for (let i = 1; i <= 10; i++) await touch('touchMove', a.x + 20 + ((b.x - a.x - 20) * i) / 10, a.y + ((by - a.y) * i) / 10)
        await touch('touchEnd', b.x, by)
        // (Chrome's touch emulation drops the click of the FIRST tap after a CDP touch drag — seen 2026-10-13: pointer
        // and touch events arrive, no click. A harmless tap on the prompt's words takes that place.)
        const p = await centre(page.locator('.game-prompt'))
        await touch('touchStart', p.x, p.y)
        await touch('touchEnd', p.x, p.y)
      } else {
        await page.mouse.move(a.x, a.y)
        await page.mouse.down()
        await page.mouse.move(a.x + 20, a.y, { steps: 4 })
        await page.mouse.move(b.x, b.y, { steps: 10 })
        await page.mouse.up()
      }
      await dropDone()
      await page.waitForTimeout(150)
    }
    // A tap: on the phone a real touch through the same CDP touch stream as the drags (Playwright's own tap after a CDP
    // touch drag gets lost — the first one after each drag never arrived)
    const tap = async (loc) => {
      if (!size.mobile) return loc.click({ force: true })
      await loc.waitFor()
      const { x, y } = await centre(loc)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await page.waitForTimeout(60) // (a finger rests a moment)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(120)
    }
    const quiet = () => page.waitForFunction(() => {
      const s = window.__glyphtender.store.getState()
      return !s.flying && !s.scoring && !s.refreshFx && !s.botDraft && !s.trail
        && [...document.querySelectorAll('[data-glide]')].every((g) => g.getAnimations().length === 0)
    }, null, { timeout: 20000 })

    // ─── a step: its callout says its words; it doesn't cover its target or the live hex; inside the screen ───
    let shotNo = 0
    async function expectStep(id, { liveHex } = {}) {
      const reached = await page.waitForFunction((id) => window.__rails.director.useRailsDirector.getState().step?.id === id,
        id, { timeout: 30000, polling: 100 }).then(() => true, () => false)
      ok(reached, `step ${id}`)
      if (!reached) { console.log(`     (on ${await stepNow()})`); return }
      await quiet()
      const shown = await bubble.filter({ hasText: words[id] }).waitFor({ timeout: 6000 }).then(() => true, () => false)
      ok(shown, `  callout: "${words[id]}"`)
      await page.waitForTimeout(350) // (its entrance)
      const geo = await page.evaluate(async (liveHex) => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
        const over = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5
        const { useRailsDirector } = window.__rails.director
        const s = window.__glyphtender.store.getState()
        const step = useRailsDirector.getState().step
        const bubbles = [...document.querySelectorAll('.kit-callout-layer[data-ready] .kit-callout')]
        const target = document.querySelector(step.target({ game: s.game, move: s.move, cast: s.cast, setAside: s.setAside, seen: new Set() }))
        const b = box(bubbles[0])
        const live = liveHex ? document.querySelector(`.game-garden > polygon[data-hex="${liveHex}"]`) : null
        const edge = Math.min(b.l, b.t, innerWidth - b.r, innerHeight - b.b)
        const glowing = [...document.querySelectorAll('.game-garden [data-option] polygon[data-hex]')].map((p) => p.getAttribute('data-hex'))
        const railsTarget = document.querySelector('[data-rails-target]')?.getAttribute('data-rails-target') ?? null
        return { glowing, railsTarget, count: bubbles.length, coversTarget: !!target && over(b, box(target)), coversLive: !!live && over(b, box(live)), edge: Math.round(edge) }
      }, liveHex ?? null)
      ok(geo.count === 1, `  one callout (${geo.count})`)
      if (liveHex) {
        // The draft, a move or a plant: every hex the piece could go to, the live hex extra bright
        // (Muzzy, 2026-10-13: "show them what they COULD do"; the draft too — "all of the legal spots highlighted")
        ok(geo.glowing.includes(liveHex) && geo.glowing.length > 1, `  the board glows at every hex it could go to (${geo.glowing.length} lit)`)
        ok(geo.railsTarget === liveHex, `  …the live hex extra bright (${geo.railsTarget})`)
      }
      ok(!geo.coversTarget, '  it does not cover its target')
      if (liveHex) ok(!geo.coversLive, '  it does not cover the live hex')
      ok(geo.edge >= 8, `  it keeps clear of the screen's edge (${geo.edge} px)`)
      await page.screenshot({ path: `${OUT}/${size.name}-${String(++shotNo).padStart(2, '0')}-${id}.png` })
    }
    const pressButton = async (label) => {
      await tap(bubble.getByRole('button', { name: label, exact: true }))
      await page.waitForTimeout(100)
    }
    const W = text.tutorial.rails

    // ─── Draft ───
    const draftHexes = await Promise.all(rails.draft.you.map(keyOf))
    await expectStep('draft1', { liveHex: draftHexes[0] })
    ok(!!(await limitNow()).limit?.to, '  the rails limit is on')
    // a wrong drop: any other empty hex — refused, the glyphling goes home
    const wrong = await page.evaluate(async (good) => {
      const s = window.__glyphtender.store.getState()
      const { legalDraftHexes } = await import('/src/engine/engine.ts')
      const h = legalDraftHexes(s.game).find((x) => `${x.q},${x.r}` !== good)
      return `${h.q},${h.r}`
    }, draftHexes[0])
    await drag(page.locator('[data-draft="next"] image'), hex(wrong))
    ok(await state('(s) => s.game.glyphlings.length') === 0, '  a drop on another hex is refused (nothing placed)')
    await tap(page.locator(`.game-garden > polygon[data-hex="${draftHexes[0]}"]`))
    ok(await state('(s) => s.game.glyphlings.length === 0 && s.nope?.kind === "draft"'), '  a TAP on the glowing hex places nothing — drag only (the tray glyphling shakes)')
    await drag(page.locator('[data-draft="next"] image'), hex(draftHexes[0]))
    ok(await state('(s) => s.game.glyphlings.length') === 1, '  the drop on the glowing hex places it')
    await expectStep('draft2', { liveHex: draftHexes[1] })
    const aiDraft = await Promise.all(rails.draft.ai.map(keyOf))
    ok(JSON.stringify(await state(`(s) => s.game.glyphlings.filter((g) => g.seat === ${rails.ai.seat}).map((g) => g.hex.q + ',' + g.hex.r)`)) === JSON.stringify(aiDraft),
      '  Sprout drafted its scripted hexes')
    await drag(page.locator('[data-draft="next"] image'), hex(draftHexes[1]))

    // ─── Turn 1 ───
    const to1 = await keyOf(rails.turn1.to)
    await expectStep('lines', { liveHex: to1 })
    await tap(page.locator('[data-glyph="1"]')) // (a pause holds the game: a tap does nothing)
    ok(await state('(s) => s.selected === null && s.move === null'), '  while the pause is up, a tap does nothing')
    await pressButton(W.next)
    await expectStep('block', { liveHex: to1 })
    await pressButton(W.next)
    await expectStep('move1', { liveHex: to1 })
    // a wrong drag: the other glyphling to one of its own legal hexes — refused
    const otherTo = await page.evaluate(async () => {
      const s = window.__glyphtender.store.getState()
      const { legalMoves } = await import('/src/engine/engine.ts')
      const h = legalMoves(s.game, 1)[0]
      return `${h.q},${h.r}`
    })
    await drag(page.locator('[data-glyph="1"]'), hex(otherTo))
    ok(await state('(s) => s.move === null && s.nope?.kind === "glyph" && s.nope.key === "1"'), '  dragging the other glyphling is refused (it shakes)')
    await drag(page.locator('[data-glyph="0"]'), hex(to1))
    ok(await state(`(s) => s.move?.glyphling === 0 && s.move.to.q + ',' + s.move.to.r === '${to1}'`), '  the glyphling moved to the glowing hex')
    const plant1 = await keyOf(rails.turn1.plant)
    await expectStep('overOwn', { liveHex: plant1 })
    await pressButton(W.next)
    await expectStep('seed1', { liveHex: plant1 })
    const c = await seedId(rails.turn1.seed)
    const notC = await state(`(s) => s.game.hands[${rails.you}].find((p) => p.id !== '${c}').id`)
    await drag(page.locator(`[data-hand="${notC}"] image`), hex(plant1))
    ok(await state('(s) => s.cast === null'), '  another seed is refused')
    await tap(page.locator(`[data-hand="${notC}"]`))
    ok(await state(`(s) => s.selected?.id !== '${notC}'`), "  …a tap doesn't pick it up either")
    ok(await page.locator(`[data-rails-target="${plant1}"]`).count() === 1, '  …and the bright hex stays')
    await drag(page.locator(`[data-hand="${c}"] image`), hex(plant1))
    ok(await state(`(s) => s.cast?.seed === '${c}'`), `  the ${rails.turn1.seed} is aimed at the glowing hex`)
    await expectStep('plant1')
    await tap(page.locator('[data-action="plant"]'))
    await expectStep('blocks')
    ok(await state('(s) => s.game.phase') === 'refresh', '  no word: the refresh choice')
    await pressButton(W.next)
    await expectStep('noWord')
    ok(await page.locator('.kit-callout-layer[data-dim] .kit-callout-dim').count() === 1, '  the no-word pause dims the game')
    await pressButton(W.gotIt)
    await expectStep('swap')
    ok(await page.locator('[data-action="keep-all"]').isDisabled(), '  Keep all is unavailable on the rails')
    ok(await page.locator('[data-action="refresh"]').isDisabled(), '  Refresh waits for the seeds')
    const [j, v] = await Promise.all(rails.turn1.refresh.map(seedId))
    const other = await state(`(s) => s.game.hands[${rails.you}].find((p) => !['${j}', '${v}'].includes(p.id)).id`)
    await tap(page.locator(`[data-hand="${other}"]`))
    ok(await state('(s) => s.setAside.length') === 0 && await state('(s) => s.nope?.key') === other, '  another seed can\'t be set aside (it shakes)')
    await tap(page.locator(`[data-hand="${j}"]`))
    ok(await state('(s) => s.setAside.length') === 1, `  ${rails.turn1.refresh[0]} set aside`)
    ok(await page.locator('[data-action="refresh"]').isDisabled(), '  Refresh still waits')
    await expectStep('swap')
    await tap(page.locator(`[data-hand="${v}"]`))
    await expectStep('refresh')
    await tap(page.locator('[data-action="refresh"]'))

    // ─── Sprout's turn 1 (scripted), then your turn 2 ───
    const to2 = await keyOf(rails.turn2.to)
    await expectStep('move2', { liveHex: to2 })
    const aiTo = await keyOf(rails.aiTurn1.to)
    const aiPlant = await keyOf(rails.aiTurn1.plant)
    ok(await state(`(s) => s.game.glyphlings.some((g) => g.seat === ${rails.ai.seat} && g.hex.q + ',' + g.hex.r === '${aiTo}')`), '  Sprout moved where the script says')
    ok(await state(`(s) => s.game.seeds['${aiPlant}']?.letter`) === rails.aiTurn1.seed, `  …and planted its ${rails.aiTurn1.seed} there`)
    // either of your glyphlings may go there (Muzzy, 2026-10-13): the phone run drags the OTHER one
    const turn2Glyph = size.name === 'phone' ? 1 : 0
    await drag(page.locator(`[data-glyph="${turn2Glyph}"]`), hex(to2))
    ok(await state(`(s) => s.move?.glyphling === ${turn2Glyph}`), `  glyphling ${turn2Glyph} moved there`)
    const plant2 = await keyOf(rails.turn2.plant)
    await expectStep('seed2', { liveHex: plant2 })
    await drag(page.locator(`[data-hand="${await seedId(rails.turn2.seed)}"] image`), hex(plant2))
    await expectStep('preview')
    const label = (await page.locator('[data-action="plant"]').textContent()).trim()
    ok(label === text.game.buttons.castMagic.replace('{n}', rails.turn2.magic), `  the button reads "${label}"`)
    await tap(page.locator('[data-action="plant"]'))
    await expectStep('counts')
    ok(await state(`(s) => s.game.magic[${rails.you}]`) === rails.turn2.magic, `  ${rails.turn2.word} made +${rails.turn2.magic}`)
    await pressButton(W.next)
    await expectStep('secret')
    await pressButton(W.next)
    await expectStep('handOver')
    await pressButton(W.play)

    // ─── Free play ───
    await page.waitForTimeout(300)
    ok(await stepNow() === null, 'the rails are over')
    const after = await limitNow()
    ok(after.limit === null && after.hold === false, 'limit off, hold off')
    const played = await page.waitForFunction(() => window.__glyphtender.store.getState().game.turnCount >= 4, null, { timeout: 30000 }).then(() => true, () => false)
    ok(played, 'Sprout plays a real turn (its own thinking)')
    await quiet()
    await page.waitForTimeout(1500)
    ok(await page.locator('.kit-callout-layer[data-ready]').count() === 0, 'no callout in free play')
    await page.screenshot({ path: `${OUT}/${size.name}-${String(++shotNo).padStart(2, '0')}-free-play.png` })
    ok(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`)
    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} FAILED` : '\nAll rails checks passed')
process.exit(failures ? 1 : 0)

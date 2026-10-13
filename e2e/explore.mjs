// EXPLORE MODE — the ? button (F79, design/tutorial.md §6), through the real screen.
//   1. vs AI at 390×844, 844×390 and 1440×900 (a returning device: Play → New game, Blue = AI, Settings → AI speed Slow):
//      play the draft and one turn, then on my next turn tap ? → the bar takes the prompt's place, the ? is lit, the
//      reminder points at the ?. Tap my glyphling (your words), a rival glyphling (their words), a seed on the board, a
//      tray seed, Plant, ☰ (it explains itself — Pause does NOT open) → each lights up with its callout. Tap empty space
//      → the callout goes, still exploring. A drag on my glyphling moves nothing. ? → back: my turn plays normally.
//      Then: plant, and tap ? while the AI thinks → its turn waits (no AI move for 8 s); ? again → the AI plays.
//      Every callout: inside the window with the kit's edge room, never covering what it points at; the bar never
//      covers the board. Screenshots → e2e-shots/explore/ (LOOK at them).
//   2. Pass-and-play (2 people, Hide seeds on, 390×844): ? while choosing what to refresh → Keep all (from the store: in Explore a tap
//      only explains) → the handoff screen comes up → Explore has ended by itself.
// Starts its OWN dev server (default port 5447 — never Muzzy's 5180) and closes only that one at the end.
//   node e2e/explore.mjs [outDir] [port]          (npm run e2e:explore)
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/explore'
const PORT = Number(process.argv[3] ?? 5447)
mkdirSync(OUT, { recursive: true })
const URL_ = `http://127.0.0.1:${PORT}/`
const SETTINGS_KEY = 'kit-settings:' // the kit's Settings slot for a page at "/"

const SIZES = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'phone-side', width: 844, height: 390, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
]

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }

function watchErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  return errors
}

/** The callout on screen now: its words and box, and whether it covers its target / leaves the window's edge room. */
function calloutNow(targetSelector) {
  const layers = [...document.querySelectorAll('.kit-callout-layer[data-ready]')]
  const layer = layers.at(-1)
  if (!layer) return null
  const box = layer.querySelector('.kit-callout').getBoundingClientRect()
  const out = { text: layer.querySelector('.kit-callout').textContent.trim(), dim: layer.hasAttribute('data-dim'), problems: [] }
  const edge = 4 // (the kit's edge room is more; touching or leaving the window is what counts here)
  if (box.left < edge || box.top < edge || box.right > innerWidth - edge || box.bottom > innerHeight - edge) out.problems.push(`callout touches the window's edge (${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.right)},${Math.round(box.bottom)})`)
  const target = targetSelector && document.querySelector(targetSelector)
  if (target) {
    const t = target.getBoundingClientRect()
    const overlap = Math.min(box.right, t.right) - Math.max(box.left, t.left) > 1 && Math.min(box.bottom, t.bottom) - Math.max(box.top, t.top) > 1
    if (overlap) out.problems.push('callout covers its target')
  }
  return out
}

function helpers(page, mobile, tag) {
  const tap = (loc) => (mobile ? loc.tap({ force: true }) : loc.click({ force: true }))
  const store = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
  const check = (what, ok) => { if (!ok) fail(`${tag}: ${what}`); else console.log(`ok   ${tag}: ${what}`) }
  const option = (kind, pick) => page.locator(`[data-option="${kind}"] circle`).nth(pick)
  const optionCount = (kind) => page.locator(`[data-option="${kind}"] circle`).count()
  const exploreButton = page.locator('[data-explore-button]')
  const exploring = async () => (await exploreButton.getAttribute('aria-pressed')) === 'true'
  const promptText = () => page.locator('.game-prompt-row:not(.game-prompt-sizer)').textContent()
  const quiet = (s) => !s.flying && s.handoff === null && s.refreshFx === null && s.scoring === null && s.trail === null && s.botDraft === null && s.move === null
  return {
    tap, store, check, option, optionCount, exploreButton, exploring, promptText,
    ready: () => page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 }),
    /** Wait until it's the person's (seat 0) quiet turn in this phase set. */
    async myTurn(timeout = 30000) {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        const ok = await store(`(s) => s.game.current === 0 && s.game.phase !== 'over' && (${quiet})(s)`)
        if (ok) { await page.waitForTimeout(300); return true }
        await page.waitForTimeout(80)
      }
      return false
    },
    /** One whole person's turn (draft, or move + plant + Keep all) through the store, the way the screen's taps do —
     *  this check is about Explore, not the taps (e2e:ai / e2e:pass tap them). keepAll false: stop while choosing
     *  what to refresh. */
    async playMyTurn(seat = 0, keepAll = true) {
      const drafted = await page.evaluate(async () => {
        const g = window.__glyphtender
        const st = () => g.store.getState()
        const hexOf = (key) => { const [q, r] = key.split(',').map(Number); return { q, r } }
        const option = (kind) => document.querySelector(`[data-option="${kind}"] polygon[data-hex]`)?.getAttribute('data-hex')
        if (st().game.phase === 'draft') { st().tapHex(hexOf(option('move'))); return true }
        for (const piece of st().game.glyphlings.filter((x) => x.seat === st().game.current && !st().game.tangled.includes(x.id))) {
          const held = () => st().selected?.kind === 'glyphling' && st().selected.id === piece.id
          if (!held()) st().tapGlyphling(piece.id)
          await new Promise((r) => setTimeout(r, 120))
          const to = option('move')
          if (to) { st().tapHex(hexOf(to)); break }
          if (held()) st().tapGlyphling(piece.id) // (put it down: no move)
        }
        const pick = g.findCast(true) ?? g.findCast(false)
        if (pick) { st().tapSeed(pick.seed); st().tapHex(hexOf(pick.hex)) }
        st().startCast()
        return false
      })
      if (drafted) return
      await page.waitForFunction((me) => { const s = window.__glyphtender.store.getState(); return (s.game.phase === 'refresh' && !s.scoring && !s.flying) || s.game.current !== me || s.game.phase === 'over' }, seat, { timeout: 15000 })
        .catch(async () => {
          fail(`${tag}: the turn didn't go on: ${JSON.stringify(await store((s) => ({ phase: s.game.phase, current: s.game.current, move: s.move, cast: s.cast, selected: s.selected, refreshFx: s.refreshFx !== null, scoring: s.scoring !== null, flying: s.flying, words: s.wordsStatus, note: s.note })))}`)
          await page.screenshot({ path: `${OUT}/debug@${tag}.png` })
        })
      await page.waitForTimeout(200)
      if (keepAll && (await store(`(s) => s.game.phase === 'refresh' && s.game.current === ${seat}`))) await store((s) => s.refresh(true))
    },
    /** Tap something while exploring; the callout that comes up, checked. */
    async explainOf(what, loc, target, expect) {
      // (the last callout may lie over this thing — tapping the callout closes it, Explore stays on)
      const open = page.locator('.kit-callout-layer[data-dim] .kit-callout')
      if (await open.count()) {
        await tap(open)
        await page.waitForTimeout(250)
        check(`${what}: tapping the last callout closed it`, (await open.count()) === 0 && (await exploring()))
      }
      await tap(loc)
      await page.waitForTimeout(350)
      const c = await page.evaluate(calloutNow, target)
      if (!c) {
        const box = await loc.boundingBox()
        const under = box && await page.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 6).map((el) => `${el.tagName}.${el.getAttribute('class') ?? ''}[${[...el.attributes].map((a) => a.name).filter((n) => n.startsWith('data-')).join(' ')}]`), [box.x + box.width / 2, box.y + box.height / 2])
        return check(`${what}: a callout comes up (under the tap: ${under?.join(' > ')})`, false)
      }
      check(`${what}: "${c.text}"`, expect.test(c.text))
      check(`${what}: the rest dims`, c.dim)
      c.problems.forEach((p) => fail(`${tag} ${what}: ${p}`))
      return c
    },
    async shot(name) {
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${OUT}/${name}@${tag}.png` })
    },
  }
}

try {
  // ───────────── 1. vs AI, three sizes ─────────────
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ aiSpeed: 'Slow' })), [SETTINGS_KEY])
    const errors = watchErrors(page)
    const h = helpers(page, size.mobile, tag)
    await page.goto(URL_)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Next Player 2', exact: true }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await h.ready()
    h.check('Blue is an AI seat', await h.store((s) => s.seats[1].kind === 'bot'))
    // The draft, then my first turn, then the AI's — so the board has seeds on it
    let turns = 0
    while (await h.store((s) => s.game.phase === 'draft' || s.game.turnCount < 2)) {
      if (!(await h.myTurn(40000))) { fail(`${tag}: my turn never came`); break }
      if (await h.store((s) => s.game.phase !== 'draft' && s.game.turnCount >= 2)) break
      await h.playMyTurn()
      if (++turns > 6) break
    }
    if (!(await h.myTurn(40000))) fail(`${tag}: my turn never came back`)
    h.check('the ? sits beside ☰, not lit', (await h.exploreButton.count()) === 1 && !(await h.exploring()))

    // ? → Explore
    await h.tap(h.exploreButton)
    await page.waitForTimeout(300)
    h.check('? → Explore is on (the ? is lit)', await h.exploring())
    h.check('the bar takes the prompt\'s place', (await h.promptText()).includes('Explore — tap anything.'))
    const remind = await page.evaluate(calloutNow, '[data-explore-button]')
    // (beside the board on a short screen the bar sits right under the ? and says it itself: no reminder over it)
    const barUnder = await page.evaluate(() => {
      const b = document.querySelector('[data-explore-button]').getBoundingClientRect()
      const p = document.querySelector('.game-prompt-row:not(.game-prompt-sizer)').getBoundingClientRect()
      return p.left < b.right && p.right > b.left && p.top - b.bottom < 96
    })
    if (barUnder) h.check('the bar right under the ? says "Tap ? to go back." (no reminder over it)', !remind && (await h.promptText()).includes('Tap ? to go back.'))
    else h.check(`the reminder points at the ?: "${remind?.text}"`, !!remind && remind.text.includes('Tap ? to go back'))
    remind?.problems.forEach((p) => fail(`${tag} reminder: ${p}`))
    // The bar never covers the board: the prompt's box sits outside the garden's hexes
    const covers = await page.evaluate(() => {
      const p = document.querySelector('.game-prompt').getBoundingClientRect()
      return [...document.querySelectorAll('.game-garden > polygon[data-hex]')].some((c) => {
        const r = c.getBoundingClientRect()
        return Math.min(p.right, r.right) - Math.max(p.left, r.left) > 1 && Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top) > 1
      })
    })
    h.check('the bar covers no hex of the board', !covers)
    await h.shot('1-explore-on')

    const pieces = await h.store((s) => {
      const mine = s.game.glyphlings.find((g) => g.seat === 0)
      const theirs = s.game.glyphlings.find((g) => g.seat === 1)
      const seed = Object.keys(s.game.seeds)[0]
      return { mine: mine.id, mineHex: `${mine.hex.q},${mine.hex.r}`, theirs: theirs.id, theirsHex: `${theirs.hex.q},${theirs.hex.r}`, seed }
    })
    const cell = (hex) => `.game-garden > polygon[data-hex="${hex}"]`
    await h.explainOf('my glyphling', page.locator(`[data-glyph="${pieces.mine}"]`), cell(pieces.mineHex), /^Your (tangled )?glyphling/)
    await h.shot('2-your-glyphling')
    await h.explainOf('a rival glyphling', page.locator(`[data-glyph="${pieces.theirs}"]`), cell(pieces.theirsHex), /^Blue's (tangled )?glyphling/)
    await h.shot('3-their-glyphling')
    if (pieces.seed) {
      await h.explainOf('a seed on the board', page.locator(`[data-seed="${pieces.seed}"]`), cell(pieces.seed), /seed — /)
      await h.shot('4-seed')
    } else fail(`${tag}: no seed on the board to tap`)
    await h.explainOf('a tray seed', page.locator('[data-hand]').first(), '[data-hand]', /^Your . seed\./)
    await h.shot('5-tray-seed')
    await h.explainOf('Plant', page.locator('[data-action="plant"]'), '[data-action="plant"]', /^Plant/)
    await h.shot('6-plant')
    await h.explainOf('☰', page.locator('[data-part="menu"]'), '[data-part="menu"]', /^Menu — settings, rules and leaving the game/)
    h.check('☰ in Explore: Pause does NOT open', (await page.locator('.kit-screen').count()) === 0)
    await h.shot('7-menu')
    await h.explainOf('the turn bar', page.locator('[data-part="turnBar"]'), '[data-part="turnBar"]', /^Whose turn/)
    // Empty space: a spot on the board's box with no hex under it
    const empty = await page.evaluate(() => {
      const r = document.querySelector('.game-board').getBoundingClientRect()
      for (let y = r.top + 6; y < r.bottom; y += 8) for (let x = r.left + 6; x < r.right; x += 8) {
        const stack = document.elementsFromPoint(x, y).filter((el) => !el.closest('.kit-callout-layer'))
        if (stack[0]?.closest('.game') && !stack.some((el) => el.closest('[data-hex], [data-glyph], .game-turn-bar, .game-panel, button'))) return { x, y }
      }
      return null
    })
    if (empty) {
      if (size.mobile) await page.touchscreen.tap(empty.x, empty.y); else await page.mouse.click(empty.x, empty.y)
      await page.waitForTimeout(300)
      h.check('tap empty space → the callout closes', !(await page.evaluate(() => document.querySelector('.kit-callout-layer[data-dim]'))))
      h.check('…and Explore stays on', await h.exploring())
    } else fail(`${tag}: found no empty space to tap`)
    // A drag on my glyphling moves nothing
    const from = await page.locator(`[data-glyph="${pieces.mine}"]`).boundingBox()
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 60, from.y + from.height / 2 + 40, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    h.check('a drag in Explore moves nothing', await h.store((s) => s.move === null && s.selected === null))
    // ? → back to the game
    await page.evaluate(() => document.querySelector('.kit-callout-layer') && null)
    await h.tap(h.exploreButton)
    await page.waitForTimeout(300)
    h.check('? → Explore is off', !(await h.exploring()))
    h.check('the prompt is back', !(await h.promptText()).includes('Explore'))
    await h.tap(page.locator(`[data-glyph="${pieces.mine}"]`))
    await page.waitForTimeout(200)
    const moves = await h.optionCount('move')
    h.check('normal play again: tapping my glyphling shows its moves', moves > 0 || (await h.store((s) => s.game.tangled.length > 0)))
    // The AI waits while I explore: finish my turn, then ? while it thinks
    await h.playMyTurn()
    // (rarely the game's random garden ends right here — 2 glyphlings tangled: then there's no AI turn to hold)
    if (await h.store((s) => s.game.phase === 'over')) {
      console.log(`skip ${tag}: the game ended on my turn — no AI turn to hold this time`)
      if (errors.length) fail(`${tag}: console errors: ${errors.join(' | ')}`)
      await page.close()
      continue
    }
    await page.waitForFunction(() => window.__glyphtender.store.getState().game.current === 1, null, { timeout: 15000 }).catch(async () => {
      fail(`${tag}: my turn didn't pass to the AI: ${JSON.stringify(await h.store((s) => ({ phase: s.game.phase, current: s.game.current, move: s.move, cast: s.cast, selected: s.selected, refreshFx: s.refreshFx !== null, scoring: s.scoring !== null, flying: s.flying })))}`)
      await h.shot('debug')
    })
    const before = await h.store((s) => s.game.turnCount)
    await h.tap(h.exploreButton)
    await page.waitForTimeout(8000)
    h.check('while exploring, the AI\'s turn waits (8 s, no move)', await h.store(`(s) => s.game.current === 1 && s.game.turnCount === ${before} && s.move === null`))
    await h.shot('8-ai-waits')
    await h.tap(h.exploreButton)
    await page.waitForFunction((n) => window.__glyphtender.store.getState().game.turnCount > n, before, { timeout: 30000 }).catch(() => {})
    h.check('? again → the AI plays its turn', await h.store(`(s) => s.game.turnCount > ${before}`))
    if (errors.length) fail(`${tag}: console errors: ${errors.join(' | ')}`)
    await page.close()
  }

  // ───────────── 2. Pass-and-play: the handoff ends Explore ─────────────
  {
    const tag = 'pass'
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const errors = watchErrors(page)
    const h = helpers(page, true, tag)
    await page.goto(URL_)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('switch', { name: 'Hide seeds between turns' }).click() // (the handoff screen shows only with Hide seeds on)
    await page.getByRole('button', { name: 'Start' }).click()
    await h.ready()
    h.check('two people on this device', await h.store((s) => s.seats.every((x) => x.kind !== 'bot')))
    // Draft (passing the device on as asked), until a person may play a turn
    // (the handoff comes up only once the tray has grown — B011 — so: settled = in play, no handoff, twice in a row)
    for (let i = 0, settled = 0; i < 60 && settled < 3; i++) {
      const now = await h.store((s) => ({ phase: s.game.phase, handoff: s.handoff !== null, busy: s.flying || s.refreshFx !== null || s.scoring !== null }))
      if (now.handoff) { settled = 0; await h.tap(page.getByRole('button', { name: 'Show my seeds' })); await page.waitForTimeout(400); continue }
      if (now.phase === 'draft' && !now.busy) { settled = 0; await h.tap(h.option('move', Math.floor((await h.optionCount('move')) / 2))); await page.waitForTimeout(500); continue }
      settled = now.phase === 'play' && !now.busy ? settled + 1 : 0
      await page.waitForTimeout(400)
    }
    // Move + plant (or end the turn), up to choosing what to refresh
    await h.playMyTurn(await h.store((s) => s.game.current), false)
    if (await h.store((s) => s.game.phase === 'refresh')) {
      await h.tap(h.exploreButton)
      await page.waitForTimeout(300)
      h.check('? while choosing what to refresh → Explore', await h.exploring())
      await h.explainOf('Keep all', page.locator('[data-action="keep-all"]'), '[data-action="keep-all"]', /^Keep all/)
      h.check('Keep all only explained itself (still choosing)', await h.store((s) => s.game.phase === 'refresh' && s.handoff === null))
      await h.shot('9-pass-refresh')
      await h.store((s) => s.refresh(true)) // (the turn goes on — in Explore a tap can't do it)
    } else {
      // (End turn went straight on: Explore during the handoff wait instead)
      await h.tap(h.exploreButton)
    }
    await page.waitForFunction(() => window.__glyphtender.store.getState().handoff !== null, null, { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(300)
    h.check('the handoff screen comes up', await h.store((s) => s.handoff !== null))
    h.check('…and Explore has ended by itself', !(await h.exploring()))
    await h.shot('10-pass-handoff')
    if (errors.length) fail(`${tag}: console errors: ${errors.join(' | ')}`)
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}

console.log(failures ? `\n${failures} problem(s)` : '\nExplore: all good')
process.exit(failures ? 1 : 0)

// DRAG CARRY STYLES (F63) — every carry style (A Pick it up · B Lift, mark home · C Aim · D Float — ui-kit drag/carry.ts)
// × every drag type (draft · a seed onto a hex · tray reorder · glyphling move), dragged with the mouse on the real
// screen at phone 390×844 and desktop 1440×900. The style is switched live (content/tuning/drag.json, as the Dev Kit
// does — once through the Dev Kit's own Tuning dropdown), then for each:
//   mid-drag: the carried piece shows (solid or a ghost, as the style says) and the piece's home shows what the style
//             says (data-carried on the tray place / board glyphling: none = solid · "ghost" · "empty")
//   a WRONG drop (an illegal hex, or nothing): the piece goes back — carried piece hidden, home normal, the game unchanged
//   a legal drop: while it lands nothing has changed yet; once landed the carried piece is hidden, its home normal and
//             the store has the change (placed / moved / aimed / reordered). A move in style C glides (useGlide);
//             in the other styles it was set down by the drop, so it doesn't glide as well (one motion).
// Screenshots (mid-drag + after the drop) in <out>/drag-styles/.
// Starts its OWN dev server (default port 5432 — never Muzzy's) and closes only that one.
//   node e2e/drag-styles.mjs [outDir] [port]
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import drag from '../content/tuning/drag.json' with { type: 'json' }

const OUT = `${process.argv[2] ?? 'e2e-shots'}/drag-styles`
const PORT = Number(process.argv[3] ?? 5432)
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]
const STYLES = ['A', 'B', 'C', 'D']
// What each style shows (ui-kit CARRY_PRESETS): the carried piece, its home (null = solid, as usual)
const LOOK = {
  A: { carried: 'solid', home: 'empty' },
  B: { carried: 'solid', home: 'ghost' },
  C: { carried: 'ghost', home: null },
  D: { carried: 'ghost', home: 'empty' },
}
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const check = (what, ok) => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}

try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    const store = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
    // What a drop may change: the game, the plan and the tray order (selected / note may change — a tap there does)
    const gameNow = () => store((s) => JSON.stringify({ game: s.game, move: s.move, cast: s.cast, order: s.trayOrder }))

    // Switch a drag type's style live — the Dev Kit's own event (liveTuning), the same as its Tuning dropdown
    const styles = { ...drag.styles }
    const setStyle = (type, letter) => {
      styles[type] = letter
      return page.evaluate((data) => window.dispatchEvent(new CustomEvent('devkit:tuning', { detail: { file: 'drag', data } })),
        { ...drag, styles: { ...styles } })
    }

    // The carried piece and a piece's home look, read in the page
    const carriedNow = () => page.evaluate(() => {
      const el = document.querySelector('[data-carry]')
      return { visible: el.style.visibility === 'visible', opacity: Number(el.style.opacity) }
    })
    const homeLook = (selector) => page.evaluate((sel) => document.querySelector(sel)?.getAttribute('data-carried') ?? null, selector)
    const glidesDone = () => page.waitForFunction(
      () => [...document.querySelectorAll('[data-glide]')].every((g) => g.getAnimations().length === 0), null, { timeout: 3000 })
    const dropDone = () => page.waitForFunction(() => document.querySelector('[data-carry]').style.visibility !== 'visible', null, { timeout: 3000 })

    // Press a piece and move a little (it becomes a drag: the options glow), then go to a point found mid-drag
    const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    const pickUp = async (loc) => {
      const a = await centre(loc)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(a.x + 20, a.y, { steps: 4 })
    }
    const goTo = (pt) => page.mouse.move(pt.x, pt.y, { steps: 8 })
    // A board hex that is NOT a legal drop right now (no option glow on it, nothing standing on it)
    const illegalHex = () => page.evaluate(() => {
      const lit = new Set([...document.querySelectorAll('[data-option] [data-hex]')].map((el) => el.getAttribute('data-hex')))
      // (anything drawn on a hex: glyphlings, seeds, a moved glyphling's ghost — a tap on the ghost takes the move back)
      const taken = new Set([...document.querySelectorAll('.game-garden image[data-hex]')].map((el) => el.getAttribute('data-hex')))
      const cell = [...document.querySelectorAll('.game-garden > polygon[data-hex]')].find((p) => !lit.has(p.dataset.hex) && !taken.has(p.dataset.hex))
      const r = cell.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, hex: cell.dataset.hex }
    })
    // Nothing at all: the middle of the turn bar's top edge area (no hex, no tray place)
    const nowhere = () => page.evaluate(() => {
      const r = document.querySelector('.game-board').getBoundingClientRect()
      return { x: r.left + 4, y: r.top + 4 }
    })

    // One drag: pick up → go to `target()` → mid-drag checks + shot → let go → after-drop checks (+ shot when legal)
    const tryDrag = async ({ type, style, piece, home, target, legal, changed, name }) => {
      const before = await gameNow()
      await pickUp(piece)
      const pt = await target()
      await goTo(pt)
      const look = LOOK[style]
      const mid = await carriedNow()
      const wantOpacity = look.carried === 'ghost' ? drag.ghostOpacity : 1
      check(`${size.name} ${type} ${style} ${legal ? '' : '(wrong drop) '}mid-drag: the carried piece shows, ${look.carried} (opacity ${mid.opacity})`,
        mid.visible && Math.abs(mid.opacity - wantOpacity) < 0.01)
      check(`${size.name} ${type} ${style} mid-drag: its home shows ${look.home ?? 'solid'}`, (await homeLook(home())) === look.home)
      if (legal) await page.screenshot({ path: `${OUT}/${size.name}-${type}-${style}-mid.png` })
      await page.mouse.up()
      // Right after letting go, while the landing plays, the game hasn't changed yet (it changes once landed)
      const landing = await page.evaluate(() => document.querySelector('[data-carry]').style.visibility === 'visible')
      if (landing) check(`${size.name} ${type} ${style}: nothing changes while it ${legal ? 'lands' : 'goes back'}`, (await gameNow()) === before)
      await dropDone()
      const after = await carriedNow()
      check(`${size.name} ${type} ${style}: after the drop the carried piece is hidden`, !after.visible)
      if (legal) {
        check(`${size.name} ${type} ${style}: the drop ${name} (store)`, await changed())
        await page.screenshot({ path: `${OUT}/${size.name}-${type}-${style}-after.png` })
      } else {
        check(`${size.name} ${type} ${style}: a wrong drop changes nothing`, (await gameNow()) === before)
        check(`${size.name} ${type} ${style}: after a wrong drop its home looks normal`, (await homeLook(home())) === null)
      }
      return landing
    }

    // ---- menu → Play → Start (2 players, Small) ----
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 })

    // ---- the Dev Kit's Tuning dropdown switches a style live (desktop: draft → B) ----
    let draftStyles = STYLES
    if (size.name === 'desktop') {
      await page.keyboard.press('Backquote')
      await page.getByRole('tab', { name: 'Tuning' }).click()
      await page.getByRole('searchbox', { name: 'Search Tuning', exact: true }).fill('drag style')
      const dropdown = page.locator('select[aria-label="styles.draft"]')
      const names = await dropdown.locator('option').allTextContents()
      check(`${size.name} Dev Kit: Tuning → Dragging has a draft style dropdown (${names.join(' / ')})`,
        names.join('|') === 'A · Pick it up|B · Lift, mark home|C · Aim|D · Float')
      await dropdown.selectOption('B')
      await page.screenshot({ path: `${OUT}/${size.name}-devkit-dropdown.png` })
      await page.keyboard.press('Escape') // (clears the search)
      await page.keyboard.press('Backquote')
      styles.draft = 'B'
      draftStyles = ['B', 'A', 'C', 'D'] // (the first draft drag uses the Dev Kit's B)
    }

    // ---- draft: one placement per style (2 players × 2 glyphlings = 4) ----
    const draftNext = page.locator('[data-draft="next"]')
    const option = (kind, pick) => page.locator(`[data-option="${kind}"] circle`).nth(pick)
    for (const [i, style] of draftStyles.entries()) {
      if (!(size.name === 'desktop' && i === 0)) await setStyle('draft', style)
      const home = () => '[data-draft="next"]'
      await tryDrag({ type: 'draft', style, piece: draftNext, home, target: illegalHex, legal: false })
      const placed = await store((s) => s.game.glyphlings.length)
      await tryDrag({
        type: 'draft', style, piece: draftNext, home, legal: true, name: 'placed a glyphling',
        target: () => centre(option('move', i)),
        changed: () => store(`(s) => s.game.glyphlings.length === ${placed + 1}`),
      })
    }
    check(`${size.name} the draft is done`, await store((s) => s.game.phase === 'play'))
    if (await store((s) => s.handoff !== null)) await page.getByRole('button', { name: 'Show my seeds' }).click()

    // ---- glyphling moves: drag one onto a move option, per style (then Undo for the next) ----
    const mine = await store((s) => s.game.glyphlings.filter((g) => g.seat === s.game.current && !s.game.tangled.includes(g.id)).map((g) => g.id)[0])
    const glyph = page.locator(`[data-glyph="${mine}"]`)
    const glyphHome = () => `[data-glide="${mine}"]`
    for (const style of STYLES) {
      await setStyle('move', style)
      await tryDrag({ type: 'move', style, piece: glyph, home: glyphHome, target: illegalHex, legal: false })
      await tryDrag({
        type: 'move', style, piece: glyph, home: glyphHome, legal: true, name: 'planned the move',
        target: () => centre(option('move', 0)),
        changed: () => store((s) => s.move !== null),
      })
      // C flies the real piece = the move glide; the others set it down themselves, so no glide follows
      const gliding = await page.evaluate((id) => document.querySelector(`[data-glide="${id}"]`).getAnimations().length > 0, mine)
      check(`${size.name} move ${style}: ${style === 'C' ? 'the glyphling glides there (useGlide)' : 'no glide after it was set down'}`, gliding === (style === 'C'))
      await glidesDone()
      if (style !== 'D') {
        await page.locator('.game-actions button', { hasText: 'Undo' }).click()
        await glidesDone()
      }
    }

    // ---- a move planned WITHOUT a drag (a tap-tap — the same path as an AI's or an online rival's move: store.move)
    // glides wearing the move's carry style: lifted on the way (B), or as itself (C) (Muzzy 2026-10-10: the AI's
    // actions look like the player's) ----
    // (the D drop above left its move planned: take it back first; the last one stays planned, as the seeds need a move)
    await page.locator('.game-actions button', { hasText: 'Undo' }).click()
    await glidesDone()
    for (const style of ['B', 'C']) {
      await setStyle('move', style)
      await glyph.click({ force: true })
      await option('move', 0).click({ force: true })
      const lifted = await page.evaluate((id) => document.querySelector(`[data-lift="${id}"]`).getAnimations().length > 0, mine)
      check(`${size.name} planned move in ${style}: ${style === 'C' ? 'glides as itself' : 'glides lifted, like a carried piece'}`, lifted === (style !== 'C'))
      await glidesDone()
      if (style === 'B') {
        await page.locator('.game-actions button', { hasText: 'Undo' }).click()
        await glidesDone()
      }
    }

    // ---- try again (Muzzy 2026-10-10): dragging the MOVED glyphling — or its start-of-turn ghost — starts over from
    // the start of the turn: the plan goes back at once (no glide), its home (faint mark, aim line) is the START hex ----
    await setStyle('move', 'B')
    const startHex = await store((s) => { const g = s.game.glyphlings.find((x) => x.id === s.move.glyphling); return `${g.hex.q},${g.hex.r}` })
    const startCentre = await centre(page.locator(`.game-garden > polygon[data-hex="${startHex}"]`))
    for (const grab of ['glyphling', 'ghost']) {
      await pickUp(grab === 'ghost' ? page.locator(`[data-moved-from="${mine}"]`) : glyph)
      const mid = await page.evaluate((id) => ({
        move: window.__glyphtender.store.getState().move,
        ghost: document.querySelectorAll('[data-moved-from]').length,
        home: document.querySelector(`[data-glide="${id}"]`).getAttribute('data-carried'),
        at: (() => { const r = document.querySelector(`[data-glyph="${id}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })(),
      }), mine)
      check(`${size.name} grab the moved ${grab} again: the plan is taken back (no move, no old ghost)`, mid.move === null && mid.ghost === 0)
      check(`${size.name} grab the moved ${grab} again: its faint home is the turn's START hex`, mid.home === 'ghost' && Math.hypot(mid.at.x - startCentre.x, mid.at.y - startCentre.y) < 3)
      await goTo(await centre(option('move', 1)))
      await page.mouse.up()
      await dropDone()
      await glidesDone()
      check(`${size.name} grab the moved ${grab} again: dropping it plans the new move`, await store((s) => s.move !== null))
    }
    // and back onto its start hex = put it back: no plan, one motion home (B026)
    await pickUp(glyph)
    await goTo(startCentre)
    await page.mouse.up()
    await dropDone()
    check(`${size.name} dropped back on its start hex: no move planned`, await store((s) => s.move === null))
    const glidingHome = await page.evaluate((id) => document.querySelector(`[data-glide="${id}"]`).getAnimations().length > 0, mine)
    check(`${size.name} dropped back on its start hex: one motion only, no glide after (B026)`, !glidingHome)
    // (the seeds below need a planned move)
    await glyph.click({ force: true })
    await option('move', 0).click({ force: true })
    await glidesDone()

    // ---- seeds: drag one from the tray onto a cast option, per style (then Undo the aim for the next) ----
    const pick = await page.evaluate(() => window.__glyphtender.findCast(false) ?? window.__glyphtender.findCast(true))
    for (const style of STYLES) {
      await setStyle('seed', style)
      const pos = await store(`(s) => s.trayOrder[s.game.current].indexOf('${pick.seed}')`)
      const seed = page.locator(`[data-tray-pos="${pos}"]`)
      const seedHome = () => `[data-hand="${pick.seed}"]`
      await tryDrag({ type: 'seed', style, piece: seed, home: seedHome, target: illegalHex, legal: false })
      await tryDrag({
        type: 'seed', style, piece: seed, home: seedHome, legal: true, name: 'aimed the seed',
        target: () => centre(page.locator(`[data-option="cast"] circle[data-hex="${pick.hex}"]`)),
        changed: () => store(`(s) => s.cast?.seed === '${pick.seed}' && s.cast.target.q + ',' + s.cast.target.r === '${pick.hex}'`),
      })
      const aimed = await page.evaluate((id) => document.querySelector(`[data-hand="${id}"] image`) === null, pick.seed)
      check(`${size.name} seed ${style}: its tray place shows only the aimed halo (no solid copy)`, aimed)
      await page.locator('.game-actions button', { hasText: 'Undo' }).click()
    }

    // ---- tray reorder: drag the seed in place 0 onto place 3, per style ----
    for (const style of STYLES) {
      // (in play a seed drag is a reorder only while it's over ANOTHER tray place — elsewhere it's aiming: same style)
      await setStyle('reorder', style)
      await setStyle('seed', style)
      const id = await store((s) => s.trayOrder[s.game.current][0])
      const from = page.locator('[data-tray-pos="0"]')
      const trayHome = () => `[data-hand="${id}"]`
      await tryDrag({ type: 'reorder', style, piece: from, home: trayHome, target: nowhere, legal: false })
      await tryDrag({
        type: 'reorder', style, piece: from, home: trayHome, legal: true, name: 'reordered the tray',
        target: () => centre(page.locator('[data-tray-pos="3"]')),
        changed: () => store(`(s) => s.trayOrder[s.game.current].indexOf('${id}') === 3`),
      })
      await store((s) => s.selected?.kind === 'seed' && s.tapSeed(s.selected.id)) // (put the dragged seed down — B004)
    }

    check(`${size.name}: no console errors${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`, errors.length === 0)
    await page.close()
  }
} catch (error) {
  failures++
  console.log(`FAIL ${error.message}`)
} finally {
  await browser.close()
  await server.close()
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
process.exit(failures ? 1 : 0)

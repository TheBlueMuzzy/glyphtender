// DRAG TARGET FEEDBACK (F64) — what the TARGET shows while a piece is dragged (ui-kit drag/target.ts, content/tuning/
// drag.json targets / snap), dragged with the mouse on the real screen at phone 390×844, a phone on its side 844×390 and
// desktop 1440×900. Each look is switched live (as the Dev Kit does — on desktop once through its own Tuning dropdown):
//   board drags (draft · seed · glyphling move), mid-drag over a legal hex:
//     highlight — the hex glows at full strength; no ghost preview, no tether
//     ghost     — a see-through copy of the piece ([data-target-preview], its own drag-layer image) sits ON that hex, the
//                 glow is fainter (ghostGlow); after the drop it's gone
//     tether    — the aim line ([data-tether]) is drawn, in the player's colour, the hex still glows; gone after the drop
//   magnetic snap: the pointer just off a legal hex (over one that isn't legal) → the carried piece is pulled toward the
//     legal hex, that hex glows, and letting go there makes the move onto it; snap 0 = no pull, the same drop goes back
//   tray reorder (after the move), a seed dragged onto another seed:
//     marker — the insertion marker shows at the gap moveInRack really inserts into (rightwards: after that seed,
//              leftwards: before it), not over its own place; the drop puts it there; the tray keeps its height (B013)
//     room   — the seeds on each side of that gap slide apart (left of it left, right of it right); back after the drop
//     none   — neither
// Screenshots (mid-drag) in <out>/drag-targets/.
// Starts its OWN dev server (default port 5434 — never Muzzy's) and closes only that one.
//   node e2e/drag-targets.mjs [outDir] [port]
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import drag from '../content/tuning/drag.json' with { type: 'json' }

const OUT = `${process.argv[2] ?? 'e2e-shots'}/drag-targets`
const PORT = Number(process.argv[3] ?? 5434)
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
]
mkdirSync(OUT, { recursive: true })

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const check = (what, ok) => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
}
const near = (a, b, px) => Math.hypot(a.x - b.x, a.y - b.y) <= px
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    const store = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)

    // Switch drag.json live — the Dev Kit's own event (liveTuning), the same as its Tuning tab
    let tuning = structuredClone(drag)
    const setTuning = (change) => {
      tuning = { ...tuning, ...change, targets: { ...tuning.targets, ...(change.targets ?? {}) } }
      return page.evaluate((data) => window.dispatchEvent(new CustomEvent('devkit:tuning', { detail: { file: 'drag', data } })), tuning)
    }
    const setTarget = (type, look) => setTuning({ targets: { [type]: look } })

    // What the drag layer and the board show, read in the page (client px)
    const targetsNow = () => page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } }
      const preview = document.querySelector('[data-target-preview]')
      const tether = document.querySelector('[data-tether]')
      const carry = document.querySelector('[data-carry]')
      const glow = [...document.querySelectorAll('[data-drop-target]')].find((m) => m.getAttribute('visibility') === 'visible')
      return {
        preview: { visible: preview.style.visibility === 'visible', opacity: Number(preview.style.opacity), ...box(preview) },
        tether: { visible: tether.style.visibility === 'visible', d: tether.getAttribute('d') ?? '', stroke: getComputedStyle(tether).stroke },
        carry: { visible: carry.style.visibility === 'visible', ...box(carry) },
        glow: glow ? { hex: glow.getAttribute('data-drop-hex'), opacity: Number(glow.getAttribute('opacity') ?? 1) } : null,
        // (the player's colour: the move glow's fill — a cast's glow is the cast tint)
        player: getComputedStyle(document.querySelector('[data-drop-target="move"] polygon:not([fill="none"])')).fill,
      }
    })
    const hexCentre = (hex) => page.evaluate((key) => {
      const r = document.querySelector(`.game-garden > polygon[data-hex="${key}"]`).getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }
    }, hex)
    const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
    const pickUp = async (loc) => {
      const a = await centre(loc)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(a.x + 20, a.y, { steps: 4 })
    }
    const goTo = (pt) => page.mouse.move(pt.x, pt.y, { steps: 8 })
    const dropDone = () => page.waitForFunction(() => document.querySelector('[data-carry]').style.visibility !== 'visible', null, { timeout: 3000 })
    const glidesDone = () => page.waitForFunction(
      () => [...document.querySelectorAll('[data-glide]')].every((g) => g.getAnimations().length === 0), null, { timeout: 3000 })
    const undo = async () => { await page.locator('.game-actions button', { hasText: 'Undo' }).click(); await glidesDone() }

    // One board drag onto a legal hex with a target look: the mid-drag checks (+ a shot), then the drop, then all gone.
    // `hex` may be a function, asked once the piece is picked up (its options show then)
    const boardDrag = async ({ type, look, piece, hex: which, changed, name }) => {
      await pickUp(piece)
      const hex = typeof which === 'function' ? await which() : which
      const spot = await hexCentre(hex)
      await goTo(spot)
      const t = await targetsNow()
      const tag = `${size.name} ${type} ${look}`
      check(`${tag}: the hex glows (${t.glow?.hex}) at ${look === 'ghost' ? 'ghostGlow' : 'full'} strength (${t.glow?.opacity})`,
        t.glow?.hex === hex && Math.abs(t.glow.opacity - (look === 'ghost' ? tuning.ghostGlow : 1)) < 0.01)
      if (look === 'ghost') {
        check(`${tag}: a ghost preview sits on the hex (off by ${dist(t.preview, spot).toFixed(1)} px, opacity ${t.preview.opacity})`,
          t.preview.visible && near(t.preview, spot, 2) && Math.abs(t.preview.opacity - tuning.ghostOpacity) < 0.01)
      } else check(`${tag}: no ghost preview`, !t.preview.visible)
      if (look === 'tether') {
        check(`${tag}: the aim line is drawn, in the player's colour (${t.tether.stroke} vs ${t.player})`, t.tether.visible && t.tether.d.length > 10 && t.tether.stroke === t.player)
      } else check(`${tag}: no aim line`, !t.tether.visible)
      await page.screenshot({ path: `${OUT}/${size.name}-${type}-${look}-mid.png` })
      await page.mouse.up()
      await dropDone()
      const after = await targetsNow()
      check(`${tag}: after the drop the preview, the aim line and the glow are gone`, !after.preview.visible && !after.tether.visible && after.glow === null)
      check(`${tag}: the drop ${name}`, await changed())
    }

    // ---- menu → Play → Start (2 players, Small) ----
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 })

    // ---- the Dev Kit's Tuning dropdown switches a target look live (desktop: draft → ghost) ----
    let draftLooks = ['ghost', 'tether', 'highlight', 'ghost']
    if (size.name === 'desktop') {
      await page.keyboard.press('Backquote')
      await page.getByRole('tab', { name: 'Tuning' }).click()
      await page.getByRole('searchbox', { name: 'Search Tuning', exact: true }).fill('drag target')
      const dropdown = page.locator('select[aria-label="targets.draft"]')
      const names = await dropdown.locator('option').allTextContents()
      check(`${size.name} Dev Kit: Tuning → Dragging has a draft target dropdown (${names.join(' / ')})`,
        names.join('|') === 'Highlight the hex|Ghost preview on the hex|Aim line from home')
      const reorder = await page.locator('select[aria-label="targets.reorder"]').locator('option').allTextContents()
      check(`${size.name} Dev Kit: … and a tray reorder one (${reorder.join(' / ')})`, reorder.join('|') === 'None|Insertion marker|Make room')
      await dropdown.selectOption('ghost')
      await page.screenshot({ path: `${OUT}/${size.name}-devkit-targets.png` })
      await page.keyboard.press('Escape')
      await page.keyboard.press('Backquote')
      tuning.targets.draft = 'ghost'
      draftLooks = ['ghost', 'tether', 'highlight', 'ghost'] // (the first draft drag uses the Dev Kit's ghost)
    }

    // ---- draft: one placement per look ----
    const draftNext = page.locator('[data-draft="next"]')
    const optionHex = (kind, pick) => page.locator(`[data-option="${kind}"] circle[data-hex]`).nth(pick).getAttribute('data-hex')
    for (const [i, look] of draftLooks.entries()) {
      if (!(size.name === 'desktop' && i === 0)) await setTarget('draft', look)
      const placed = await store((s) => s.game.glyphlings.length)
      await boardDrag({
        type: 'draft', look, piece: draftNext, hex: () => optionHex('move', i), name: 'placed a glyphling',
        changed: () => store(`(s) => s.game.glyphlings.length === ${placed + 1}`),
      })
    }
    check(`${size.name} the draft is done`, await store((s) => s.game.phase === 'play'))
    if (await store((s) => s.handoff !== null)) await page.getByRole('button', { name: 'Show my seeds' }).click()

    // ---- glyphling moves: ghost (undone), then tether (kept — seeds may be aimed only after the move, B008) ----
    const mine = await store((s) => s.game.glyphlings.filter((g) => g.seat === s.game.current && !s.game.tangled.includes(g.id)).map((g) => g.id)[0])
    const glyph = page.locator(`[data-glyph="${mine}"]`)
    let moved = ''
    const moveHex = async () => (moved = await optionHex('move', 0))
    for (const look of ['ghost', 'tether']) {
      await setTarget('move', look)
      await boardDrag({
        type: 'move', look, piece: glyph, hex: moveHex, name: 'planned the move',
        changed: () => store(`(s) => s.move && s.move.to.q + ',' + s.move.to.r === '${moved}'`),
      })
      await glidesDone()
      if (look === 'ghost') await undo()
    }

    // ---- seeds: ghost, tether, highlight onto a cast option (the aim undone each time) ----
    const pick = await page.evaluate(() => window.__glyphtender.findCast(false) ?? window.__glyphtender.findCast(true))
    for (const look of ['ghost', 'tether', 'highlight']) {
      await setTarget('seed', look)
      const pos = await store(`(s) => s.trayOrder[s.game.current].indexOf('${pick.seed}')`)
      await boardDrag({
        type: 'seed', look, piece: page.locator(`[data-tray-pos="${pos}"]`), hex: pick.hex, name: 'aimed the seed',
        changed: () => store(`(s) => s.cast?.seed === '${pick.seed}' && s.cast.target.q + ',' + s.cast.target.r === '${pick.hex}'`),
      })
      await page.locator('.game-actions button', { hasText: 'Undo' }).click() // (takes the aim back, the move stays)
    }

    // ---- a seed's aim line starts at the glyphling that casts it, not at the tray (Muzzy 2026-10-10) ----
    {
      await setTarget('seed', 'tether')
      const pos = await store(`(s) => s.trayOrder[s.game.current].indexOf('${pick.seed}')`)
      await pickUp(page.locator(`[data-tray-pos="${pos}"]`))
      await goTo(await hexCentre(pick.hex))
      const gap = await page.evaluate(() => {
        const d = document.querySelector('[data-tether]').getAttribute('d') ?? ''
        const [x, y] = (d.match(/^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/) ?? []).slice(1).map(Number)
        const layer = document.querySelector('.game-drag-layer').getBoundingClientRect()
        const id = window.__glyphtender.store.getState().move.glyphling
        const r = document.querySelector(`[data-glyph="${id}"]`).getBoundingClientRect()
        return Math.hypot(layer.left + x - (r.left + r.width / 2), layer.top + y - (r.top + r.height / 2))
      })
      check(`${size.name} seed tether: starts at the moved glyphling (${Math.round(gap)} px off)`, gap < 3)
      await page.mouse.up()
      await dropDone()
      await page.locator('.game-actions button', { hasText: 'Undo' }).click()
    }

    // ---- magnetic snap: the glyphling dragged to just off a legal hex ----
    await undo() // (the move, so the glyphling can be dragged again)
    await setTarget('move', 'highlight')
    // A point just past a legal hex's edge, over a hex that ISN'T legal (or off the board), with that legal hex the nearest
    // (asked mid-drag: the options show while the glyphling is carried)
    const offSpot = () => page.evaluate(() => {
        const legal = [...document.querySelectorAll('[data-option="move"] circle[data-hex]')].map((c) => c.getAttribute('data-hex'))
        for (const hex of legal) {
          const r = document.querySelector(`.game-garden > polygon[data-hex="${hex}"]`).getBoundingClientRect()
          const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          for (let k = 0; k < 6; k++) {
            const angle = (Math.PI / 3) * k + Math.PI / 6 // toward each side (flat-top hexes)
            const p = { x: c.x + Math.cos(angle) * r.width * 0.5, y: c.y + Math.sin(angle) * r.width * 0.5 }
            const under = document.elementFromPoint(p.x, p.y)?.closest('[data-hex]')?.getAttribute('data-hex')
            if (under === undefined || !legal.includes(under)) return { hex, centre: c, point: p, w: r.width }
          }
        }
        return null
      })
    // Strong pull, long reach (switched mid-drag — read on every pointer move): the carried piece shows well on its way
    // to the legal hex, and that hex glows
    await pickUp(glyph)
    const spot = await offSpot()
    check(`${size.name} snap: found a point just off a legal hex (${spot?.hex})`, spot !== null)
    if (!spot) await page.mouse.up()
    if (spot) {
      await setTuning({ snap: 1, snapRadius: 1 })
      await goTo(spot.point)
      const t = await targetsNow()
      check(`${size.name} snap: the carried piece is pulled toward the legal hex (${dist(spot.point, spot.centre).toFixed(1)} → ${dist(t.carry, spot.centre).toFixed(1)} px)`,
        dist(t.carry, spot.centre) < 0.75 * dist(spot.point, spot.centre))
      check(`${size.name} snap: the legal hex glows (${t.glow?.hex})`, t.glow?.hex === spot.hex)
      await page.screenshot({ path: `${OUT}/${size.name}-snap-mid.png` })
      await page.mouse.up()
      await dropDone()
      await glidesDone()
      check(`${size.name} snap: letting go there moves onto the legal hex`, await store(`(s) => s.move && s.move.to.q + ',' + s.move.to.r === '${spot.hex}'`))
      await undo()
      // The defaults (snap 0.5, reach 0.6 × a piece) still catch it
      await setTuning({ snap: drag.snap, snapRadius: drag.snapRadius })
      await pickUp(glyph)
      await goTo(spot.point)
      await page.mouse.up()
      await dropDone()
      await glidesDone()
      check(`${size.name} snap (defaults): the same drop lands on the legal hex`, await store(`(s) => s.move && s.move.to.q + ',' + s.move.to.r === '${spot.hex}'`))
      await undo()
      // Snap off: no pull, no glow, the same drop goes back
      await setTuning({ snap: 0 })
      await pickUp(glyph)
      await goTo(spot.point)
      const off = await targetsNow()
      check(`${size.name} snap 0: the carried piece is NOT pulled (${dist(off.carry, spot.point).toFixed(1)} px from the pointer), nothing glows`,
        dist(off.carry, spot.point) < 1.5 && off.glow === null)
      await page.mouse.up()
      await dropDone()
      check(`${size.name} snap 0: the drop changes nothing`, await store((s) => s.move === null))
      await setTuning({ snap: drag.snap })
    }

    // ---- tray reorder (after the move): marker, room, none ----
    await pickUp(glyph)
    await goTo(await hexCentre(await moveHex()))
    await page.mouse.up()
    await dropDone()
    await glidesDone()
    check(`${size.name} tray: the move is planned (reorder allowed)`, await store((s) => s.move !== null))
    const trayHeight = () => page.evaluate(() => document.querySelector('.game-tray').getBoundingClientRect().height)
    const marker = () => page.evaluate(() => {
      const m = document.querySelector('.kit-hand-marker')
      if (!m) return null
      const r = m.getBoundingClientRect()
      return { at: Number(m.getAttribute('data-insert-at')), x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    const shifts = () => page.evaluate(() => [...document.querySelectorAll('.game-tray [data-tray-pos]')]
      .map((g) => parseFloat(g.querySelector('.kit-hand-room').style.getPropertyValue('--kit-hand-shift')) || 0))
    const putDown = () => store((s) => s.selected?.kind === 'seed' && s.tapSeed(s.selected.id)) // (B004)
    const height = await trayHeight()

    // marker, rightwards: place 0 onto place 2 → it will slide in AFTER that seed (gap 3)
    await setTarget('reorder', 'marker')
    let id = await store((s) => s.trayOrder[s.game.current][0])
    await pickUp(page.locator('[data-tray-pos="0"]'))
    const place2 = await centre(page.locator('[data-tray-pos="2"]'))
    const place3 = await centre(page.locator('[data-tray-pos="3"]'))
    await goTo(place2)
    let m = await marker()
    check(`${size.name} tray marker: over place 2 (from 0) it shows at gap 3 — after that seed (gap ${m?.at})`, m?.at === 3)
    check(`${size.name} tray marker: drawn between places 2 and 3`, m !== null && m.x > place2.x && m.x < place3.x && Math.abs(m.y - place2.y) < 4)
    check(`${size.name} tray marker: the tray keeps its height (${height} px)`, Math.abs((await trayHeight()) - height) < 0.5)
    await page.screenshot({ path: `${OUT}/${size.name}-tray-marker-mid.png` })
    await goTo(await centre(page.locator('[data-tray-pos="0"]')))
    check(`${size.name} tray marker: none over its own place`, (await marker()) === null)
    await goTo(place2)
    await page.mouse.up()
    await dropDone()
    check(`${size.name} tray marker: the drop puts it where the marker was (place 2)`, await store(`(s) => s.trayOrder[s.game.current].indexOf('${id}') === 2`))
    check(`${size.name} tray marker: gone after the drop`, (await marker()) === null)
    await putDown()

    // marker, leftwards: place 3 onto place 1 → it will slide in BEFORE that seed (gap 1)
    id = await store((s) => s.trayOrder[s.game.current][3])
    await pickUp(page.locator('[data-tray-pos="3"]'))
    await goTo(await centre(page.locator('[data-tray-pos="1"]')))
    m = await marker()
    check(`${size.name} tray marker: over place 1 (from 3) it shows at gap 1 — before that seed (gap ${m?.at})`, m?.at === 1)
    await page.mouse.up()
    await dropDone()
    check(`${size.name} tray marker: the drop puts it at place 1`, await store(`(s) => s.trayOrder[s.game.current].indexOf('${id}') === 1`))
    await putDown()

    // make room: place 0 onto place 2 → places 0–2 slide left, the rest of that row right
    await setTarget('reorder', 'room')
    await pickUp(page.locator('[data-tray-pos="0"]'))
    await goTo(place2)
    await page.waitForTimeout(tuning.roomTime * 1000 + 150)
    const room = await shifts()
    const sameRow = Math.abs(place3.y - place2.y) < 4
    check(`${size.name} tray room: the seeds slide apart at gap 3 (${room.map((n) => n.toFixed(1)).join(' ')})`,
      room[1] < 0 && room[2] < 0 && (sameRow ? room[3] > 0 : room[3] === 0))
    check(`${size.name} tray room: no marker`, (await marker()) === null)
    check(`${size.name} tray room: the tray keeps its height`, Math.abs((await trayHeight()) - height) < 0.5)
    await page.screenshot({ path: `${OUT}/${size.name}-tray-room-mid.png` })
    await page.mouse.up()
    await dropDone()
    check(`${size.name} tray room: back together after the drop`, (await shifts()).every((n) => n === 0))
    await putDown()

    // none: neither
    await setTarget('reorder', 'none')
    await pickUp(page.locator('[data-tray-pos="0"]'))
    await goTo(place2)
    check(`${size.name} tray none: no marker, nothing slides`, (await marker()) === null && (await shifts()).every((n) => n === 0))
    await page.mouse.up()
    await dropDone()
    await putDown()

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

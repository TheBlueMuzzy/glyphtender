// DEV KIT SELECT TAB (Dev Kit 0.14.0, F86) — Muzzy: "click on a thing > see the attributes associated with it compiled
// in one place > update those things and hit save."
// At phone 390×844 and desktop 1440×900, over a real game (played on until a glyphling is in danger):
//   ` → the Select tab is first and open → Select mode on (phone: the panel shrinks to a bar) → hover a glyphling
//   (desktop: thin pink outline named "Glyphling") → click / tap it: the game does NOT react (no move options), it's
//   picked (desktop: thick outline + its twins dashed; phone: the panel comes back) → the panel lists its knobs in
//   its own sections (Look · Drag · Move…) + its Text + Sounds → a slider changed there is the SAME value in the
//   Tuning tab → Recently on screen says what's showing and what hasn't been seen → (desktop) + Add a knob saves
//   content/devkit/select.json, ✕ takes it off again, and the file ends exactly as it started → the game plays on to
//   the end with the panel open: the end reveal lands in "Recently on screen". No console errors, nothing sideways.
// Menus first (Dev Kit 0.15.0, F88): on the main menu, pick a Button → its shared UI style rows (Color) + 2 sounds,
//   corners → 0rem squares every game button live, Undo puts it back; open Settings → the main menu behind it can't be
//   picked → pick a Tab, and a Toggle switch where one isn't behind the panel (phone).
// WRITES content/devkit/select.json (puts it back) — so check-all runs it ALONE.
// Starts its OWN dev server (default port 5448 — never Muzzy's) and closes only that one.
//   npm run e2e:devkit-select [outDir] [port]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/devkit-select'
const PORT = Number(process.argv[3] ?? 5448)
const SELECT_FILE = 'content/devkit/select.json'
const SIZES = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
]
mkdirSync(OUT, { recursive: true })
const original = readFileSync(SELECT_FILE, 'utf8')

/** Dev Kit parts that scroll sideways (there should be none). Runs in the page. */
function sideways() {
  const out = []
  for (const el of document.querySelectorAll('aside.devkit *')) {
    const x = getComputedStyle(el).overflowX
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push(el.className)
  }
  return out
}

/** The panel's picked view right now. Runs in the page. */
function pickedView() {
  const shown = (el) => el.offsetParent !== null
  const bodies = [...document.querySelectorAll('aside.devkit .devkit-body')].filter((b) => !b.hidden)
  return {
    name: document.querySelector('.sel-picked-name')?.textContent ?? null,
    panels: bodies.filter(shown).map((b) => b.getAttribute('aria-label')),
    sections: [...document.querySelectorAll('.devkit-body.is-picked-view .dk-section-title, .devkit-body.is-picked-view .sb-section-head button')].filter(shown).map((t) => t.textContent.trim()),
    knobs: document.querySelectorAll('.devkit-body.is-picked-view .sel-knob').length,
    sounds: document.querySelectorAll('.devkit-body.is-picked-view .sb-sound').length,
    boxes: [...document.querySelectorAll('.devkit-select-box')].map((b) => `${b.className.replace('devkit-select-box ', '')}:${b.dataset.label}`),
    recent: Object.fromEntries([...document.querySelectorAll('.sel-recent .sel-item')].map((b) => [b.querySelector('.sel-item-name').textContent, b.querySelector('.sel-item-when').textContent])),
  }
}

/** Where to point at one glyphling on the board that the Dev Kit panel doesn't cover: its centre. Runs in the page. */
function glyphlingSpot() {
  const panel = document.querySelector('aside.devkit').getBoundingClientRect()
  const free = (x, y) => panel.height < 200 ? y < panel.top : x < panel.left
  // not one in danger: its warning ring is a smaller box round the same spot, so a click there picks the ring
  const rings = [...document.querySelectorAll('[data-knobs="tangle"]')].map((el) => el.getBoundingClientRect())
  const inRing = (x, y) => rings.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
  for (const g of document.querySelectorAll('.game-garden [data-knobs="glyphling"]')) {
    const r = g.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (r.width > 4 && free(x, y) && !inRing(x, y)) return { x, y }
  }
  return null
}

/** Open the Dev Kit with ` (the menu shows a moment before the Dev Kit listens for the key — press until it opens). */
async function openDevKit(page) {
  for (let i = 0; i < 20 && !(await page.locator('aside.devkit:not([hidden])').count()); i++) {
    await page.keyboard.press('Backquote')
    await page.waitForTimeout(250)
  }
}

/** Open a Dev Kit tab (on a phone the tabs row is a carousel: ▶ to its page first, like a person would). */
async function pickTab(page, name) {
  const inView = () => page.evaluate((name) => {
    // pressable = it's what's under its own centre (a tab half past the page's edge is masked off, not just "off")
    const tab = [...document.querySelectorAll('.devkit-tab')].find((t) => t.textContent === name)
    const box = tab?.getBoundingClientRect()
    return !box || tab.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  }, name)
  for (let i = 0; i < 6 && !(await inView()); i++) {
    await page.getByRole('button', { name: 'Next tools' }).click()
    await page.waitForTimeout(250)
  }
  await page.getByRole('tab', { name }).click()
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const check = (what, ok) => (ok ? console.log(`  ok   ${what}`) : fail(what))

try {
  for (const size of SIZES) {
    console.log(`--- ${size.name} ${size.width}×${size.height}`)
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    const shot = (name) => page.screenshot({ path: `${OUT}/${size.name}-${name}.png` })

    let view
    // MENUS (Dev Kit 0.15.0, F88): the main menu's buttons and Settings' switches are pickable; their knobs are the
    // UI kit's shared style values (the Color tab's rows), live; a screen behind a menu (inert) is never picked
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
    const settingsBtn = page.getByRole('button', { name: 'Settings', exact: true })
    const playBox = await page.getByRole('button', { name: 'Play', exact: true }).boundingBox()
    await openDevKit(page)
    await page.getByRole('button', { name: /Select mode: off/ }).click()
    const sb = await settingsBtn.boundingBox()
    if (size.mobile) await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2)
    else await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.waitForTimeout(400)
    check('menu: the game ignored the click (still on the main menu)', await page.getByRole('button', { name: 'Play', exact: true }).isVisible())
    view = await page.evaluate(pickedView)
    check(`menu: picked ${view.name}`, view.name === 'Button')
    const styleRows = await page.locator('.devkit-body.is-picked-view .ct-row').count()
    check(`menu: its shared UI style rows (${styleRows}) + its sounds (${view.sounds}) from Color / Sound (${view.panels.join(', ')})`,
      styleRows >= 15 && view.sounds === 2 && view.panels.includes('Color') && view.sections.includes('UI style'))
    if (!size.mobile) {
      const twins = view.boxes.filter((b) => b.startsWith('is-twin')).length
      check(`menu: thick outline on it + ${twins} other buttons dashed (they share it)`, view.boxes.includes('is-picked:Button') && twins >= 2)
    }
    await page.locator('.devkit-body.is-picked-view .ct-row').first().scrollIntoViewIfNeeded()
    await shot('0a-menu-button-picked')
    // A style value changed under the pick restyles every button live; Undo puts it back
    const corners = page.getByRole('textbox', { name: 'Button & input corners (radius-control) — value' })
    const cornersWas = await corners.inputValue()
    await corners.fill('0rem')
    await corners.press('Enter')
    await page.waitForTimeout(200)
    const radius = () => page.evaluate(() => getComputedStyle([...document.querySelectorAll('.kit-button')].find((b) => !b.closest('.devkit'))).borderTopLeftRadius)
    check(`menu: corners 0rem → the game's buttons are square (${await radius()})`, (await radius()) === '0px')
    await page.locator('.devkit-body.is-picked-view').filter({ has: corners }).getByRole('button', { name: 'Undo unsaved' }).click()
    await page.waitForTimeout(200)
    check(`menu: Undo put the corners back (${await corners.inputValue()})`, (await corners.inputValue()) === cornersWas && (await radius()) !== '0px')
    // Settings → a switch
    if (await page.getByRole('button', { name: /Select mode: on/ }).isVisible()) await page.getByRole('button', { name: /Select mode: on/ }).click()
    await page.keyboard.press('Backquote') // close it (on a phone it covers the menu), open Settings, open it again
    await page.waitForTimeout(200)
    await settingsBtn.click()
    await page.waitForTimeout(600)
    await openDevKit(page)
    await page.getByRole('button', { name: /Select mode: off/ }).click()
    if (!size.mobile) {
      // where Play was is now the Settings card: the hidden main menu's buttons can't be picked through it
      await page.mouse.move(playBox.x + playBox.width / 2, playBox.y + playBox.height / 2)
      await page.waitForTimeout(150)
      view = await page.evaluate(pickedView)
      check(`menu: the main menu behind Settings isn't picked (hover: ${view.boxes.filter((b) => b.startsWith('is-hover')).join() || 'nothing'})`,
        !view.boxes.some((b) => b === 'is-hover:Button') || (await page.locator('.devkit-select-box.is-hover').boundingBox()).width < playBox.width - 20)
    }
    // Pick a thing at its centre (phone: a tap; on a phone the pick ends select mode, so turn it back on after)
    const pickAt = async (box) => {
      if (!(await page.locator('aside.devkit.is-selecting').count())) await page.getByRole('button', { name: /Select mode: off/ }).click() // (phone: the bar hides the button)
      if (size.mobile) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(400)
      return page.evaluate(pickedView)
    }
    view = await pickAt(await page.getByRole('tab', { name: 'Gameplay' }).boundingBox())
    check(`menu: picked ${view.name} with ${view.sounds} sound`, view.name === 'Tab' && view.sounds === 1)
    // A switch — where one isn't under the Dev Kit panel (at 1440 px the Settings switches are behind it)
    const panelLeft = (await page.locator('aside.devkit').boundingBox()).x
    const tg = await page.locator('.kit-toggle').first().boundingBox()
    if (size.mobile || tg.x + tg.width < panelLeft) {
      view = await pickAt(tg)
      check(`menu: picked ${view.name} with ${view.sounds} sounds`, view.name === 'Toggle switch' && view.sounds === 2)
    }
    await page.locator('.devkit-body.is-picked-view .ct-row').first().scrollIntoViewIfNeeded()
    await shot('0b-menu-toggle-picked')
    if (await page.getByRole('button', { name: /Select mode: on/ }).isVisible()) await page.getByRole('button', { name: /Select mode: on/ }).click()
    await page.getByRole('button', { name: 'Clear the pick' }).click() // the game test below starts with nothing picked
    await page.keyboard.press('Backquote') // close the Dev Kit; the game test below opens it fresh
    await page.waitForTimeout(200)

    // A real game, played on until a glyphling is in danger (pieces, seeds and a warning ring on the board)
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 20000 })
    // (the start is random: a seed can tangle the garden before anyone's in danger — then the helper changes nothing,
    // and its note says try another seed)
    const inDanger = await page.evaluate(() => [3, 1, 2, 4, 5, 6, 7, 8].some((seed) => window.__glyphtender.playUntilDanger(seed)))
    if (!inDanger) throw new Error('no seed reached a glyphling in danger')
    await page.waitForTimeout(1500)

    // ` → the Select tab is first and open
    await page.keyboard.press('Backquote')
    await page.waitForTimeout(300)
    const tabs = await page.locator('.devkit-tab').allTextContents()
    check(`Select is the first tab (${tabs.slice(0, 3).join(', ')}…)`, tabs[0] === 'Select')
    check('the Select tab is open', (await page.getByRole('tab', { name: 'Select' }).getAttribute('aria-selected')) === 'true')
    await page.waitForTimeout(500) // the on-screen look runs every 300 ms
    view = await page.evaluate(pickedView)
    check(`Recently on screen: Glyphling ${view.recent.Glyphling}, Award ribbon ${view.recent['Award ribbon']}`, view.recent.Glyphling === 'on screen' && view.recent['Award ribbon'] === 'not seen yet')
    await shot('1-select-tab')

    // Select mode on
    await page.getByRole('button', { name: /Select mode: off/ }).click()
    if (size.mobile) {
      const bar = await page.locator('aside.devkit').boundingBox()
      check(`phone: the panel shrinks to a bar while selecting (${Math.round(bar.height)} px tall)`, bar.height < 120)
    }
    // (under a busy machine the pieces may still be gliding into place: wait for one to settle outside the panel)
    const spot = await page.waitForFunction(glyphlingSpot, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null)
    if (!spot) throw new Error('no glyphling outside the panel to point at')
    const options = () => page.locator('[data-option]').count()
    const optionsBefore = await options()
    const selectedBefore = await page.evaluate(() => JSON.stringify(window.__glyphtender.store.getState().selected))

    if (!size.mobile) {
      await page.mouse.move(spot.x, spot.y)
      await page.waitForTimeout(150)
      view = await page.evaluate(pickedView)
      check(`hover: thin outline named Glyphling (${view.boxes.join(' ')})`, view.boxes.includes('is-hover:Glyphling'))
      await shot('2-hover')
      await page.mouse.click(spot.x, spot.y)
    } else {
      await shot('2-selecting-bar')
      await page.touchscreen.tap(spot.x, spot.y)
    }
    await page.waitForTimeout(400)
    check('the game ignored the click (no move options, nothing selected)',
      (await options()) === optionsBefore && (await page.evaluate(() => JSON.stringify(window.__glyphtender.store.getState().selected))) === selectedBefore)

    view = await page.evaluate(pickedView)
    check(`picked: ${view.name}`, view.name === 'Glyphling')
    if (!size.mobile) {
      const twins = view.boxes.filter((b) => b.startsWith('is-twin')).length
      check(`thick outline on it + ${twins} twins dashed`, view.boxes.includes('is-picked:Glyphling') && twins >= 1)
      await shot('3-picked-outlines')
    } else {
      check('phone: a pick brings the whole panel back', (await page.locator('aside.devkit').boundingBox()).height > 400)
    }
    check(`its knobs in its own sections: ${view.sections.join(' · ')}`, ['Look', 'Drag', 'Move', 'Text', 'Sounds'].every((t) => view.sections.some((s) => s.includes(t))))
    check(`${view.knobs} knob rows + ${view.sounds} sounds, from Tuning / Text / Sound (${view.panels.join(', ')})`, view.knobs >= 20 && view.sounds === 4 && view.panels.join() === 'Select,Tuning,Text,Sound')
    await page.locator('.devkit-body.is-picked-view').first().scrollIntoViewIfNeeded()
    await shot('4-picked-knobs')

    // A knob changed here is the same value in the Tuning tab (one source of truth)
    const sizeBox = page.locator('.devkit-body.is-picked-view .sel-knob').first().locator('input[type="number"]')
    const was = await sizeBox.inputValue()
    await sizeBox.fill('0.8')
    await sizeBox.press('Enter')
    await page.waitForTimeout(200)
    await pickTab(page, 'Tuning')
    await page.getByRole('searchbox', { name: 'Search Tuning', exact: true }).fill('pieceScale')
    await page.waitForTimeout(200)
    const inTuning = await page.locator('.devkit-body:not([hidden]) .tt-row input[type="number"]').first().inputValue()
    check(`Piece size: changed under Select to 0.8 → the Tuning tab shows ${inTuning}`, Number(inTuning) === 0.8)
    await page.getByRole('button', { name: 'Undo unsaved' }).first().click()
    await pickTab(page, 'Select')
    check(`Undo put it back (${was})`, (await sizeBox.inputValue()) === was)

    if (!size.mobile) {
      // + Add a knob → saved; ✕ → saved; the file ends exactly as it started
      await page.getByRole('button', { name: '+ Add a knob' }).click()
      await page.getByRole('searchbox', { name: 'Search for a knob to add' }).fill('hex line width')
      await page.getByLabel('Settings go in').selectOption({ label: 'New section…' })
      await page.getByRole('textbox', { name: 'New section name' }).fill('E2E test')
      await page.locator('.sel-add .sel-item').first().click()
      await page.waitForTimeout(500)
      const added = JSON.parse(readFileSync(SELECT_FILE, 'utf8')).objects.glyphling.knobs['E2E test']
      check(`+ Add a knob saved it to select.json (${JSON.stringify(added)})`, JSON.stringify(added) === '["garden.hexLineWidth"]')
      view = await page.evaluate(pickedView)
      check('the new section shows in the pick', view.sections.includes('E2E test'))
      await shot('5-added-knob')
      await page.getByRole('button', { name: 'Take garden.hexLineWidth off Glyphling' }).click()
      await page.waitForTimeout(500)
      check('✕ took it off and the file is exactly as it started', readFileSync(SELECT_FILE, 'utf8') === original)
    }

    // The game plays on to the end with the panel open: the reveal is seen
    await page.getByRole('button', { name: /Select mode: on/ }).click().catch(() => {})
    await page.evaluate(() => window.__glyphtender.playRest(4))
    await page.waitForFunction(() => [...document.querySelectorAll('.sel-recent .sel-item')].some((b) => b.textContent.startsWith('End reveal') && !b.textContent.includes('not seen')), null, { timeout: 30000 })
      .then(() => check('the end reveal lands in Recently on screen', true), () => fail('the end reveal never showed in Recently on screen'))
    await page.locator('.sel-recent .sel-item', { hasText: 'End reveal' }).click()
    view = await page.evaluate(pickedView)
    check(`picked from the list: ${view.name} (${view.sections.join(' · ')})`, view.name === 'End reveal' && view.sections.includes('Timing'))
    await shot('6-reveal-from-list')

    ;(await page.evaluate(sideways)).forEach((p) => fail(`scrolls sideways: ${p}`))
    errors.filter((e) => !/favicon/.test(e)).forEach((e) => fail(`console: ${e}`))
    await context.close()
  }
} catch (e) {
  fail(e.message)
} finally {
  if (readFileSync(SELECT_FILE, 'utf8') !== original) writeFileSync(SELECT_FILE, original)
  await browser.close()
  await server.close()
}
console.log(failures ? `FAIL — ${failures} problem(s). Screenshots: ${OUT}` : `PASS — screenshots: ${OUT}`)
process.exit(failures ? 1 : 0)

// DEV KIT AI TAB (F41, framework Dev Kit 0.6.0) — Muzzy: "I want to be able to tweak these in the Dev Kit. select a
// personality, tweak the values etc." and "test the expectation of a personality against lots of games".
// Over a real game, at phone 390×844, phone landscape 844×390 and desktop 1440×900:
//   ` → AI tab → pick Strategist → open "AI: traits" → move the aggression low handle (keyboard, like a drag) → Save →
//   reload → the saved value is still there (first size only; content/ai/personalities.json is put back afterwards,
//   whatever happens) → ▶ Watch: an all-AI game starts on the board, decision notes and belief bars appear → ■ Stop.
//   Desktop also: Run check (6 games, in a Web Worker) → the report link opens a page with the Personality Check,
//   and the search box finds AI settings ("nerve").
// F41 follow-ups (first size): focus 0.8 → 0.55 and goals.json's TRAP big-moment bar 55 → 60 → Save → each file
//   differs from the hand-written one in exactly that ONE line (Save keeps the layout) → reload → both kept.
//   Copy to new "Brute" → Save → en.json gains ai.personality.Brute { name: "the Brute", bio: the Strategist's bio }.
//   Every AI file (personalities, goals, pace, en.json) is put back afterwards, whatever happens.
// Every size: nothing in the AI tab sticks out of the panel, nothing scrolls sideways, no console errors.
// Starts its OWN dev server (default port 5415 — never Muzzy's) and closes only that one.
//   npm run e2e:devkit-ai [outDir] [port]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/devkit-ai'
const PORT = Number(process.argv[3] ?? 5415)
const SIZES = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'landscape', width: 844, height: 390, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
]
const FILE = 'content/ai/personalities.json'
const GOALS = 'content/ai/goals.json'
const TEXT = 'content/text/en.json'
const SAVED_FILES = [FILE, GOALS, 'content/ai/pace.json', TEXT] // every file this test may save
mkdirSync(OUT, { recursive: true })
const original = readFileSync(FILE, 'utf8') // put back at the end, whatever happens (Claude tunes this file)
const originals = Object.fromEntries(SAVED_FILES.map((f) => [f, readFileSync(f, 'utf8')]))
const putBack = () => SAVED_FILES.forEach((f) => writeFileSync(f, originals[f]))

/** The lines that differ between two versions of a file (same line count), or null when lines were added / removed. */
function changedLines(before, after) {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  if (a.length !== b.length) return null
  return b.filter((line, n) => line !== a[n])
}

/** Parts of the AI tab sticking out past the panel's sides, and sideways scrolling. Runs in the page. */
function clipped() {
  const panel = document.querySelector('aside.devkit')
  const box = panel.getBoundingClientRect()
  const out = []
  for (const el of panel.querySelectorAll('.devkit-body:not([hidden]) .ai *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || el.closest('.dk-carousel-view')) continue // the chips' carousel clips on purpose
    if (r.right > box.right + 1 || r.left < box.left - 1) out.push(`${el.tagName.toLowerCase()}.${el.className} (${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(box.left)}–${Math.round(box.right)})`)
  }
  for (const el of panel.querySelectorAll('*')) {
    const x = getComputedStyle(el).overflowX
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push(`scrolls sideways: ${el.className}`)
  }
  return out.slice(0, 6)
}

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()
let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }

try {
  for (const [i, size] of SIZES.entries()) {
    console.log(`--- ${size.name} ${size.width}×${size.height}`)
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile })
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    const shot = (name) => page.screenshot({ path: `${OUT}/${size.name}-${name}.png` })
    try { // (on a crash: a screenshot of the moment, then stop)
    const panel = page.locator('aside.devkit')
    const section = (title) => panel.locator(`[data-dk-section="ai:${title}"]`)
    const openSection = async (title) => {
      const s = section(title)
      if ((await s.getAttribute('data-open')) === null) await s.locator('.dk-section-btn').click()
    }

    // ` → the AI tab (on a phone it's on a later page of the tab carousel: ▶ until it shows)
    const openAiTab = async () => {
      await panel.waitFor({ state: 'attached' }) // the Dev Kit loads a moment after the page
      await page.keyboard.press('Backquote')
      const tab = page.getByRole('tab', { name: 'AI', exact: true })
      // (The game's own tabs come last: on a narrow panel that's the last carousel page.)
      const lastPage = panel.locator('.devkit-tabs .dk-carousel-dot').last()
      if (await lastPage.count()) await lastPage.click()
      await tab.click()
      await page.getByLabel('Personality', { exact: true }).selectOption('Strategist')
    }

    // A real game underneath
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.waitForFunction(() => window.__glyphtender?.store.getState().game !== null)
    await openAiTab()
    await openSection('AI: traits')
    await shot('1-traits')

    // Move a range handle (keyboard = the same input a drag changes)
    const low = page.getByLabel('aggression low end slider')
    const before = Number(await low.inputValue())
    await low.focus()
    for (let n = 0; n < 5; n++) await page.keyboard.press('ArrowLeft')
    const moved = Number(await page.getByLabel('aggression low end', { exact: true }).inputValue())
    if (moved !== before - 5) fail(`the aggression low end went ${before} → ${moved} (expected ${before - 5})`)
    if (!(await section('AI: traits').locator('.dk-dot').isVisible())) fail('no "changed, not saved" dot on the traits section')
    console.log(`  ok   aggression low end ${before} → ${moved}`)

    if (i === 0) {
      // Save → reload → still there
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor({ timeout: 5000 })
      const onDisk = JSON.parse(readFileSync(FILE, 'utf8'))
      if (onDisk.personalities.find((p) => p.id === 'Strategist').traits.aggression.min !== moved) fail('the file on disk does not hold the new value')
      if (!onDisk._help || !onDisk._labels || !onDisk._sections) fail('Save lost the file\'s _help / _labels / _sections')
      await page.reload()
      await page.waitForFunction(() => window.__glyphtender !== undefined)
      await openAiTab()
      await openSection('AI: traits')
      const after = Number(await page.getByLabel('aggression low end', { exact: true }).inputValue())
      if (after !== moved) fail(`after a reload the value is ${after}, not the saved ${moved}`)
      else console.log(`  ok   saved, reloaded, still ${after}`)
      writeFileSync(FILE, original) // put the file back now (the finally does it too)
      await page.waitForTimeout(500)

      // F41 follow-ups: focus + a goal's big-moment bar → Save → one line changed in each file → reload → kept
      await page.reload()
      await page.waitForFunction(() => window.__glyphtender !== undefined)
      await openAiTab()
      await openSection('AI: who it is')
      await openSection('AI: big moments')
      await page.getByLabel('focus', { exact: true }).fill('0.55')
      await page.getByLabel('bigAt.TRAP', { exact: true }).fill('60')
      await shot('1b-focus-bigAt')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor({ timeout: 5000 })
      const people = changedLines(originals[FILE], readFileSync(FILE, 'utf8'))
      const goals = changedLines(originals[GOALS], readFileSync(GOALS, 'utf8'))
      if (people?.length !== 1 || !people[0].includes('"focus": 0.55')) fail(`personalities.json: expected only the focus line to change, got ${JSON.stringify(people)}`)
      else console.log(`  ok   personalities.json: one line changed —${people[0]}`)
      if (goals?.length !== 1 || !goals[0].includes('"TRAP": 60')) fail(`goals.json: expected only the bigAt line to change, got ${JSON.stringify(goals)}`)
      else console.log(`  ok   goals.json: one line changed —${goals[0]}`)
      await page.reload()
      await page.waitForFunction(() => window.__glyphtender !== undefined)
      await openAiTab()
      await openSection('AI: who it is')
      await openSection('AI: big moments')
      const focusNow = await page.getByLabel('focus', { exact: true }).inputValue()
      const bigNow = await page.getByLabel('bigAt.TRAP', { exact: true }).inputValue()
      if (focusNow !== '0.55' || bigNow !== '60') fail(`after a reload focus = ${focusNow}, bigAt.TRAP = ${bigNow} (expected 0.55, 60)`)
      else console.log('  ok   saved, reloaded: focus 0.55 and TRAP big moment 60 kept')

      // Copy to new → its name and bio in en.json
      await page.getByRole('button', { name: 'Copy to new…' }).click()
      await page.getByLabel("New personality's name").fill('Brute')
      await page.getByRole('button', { name: 'Copy', exact: true }).click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor({ timeout: 5000 })
      const texts = JSON.parse(readFileSync(TEXT, 'utf8')).ai.personality
      if (texts.Brute?.name !== 'the Brute' || texts.Brute?.bio !== texts.Strategist.bio) fail(`en.json Brute = ${JSON.stringify(texts.Brute)}`)
      else console.log(`  ok   Copy to new: en.json has Brute = ${JSON.stringify(texts.Brute)}`)
      putBack()
      await page.waitForTimeout(800)
      await page.reload()
      await page.waitForFunction(() => window.__glyphtender !== undefined)
      await openAiTab()
    }

    // The rest of the editor: goals, shifts, skill, bio — screenshot them open
    for (const title of ['AI: who it is', 'AI: mood shifts', 'AI: banter, nerve & words', 'AI: bio', 'AI: big moments', 'AI: pace', 'AI: skill']) await openSection(title)
    await section('AI: who it is').scrollIntoViewIfNeeded()
    await shot('2-editor')
    await panel.locator('.ai-steady').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await shot('2b-steady')
    await section('AI: big moments').scrollIntoViewIfNeeded()
    await shot('2c-big-moments')
    await section('AI: pace').scrollIntoViewIfNeeded()
    await shot('2d-pace')
    await section('AI: mood shifts').scrollIntoViewIfNeeded()
    await shot('3-shifts')
    ;(await page.evaluate(clipped)).forEach((p) => fail(`sticks out: ${p}`))

    // ▶ Watch: an all-AI game on the board, notes + belief bars
    await openSection('AI: watch a game')
    await page.getByRole('button', { name: '▶ Watch' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.ai-note').length >= 3, null, { timeout: 60000 }).catch(() => fail('fewer than 3 notes within 60 s of ▶ Watch'))
    const notes = await panel.locator('.ai-note').count()
    const bars = await panel.locator('.ai-belief').count()
    const bots = await page.evaluate(() => window.__glyphtender.store.getState().seats.filter((s) => s.kind === 'bot').length)
    if (!bars) fail('no belief bars while watching')
    if (bots < 2) fail(`the watched game has ${bots} AI seats (expected every seat)`)
    console.log(`  ok   watching: ${notes} notes, ${bars} belief rows, ${bots} AI seats`)
    await section('AI: watch a game').scrollIntoViewIfNeeded()
    await shot('4-watch')
    ;(await page.evaluate(clipped)).forEach((p) => fail(`sticks out while watching: ${p}`))
    await page.getByRole('button', { name: '■ Stop' }).click()

    if (size.name === 'desktop') {
      // Run check: 6 games in a worker → a report link
      await openSection('AI: Personality Check')
      await page.getByRole('button', { name: 'Run check' }).click()
      const link = page.getByRole('link', { name: 'open the report' })
      await link.waitFor({ timeout: 240000 }).catch(() => fail('no report link within 4 minutes of Run check'))
      if (await link.isVisible()) {
        const html = await page.evaluate(async (href) => (await fetch(href)).text(), await link.getAttribute('href'))
        if (!html.includes('Personality Check')) fail('the report page has no "Personality Check"')
        else console.log(`  ok   Run check → report (${Math.round(html.length / 1024)} KB)`)
      }
      await section('AI: Personality Check').scrollIntoViewIfNeeded()
      await shot('5-check')

      // The search box finds AI settings
      await page.getByRole('searchbox', { name: 'Search settings' }).fill('nerve')
      await page.waitForTimeout(150)
      if (!(await panel.getByRole('heading', { name: /^AI · \d+$/ }).isVisible())) fail('searching "nerve" does not list the AI tab')
      await shot('6-search-nerve')
    }

    if (errors.length) fail(`console errors: ${errors.slice(0, 5).join(' | ')}`)
    await context.close()
    } catch (e) {
      await shot('error').catch(() => {})
      throw e
    }
  }
} finally {
  putBack()
  await browser.close()
  await server.close()
}
console.log(failures ? `FAIL — ${failures} problem(s)` : `PASS — Dev Kit AI tab at phone, landscape and desktop; screenshots in ${OUT}/`)
process.exit(failures ? 1 : 0)

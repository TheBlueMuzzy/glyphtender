// DEV KIT WORDS TAB (F70) — Muzzy 2026-10-11: "open devkit, check words tab, check them off if they are good, hit save.
// can we have a 3-stage checkbox? Yes, No, Open… Open words are always at the top. after a save, it reorders
// (Alphabetical Open | Alphabetical Yes | Alphabetical No)".
// Against a stand-in word server (this script's own, port 1986 — never the live one): ` → Words → the rows come from
// content/words/submitted.csv plus the server's new player word (open, at the top A–Z) → click a box: open → yes → no
// + four clicks → vulgar (rows don't jump while clicking) → search "rooster" finds COCK + COCKS by their notes → Save → words.csv gains the yes
// word (with a Zipf score) and loses the no word, submitted.csv is re-sorted open | yes | no, the stand-in server got the
// marks with the admin key, and the list re-sorts. Both word files are put back afterwards, whatever happens.
// Starts its OWN dev server (default port 5432 — never Muzzy's) and closes only that one.
//   npm run e2e:words-tab [outDir] [port]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? 'e2e-shots/words-tab'
const PORT = Number(process.argv[3] ?? 5432)
const WORD_SERVER_PORT = 1986
const KEY = 'e2e-words-key'
const FILES = ['content/words/submitted.csv', 'public/words/words.csv']
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const ok = (what) => console.log(`  ok   ${what}`)

// The stand-in online server: one new player word, and it records the marks it's sent.
const received = []
const wordServer = createHttpServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${KEY}`) { res.statusCode = 403; return res.end('{}') }
  if (req.url === '/words/list') return res.end(JSON.stringify({ words: [{ word: 'AAAGLIMMER', status: 'open', category: 'player', added: '2026-10-12' }] })) // the real server's shape (party/wordsRoutes.ts)
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => { received.push(JSON.parse(body)); res.end('{"ok":true}') })
})
await new Promise((done) => wordServer.listen(WORD_SERVER_PORT, '127.0.0.1', done))

const backup = FILES.map((f) => readFileSync(f))
process.env.WORDS_ADMIN_KEY = KEY
process.env.WORDS_SERVER = `http://127.0.0.1:${WORD_SERVER_PORT}`
const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()

/** Open a Dev Kit tab (on a phone the tabs row is a carousel: ▶ to its page first). */
async function pickTab(page, name) {
  const inView = () => page.evaluate((name) => {
    const view = document.querySelector('.devkit-tabs .dk-carousel-view')?.getBoundingClientRect()
    const tab = [...document.querySelectorAll('.devkit-tab')].find((t) => t.textContent === name)?.getBoundingClientRect()
    return !view || !tab || (tab.left >= view.left - 1 && tab.right <= view.right + 1)
  }, name)
  for (let i = 0; i < 8 && !(await inView()); i++) {
    await page.getByRole('button', { name: 'Next tools' }).click()
    await page.waitForTimeout(250)
  }
  await page.locator('.devkit-tab', { hasText: new RegExp(`^${name}$`) }).click()
}

const rowWords = (page) => page.locator('.devkit-body:not([hidden]) .rv-row .rv-label').allTextContents()
const box = (page, word) => page.locator('.devkit-body:not([hidden]) .rv-row').filter({ has: page.locator('.rv-label', { hasText: new RegExp(`^${word}$`) }) })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`http://127.0.0.1:${PORT}/`)
  await page.waitForTimeout(1500)
  await page.keyboard.press('Backquote')
  await pickTab(page, 'Words')
  await page.locator('.devkit-body:not([hidden]) .rv-row').first().waitFor({ timeout: 15000 })

  const words = await rowWords(page)
  if (words[0] !== 'AAAGLIMMER') fail(`the new player word isn't first among the open words (first: ${words[0]})`)
  else ok(`the server's new player word is in, open, at the top (${words.length} rows)`)
  // Each row's state, from its box's label ("COCK: Open (click for Yes)")
  const states = (await page.locator('.devkit-body:not([hidden]) .rv-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label'))))
    .map((l) => l.match(/^(\w+): (\w+)/).slice(1, 3))
  const groups = ['Open', 'Yes', 'No', 'British', 'Vulgar'].map((s) => states.filter(([, st]) => st === s).map(([w]) => w))
  const inOrder = states.map(([w]) => w).join() === groups.flat().join()
  const azEach = groups.every((g) => [...g].sort().join() === g.join())
  if (!inOrder || !azEach) fail(`order: open | yes | no | british | vulgar ${inOrder}, A–Z in each ${azEach}`)
  else ok(`order: ${groups[0].length} open A–Z, then ${groups[1].length} yes, ${groups[2].length} no, ${groups[3].length} british, ${groups[4].length} vulgar`)

  // HELLER: open → yes. ENDER: open → yes → no. PALMER: four clicks → vulgar (the box cycles Open → Yes → No → B → V, Muzzy 2026-10-12).
  // Rows mustn't move while clicking.
  const before = await rowWords(page)
  await box(page, 'HELLER').click()
  await box(page, 'ENDER').click()
  await box(page, 'ENDER').click()
  for (let i = 0; i < 4; i++) await box(page, 'PALMER').click()
  if ((await box(page, 'PALMER').locator('.rv-box').textContent()) !== 'V') fail('the box of PALMER does not show V')
  if ((await page.locator('.devkit-body:not([hidden]) .rv-list button:not(.rv-row)').count()) > 0) fail('extra buttons in the rows')
  const label = (w) => box(page, w).getAttribute('aria-label')
  if (!/^HELLER: Yes/.test(await label('HELLER')) || !/^ENDER: No/.test(await label('ENDER')) || !/^PALMER: Vulgar/.test(await label('PALMER'))) fail(`marks: HELLER "${await label('HELLER')}", ENDER "${await label('ENDER')}", PALMER "${await label('PALMER')}"`)
  else ok('one click = yes, two = no, four = vulgar (box shows V, no extra buttons)')
  if ((await rowWords(page)).join() !== before.join()) fail('rows moved while clicking')
  else ok('rows stay put until Save')
  await page.screenshot({ path: `${OUT}/words-marked.png` })

  // Search: by the note ("rooster" = COCK)
  await page.getByPlaceholder(/Search Words/).fill('rooster')
  await page.waitForTimeout(300)
  const found = await rowWords(page)
  const count = await page.locator('.devkit-body:not([hidden]) .dk-found').textContent().catch(() => '')
  if (found.join() !== 'COCK,COCKS' || !/2 words found/.test(count ?? '')) fail(`search "rooster": ${found.join()} · "${count}"`)
  else ok('search "rooster" → COCK + COCKS (by their notes), "2 words found"')
  await page.getByPlaceholder(/Search Words/).fill('')
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: /^Save/ }).click()
  await page.waitForFunction(() => /saved|Saved/.test(document.querySelector('.devkit-body:not([hidden]) .devkit-status')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {})
  const official = readFileSync('public/words/words.csv', 'utf8')
  const apt = official.match(/^HELLER,(\d+\.\d\d)$/m)
  if (!apt || Number(apt[1]) <= 0) fail(`words.csv has no HELLER with a Zipf score (${apt?.[0] ?? 'missing'})`)
  else ok(`words.csv: HELLER added (${apt[0]})`)
  if (/^(ENDER|PALMER),/m.test(official)) fail('words.csv has ENDER or PALMER')
  else ok('words.csv: no ENDER (no) or PALMER (vulgar)')
  const submitted = readFileSync('content/words/submitted.csv', 'utf8').split('\n')
  const status = (w) => submitted.find((l) => l.startsWith(`${w},`))?.split(',')[1]
  if (status('HELLER') !== 'yes' || status('ENDER') !== 'no' || status('PALMER') !== 'vulgar' || status('AAAGLIMMER') !== 'open') fail(`submitted.csv: HELLER ${status('HELLER')}, ENDER ${status('ENDER')}, PALMER ${status('PALMER')}, AAAGLIMMER ${status('AAAGLIMMER')}`)
  else ok('submitted.csv: HELLER yes, ENDER no, PALMER vulgar, the player word kept as open')
  const sent = received.at(-1)?.changes ?? []
  if (!sent.some((c) => c.word === 'HELLER' && c.status === 'yes') || !sent.some((c) => c.word === 'ENDER' && c.status === 'no') || !sent.some((c) => c.word === 'PALMER' && c.status === 'vulgar')) fail(`the server got ${JSON.stringify(sent)}`)
  else ok('the word server got the marks (with the admin key)')
  const after = await rowWords(page)
  if (after.indexOf('HELLER') < after.indexOf('AAAGLIMMER') || after.indexOf('ENDER') < after.indexOf('HELLER') || after.indexOf('PALMER') < after.indexOf('ENDER')) fail('the list did not re-sort after Save')
  else ok('re-sorted after Save: HELLER among yes, ENDER among no, PALMER among vulgar')
  await page.screenshot({ path: `${OUT}/words-saved.png` })

  // Only the game's own page may save (any other page could otherwise use the server key through the dev server)
  const outsider = await fetch(`http://127.0.0.1:${PORT}/__words/save`, { method: 'POST', headers: { origin: 'https://some-other-site.example', 'content-type': 'text/plain' }, body: '{"changes":[{"id":"APT","status":"no"}]}' })
  if (outsider.status !== 403) fail(`a save from another site got ${outsider.status}, not 403`)
  else ok('a save from another site is refused (403)')

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`)
} catch (error) {
  fail(String(error))
} finally {
  FILES.forEach((f, i) => writeFileSync(f, backup[i]))
  await browser.close()
  await server.close()
  wordServer.close()
}

console.log(failures ? `\n✗ words tab e2e: ${failures} failed` : '\n✓ words tab e2e passed')
process.exit(failures ? 1 : 0)

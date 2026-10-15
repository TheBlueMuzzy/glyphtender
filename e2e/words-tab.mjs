// DEV KIT WORDS TAB (F70, F71) — Muzzy 2026-10-12: "when I go to the word tab, i should really only see undecided ones,
// as it becomes a checklist for me. then after i hit save, it … updates the main word list (and its segregations)
// removing them from the check-against list if they were 'accepted' (Yes, B, V), and the No and Undecided ones remain".
// Against a stand-in word server (this script's own, port 1986 — never the live one). The script first makes five real
// words undecided on its copy (out of words.csv, open in submitted.csv): HELLER, PALMER, COLOUR, COCK, COCKS.
// ` → Words → ONLY open rows (the five + the server's new player word; the server's words already in words.csv never
// show) → click a box: HELLER once = yes, PALMER twice = no, COLOUR three times = B, COCK four times = V (rows don't jump)
// → search "rooster" finds COCK + COCKS by their notes → Save → words.csv: HELLER plain, COLOUR ,B, COCK ,V (each with a
// Zipf score), no PALMER · submitted.csv: HELLER / COLOUR / COCK gone, PALMER no, COCKS open · the stand-in server got
// the marks with the admin key · the tab reloads: only the open words are left. Both word files are put back afterwards.
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

// The stand-in online server: one new player word + two it remembers as accepted (already in words.csv — they must not
// come back as open), and it records the marks it's sent.
const received = []
const wordServer = createHttpServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${KEY}`) { res.statusCode = 403; return res.end('{}') }
  if (req.url === '/words/list') {
    return res.end(JSON.stringify({ words: [ // the real server's shape (party/wordsRoutes.ts)
      { word: 'AAAGLIMMER', status: 'open', category: 'player', added: '2026-10-12' },
      { word: 'DREAMT', status: 'yes', category: 'missing form', added: '2026-10-11' },
      { word: 'MATHS', status: 'british', category: 'british', added: '2026-10-11' },
    ] }))
  }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => { received.push(JSON.parse(body)); res.end('{"ok":true}') })
})
await new Promise((done) => wordServer.listen(WORD_SERVER_PORT, '127.0.0.1', done))

const backup = FILES.map((f) => readFileSync(f))
// This run's undecided words (on the copy only — the real files come back at the end)
const UNDECIDED = { HELLER: 'missing form,2026-10-11,', PALMER: 'name or word,2026-10-11,', COLOUR: 'british spelling,2026-10-12,', COCK: 'swear or word,2026-10-11,rooster', COCKS: 'swear or word,2026-10-11,roosters' }
const isUndecided = (line) => Object.keys(UNDECIDED).some((w) => line.startsWith(`${w},`))
writeFileSync(FILES[1], backup[1].toString('utf8').split('\n').filter((l) => !isUndecided(l)).join('\n'))
writeFileSync(FILES[0], backup[0].toString('utf8').split('\n').filter((l) => l && !isUndecided(l)).concat(Object.entries(UNDECIDED).map(([w, rest]) => `${w},open,${rest}`)).join('\n') + '\n')

process.env.WORDS_ADMIN_KEY = KEY
process.env.WORDS_SERVER = `http://127.0.0.1:${WORD_SERVER_PORT}`
const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch()

/** Open a Dev Kit tab (on a phone the tabs row is a carousel: ▶ to its page first). */
async function pickTab(page, name) {
  const inView = () => page.evaluate((name) => {
    // pressable = it's what's under its own centre (a tab half past the page's edge is masked off, not just "off")
    const tab = [...document.querySelectorAll('.devkit-tab')].find((t) => t.textContent === name)
    const box = tab?.getBoundingClientRect()
    return !box || tab.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
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
  const expected = ['AAAGLIMMER', 'COCK', 'COCKS', 'COLOUR', 'HELLER', 'PALMER']
  if (words.join() !== expected.join()) fail(`the tab should list only the open words A–Z (${expected.join()}), got ${words.join()}`)
  else ok(`only the undecided words, A–Z: ${words.join()} (no No rows; DREAMT / MATHS, already words, stay out)`)

  // HELLER once = yes · PALMER twice = no · COLOUR three times = B · COCK four times = V (the box cycles Open → Yes → No → B → V).
  // Rows mustn't move while clicking.
  const before = await rowWords(page)
  const clicks = { HELLER: 1, PALMER: 2, COLOUR: 3, COCK: 4 }
  for (const [word, n] of Object.entries(clicks)) for (let i = 0; i < n; i++) await box(page, word).click()
  if ((await box(page, 'COCK').locator('.rv-box').textContent()) !== 'V' || (await box(page, 'COLOUR').locator('.rv-box').textContent()) !== 'B') fail('the boxes of COCK / COLOUR do not show V / B')
  if ((await page.locator('.devkit-body:not([hidden]) .rv-list button:not(.rv-row)').count()) > 0) fail('extra buttons in the rows')
  const label = (w) => box(page, w).getAttribute('aria-label')
  if (!/^HELLER: Yes/.test(await label('HELLER')) || !/^PALMER: No/.test(await label('PALMER')) || !/^COLOUR: British/.test(await label('COLOUR')) || !/^COCK: Vulgar/.test(await label('COCK'))) fail(`marks: HELLER "${await label('HELLER')}", PALMER "${await label('PALMER')}", COLOUR "${await label('COLOUR')}", COCK "${await label('COCK')}"`)
  else ok('one click = yes, two = no, three = British (B), four = vulgar (V), no extra buttons')
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
  const line = (w) => official.match(new RegExp(`^${w},(\\d+\\.\\d\\d)(,[BV])?$`, 'm'))
  const heller = line('HELLER'); const colour = line('COLOUR'); const cock = line('COCK')
  if (!heller || heller[2] || Number(heller[1]) <= 0) fail(`words.csv: HELLER should be plain with a Zipf score (${heller?.[0] ?? 'missing'})`)
  else ok(`words.csv: HELLER added plain (${heller[0]})`)
  if (colour?.[2] !== ',B' || Number(colour[1]) <= 0 || cock?.[2] !== ',V' || Number(cock[1]) <= 0) fail(`words.csv: COLOUR ${colour?.[0] ?? 'missing'}, COCK ${cock?.[0] ?? 'missing'}`)
  else ok(`words.csv: ${colour[0]} (British), ${cock[0]} (vulgar)`)
  if (/^(PALMER|COCKS),/m.test(official)) fail('words.csv has PALMER (no) or COCKS (still open)')
  else ok('words.csv: no PALMER (no), no COCKS (still open)')
  const submitted = readFileSync('content/words/submitted.csv', 'utf8').split('\n')
  const status = (w) => submitted.find((l) => l.startsWith(`${w},`))?.split(',')[1]
  if (status('HELLER') || status('COLOUR') || status('COCK') || status('PALMER') !== 'no' || status('COCKS') !== 'open' || status('AAAGLIMMER') !== 'open') fail(`submitted.csv: HELLER ${status('HELLER')}, COLOUR ${status('COLOUR')}, COCK ${status('COCK')}, PALMER ${status('PALMER')}, COCKS ${status('COCKS')}, AAAGLIMMER ${status('AAAGLIMMER')}`)
  else ok('submitted.csv: HELLER / COLOUR / COCK gone (accepted), PALMER no, COCKS + the player word open')
  if (submitted.some((l) => /^[A-Z]+,(yes|british|vulgar),/.test(l))) fail('submitted.csv still has an accepted row')
  const sent = received.at(-1)?.changes ?? []
  const got = (w, s) => sent.some((c) => c.word === w && c.status === s)
  if (!got('HELLER', 'yes') || !got('PALMER', 'no') || !got('COLOUR', 'british') || !got('COCK', 'vulgar')) fail(`the server got ${JSON.stringify(sent)}`)
  else ok('the word server got the marks (with the admin key)')
  await page.waitForFunction(() => document.querySelectorAll('.devkit-body:not([hidden]) .rv-row').length === 2, null, { timeout: 10000 }).catch(() => {})
  const after = await rowWords(page)
  if (after.join() !== 'AAAGLIMMER,COCKS') fail(`after Save the tab should list only what's still open (AAAGLIMMER,COCKS), got ${after.join()}`)
  else ok('after Save the decided words left the tab: AAAGLIMMER, COCKS')
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

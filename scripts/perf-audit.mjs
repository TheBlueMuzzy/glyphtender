// PERFORMANCE AUDIT (F66) — measures the BUILT game (dist/, run `npm run build` first) the way a player meets it.
//   1. First visit on a slow phone (Slow 4G: 150 ms, 1.6 Mbit/s down · CPU 4× slower) and on a desktop (no throttle):
//      how long until the menu's Play button shows, how many bytes came down before that, and how many bytes the
//      offline cache (service worker) pulls in the background after it.
//   2. Second visit on the same slow phone (offline cache warm): how long until Play shows.
//   3. A whole game on the slow phone (390×844, CPU 4×): the Dev Kit AI tab's ▶ Watch plays 2 AIs on the real board at
//      Normal speed; every frame's time is recorded → median, 95th percentile, share of slow frames (> 33 ms = under
//      30 fps), long tasks (> 50 ms), and the page's memory at the start and the end.
// Serves dist/ itself under /glyphtender/ with gzip on text files, like GitHub Pages, and counts the bytes it sends
// (the service worker's downloads included — the browser can't hide them from the server).
//   node scripts/perf-audit.mjs [port]        (npm run perf)   Budgets: content/perf.json — prints PASS / OVER per line.
import { createServer } from 'node:http'
import { readFileSync, statSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright-core'

const PORT = Number(process.argv[2] ?? 5261)
const DIST = join(import.meta.dirname, '..', 'dist')
const BASE = '/glyphtender/'
const budget = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'content', 'perf.json'), 'utf8'))
if (!existsSync(join(DIST, 'index.html'))) { console.log('No dist/ — run npm run build first'); process.exit(1) }

// ---------- a GitHub-Pages-like static server that counts bytes ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.csv': 'text/csv', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' }
const GZIP = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.csv', '.svg'])
const gzCache = new Map()
let log = [] // { t, path, bytes, page }
// Slow 4G is modelled HERE, on one shared pipe — Chrome's own network throttle skips the service worker's downloads,
// but on a real phone the offline cache and the first screen share the same slow connection.
let pipe = null // { latency, bytesPerMs, freeAt }
function send(res, status, headers, body) {
  if (!pipe) { res.writeHead(status, headers).end(body); return }
  const now = Date.now()
  const start = Math.max(now + pipe.latency, pipe.freeAt)
  pipe.freeAt = start + body.length / pipe.bytesPerMs
  setTimeout(() => res.writeHead(status, headers).end(body), pipe.freeAt - now)
}
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (!url.startsWith(BASE)) { res.writeHead(404).end(); return }
  let file = normalize(join(DIST, url.slice(BASE.length) || 'index.html'))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  const ext = extname(file)
  let body = readFileSync(file)
  const headers = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'max-age=600' } // GitHub Pages: 10 min
  if (GZIP.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    if (!gzCache.has(file)) gzCache.set(file, gzipSync(body))
    body = gzCache.get(file); headers['content-encoding'] = 'gzip'
  }
  // audio streams with range requests (music): answer a range like GitHub Pages does
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  if (range && !headers['content-encoding']) {
    const start = Number(range[1]); const end = range[2] ? Number(range[2]) : body.length - 1
    const part = body.subarray(start, end + 1)
    log.push({ t: Date.now(), path: url, bytes: part.length })
    send(res, 206, { ...headers, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': part.length }, part)
    return
  }
  log.push({ t: Date.now(), path: url, bytes: body.length })
  send(res, 200, { ...headers, 'accept-ranges': 'bytes', 'content-length': body.length }, body)
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
const URL_ = `http://127.0.0.1:${PORT}${BASE}`

const browser = await chromium.launch()
const kb = (n) => `${Math.round(n / 1024)} KB`
const results = []
function report(name, value, unit, limit) {
  if (unit === 'KB' && limit != null) limit *= 1024
  const over = limit != null && value > limit
  results.push({ name, value, unit, limit, over })
  console.log(`${over ? 'OVER' : limit != null ? 'PASS' : '    '} ${name}: ${unit === 'KB' ? kb(value) : `${Math.round(value)} ${unit}`}${limit != null ? `  (budget ${unit === 'KB' ? kb(limit) : `${limit} ${unit}`})` : ''}`)
}
async function slowPhone(page) {
  pipe = { latency: 150, bytesPerMs: (1.6 * 1024 * 1024) / 8 / 1000, freeAt: 0 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  return cdp
}
/** The page's own requests (not the service worker's) — to tell the two apart in the server's log. */
function pageRequests(page) {
  const urls = new Set()
  page.on('request', (r) => { if (!r.serviceWorker?.()) urls.add(decodeURIComponent(new URL(r.url()).pathname)) })
  return urls
}
/** Waits until the server has sent nothing for `quiet` ms (or `max` ms passed). */
async function networkIdle(quiet = 3000, max = 120000) {
  const start = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 250))
    const last = log.length ? log[log.length - 1].t : start
    if (Date.now() - last > quiet || Date.now() - start > max) return
  }
}
const sum = (rows) => rows.reduce((n, r) => n + r.bytes, 0)

try {
  // ───────────── 1 + 2. First visit (slow phone, desktop) + second visit ─────────────
  for (const device of ['phone', 'desktop']) {
    const context = await browser.newContext(device === 'phone'
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    pipe = null
    if (device === 'phone') await slowPhone(page)
    const own = pageRequests(page)
    log = []
    const t0 = Date.now()
    await page.goto(URL_)
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 60000 })
    const tPlay = Date.now() - t0
    const before = sum(log.filter((r) => r.t <= t0 + tPlay))
    const beforeList = log.filter((r) => r.t <= t0 + tPlay)
    const pageBefore = sum(beforeList.filter((r) => own.has(r.path)))
    await networkIdle()
    const after = sum(log) - before
    console.log(`\n── First visit · ${device === 'phone' ? 'slow phone (Slow 4G, CPU 4×)' : 'desktop'} ──`)
    report(`${device}: Play shows after`, tPlay, 'ms', budget[`${device}PlayMs`])
    report(`${device}: the page downloaded before Play`, pageBefore, 'KB', budget.firstScreenKB)
    report(`${device}: offline cache downloaded before Play`, before - pageBefore, 'KB', null)
    report(`${device}: offline cache pulls in after`, after, 'KB', budget.backgroundKB)
    if (device === 'phone') {
      const top = [...beforeList].sort((a, b) => b.bytes - a.bytes).slice(0, 8)
      console.log('     biggest before Play (* = page): ' + top.map((r) => `${own.has(r.path) ? '*' : ''}${r.path.replace(BASE, '')} ${kb(r.bytes)}`).join(' · '))
      const bg = [...log.filter((r) => r.t > t0 + tPlay)].sort((a, b) => b.bytes - a.bytes).slice(0, 8)
      console.log('     biggest after:       ' + bg.map((r) => `${r.path.replace(BASE, '')} ${kb(r.bytes)}`).join(' · '))
      // second visit: the offline cache is warm
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 }).catch(() => {})
      const page2 = await context.newPage()
      await slowPhone(page2)
      pipe.freeAt = 0
      log = []
      const t1 = Date.now()
      await page2.goto(URL_)
      await page2.getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 60000 })
      console.log('\n── Second visit · slow phone, offline cache warm ──')
      report('phone again: Play shows after', Date.now() - t1, 'ms', budget.phoneAgainPlayMs)
      report('phone again: downloaded', sum(log), 'KB', null)
      await page2.close()
    }
    await context.close()
  }

  // ───────────── 3. A whole AI game on the slow phone ─────────────
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const cdp = await page.context().newCDPSession(page)
    await page.goto(URL_)
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor()
    pipe = null
    await networkIdle(2000, 60000)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    // Dev Kit (` key) → AI tab → ▶ Watch: 2 AIs play at Normal speed on the real board
    await page.keyboard.press('`')
    // (on a phone the Dev Kit's tab carousel arrows sit over the tabs — click through them)
    await page.getByRole('tab', { name: 'AI', exact: true }).evaluate((el) => el.click())
    const watch = page.getByRole('button', { name: '▶ Watch' })
    if (!(await watch.count())) await page.getByText('AI: watch a game').first().evaluate((el) => el.click()) // a folded section
    await watch.evaluate((el) => el.click())
    await page.keyboard.press('`') // close the Dev Kit — measure the game, not the panel
    await page.evaluate(() => {
      const w = window
      w.__perf = { frames: [], long: 0, longMs: 0 }
      let last = performance.now()
      const tick = (t) => { w.__perf.frames.push(t - last); last = t; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { w.__perf.long++; w.__perf.longMs += e.duration } }).observe({ entryTypes: ['longtask'] })
    })
    const heap = async () => (await cdp.send('Runtime.getHeapUsage')).usedSize
    await cdp.send('HeapProfiler.collectGarbage')
    const heapStart = await heap()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(import.meta.dirname, '..', 'e2e-shots', 'perf-game-start.png') })
    const gameMs = budget.gameSeconds * 1000
    const start = Date.now()
    let over = false
    while (Date.now() - start < gameMs) {
      await page.waitForTimeout(2000)
      if (await page.locator('.game-over, [data-end-screen]').count()) { over = true; break }
    }
    const perf = await page.evaluate(() => window.__perf)
    await page.screenshot({ path: join(import.meta.dirname, '..', 'e2e-shots', 'perf-game.png') }) // proof a game was playing
    await cdp.send('HeapProfiler.collectGarbage')
    const heapEnd = await heap()
    const f = perf.frames.slice(5).sort((a, b) => a - b)
    const pct = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))]
    console.log(`\n── An AI game on the slow phone (CPU 4×, ${Math.round((Date.now() - start) / 1000)} s${over ? ', to the end' : ''}) ──`)
    report('frames: median', pct(0.5), 'ms', budget.frameMedianMs)
    report('frames: 95th percentile', pct(0.95), 'ms', budget.frameP95Ms)
    report('frames: slower than 33 ms', (100 * f.filter((x) => x > 33.4).length) / f.length, '%', budget.slowFramePct)
    report('long tasks (> 50 ms)', perf.long, '', null)
    report('memory at start', heapStart, 'KB', null)
    report('memory growth over the game', Math.max(0, heapEnd - heapStart), 'KB', budget.heapGrowthKB)
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}
const overs = results.filter((r) => r.over)
console.log(`\n${overs.length ? `${overs.length} OVER budget: ${overs.map((r) => r.name).join(' · ')}` : 'All within budget'}`)

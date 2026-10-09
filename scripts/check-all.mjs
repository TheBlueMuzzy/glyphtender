// CHECK EVERYTHING, SIDE BY SIDE — the BMUZ check tiers in one command (BMUZ "Checks", 2026-10-04).
//   npm run check:fast            the quick ones, together (~1 min): unit tests, type check + build, lint, golden games
//   npm run check:full            fast first; if green, every e2e script + the before/after screenshots, a few at a time
//   npm run check:full -- game online   only these e2e scripts (an "area" check: the scripts for what you touched)
// Each e2e script gets its OWN port (and the online ones their own wrangler port + storage), so they can run side by
// side; `--jobs 3` sets how many run at once (default 3 — more makes the animation-timed scripts flaky on a busy PC).
// Writes e2e-shots/checks.html: every check, pass/fail, how long, and its full log — the page Claude links for Muzzy
// (dev server: /e2e-shots/checks.html), next to golden.html and report.html. Exit code 0 = everything passed.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

// [name, command] — fast checks don't use ports, so they all run at once
const FAST = [
  ['unit tests', 'npx vitest run'],
  ['build', 'npm run -s build'],
  ['lint', 'npm run -s lint'],
  ['golden games', 'npm run -s check:golden'],
]
// e2e: [name, script, args] — every one on its own ports (see each script's header for what it checks).
// Measured 2026-10-04, 3 at a time: end 462 s · online 334 · online4 274 · screenshots 213 · pass4 114 · game 95 · pass 95 ·
// previews 92 · spotlight 53 · trails 44 · margins 27 · score 26 · portrait 24 · devkit-search 13 · fullscreen 7 (one at a
// time they add up to ~31 min; side by side ~12 min).
const E2E = [ // longest first (measured), so the slow ones never start last
  ['end', 'e2e/end-screen-shots.mjs', 'e2e-shots 5406'],
  ['online', 'e2e/online-shots.mjs', 'e2e-shots 5404 1995'],
  ['online4', 'e2e/online-four.mjs', 'e2e-shots 5405 1994'],
  ['online-ai', 'e2e/online-ai.mjs', 'e2e-shots 5416 1993'], // (F43: AI seats online — lobby add / remove, the server's AI, idle takeover)
  ['screenshots', 'e2e/shots.mjs', 'check'], // (always port 5250)
  ['audio', 'e2e/audio-log.mjs', 'e2e-shots 5417 1992'], // (F55: sound at the animation's moment, rivals' replays, a rejoin is silent)
  ['ai', 'e2e/ai-play.mjs', 'e2e-shots 5431'], // (measured ~4 min alone: two whole games against the AI + 7 sizes)
  ['pass4', 'e2e/pass-and-play-shots.mjs', 'e2e-shots 5403 4'],
  ['game', 'e2e/game-shots.mjs', 'e2e-shots 5401'],
  ['pass', 'e2e/pass-and-play-shots.mjs', 'e2e-shots 5402 3'],
  ['previews', 'e2e/previews.mjs', 'e2e-shots/previews 5412'],
  ['spotlight', 'e2e/word-spotlight.mjs', 'e2e-shots 5408'],
  ['trails', 'e2e/trail-shots.mjs', 'e2e-shots 5409'],
  ['margins', 'e2e/layout-margins.mjs', 'e2e-shots/margins 5411'],
  ['score', 'e2e/score-sequence.mjs', 'e2e-shots 5407'],
  ['portrait', 'e2e/portrait-layout.mjs', 'e2e-shots 5410'],
  ['devkit-search', 'e2e/devkit-search.mjs', 'e2e-shots/devkit-search 5414'],
  ['fullscreen', 'e2e/fullscreen.mjs', ''], // (always port 5243)
]

// Checks that WRITE game files (the Dev Kit's Save → content/ai/…) reload every other check's dev server, so they run
// on their own after the others.
const ALONE = [
  ['devkit-ai', 'e2e/devkit-ai.mjs', 'e2e-shots/devkit-ai 5415'],
]

const args = process.argv.slice(2)
const tier = args[0] === 'full' ? 'full' : 'fast'
const jobsAt = args.indexOf('--jobs')
const JOBS = jobsAt >= 0 ? Number(args[jobsAt + 1]) : 3
const only = args.slice(1).filter((a, i, all) => a !== '--jobs' && all[i - 1] !== '--jobs')
const e2e = only.length ? E2E.filter(([name]) => only.includes(name)) : E2E
const alone = only.length ? ALONE.filter(([name]) => only.includes(name)) : ALONE
const unknown = only.filter((n) => ![...E2E, ...ALONE].some(([name]) => name === n))
if (unknown.length) {
  console.log(`Unknown e2e name(s): ${unknown.join(', ')}. Known: ${[...E2E, ...ALONE].map(([n]) => n).join(', ')}`)
  process.exit(1)
}
mkdirSync('e2e-shots/logs', { recursive: true })

/** Runs one check; resolves with { name, ok, seconds, log }. */
function run(name, command) {
  return new Promise((done) => {
    const started = Date.now()
    let log = ''
    const child = spawn(command, { shell: true, env: { ...process.env, FORCE_COLOR: '0' } })
    child.stdout.on('data', (d) => (log += d))
    child.stderr.on('data', (d) => (log += d))
    child.on('close', (code) => {
      const result = { name, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000), log }
      writeFileSync(`e2e-shots/logs/${name}.log`, log)
      console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} ${String(result.seconds).padStart(4)} s`)
      done(result)
    })
  })
}

/** Runs checks at most `jobs` at a time, in order. */
async function pool(checks, jobs) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < checks.length) {
      const [name, command] = checks[next++]
      results.push(await run(name, command))
    }
  }
  await Promise.all(Array.from({ length: Math.min(jobs, checks.length) }, worker))
  return results
}

const started = Date.now()
console.log(`Fast checks (${FAST.length}, together):`)
const results = await pool(FAST, FAST.length)
if (tier === 'full') {
  if (results.every((r) => r.ok)) {
    console.log(`\nFull checks (${e2e.length} at ${JOBS} at a time, then ${alone.length} alone):`)
    results.push(...(await pool(e2e.map(([name, script, a]) => [name, `node ${script} ${a}`]), JOBS)))
    results.push(...(await pool(alone.map(([name, script, a]) => [name, `node ${script} ${a}`]), 1))) // (one at a time, after the rest)
  } else {
    console.log('\nA fast check failed — fix that first (the e2e scripts would only repeat it).')
  }
}
const minutes = ((Date.now() - started) / 60000).toFixed(1)
const failed = results.filter((r) => !r.ok)
console.log(`\n${failed.length ? `NOT OK — ${failed.length} failed: ${failed.map((r) => r.name).join(', ')}` : `ALL PASS — ${results.length} checks`} (${minutes} min). Page: e2e-shots/checks.html`)
writeReport()
process.exit(failed.length ? 1 : 0)

function writeReport() {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const rows = results.map((r) => `<tr class="${r.ok ? '' : 'no'}"><td>${r.ok ? '✓' : '✗'} ${esc(r.name)}</td><td>${r.seconds} s</td><td><a href="logs/${encodeURIComponent(r.name)}.log">log</a></td></tr>`)
  const extra = results.some((r) => r.name === 'screenshots') ? ' · <a href="report.html">screenshots before | now</a>' : ''
  writeFileSync('e2e-shots/checks.html', `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checks</title><style>body{font:16px system-ui;background:#0f1729;color:#eee;margin:0;padding:16px}h1{margin:0 0 4px}p{margin:0 0 16px;color:#aab}
.ok{color:#7d7}.no,.no a{color:#f77}a{color:#9cf}table{border-collapse:collapse}td{padding:6px 12px;border-bottom:1px solid #334}</style>
<h1 class="${failed.length ? 'no' : 'ok'}">${failed.length ? `Not OK — ${failed.length} of ${results.length} failed` : `All ${results.length} checks pass`}</h1>
<p>${tier} check · ${new Date().toLocaleString()} · ${minutes} min · <a href="golden.html">golden games</a>${extra}</p>
<table>${rows.join('')}</table>`)
}

// SOUND AT THE RIGHT MOMENT (F55) — reads the audio module's log (window.__audioLog: every play and drop, with why;
// src/game/sound.ts) in real games, through the real screens and a real local server:
//   1. LOCAL, my cast that grows 2 words: seed.land is logged AT the landing (not long before, never after), the
//      throw's whoosh before it, one score.pop per seed climbing the ladder (steps 0, 1, 2 …), one score.arrive per
//      seed, and the "two birds" flourish.
//   2. ONLINE, 2 players (Ada creates, Bo joins): the draft + a few turns by taps. On each screen every landing (mine or
//      the rival's replay) has its seed.land at the landing, and the rival's turns play the same sounds as my own
//      (draft.place, glyph.step, cast.throw, seed.land) — bots and rivals sound like people.
//   3. RECONNECT: on Bo's turn his tab closes; he comes back by the code (a new page: a rejoin = a jump). What was
//      already on the board when he arrived is old news: the log has NO game sound played for it (only the night
//      garden / harp starting, and the menu taps), the "your turn" chime is a catch-up drop, nothing is dropped as
//      stale — no burst. Then his next turn sounds normally again.
// Headless Chromium starts with --autoplay-policy=no-user-gesture-required (the taps unlock the audio anyway).
// Starts its OWN `wrangler dev` (default port 1992) and Vite (default 5417) and stops only those.
//   npm run e2e:audio [outDir] [vitePort] [partyPort]
import { mkdirSync } from 'node:fs'
import { makePlayer, startServers } from './online-kit.mjs'

const OUT = process.argv[2] ?? 'e2e-shots'
const VITE_PORT = Number(process.argv[3] ?? 5417)
const PARTY_PORT = Number(process.argv[4] ?? 1992)
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const ok = (good, what) => { if (!good) fail(what); else console.log(`ok   ${what}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const LAND_SLACK_MS = 60 // seed.land is played in the same frame as the landing; a little room for a busy PC

const { browser, stop } = await startServers(VITE_PORT, PARTY_PORT, 'npm run e2e:audio e2e-shots <vitePort> <partyPort>', {},
  { args: ['--autoplay-policy=no-user-gesture-required'] })
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => { // (full screen off: nothing to do with sound)
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  return ctx
}

// ---- in the page ----
/** Every landing (a seed in the air comes down: flying true → false), on the page's own clock — the log's clock. */
const watchLandings = (page) => page.evaluate(() => {
  window.__landings = []
  const store = window.__glyphtender.store
  let flying = store.getState().flying
  store.subscribe((s) => {
    if (flying && !s.flying) window.__landings.push(performance.now())
    flying = s.flying
  })
})
const audioLog = (page) => page.evaluate(() => window.__audioLog?.entries() ?? null)
const played = (log, id) => log.filter((e) => e.id === id && e.result === 'played')
/** For each landing, the seed.land played nearest to it (ms: negative = before the landing). */
function landGaps(log, landings) {
  const lands = played(log, 'seed.land').map((e) => e.t + (e.delayMs ?? 0))
  return landings.map((at) => lands.reduce((best, t) => (Math.abs(t - at) < Math.abs(best) ? t - at : best), Infinity))
}

try {
  // ======== 1. LOCAL: my cast that grows 2 words ========
  {
    const ctx = await context()
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${VITE_PORT}/`)
    ok(await page.evaluate(() => !!window.__audioLog), 'local: the audio log is there (window.__audioLog)')
    await page.getByRole('button', { name: 'Play', exact: true }).click() // (the first tap unlocks the audio)
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForFunction(() => window.__glyphtender?.store.getState().wordsStatus === 'ready', null, { timeout: 15000 })
    const act = (fn) => page.evaluate(`(${fn})(window.__glyphtender.store.getState())`)
    await act('(s) => s.startGame({ players: 2, seed: 21, hideSeeds: false })')
    let pick = null
    for (let seed = 1; seed <= 30 && !pick; seed++) pick = await page.evaluate((seed) => window.__glyphtender.findWordsTurn(2, seed), seed)
    if (!pick) fail('local: found no 2-word cast')
    else {
      await wait(1200) // (the effects preload after the first tap)
      await watchLandings(page)
      await page.evaluate(() => window.__audioLog.clear())
      await act(`(s) => s.tapGlyphling(${pick.glyphling})`)
      const [q, r] = pick.to.split(',').map(Number)
      await act(`(s) => s.tapHex({ q: ${q}, r: ${r} })`)
      await page.waitForFunction(() => [...document.querySelectorAll('[data-glide]')].every((g) => g.getAnimations().length === 0), null, { timeout: 3000 })
      await act(`(s) => s.tapSeed('${pick.seed}')`)
      const [tq, tr] = pick.target.split(',').map(Number)
      await act(`(s) => s.tapHex({ q: ${tq}, r: ${tr} })`)
      await act('(s) => s.startCast()')
      await page.waitForFunction(() => window.__glyphtender.store.getState().scoring === null && !window.__glyphtender.store.getState().flying, null, { timeout: 15000 })
      await wait(300)
      const log = await audioLog(page)
      const landings = await page.evaluate(() => window.__landings)
      const seeds = pick.words.reduce((n, w) => n + w.hexes.length, 0)
      const gaps = landGaps(log, landings)
      ok(landings.length === 1 && Math.abs(gaps[0]) <= LAND_SLACK_MS, `local: seed.land at the landing (${gaps.map((g) => Math.round(g))} ms)`)
      const throwAt = played(log, 'cast.throw')[0]
      ok(throwAt && throwAt.t + (throwAt.delayMs ?? 0) < landings[0], 'local: the throw\'s whoosh before the landing')
      for (const id of ['seed.pick', 'seed.aim', 'glyph.step', 'sprout.grow']) ok(played(log, id).length >= 1, `local: ${id} played`)
      const pops = played(log, 'score.pop')
      ok(pops.length === seeds && pops.every((p, i) => p.step === Math.min(i, 7)), `local: one score.pop per seed (${seeds}), climbing the ladder (steps ${pops.map((p) => p.step).join(' ')})`)
      ok(played(log, 'score.arrive').length === seeds, `local: one score.arrive per seed (${played(log, 'score.arrive').length})`)
      ok(played(log, 'cast.flourish').length === 1, 'local: 2 words → the "two birds" flourish')
      const bad = log.filter((e) => e.result === 'dropped' && !['cooldown', 'catch-up'].includes(e.reason)).map((e) => `${e.id}: ${e.reason}`)
      ok(bad.length === 0, `local: nothing dropped for a bad reason (${bad.join(', ') || 'none'})`)
    }
    await ctx.close()
  }

  // ======== 2. ONLINE: 2 players — my landings and the rival's replays ========
  const ada = makePlayer('Ada', await context(), { mobile: false }, { vitePort: VITE_PORT, out: OUT, fail })
  const bo = makePlayer('Bo', await context(), { mobile: false }, { vitePort: VITE_PORT, out: OUT, fail })
  const everyone = [ada, bo]
  const join = async (p, code) => {
    await p.tap(p.page.getByRole('button', { name: 'Play online' }))
    await p.page.getByRole('textbox', { name: 'Your name' }).fill(p.name)
    await p.page.locator('.kit-roomcode-box').first().click()
    await p.page.keyboard.type(code)
    await p.tap(p.page.getByRole('button', { name: 'Join', exact: true }))
  }
  await ada.open()
  await ada.tap(ada.page.getByRole('button', { name: 'Play online' }))
  await ada.page.getByRole('textbox', { name: 'Your name' }).fill('Ada')
  await ada.tap(ada.page.getByRole('button', { name: 'Create a room' }))
  await ada.page.getByText(/^Room [A-Z]{4}$/).waitFor({ timeout: 10000 })
  const code = await ada.room((s) => s.code)
  await bo.open()
  await join(bo, code)
  await bo.page.getByRole('button', { name: 'I’m ready' }).waitFor({ timeout: 10000 })
  await bo.tap(bo.page.getByRole('button', { name: 'I’m ready' }))
  await ada.page.waitForFunction(() => !document.querySelector('.kit-modal button:last-child')?.disabled, null, { timeout: 10000 })
  await ada.tap(ada.page.getByRole('button', { name: 'Start game' }))
  for (const p of everyone) {
    await p.page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready' && window.__glyphtender.store.getState().game, null, { timeout: 15000 })
    await watchLandings(p.page)
  }

  const open = (p) => p.page && !p.page.isClosed()
  const seatOf = (p) => p.store((s) => s.online.mySeat)
  const myTurn = (p) => open(p) && p.store((s) => !!s.game && !!s.online && s.game.phase !== 'over'
    && s.game.current === s.online.mySeat && !s.waiting && !s.flying && s.scoring === null && s.wordsStatus === 'ready')
  async function playTurn(p) {
    const { page } = p
    const option = (kind) => page.locator(`[data-option="${kind}"] circle`)
    const phase = await p.store((s) => s.game.phase)
    if (phase === 'draft') {
      const count = await option('move').count()
      await p.tap(option('move').nth(Math.floor(count / 2)))
    } else if (phase === 'refresh') {
      await p.tap(page.getByRole('button', { name: 'Keep all' }))
    } else {
      const mine = await p.store((s) => s.game.glyphlings.filter((g) => g.seat === s.game.current && !s.game.tangled.includes(g.id)).map((g) => g.id))
      await p.tapGlyph(page.locator(`[data-glyph="${mine[0]}"]`))
      await p.tap(option('move').first())
      const pick = await page.evaluate(() => window.__glyphtender.findCast(true) ?? window.__glyphtender.findCast(false))
      if (pick) {
        const pos = await p.store(`(s) => s.trayOrder[s.online.mySeat].indexOf('${pick.seed}')`)
        await p.tap(page.locator(`[data-tray-pos="${pos}"]`))
        await p.tap(page.locator(`[data-option="cast"] circle[data-hex="${pick.hex}"]`))
      }
      await p.tap(page.locator('.game-actions button').last()) // Cast (or End turn)
    }
    await page.waitForFunction(() => { const s = window.__glyphtender.store.getState(); return !s.flying && !s.waiting }, null, { timeout: 10000 })
  }
  async function playUntil(players, done, seconds = 120) {
    const until = Date.now() + seconds * 1000
    while (!(await done())) {
      if (Date.now() > until) return fail(`gave up waiting after ${seconds} s`)
      let moved = false
      for (const p of players) if (await myTurn(p)) { await playTurn(p); moved = true }
      if (!moved) await wait(250)
    }
  }
  const turns = (p) => p.store((s) => s.game?.turnCount ?? -1)
  await playUntil(everyone, async () => (await turns(ada)) >= 4)
  await wait(3000) // (the last replay plays out on the other screen)
  for (const p of everyone) {
    const log = await audioLog(p.page)
    const landings = await p.page.evaluate(() => window.__landings)
    const gaps = landGaps(log, landings)
    const late = gaps.filter((g) => Math.abs(g) > LAND_SLACK_MS)
    ok(landings.length >= 2 && late.length === 0, `${p.name}: every landing (${landings.length}, mine + the rival's) has its seed.land at the landing (${gaps.map((g) => Math.round(g)).join(' ')} ms)`)
    ok(played(log, 'draft.place').length >= 4, `${p.name}: 4 draft placements sound (mine + the rival's): ${played(log, 'draft.place').length}`)
    for (const id of ['glyph.step', 'cast.throw', 'sprout.grow']) ok(played(log, id).length >= 2, `${p.name}: ${id} for my turns and the rival's (${played(log, id).length})`)
    const stale = log.filter((e) => e.reason === 'stale')
    ok(stale.length === 0, `${p.name}: nothing asked for late (stale: ${stale.map((e) => e.id).join(' ') || 'none'})`)
  }

  // ======== 3. RECONNECT on Bo's turn: no burst ========
  const boSeat = await seatOf(bo)
  await playUntil(everyone, async () => (await myTurn(bo)))
  await bo.page.close()
  console.log('ok   Bo dropped on his turn')
  await bo.open()
  await join(bo, code)
  const back = await bo.page.waitForFunction((seat) => window.__glyphtender.store.getState().online?.mySeat === seat
    && window.__glyphtender.store.getState().wordsStatus === 'ready', boSeat, { timeout: 15000 }).then(() => true, () => false)
  ok(back, 'Bo is back in his seat')
  if (back) {
    await wait(2500)
    const log = await audioLog(bo.page)
    const quiet = new Set(['amb.night', 'mus.garden', 'mus.menu', 'ui.tap', 'ui.back', 'ui.toggle']) // the bed + his own menu taps
    const noise = log.filter((e) => e.result === 'played' && !quiet.has(e.id)).map((e) => e.id)
    ok(noise.length === 0, `Bo's rejoin: no game sound for what was already there (${noise.join(' ') || 'none'})`)
    const catchUp = log.filter((e) => e.reason === 'catch-up').map((e) => e.id)
    ok(catchUp.includes('turn.yours'), `Bo's rejoin: "your turn" is a catch-up drop (catch-up: ${catchUp.join(' ')})`)
    const odd = log.filter((e) => e.result === 'dropped' && !['catch-up', 'cooldown', 'not-loaded', 'locked'].includes(e.reason)).map((e) => `${e.id}: ${e.reason}`)
    ok(odd.length === 0, `Bo's rejoin: no other drops (${odd.join(', ') || 'none'})`)
    ok(played(log, 'amb.night').length === 1, 'Bo\'s rejoin: the night garden is back')
    // …and his next turn sounds as usual
    await watchLandings(bo.page)
    await bo.page.evaluate(() => window.__audioLog.clear())
    await wait(500)
    await playTurn(bo)
    await wait(1500)
    const after = await audioLog(bo.page)
    ok(played(after, 'glyph.step').length >= 1 || played(after, 'draft.place').length >= 1, `Bo's next turn sounds again (${[...new Set(played(after, 'glyph.step').concat(played(after, 'seed.land'), played(after, 'draft.place')).map((e) => e.id))].join(' ')})`)
  }
  for (const p of everyone) {
    const errors = p.errors.filter((e) => !/WebSocket/.test(e))
    errors.forEach((e) => fail(`${p.name} console: ${e}`))
  }
} catch (error) {
  fail(error.stack ?? String(error))
} finally {
  await stop()
}
console.log(failures ? `\n${failures} problem(s)` : '\nall good (sound at the right moment)')
process.exit(failures ? 1 : 0)

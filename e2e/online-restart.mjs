// A MATCH SURVIVES A SERVER RESTART (F96) — the room keeps the match in its Durable Object storage, so the local
// `wrangler dev` can be stopped and started again mid-game (like a redeploy) and both players carry on in the SAME game.
// Two browsers (own storage = two players): Ada (host, phone 390×844) and Bo (desktop 1440×900). Ada creates a room
// with the 120 s turn timer, Bo joins by the code, both ready → Start → a few turns by taps → the room server is
// STOPPED (stop-servers.mjs <port>: its whole process tree) and started again on the same port with the same
// --persist-to folder → both pages reconnect by themselves → the same game id, the same turn count, the same player's
// turn, the same turn-timer end → they play on (a turn each way) and both screens agree.
// Also: every frame either browser got had no secrets (e2e:online's secretsIn — the move record and its seed numbers
// are stored on the server but never sent), and the storage writes a game action costs (the server logs each one
// with --var TEST_LOG_STORAGE:1 — measured against the Workers free plan's 100,000 rows written a day, SPRINT F96).
// Starts its OWN `wrangler dev` and Vite — never 1997/1999/5180 — and stops only those.
// ports: 5452 1979
// Shots: <outDir>/restart-<size>-<step>.png
//   npm run e2e:restart [outDir] [vitePort] [partyPort]
import { mkdirSync, rmSync } from 'node:fs'
import { makePlayer, secretsIn, startServers } from './online-kit.mjs'

const OUT = process.argv[2] ?? 'e2e-shots'
const VITE_PORT = Number(process.argv[3] ?? 5452)
const PARTY_PORT = Number(process.argv[4] ?? 1979)
mkdirSync(OUT, { recursive: true })
// A clean storage folder each run: matches kept from an earlier run would wake up on their alarms (bots finish them)
// and muddle the write count (it's this script's own folder — online-kit.mjs --persist-to .wrangler/state-e2e-<port>)
rmSync(`.wrangler/state-e2e-${PARTY_PORT}`, { recursive: true, force: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const check = (what, ok) => { if (ok) console.log(`ok   ${what}`); else fail(what) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const { browser, stop, restartParty, partyLog } = await startServers(VITE_PORT, PARTY_PORT,
  'npm run e2e:restart e2e-shots <vitePort> <partyPort>', { TEST_LOG_STORAGE: 1 })
// (Settings → Full screen off, as e2e:rejoin)
async function context(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
  await ctx.addInitScript(() => {
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  return ctx
}
const player = async (name, viewport, mobile) => makePlayer(name, await context(viewport, mobile), { mobile }, { vitePort: VITE_PORT, out: OUT, fail })
const ada = await player('Ada', { width: 390, height: 844 }, true)
const bo = await player('Bo', { width: 1440, height: 900 }, false)
const shot = (p, label) => p.shot(label, 400, 'restart')

// Is it this player's turn, with nothing in the air and nothing on its way to the server? (as e2e:rejoin)
const myTurn = (p) => p.store((s) => !!s.game && !!s.online && s.game.phase !== 'over'
  && s.game.current === s.online.mySeat && !s.waiting && !s.flying && s.scoring === null && s.wordsStatus === 'ready')

// One turn through the screen: a draft placement, Keep all on a refresh, or move + cast + Plant (as e2e:rejoin)
async function playTurn(p) {
  const { page } = p
  const option = (kind) => page.locator(`[data-option="${kind}"] circle`)
  const phase = await p.store((s) => s.game.phase)
  if (phase === 'draft') {
    const count = await option('move').count()
    await p.tap(option('move').nth(Math.floor(count * (0.25 + Math.random() * 0.5))))
  } else if (phase === 'refresh') {
    await p.tap(page.getByRole('button', { name: 'Keep all' }))
  } else {
    const mine = await p.store((s) => s.game.glyphlings.filter((g) => g.seat === s.game.current && !s.game.tangled.includes(g.id)).map((g) => g.id))
    await p.tapGlyph(page.locator(`[data-glyph="${mine[Math.floor(Math.random() * mine.length)]}"]`))
    const count = await option('move').count()
    await p.tap(option('move').nth(Math.floor(Math.random() * count)))
    const pick = await page.evaluate(() => window.__glyphtender.findCast(true) ?? window.__glyphtender.findCast(false))
    if (pick) {
      const pos = await p.store(`(s) => s.trayOrder[s.online.mySeat].indexOf('${pick.seed}')`)
      await p.tap(page.locator(`[data-tray-pos="${pos}"]`))
      await p.tap(page.locator(`[data-option="cast"] circle[data-hex="${pick.hex}"]`))
    }
    await p.tap(page.locator('.game-actions button').last()) // Plant (or End turn)
  }
  await page.waitForFunction(() => { const s = window.__glyphtender.store.getState(); return !s.flying && !s.waiting }, null, { timeout: 10000 })
}

/** Whoever's turn it is plays, until done() says stop. Counts each player's turns in p.turnsPlayed. */
async function playUntil(players, done, seconds = 120) {
  const until = Date.now() + seconds * 1000
  while (!(await done())) {
    if (Date.now() > until) return fail(`gave up waiting after ${seconds} s`)
    let played = false
    for (const p of players) {
      if (!(await myTurn(p))) continue
      await playTurn(p)
      p.turnsPlayed = (p.turnsPlayed ?? 0) + 1
      played = true
    }
    if (!played) await wait(250)
  }
}
/** The last game view this player's browser received (the server's own words: version, turn, timer end). */
const lastView = (p) => {
  for (let i = p.frames.length - 1; i >= 0; i--) {
    try {
      const message = JSON.parse(p.frames[i])
      if (message.type === 'view' && message.view) return message.view
    } catch { /* not JSON */ }
  }
  return null
}
const facts = (view) => view && ({ gameId: view.gameId, version: view.version, turns: view.game.turnCount, current: view.game.current, turnEndsAt: view.turnEndsAt })
/** The storage writes the server logged for THIS room (worker.ts: "[storage] <code> put <bytes> +alarm"). */
const storageLines = (code) => partyLog().split('\n').filter((line) => line.includes(`[storage] ${code} `))

try {
  // ---- Ada creates a room with the 120 s turn timer, Bo joins by the code, both ready, Start ----
  await ada.open()
  await ada.tap(ada.page.getByRole('button', { name: 'Play online' }))
  await ada.page.getByRole('textbox', { name: 'Your name' }).fill('Ada')
  await ada.tap(ada.page.getByRole('button', { name: 'Create a room' }))
  await ada.page.getByText(/^Room [A-Z]{4}$/).waitFor({ timeout: 10000 })
  const code = await ada.room((s) => s.code)
  console.log(`     room ${code}`)
  // (the picker's shown value is its <output>; the other choices sit beside it, hidden, for its width)
  const timerShown = () => ada.page.getByRole('group', { name: 'Turn timer' }).locator('output').textContent()
  for (let i = 0; i < 8 && (await timerShown())?.trim() !== '120 s'; i++) {
    await ada.tap(ada.page.getByRole('button', { name: 'Next Turn timer' }))
  }
  check('the host picked the 120 s turn timer', (await timerShown())?.trim() === '120 s')
  await bo.open()
  await bo.tap(bo.page.getByRole('button', { name: 'Play online' }))
  await bo.page.getByRole('textbox', { name: 'Your name' }).fill('Bo')
  await bo.page.locator('.kit-roomcode-box').first().click()
  await bo.page.keyboard.type(code)
  await bo.tap(bo.page.getByRole('button', { name: 'Join', exact: true }))
  await bo.page.getByRole('button', { name: 'I’m ready' }).waitFor({ timeout: 10000 })
  await bo.tap(bo.page.getByRole('button', { name: 'I’m ready' }))
  await ada.page.waitForFunction(() => !document.querySelector('.kit-modal button:last-child')?.disabled, null, { timeout: 10000 })
  await ada.tap(ada.page.getByRole('button', { name: 'Start game' }))
  for (const p of [ada, bo]) await p.page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready' && window.__glyphtender.store.getState().game, null, { timeout: 15000 })
  const writesAtStart = storageLines(code).length
  const versionAtStart = lastView(ada).version

  // ---- a few turns (the draft, then real turns) ----
  await playUntil([ada, bo], async () => (await ada.store((s) => s.game.turnCount)) >= 3)
  // (let both screens settle on the same latest view)
  await wait(1500)
  const before = facts(lastView(ada))
  const boBefore = facts(lastView(bo))
  check(`both players have the same game before the restart (version ${before.version}, turn ${before.turns})`, boBefore.version === before.version && boBefore.gameId === before.gameId)
  check(`a turn timer is running before the restart (${lastView(ada).options.turnSeconds} s)`, typeof before.turnEndsAt === 'number' && before.turnEndsAt > Date.now())
  const lines = storageLines(code).slice(writesAtStart)
  const puts = lines.filter((l) => /\bput\b/.test(l)).length
  const alarms = lines.filter((l) => l.includes('+alarm')).length
  const actions = before.version - versionAtStart
  const biggest = Math.max(0, ...lines.map((l) => Number(/put (\d+)/.exec(l)?.[1] ?? 0)))
  console.log(`     storage: ${actions} actions → ${puts} saves + ${alarms} alarm moves = ${puts + alarms} rows written (${((puts + alarms) / Math.max(1, actions)).toFixed(2)} a action); biggest saved room ${biggest} bytes`)
  check('the room saved the match as it went', puts >= actions)
  check('at most ~2 rows written per action (a save + the alarm), plus a few for seats', puts + alarms <= 2 * actions + 6)
  await shot(ada, '1-before-restart')

  // ---- the room server goes down and comes back (a redeploy) ----
  const framesBefore = { ada: ada.frames.length, bo: bo.frames.length }
  const downAt = Date.now()
  await restartParty()
  console.log(`     the room server was down and back in ${((Date.now() - downAt) / 1000).toFixed(1)} s`)

  // ---- both pages reconnect by themselves and get the SAME game again ----
  const freshView = async (p, was) => {
    const until = Date.now() + 45_000
    while (Date.now() < until) {
      const got = p.frames.slice(was).some((f) => f.includes('"type":"view"'))
      if (got) return true
      await wait(250)
    }
    return false
  }
  for (const [p, was] of [[ada, framesBefore.ada], [bo, framesBefore.bo]]) {
    check(`${p.name} reconnected and got the game from the restarted server`, await freshView(p, was))
  }
  check('the server loaded the match from storage', /match loaded from storage/.test(partyLog()))
  const after = facts(lastView(ada))
  const boAfter = facts(lastView(bo))
  check(`the same game id (${before.gameId})`, after.gameId === before.gameId && boAfter.gameId === before.gameId)
  check(`the same turn count (${before.turns}) and version (${before.version})`, after.turns === before.turns && after.version === before.version && boAfter.version === before.version)
  check(`the same player's turn (seat ${before.current})`, after.current === before.current && boAfter.current === before.current)
  check('the turn timer came back with the same end time', after.turnEndsAt === before.turnEndsAt)
  for (const p of [ada, bo]) {
    check(`${p.name} is back in the game (seat kept)`, await p.store((s) => !!s.game && s.online?.mySeat !== undefined && s.online.mySeat !== null && s.wordsStatus === 'ready'))
  }
  await shot(bo, '2-after-restart')

  // ---- the game goes on: a turn each way, and both screens agree ----
  ada.turnsPlayed = 0
  bo.turnsPlayed = 0
  await playUntil([ada, bo], async () => (ada.turnsPlayed >= 1 && bo.turnsPlayed >= 1) || (await ada.store((s) => s.game.phase === 'over')), 120)
  check(`both played on after the restart (Ada ${ada.turnsPlayed}, Bo ${bo.turnsPlayed})`, ada.turnsPlayed >= 1 && bo.turnsPlayed >= 1)
  await wait(1500)
  const [a, b] = [facts(lastView(ada)), facts(lastView(bo))]
  check(`both screens moved on together (version ${before.version} → ${a.version})`, a.version > before.version && a.version === b.version && a.gameId === before.gameId)
  check('both screens agree whose turn it is', (await ada.store((s) => s.game.current)) === (await bo.store((s) => s.game.current)))
  await shot(ada, '3-game-goes-on')

  // ---- secrets: the saved match holds the move record + its seed numbers, but no frame ever carried them ----
  for (const p of [ada, bo]) {
    const leaks = p.frames.flatMap(secretsIn)
    check(`${p.name}: no secret in any of ${p.frames.length} frames`, leaks.length === 0)
    if (leaks.length) console.log(`     ${[...new Set(leaks)].join(', ')}`)
  }
  // ---- console: the dropped connection can log a failed socket; anything else is a real error ----
  for (const p of [ada, bo]) p.errors.filter((e) => !/WebSocket/.test(e)).forEach((e) => fail(`${p.name} console: ${e}`))
} catch (error) {
  fail(error.stack ?? String(error))
} finally {
  await stop()
}
console.log(failures ? `\n${failures} problem(s)` : '\nall good (a match survives a server restart)')
process.exit(failures ? 1 : 0)

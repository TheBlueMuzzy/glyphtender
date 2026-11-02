// REJOIN MATCH (F95) — a player who CLOSED THE TAB mid-match gets their seat back from the main menu, through the real
// screens and a real local server. Two browsers (own storage = two players): Ada (host, phone 390×844) and Bo
// (desktop 1440×900). Ada creates a room, Bo joins by the code, both ready → Start → a few turns by taps →
// Bo's tab CLOSES → Bo opens the game again in the same browser (a new page, same localStorage, fresh sessionStorage
// = like opening the game again after closing it) → the main menu shows "Rejoin match" as its first, main button
// (shots at 390×844, 360×780, 1440×900, 1920x1080; nothing past an edge, buttons ≥ 44 px) → one tap → Bo is back in
// the SAME seat of the SAME game → the game goes on: Bo plays a turn and the turn passes to Ada.
// Also: a browser that was never in a match sees no "Rejoin match" (a fresh menu stays as it was).
// Starts its OWN `wrangler dev` and Vite — never 1997/1999/5180 — and stops only those.
// ports: 5450 1981
// Shots: <outDir>/rejoin-<size>-<step>.png (the menu shots also go to <shotsDir> when given)
//   npm run e2e:rejoin [outDir] [vitePort] [partyPort] [menuShotsDir]
import { mkdirSync } from 'node:fs'
import { makePlayer, startServers } from './online-kit.mjs'

const OUT = process.argv[2] ?? 'e2e-shots'
const VITE_PORT = Number(process.argv[3] ?? 5450)
const PARTY_PORT = Number(process.argv[4] ?? 1981)
const MENU_SHOTS = process.argv[5] ?? null
mkdirSync(OUT, { recursive: true })
if (MENU_SHOTS) mkdirSync(MENU_SHOTS, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const check = (what, ok) => { if (!ok) fail(what) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const { browser, stop } = await startServers(VITE_PORT, PARTY_PORT, 'npm run e2e:rejoin e2e-shots <vitePort> <partyPort>')
// (Settings → Full screen off: this check resizes the window, which a full-screen page can't do)
async function context(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
  await ctx.addInitScript(() => {
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  return ctx
}
const player = async (name, viewport, mobile) => makePlayer(name, await context(viewport, mobile), { mobile }, { vitePort: VITE_PORT, out: OUT, fail })
const TALL = { width: 390, height: 844 }, SMALL = { width: 360, height: 780 }, DESK = { width: 1440, height: 900 }, WIDE = { width: 1920, height: 1080 }
const ada = await player('Ada', TALL, true)
const bo = await player('Bo', DESK, false)
const shot = (p, label, settle) => p.shot(label, settle, 'rejoin')

// Is it this player's turn, with nothing in the air and nothing on its way to the server? (as e2e:online4)
const open = (p) => p.page && !p.page.isClosed()
const myTurn = (p) => open(p) && p.store((s) => !!s.game && !!s.online && s.game.phase !== 'over'
  && s.game.current === s.online.mySeat && !s.waiting && !s.flying && s.scoring === null && s.wordsStatus === 'ready')

// One turn through the screen: a draft placement, Keep all on a refresh, or move + cast (Magic if it can) + Cast (as e2e:online4)
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
const turnCount = (p) => p.store((s) => s.game?.turnCount ?? -1)
const rejoinButton = (p) => p.page.getByRole('button', { name: 'Rejoin match' })

try {
  // ---- a fresh browser (never online): no Rejoin offer ----
  await ada.open()
  await ada.page.getByRole('button', { name: 'Play online' }).waitFor({ timeout: 10000 })
  check('a browser that was never in a match sees no "Rejoin match"', (await rejoinButton(ada).count()) === 0)

  // ---- Ada creates a room, Bo joins by the code, both ready, Start ----
  await ada.tap(ada.page.getByRole('button', { name: 'Play online' }))
  await ada.page.getByRole('textbox', { name: 'Your name' }).fill('Ada')
  await ada.tap(ada.page.getByRole('button', { name: 'Create a room' }))
  await ada.page.getByText(/^Room [A-Z]{4}$/).waitFor({ timeout: 10000 })
  const code = await ada.room((s) => s.code)
  console.log(`     room ${code}`)
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

  // ---- a few turns, then Bo's tab closes mid-match ----
  await playUntil([ada, bo], async () => (await turnCount(ada)) >= 3)
  const before = await bo.store((s) => ({ seat: s.online.mySeat, gameId: s.online.gameId ?? null, turns: s.game.turnCount }))
  check('Bo is mid-match before closing the tab', before.seat !== null && before.seat !== undefined)
  await bo.page.close()
  console.log(`ok   Bo closed the tab (seat ${before.seat}, turn ${before.turns})`)
  await wait(1000)

  // ---- Bo opens the game again: "Rejoin match" on the main menu, the main button, at every size ----
  await bo.open()
  const offered = await rejoinButton(bo).waitFor({ timeout: 10000 }).then(() => true, () => false)
  check('Bo sees "Rejoin match" on the main menu', offered)
  check('"Rejoin match" is the first menu button', (await bo.page.locator('.kit-screen button').first().textContent())?.trim() === 'Rejoin match')
  check('"Play online" is still there', (await bo.page.getByRole('button', { name: 'Play online' }).count()) === 1)
  for (const size of [TALL, SMALL, DESK, WIDE]) {
    await bo.page.setViewportSize(size)
    await shot(bo, '1-menu-rejoin')
    if (MENU_SHOTS) await bo.page.screenshot({ path: `${MENU_SHOTS}/menu-rejoin-${size.width}x${size.height}.png` })
    // the Rejoin button looks like the menu's other main button: same width and height as Play online
    const [rejoinBox, onlineBox] = [await rejoinButton(bo).boundingBox(), await bo.page.getByRole('button', { name: 'Play online' }).boundingBox()]
    check(`Rejoin match is as big as Play online (${size.width}x${size.height})`,
      Math.abs(rejoinBox.width - onlineBox.width) <= 1 && Math.abs(rejoinBox.height - onlineBox.height) <= 1)
  }
  await bo.page.setViewportSize(DESK)

  // ---- one tap: back in the same seat of the same game ----
  await bo.tap(rejoinButton(bo))
  const back = await bo.page.waitForFunction((seat) => {
    const s = window.__glyphtender.store.getState()
    return s.online?.mySeat === seat && s.wordsStatus === 'ready' && s.game
  }, before.seat, { timeout: 15000 }).then(() => true, () => false)
  check(`Bo is back in seat ${before.seat}`, back)
  if (back) {
    const after = await bo.store((s) => ({ gameId: s.online.gameId ?? null, turns: s.game.turnCount }))
    check('the same game (same game id, no turns lost)', after.gameId === before.gameId && after.turns >= before.turns)
    check('the room is still the same code', await bo.room(`(s) => s.code === '${code}'`))
    check('no Rejoin offer while back in the match', (await rejoinButton(bo).count()) === 0)
    await shot(bo, '2-back-in-seat')
    console.log(`ok   Bo is back in seat ${before.seat}`)

    // ---- the game goes on: Bo plays a turn of his own AND Ada plays one after it (the turn really passes on) ----
    // (The draft's order may give Bo two in a row, so "passes on" = Ada gets a turn after Bo's.)
    const turnsBack = await turnCount(ada)
    bo.turnsPlayed = 0
    ada.turnsPlayed = 0
    let adaAfterBo = false
    await playUntil([bo, ada], async () => {
      if (bo.turnsPlayed >= 1 && ada.turnsPlayed >= 1) adaAfterBo = true
      if (bo.turnsPlayed === 0) ada.turnsPlayed = 0 // only Ada's turns AFTER Bo's count
      return adaAfterBo || (await ada.store((s) => s.game.phase === 'over'))
    }, 120)
    check('Bo played a turn after rejoining', bo.turnsPlayed >= 1)
    check('then the turn passed on to Ada and she played', adaAfterBo)
    // (Bo's screen may still be replaying Ada's turn: give it a moment to catch up)
    const adaNow = await turnCount(ada)
    await bo.page.waitForFunction((n) => (window.__glyphtender.store.getState().game?.turnCount ?? -1) >= n, adaNow, { timeout: 10000 }).catch(() => {})
    const [adaTurns, boTurns] = [await turnCount(ada), await turnCount(bo)]
    check(`both screens moved on together (turn ${turnsBack} → Ada ${adaTurns}, Bo ${boTurns})`, adaTurns > turnsBack && adaTurns === boTurns)
    const agree = new Set([await ada.store((s) => s.game.current), await bo.store((s) => s.game.current)])
    check('both screens agree whose turn it is', agree.size === 1)
    await shot(bo, '3-game-goes-on')
  }

  // ---- console: a closed tab can log a failed socket; anything else is a real error ----
  for (const p of [ada, bo]) p.errors.filter((e) => !/WebSocket/.test(e)).forEach((e) => fail(`${p.name} console: ${e}`))
} catch (error) {
  fail(error.stack ?? String(error))
} finally {
  await stop()
}
console.log(failures ? `\n${failures} problem(s)` : '\nall good (Rejoin match)')
process.exit(failures ? 1 : 0)

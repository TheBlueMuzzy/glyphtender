// ONLINE AI SEATS (F43) THROUGH THE REAL SCREENS AND A REAL LOCAL SERVER — two browsers: Ada (host, phone 390×844)
// and Bo (desktop 1440×900).
// Play online → Ada creates a room → in the lobby she adds an AI (the Scholar at Archmage), removes it, adds the
// Strategist at Apprentice → lobby shots at 390×844, 360×780, 844×390 and 1440×900 (the add-AI card, 🤖 + skill on the AI's
// row) → Bo joins, sees the AI (no Remove for him), gets ready → Start (3 seats: Ada, Bo, the Strategist) → the AI
// places and plays on the server: its turns GLIDE on Ada's screen like any player's (a [data-glide] animation), the
// turn bar shows 🤖 on its turn → Bo LEAVES mid-game: the default AI (Survivor) plays his seat from then on →
// Ada plays to the end against two AIs → the end table has all three names.
// Every WebSocket frame each browser receives is recorded: the run FAILS if one ever holds another player's seeds,
// the bag, the log, the rng, the seed or any Magic before the game is over. Screenshots checked (nothing past an
// edge, buttons ≥ 44 px), console clean.
// Starts its OWN `wrangler dev` (default port 1993) and Vite (default 5416) and stops only those.
// Shots: e2e-shots/online-ai-<size>-<step>.png
//   npm run e2e:online-ai [outDir] [vitePort] [partyPort]
import { mkdirSync } from 'node:fs'
import { makePlayer, secretsIn, startServers } from './online-kit.mjs'

const OUT = process.argv[2] ?? 'e2e-shots'
const VITE_PORT = Number(process.argv[3] ?? 5416)
const PARTY_PORT = Number(process.argv[4] ?? 1993)
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (why) => { failures++; console.log(`  FAIL ${why}`) }
const check = (what, ok) => { if (!ok) fail(what) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const { browser, stop } = await startServers(VITE_PORT, PARTY_PORT, 'npm run e2e:online-ai e2e-shots <vitePort> <partyPort>')
async function context(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
  await ctx.addInitScript(() => { // (Full screen off: this check resizes a phone's window)
    const key = 'kit-settings:'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), fullscreen: false }))
  })
  return ctx
}
const player = async (name, viewport, mobile) => makePlayer(name, await context(viewport, mobile), { mobile }, { vitePort: VITE_PORT, out: OUT, fail })
const TALL = { width: 390, height: 844 }, SMALL = { width: 360, height: 780 }, WIDE = { width: 844, height: 390 }, DESK = { width: 1440, height: 900 }
const ada = await player('Ada', TALL, true)
const bo = await player('Bo', DESK, false)
const shot = (p, label, settle) => p.shot(label, settle, 'online-ai')

const open = (p) => p.page && !p.page.isClosed()
const myTurn = (p) => open(p) && p.store((s) => !!s.game && !!s.online && s.game.phase !== 'over'
  && s.game.current === s.online.mySeat && !s.waiting && !s.flying && s.scoring === null && s.wordsStatus === 'ready')

// One turn through the screen (as e2e:online4): a draft placement, Keep all on a refresh, or move + cast + Cast
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
    await p.tap(page.locator('.game-actions button').last())
  }
  await page.waitForFunction(() => { const s = window.__glyphtender.store.getState(); return !s.flying && !s.waiting }, null, { timeout: 10000 })
}

/** Whoever's turn it is plays (the AIs play on the server), until done() says stop. */
async function playUntil(players, done, seconds = 120) {
  const until = Date.now() + seconds * 1000
  while (!(await done())) {
    if (Date.now() > until) return fail(`gave up waiting after ${seconds} s`)
    let played = false
    for (const p of players) {
      if (!(await myTurn(p))) continue
      await playTurn(p)
      played = true
    }
    if (!played) await wait(150)
  }
}
const lobbySeats = (p) => p.room((s) => s.room?.room?.seats?.map((seat) => `${seat.name}|${seat.kind}|${seat.profile ?? ''}`) ?? [])
// Pick a value in a kit Selector (◀ value ▶): press ▶ until it shows `value`
async function choose(p, label, value) {
  const selector = p.page.getByRole('group', { name: label })
  for (let i = 0; i < 6 && (await selector.textContent()).indexOf(value) < 0; i++) await p.tap(selector.getByRole('button').last())
  check(`${label} shows ${value}`, (await selector.textContent()).includes(value))
}

try {
  // ---- Ada creates a room and adds AIs ----
  await ada.open()
  await ada.tap(ada.page.getByRole('button', { name: 'Play online' }))
  await ada.page.getByRole('textbox', { name: 'Your name' }).fill('Ada')
  await ada.tap(ada.page.getByRole('button', { name: 'Create a room' }))
  await ada.page.getByText(/^Room [A-Z]{4}$/).waitFor({ timeout: 10000 })
  const code = await ada.room((s) => s.code)
  console.log(`     room ${code}`)
  await shot(ada, '1-lobby-alone')
  await choose(ada, 'Personality', 'the Scholar')
  await choose(ada, 'Skill', 'Archmage')
  await ada.tap(ada.page.getByRole('button', { name: 'Add AI' }))
  await ada.page.waitForFunction(() => window.__glyphtender.online.getState().room?.room?.seats?.length === 2, null, { timeout: 5000 }).catch(() => {})
  check(`the Scholar (Archmage) sits down (${await lobbySeats(ada)})`, (await lobbySeats(ada)).join() === 'Ada|human|,The Scholar|bot|Scholar/Archmage')
  check('the AI row shows 🤖 and its skill', (await ada.page.getByText('🤖 Archmage', { exact: true }).count()) === 1)
  await ada.tap(ada.page.getByRole('button', { name: 'Remove The Scholar' }))
  await ada.page.waitForFunction(() => window.__glyphtender.online.getState().room?.room?.seats?.length === 1, null, { timeout: 5000 }).catch(() => {})
  check('Remove takes the AI out again', (await lobbySeats(ada)).length === 1)
  await choose(ada, 'Personality', 'the Strategist')
  await choose(ada, 'Skill', 'Apprentice')
  await ada.tap(ada.page.getByRole('button', { name: 'Add AI' }))
  await ada.page.waitForFunction(() => window.__glyphtender.online.getState().room?.room?.seats?.length === 2, null, { timeout: 5000 }).catch(() => {})
  check(`the Strategist (Apprentice) sits down (${await lobbySeats(ada)})`, (await lobbySeats(ada)).join() === 'Ada|human|,The Strategist|bot|Strategist/Apprentice')

  // ---- Bo joins: he sees the AI, can't remove it, gets ready ----
  await bo.open()
  await bo.tap(bo.page.getByRole('button', { name: 'Play online' }))
  await bo.page.getByRole('textbox', { name: 'Your name' }).fill('Bo')
  await bo.page.locator('.kit-roomcode-box').first().click()
  await bo.page.keyboard.type(code)
  await bo.tap(bo.page.getByRole('button', { name: 'Join', exact: true }))
  await bo.page.getByRole('button', { name: 'I’m ready' }).waitFor({ timeout: 10000 })
  check('Bo sees the AI in the lobby', (await bo.page.getByText('The Strategist', { exact: true }).count()) > 0)
  check('only the host can remove an AI (no Remove for Bo)', (await bo.page.getByRole('button', { name: /^Remove/ }).count()) === 0)
  check('only the host gets the add-AI card', (await bo.page.getByRole('button', { name: 'Add AI' }).count()) === 0)
  await shot(bo, '1-lobby-guest')
  await bo.tap(bo.page.getByRole('button', { name: 'I’m ready' }))
  await ada.page.waitForFunction(() => window.__glyphtender.online.getState().room?.room?.seats?.length === 3, null, { timeout: 10000 })
  await ada.page.waitForFunction(() => ![...document.querySelectorAll('.kit-modal button')].find((b) => b.textContent === 'Start game')?.disabled, null, { timeout: 10000 })
  for (const size of [TALL, SMALL, WIDE, DESK]) {
    await ada.page.setViewportSize(size)
    await shot(ada, '1-lobby-host-ai')
  }
  await ada.page.setViewportSize(TALL)
  await ada.tap(ada.page.getByRole('button', { name: 'Start game' }))

  // ---- the game: the AI (seat 1) plays on the server; its turns glide on Ada's screen ----
  for (const p of [ada, bo]) await p.page.waitForFunction(() => window.__glyphtender.store.getState().wordsStatus === 'ready' && window.__glyphtender.store.getState().game, null, { timeout: 15000 })
  check('seats: Ada 0, the Strategist 1, Bo 2', (await ada.store((s) => s.game.config.players)) === 3 && (await bo.store((s) => s.online.mySeat)) === 2)
  // Watch Ada's page: a glide while the AI's turn plays, and 🤖 by the AI's portrait on its turn
  await ada.page.evaluate(() => {
    window.__aiSeen = { glides: 0, robot: 0 }
    setInterval(() => {
      const s = window.__glyphtender.store.getState()
      if (!s.game || s.game.current !== 1) return
      if ([...document.querySelectorAll('[data-glide]')].some((g) => g.getAnimations().length > 0)) window.__aiSeen.glides++
      if (document.querySelector('.game-turn-bar [data-seat-status="bot"]')) window.__aiSeen.robot++
    }, 50)
  })
  await playUntil([ada, bo], async () => (await ada.store((s) => s.game.phase !== 'draft')))
  check('6 glyphlings placed (the AI placed its own)', await ada.store((s) => s.game.glyphlings.filter((g) => g.seat === 1).length === 2))
  await playUntil([ada, bo], async () => (await ada.store((s) => s.game.turnCount >= 6)), 180)
  await shot(ada, '2-mid-game')
  const seen = await ada.page.evaluate(() => window.__aiSeen)
  check(`the AI's moves glide on Ada's screen like anyone's (${seen.glides} glide frames)`, seen.glides > 0)
  check(`🤖 by the AI's portrait on its turn (${seen.robot} frames)`, seen.robot > 0)

  // ---- Bo leaves mid-game: the default AI plays his seat ----
  await playUntil([ada, bo], async () => (await myTurn(bo)), 60)
  await bo.tap(bo.page.getByRole('button', { name: 'Menu' }))
  await bo.tap(bo.page.getByRole('button', { name: /^Leave/ }).first())
  const confirm = bo.page.getByRole('dialog').getByRole('button', { name: /^Leave/ })
  if (await confirm.count()) await bo.tap(confirm.last())
  const boIsBot = await ada.page.waitForFunction(() => window.__glyphtender.online.getState().room?.room?.seats?.[2]?.kind === 'bot', null, { timeout: 10000 }).then(() => true, () => false)
  check('a bot took Bo\'s seat after he left', boIsBot)
  const before = await ada.store((s) => s.game.turnCount)
  const movedOn = `(s) => s.game.phase === 'over' || s.game.turnCount >= ${before + 4}` // (3 seats: 4 turns include Bo's)
  await playUntil([ada], async () => (await ada.store(movedOn)), 60)
  check('Bo\'s seat plays on without him', await ada.store(movedOn))
  await shot(ada, '3-bo-left')

  // ---- Ada plays to the end against two AIs ----
  await playUntil([ada], async () => (await ada.store((s) => s.game.phase === 'over')), 600)
  check('Ada sees everyone\'s Magic at the end', await ada.store((s) => s.game.magic.length === 3 && s.game.magic.some((m) => m > 0)))
  await ada.page.waitForTimeout(1500)
  await ada.tap(ada.page.getByRole('button', { name: 'Skip' }))
  await ada.page.getByRole('dialog').getByRole('button', { name: 'New game' }).waitFor()
  await shot(ada, '4-end-table')
  for (const name of ['Ada', 'Bo', 'The Strategist']) check(`the end table has ${name}`, (await ada.page.getByRole('dialog').getByText(name, { exact: true }).count()) > 0)

  // ---- the secrecy check over every frame each browser received ----
  for (const p of [ada, bo]) {
    const views = p.frames.filter((f) => f.includes('"type":"view"')).length
    const leaks = p.frames.flatMap((f) => secretsIn(f))
    check(`${p.name} received views (${views})`, views > 5)
    leaks.forEach((what) => fail(`${p.name} received ${what} before the end`))
    console.log(`${leaks.length ? 'FAIL' : 'ok  '} secrecy: ${p.name} — ${p.frames.length} frames, ${views} views, ${leaks.length} leaks`)
    p.errors.filter((e) => !/WebSocket/.test(e)).forEach((e) => fail(`${p.name} console: ${e}`))
  }
} catch (error) {
  fail(error.stack ?? String(error))
} finally {
  await stop()
}
console.log(failures ? `\n${failures} problem(s)` : '\nall good (online AI seats)')
process.exit(failures ? 1 : 0)

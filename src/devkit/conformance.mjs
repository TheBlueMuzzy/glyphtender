// THE DEV KIT'S PROMISE CHECKS — run by check-framework.mjs (npm run check:framework). Each one tests a line of
// MODULE-CONTRACTS.md "Dev Kit" in THIS game and, when it fails, says what to wire and where.
//   Code:    the adapter is registered · every content/tuning/*.json is read by the game · no tuning value is copied
//            at load (tuning/liveGuard.ts)
//   Browser: the Dev Kit starts and the game is plugged in · every tuning file is live in the running game · ⏸ full
//            pause (screen, both clocks and the game's state stand still) · ◐ half pause (the rules clock and the
//            game's state stand still while the looks clock runs) · a snapshot restores exactly · the game's hotkeys
//            skip text boxes · (a warning, 0.21.0) the closed-panel PAUSED pill keeps clear of the game's HUD on a phone
// The browser checks reach the game through the registered adapter (window.__devkit, checkHandle.ts); the ones that
// need live play use the adapter's conformance.startPlay (devkitGame.ts).
import { badgeOverHud, judgeBadge, BADGE_SPOTS } from './pause/badgeClear.mjs'

export const title = 'Dev Kit'

// Phones held upright: the sizes where a HUD has the least room. (Not sideways: some games are portrait only — Goops —
// and show just a "turn your phone" card there.) A game whose content/ui/style.json says "orientation": "landscape"
// (F104 — the UI kit's setting, read here directly: a game can have the Dev Kit without the UI kit) is checked on its
// side instead.
export const BADGE_SIZES = [{ width: 390, height: 844 }, { width: 360, height: 780 }]
export const BADGE_SIZES_SIDEWAYS = [{ width: 844, height: 390 }, { width: 768, height: 343 }]
export const badgeSizes = (style) => (style?.orientation === 'landscape' ? BADGE_SIZES_SIDEWAYS : BADGE_SIZES)
export const BADGE_CHECK = 'the PAUSED pill keeps clear of the game\'s HUD on a phone'

/** With the game paused and the panel closed, at each phone size: does the pill cover the game's visible words or controls? */
async function badgeCheck(t) {
  // A game whose page throws here (no __devkit.pause, a closed browser) gets a skip with the reason — never an error
  // that stops the checks after this one (the console check) from running
  try { return await badgeCheckRun(t) } catch (error) {
    return t.skip(BADGE_CHECK, `couldn't check the PAUSED pill (${error?.message ?? error})`)
  }
}

async function badgeCheckRun(t) {
  const runs = []
  for (const { width, height } of badgeSizes(t.json('content/ui/style.json'))) {
    const page = await t.page({ width, height, mobile: true })
    try {
      const reason = await t.startPlay(page)
      if (reason) return t.skip(BADGE_CHECK, `live play didn't start at ${width}×${height} (${reason.replace(/^threw:/, 'startPlay threw: ')})`)
      await page.evaluate(() => window.__devkit.pause('full'))
      await page.waitForTimeout(300)
      const seen = await page.evaluate(badgeOverHud, { spots: BADGE_SPOTS })
      await page.evaluate(() => window.__devkit.pause(null))
      if (seen.missing) return t.skip(BADGE_CHECK, `no PAUSED pill showed at ${width}×${height} (panel open?)`)
      runs.push({ size: `${width}×${height}`, ...seen })
    } finally {
      await page.close()
    }
  }
  const { ok, current, problems, clear } = judgeBadge(runs)
  if (ok) return t.pass(BADGE_CHECK, `"${current}" is clear at ${runs.map((r) => r.size).join(' and ')}`)
  return t.warn(BADGE_CHECK, problems, clear.length
    ? `content/devkit.json "pauseBadgeSpot": pick one that is clear at every phone size — ${clear.map((s) => `"${s}"`).join(', ')}.`
    : 'content/devkit.json "pauseBadgeSpot": no spot is clear at every phone size — pick the one that covers the least (each spot\'s list is above when you try it).')
}

const TIMERS = /\b(setTimeout|setInterval)\s*\(|\bperformance\.now\s*\(|\bDate\.now\s*\(/
const MAX_LIST = 8
const listSome = (lines, more = 'more') => lines.length > MAX_LIST ? [...lines.slice(0, MAX_LIST), `…and ${lines.length - MAX_LIST} ${more}`] : lines

/** The first place two JSON values differ: "shift.state.pieceY: 3 → 4" ('' = the same). */
export function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return ''
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[key], b[key], path ? `${path}.${key}` : key)
      if (d) return d
    }
  }
  const show = (v) => { const s = JSON.stringify(v); return s === undefined ? 'missing' : s.length > 40 ? s.slice(0, 37) + '…' : s }
  return `${path || '(the whole state)'}: ${show(a)} → ${show(b)}`
}

/** A copy of a tuning file with one value changed, and which top-level key holds it — or null (nothing to change). */
export function nudged(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const copy = structuredClone(data)
  const change = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue
      if (typeof v === 'number') { obj[k] = v + (Number.isInteger(v) ? 7 : 0.137); return true }
      if (typeof v === 'boolean') { obj[k] = !v; return true }
      if (typeof v === 'string') { obj[k] = v + '~'; return true }
      if (v && typeof v === 'object' && !Array.isArray(v) && change(v)) return true
    }
    return false
  }
  for (const [k, v] of Object.entries(copy)) {
    if (k.startsWith('_')) continue
    const holder = { [k]: v }
    if (change(holder)) { copy[k] = holder[k]; return { data: copy, key: k } }
  }
  return null
}

/** Tuning files no GAME code imports (tests and the Dev Kit adapter don't count: they aren't the game reading it). */
export function unreadTuning(names, gameFiles) {
  return names.filter((name) => !gameFiles.some((f) => f.text.includes(`content/tuning/${name}.json`)))
}

export async function check(t) {
  const adapter = t.adapterFile()
  if (adapter) t.pass('a game adapter is registered', adapter)
  else t.fail('a game adapter is registered', ['src/devkit-game/tabs.ts doesn\'t call registerDevKitGame(…), so Snapshots, Bug capture, Pause and these checks can\'t reach the game.'],
    'Write src/devkit-game/<game>Adapter.ts (getState / setState / canRestore / pauseModes, see the Dev Kit README "Plug the game in") and register it in src/devkit-game/tabs.ts.')

  // ---- live tuning (code) ----
  const tuning = t.files({ dirs: ['content/tuning'], exts: /\.json$/ }).map((f) => f.path.replace(/^content\/tuning\//, '').replace(/\.json$/, ''))
  if (!tuning.length) t.skip('every tuning file is read by the game', 'no content/tuning/*.json files')
  else {
    const unread = unreadTuning(tuning, t.gameCode())
    if (unread.length) t.fail('every tuning file is read by the game', unread.map((n) => `content/tuning/${n}.json — no game code imports it, so its sliders change nothing`),
      'Import it where the values are used (import x from \'…/content/tuning/<name>.json\'), or delete the file if it\'s left over.')
    else t.pass('every tuning file is read by the game', `${tuning.length} files`)
  }
  {
    const name = 'no tuning value is copied at load'
    const { copiedAtLoad } = await t.load('src/devkit/tuning/liveGuard.ts')
    const allow = t.json('content/devkit.json')?.liveGuardAllow ?? {}
    const problems = copiedAtLoad(t.files({ dirs: ['src'] }), { allow })
    if (problems.length) t.fail(name, listSome(problems, 'more copies'),
      'Read the value where it\'s used (inside the function or frame that needs it), not once at the top of the file — the Dev Kit\'s sliders can\'t reach a copy. A file that copies on purpose: content/devkit.json "liveGuardAllow": { "src/x.ts": "why" }.')
    else t.pass(name, 'liveGuard: no copies')
  }

  if (t.staticOnly) return t.skip('browser checks', '--static')

  // ---- in the running game ----
  const page = await t.page({ width: 1280, height: 800 })
  try {
    const plugged = await page.evaluate(() => ({ kit: !!window.__devkit, game: window.__devkit?.game()?.name ?? null }))
    if (!plugged.kit) {
      t.fail('the Dev Kit starts in the game', ['window.__devkit is missing after the page loaded — the Dev Kit never mounted.', ...page.errors.slice(0, 3)],
        'src/main.tsx: in dev, import(\'./devkit/mount\').then((m) => m.mountDevKit()) — Dev Kit README, Install step 1.')
      return
    }
    if (!plugged.game) { t.needsPlay('the Dev Kit starts and the game is plugged in', 'noadapter'); return }
    t.pass('the Dev Kit starts and the game is plugged in', plugged.game)

    // Every tuning file live: the same devkit:tuning event the Tuning tab sends; the game's own import must see it
    if (tuning.length) {
      const base = await page.evaluate(() => location.href.split('?')[0].replace(/[^/]*$/, ''))
      const notLive = []
      let tried = 0
      for (const name of tuning) {
        const data = t.json(`content/tuning/${name}.json`)
        const edit = nudged(data)
        if (!edit) continue
        tried++
        const seen = await page.evaluate(async ({ url, name, edit, data }) => {
          try {
            const live = (await import(/* @vite-ignore */ url)).default
            window.dispatchEvent(new CustomEvent('devkit:tuning', { detail: { file: name, data: edit.data } }))
            const got = JSON.stringify(live[edit.key])
            window.dispatchEvent(new CustomEvent('devkit:tuning', { detail: { file: name, data } })) // back as saved
            return got === JSON.stringify(edit.data[edit.key]) ? 'ok' : 'stale'
          } catch (e) { return 'error: ' + (e?.message ?? e) }
        }, { url: `${base}content/tuning/${name}.json?import`, name, edit, data })
        if (seen !== 'ok') notLive.push(`content/tuning/${name}.json — ${seen === 'stale' ? `an edit of "${edit.key}" didn't reach the game's import` : seen}`)
      }
      if (notLive.length) t.fail('every tuning file is live in the running game', notLive,
        'vite.config.ts: plugins: [react(), devkit()] with import { devkit } from \'./vite-plugins/devkit/devkitVite\' — the plugin is what makes content/tuning imports live.')
      else t.pass('every tuning file is live in the running game', `${tried} files: an edit reaches the game's own import${tried < tuning.length ? ` (${tuning.length - tried} with nothing to edit)` : ''}`)
    }

    const playChecks = ['⏸ full pause stops everything', '◐ half pause stops the rules, not the looks', 'a snapshot restores exactly', 'the game\'s hotkeys skip text boxes']
    const reason = await t.startPlay(page)
    if (reason) {
      t.needsPlay(playChecks.join(' · '), reason)
      return
    }
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__devkit.game().getState())))
    const clocks = () => page.evaluate(() => window.__devkit.clocks())
    const setPause = (mode) => page.evaluate((m) => window.__devkit.pause(m), mode)
    const blocked = await page.evaluate(() => window.__devkit.pauseBlocked())
    const suspects = () => listSome(t.linesMatching(t.gameCode(), TIMERS), 'more plain timers in game code')

    // Does play change the state on its own? (A turn-based game waiting for a move doesn't — then "nothing moved while
    // paused" proves little, and the pause checks say so instead of claiming a pass they didn't earn.)
    const before = await state()
    await page.waitForTimeout(700)
    const moves = !!firstDiff(before, await state())
    const provesLittle = 'the state didn\'t change in 0.7 s of play either (waiting for the player?), so this proves little'

    // Pictures nothing can freeze — an animated GIF / WebP / APNG, an SVG's own <animate>, a text box's blinking caret —
    // are hidden while the screen is compared, so they can't fail a game that's frozen fine
    const UNFREEZABLE = 'animated images (GIF / WebP / APNG), SVG <animate>, a focused text box\'s caret'
    const hideUnfreezable = (on) => page.evaluate((hide) => {
      document.getElementById('__framework-check-hide')?.remove()
      if (!hide) return
      document.activeElement?.blur?.()
      const style = document.createElement('style')
      style.id = '__framework-check-hide'
      style.textContent = 'img[src*=".gif" i], img[src*=".webp" i], img[src*=".apng" i], svg:has(animate, animateTransform, animateMotion, set) { visibility: hidden !important; } * { caret-color: transparent !important; }'
      document.head.appendChild(style)
    }, on)

    // ⏸ Full pause
    if (blocked) t.skip(playChecks[0], blocked)
    else {
      await setPause('full')
      await hideUnfreezable(true)
      await page.waitForTimeout(150)
      const [s0, c0, shot0] = [await state(), await clocks(), await page.screenshot()]
      await page.waitForTimeout(700)
      const [s1, c1, shot1] = [await state(), await clocks(), await page.screenshot()]
      await hideUnfreezable(false)
      await setPause(null)
      const problems = []
      if (Math.abs(c1.rules - c0.rules) > 1 || Math.abs(c1.looks - c0.looks) > 1) problems.push(`the clocks moved while frozen (rules +${Math.round(c1.rules - c0.rules)} ms, looks +${Math.round(c1.looks - c0.looks)} ms)`)
      const diff = firstDiff(s0, s1)
      if (diff) problems.push(`the game's state changed in 0.7 s of full pause — ${diff}`, 'Something in game logic runs on a plain timer the freeze can\'t hold. Suspects:', ...suspects().map((l) => '  ' + l))
      else if (!shot0.equals(shot1)) problems.push(`the screen still moved in 0.7 s of full pause (the state didn't) — a picture driven by a plain timer, setInterval or performance.now(). (Already left out of the comparison: ${UNFREEZABLE}.)`)
      if (problems.length) t.fail(playChecks[0], problems,
        'Game logic timers → rulesClock.after / every (src/devkit/gameClock.ts); presentation time → looksClock.now(); never setTimeout / setInterval / performance.now() for anything that moves.')
      else t.pass(playChecks[0], moves ? 'screen, both clocks and the game\'s state stood still for 0.7 s' : `clocks and screen stood still — but ${provesLittle}`)
    }

    // ◐ Half pause
    const canHalf = await page.evaluate(() => window.__devkit.canHalf())
    if (blocked) t.skip(playChecks[1], blocked)
    else if (!canHalf) t.fail(playChecks[1], ['◐ Half pause isn\'t offered: the game never reads rulesClock and its adapter doesn\'t list pauseModes: [\'full\', \'half\'].'],
      'Tick the game by dt × rulesClock.rate and put game-logic timers on rulesClock.after / every (src/devkit/gameClock.ts) — then half pause works on its own.')
    else {
      await setPause('half')
      await page.waitForTimeout(150)
      const [s0, c0] = [await state(), await clocks()]
      await page.waitForTimeout(1000)
      const [s1, c1] = [await state(), await clocks()]
      await setPause(null)
      const problems = []
      if (Math.abs(c1.rules - c0.rules) > 1) problems.push(`the rules clock moved while half-paused (+${Math.round(c1.rules - c0.rules)} ms)`)
      if (c1.looks - c0.looks < 500) problems.push(`the looks clock stood still while half-paused (+${Math.round(c1.looks - c0.looks)} ms in 1 s)`)
      const diff = firstDiff(s0, s1)
      if (diff) problems.push(`the game's state changed in 1 s of half pause — ${diff}`, 'Game logic is still running on its own time. Suspects (plain timers in game code):', ...suspects().map((l) => '  ' + l))
      if (problems.length) t.fail(playChecks[1], problems,
        'Tick the engine by dt × rulesClock.rate (not plain dt), and game-logic timers on rulesClock.after / every — src/devkit/gameClock.ts.')
      else t.pass(playChecks[1], moves ? `state + rules clock still for 1 s, looks clock ran ${Math.round(c1.looks - c0.looks)} ms` : `rules clock still, looks clock ran — but ${provesLittle}`)
    }

    // A snapshot restores exactly — compared while paused (half if the game can, else full), so play can't move on
    // between the restore and the read
    const canRestore = await page.evaluate(() => { try { return window.__devkit.game().canRestore() } catch { return false } })
    if (!canRestore) t.skip(playChecks[2], 'canRestore() is false (an online game)')
    else {
      const saved = await state()
      await page.waitForTimeout(700)
      const mode = canHalf ? 'half' : 'full'
      const result = await page.evaluate(async ({ s, mode }) => {
        const kit = window.__devkit, game = kit.game()
        kit.pause(mode)
        if (kit.paused() !== mode) return { unpaused: kit.pauseBlocked() || `the Dev Kit couldn't ${mode}-pause the game` }
        try { game.setState(s) } catch (e) { return { error: e?.message ?? String(e) } }
        await new Promise((r) => setTimeout(r, 300)) // a restore may finish a moment later
        return { after: JSON.parse(JSON.stringify(game.getState())) }
      }, { s: saved, mode })
      if (result.unpaused) t.skip(playChecks[2], `${result.unpaused} — so play would move on between the restore and the check`)
      else if (result.error) t.fail(playChecks[2], [`setState(getState()) threw: ${result.error}`], `${adapter}: setState must take back anything getState() gave.`)
      else {
        const diff = firstDiff(saved, result.after)
        if (diff) t.fail(playChecks[2], [`restoring a moment gave a different moment — ${diff}`], `${adapter}: setState must put back everything getState() saved (and getState must save everything that matters).`)
        else t.pass(playChecks[2], `getState → play 0.7 s → setState (${mode}-paused) → the same moment${moves ? '' : ` — but ${provesLittle}`}`)
      }
      await setPause(null)

      // The game's hotkeys skip text boxes — in live play (games ignore keys while paused). The sign a handler took a
      // key: it called preventDefault (games do, for their keys). In a text box first, then outside one (a key there
      // may leave play — the moment is restored after each)
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyS', 'KeyW', 'KeyQ', 'KeyE', 'KeyR', 'KeyZ', 'KeyX', 'KeyC', 'KeyH']
      const press = async () => { for (const k of keys) await page.keyboard.press(k) }
      const restore = async (s) => { await page.evaluate((x) => { window.__devkit.game().setState(x); window.__devkit.pause(null) }, s); await page.waitForTimeout(200) }
      await page.evaluate(() => {
        if (window.__frameworkKeys) return
        window.__frameworkKeys = []
        const original = KeyboardEvent.prototype.preventDefault
        KeyboardEvent.prototype.preventDefault = function () {
          window.__frameworkKeys.push({ key: this.key === ' ' ? 'Space' : this.key, inBox: this.target?.id === '__framework-check-box' })
          return original.call(this)
        }
      })
      const taken = (inBox) => page.evaluate((b) => [...new Set(window.__frameworkKeys.splice(0).filter((k) => k.inBox === b).map((k) => k.key))], inBox)
      await restore(saved)
      await page.evaluate(() => {
        window.__frameworkKeys.length = 0
        const box = document.createElement('input')
        box.id = '__framework-check-box'
        box.style.cssText = 'position:fixed;left:0;top:0;width:200px;z-index:2147483646'
        document.body.appendChild(box)
        box.focus()
      })
      await press(); await page.waitForTimeout(150)
      const inBox = await taken(true)
      const typed = await page.evaluate(() => { const b = document.getElementById('__framework-check-box'); const v = b.value; b.remove(); return v })
      await restore(saved)
      await page.evaluate(() => { window.__frameworkKeys.length = 0; document.activeElement?.blur?.() })
      await press(); await page.waitForTimeout(150)
      const outside = await taken(false)
      await restore(saved)
      const problems = []
      if (inBox.length) problems.push(`the game's key handler took ${inBox.join(', ')} typed in a text box (it called preventDefault on them)`)
      if (typed.replace(/\s/g, '').length < 10) problems.push(`the letters didn't reach the text box (it got "${typed}")`)
      const handlers = listSome(t.linesMatching(t.gameCode(), /addEventListener\(\s*['"]key(down|up|press)['"]|onKey(Down|Up)\s*=/))
      if (problems.length) t.fail(playChecks[3], [...problems, 'Key handlers in game code:', ...handlers.map((l) => '  ' + l)],
        'At the top of each game key handler: if (e.target instanceof HTMLElement && e.target.closest(\'input, textarea, select, [contenteditable]\')) return')
      else if (outside.length) t.pass(playChecks[3], `outside a text box the game takes ${outside.join(' ')}; inside one, none`)
      else t.pass(playChecks[3], 'the game took none of the test keys anywhere (so this proves little)')
    }
    await badgeCheck(t)
    if (page.errors.length) t.fail('no errors in the console', listSome(page.errors), 'Fix the errors above (they happened while the checks ran).')
  } finally {
    await page.close()
  }
}

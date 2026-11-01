// THE AI MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Table / AI": AI seats think on the rules clock (◐ Half pause stops a bot mid-think) and their
// personalities live in content/ai/. (The Personality Check, check.ts, is a balance tool the game runs on purpose —
// not a wiring promise, so it isn't run here.)
// Banter (F22): every personality with chattiness > 0 has lines (content/text/en.json banter.<personality>.<moment>,
// for the moments content/ai/banter.json names), no line's words are typed into the game's code, and the chatty bots
// are wired (botBanter made and fed hear(events)).
export const title = 'AI'

export async function check(t) {
  {
    const name = 'personalities live in content/ai/'
    const files = t.files({ dirs: ['content/ai'], exts: /\.json$/ }).map((f) => f.path)
    if (files.length) t.pass(name, files.map((f) => f.replace('content/ai/', '')).join(', '))
    else t.fail(name, ['No content/ai/*.json — the bots\' personalities, skills and pace belong there (the Dev Kit\'s AI tab edits them).'],
      'Move each personality (traits, goal order, bio) and the pace into content/ai/*.json and read them from there.')
  }
  {
    const name = 'bots wait on the rules clock (half pause stops a bot mid-think)'
    const code = t.gameCode()
    const handsOver = t.linesMatching(code, /\bsetPaceClock\s*\(\s*rulesClock\b/)
    // Bot code = files that work out a bot's think-moment (thinkDelay / waitLeft), however they import the kit
    // (./ai/kit/pace or the ./ai/kit index). Their plain timers are only a HINT: a file can use setTimeout for other
    // things, so the promise itself is "the clock is handed over"
    const botCode = code.filter((f) => /\b(thinkDelay|waitLeft)\s*\(/.test(f.text))
    const plain = t.linesMatching(botCode, /\b(setTimeout|setInterval)\s*\(|\bperformance\.now\s*\(/)
    const hint = plain.length ? ['Bot code that may still wait on a plain timer (check these):', ...plain.slice(0, 8).map((l) => '  ' + l)] : []
    const fix = `At start-up: import { setPaceClock } from './${t.rel.replace(/^src\//, '')}/pace' and import { rulesClock } from './devkit/gameClock', then setPaceClock(rulesClock). In the bot: paceNow() for "started", botWait(ms, act) instead of setTimeout.`
    if (!handsOver.length) t.fail(name, ['Nothing calls setPaceClock(rulesClock), so bots wait on the browser\'s clock and keep thinking through a pause.', ...hint], fix)
    else t.pass(name, hint.length ? `${handsOver[0]} — hint: ${plain.length} plain-timer line${plain.length === 1 ? '' : 's'} in bot code (${plain[0]})` : handsOver[0])
  }
  await checkBanter(t)
}

// ─── Banter (F22) ───
export const BANTER_CHECKS = {
  lines: 'every chatty personality has lines',
  hardCoded: 'no banter line is hard-coded',
  wired: 'bots talk through the emote module',
  setting: 'the Bot chatter setting is read',
}

/** Comments out, so a how-to comment never counts (strings stay). */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Every personality in content/ai/*.json (files with a "personalities" list). */
function personalitiesOf(t) {
  const out = []
  for (const f of t.files({ dirs: ['content/ai'], exts: /\.json$/ })) {
    let data
    try { data = JSON.parse(f.text) } catch { continue }
    for (const p of Array.isArray(data?.personalities) ? data.personalities : []) {
      if (p && typeof p.id === 'string') out.push({ id: p.id, chattiness: typeof p.chattiness === 'number' ? p.chattiness : 0, file: f.path })
    }
  }
  return out
}

const isLineFor = (key, moment) => key === moment || (key.startsWith(`${moment}_`) && /^\d+$/.test(key.slice(moment.length + 1)))

async function checkBanter(t) {
  const people = personalitiesOf(t)
  const chatty = people.filter((p) => p.chattiness > 0)
  const text = t.json('content/text/en.json')
  const banter = text?.banter && typeof text.banter === 'object' ? text.banter : {}
  const settings = t.json('content/ai/banter.json')
  const moments = settings?.chance && typeof settings.chance === 'object' ? Object.keys(settings.chance).filter((m) => !m.startsWith('_')) : []
  const linesOf = (id) => (Object.prototype.hasOwnProperty.call(banter, id) && banter[id] && typeof banter[id] === 'object' ? banter[id] : {})
  const wordsOf = (id) => Object.entries(linesOf(id)).filter(([, w]) => typeof w === 'string' && w.trim())

  // 1. every personality with chattiness > 0 has lines (in content/text/en.json banter.<personality>.<moment>)
  {
    const name = BANTER_CHECKS.lines
    if (!chatty.length) t.pass(name, people.length ? 'no personality talks (chattiness 0)' : 'no personalities')
    else {
      const problems = []
      if (!text) problems.push('content/text/en.json is missing (or isn\'t valid JSON) — the bots\' lines live there ("banter").')
      if (!settings) problems.push('content/ai/banter.json is missing (or isn\'t valid JSON) — it names the game\'s moments ("chance") and when bots talk (the AI installer gives a starter once).')
      const silent = chatty.filter((p) => !wordsOf(p.id).some(([key]) => moments.some((m) => isLineFor(key, m))))
      for (const p of silent) problems.push(`${p.id} (chattiness ${p.chattiness}, ${p.file}) has no lines for any of the game's moments (${moments.join(', ') || 'none in content/ai/banter.json "chance"'}) in content/text/en.json "banter".`)
      // A line for a moment the game never names is never said (a typo, or a moment that went) — worth knowing
      const stray = chatty.flatMap((p) => wordsOf(p.id).filter(([key]) => !moments.some((m) => isLineFor(key, m))).map(([key]) => `banter.${p.id}.${key} — "${key}" isn't one of the moments in content/ai/banter.json "chance", so it's never said`))
      const fix = 'content/text/en.json: "banter": { "<personality id>": { "<moment>": "…", "<moment>_2": "…" } } — one or more lines per moment the game names (content/ai/banter.json "chance"); the Dev Kit\'s AI tab edits them. Or set the personality\'s chattiness to 0.'
      if (problems.length) t.fail(name, [...problems, ...stray.slice(0, 6)], fix)
      else if (stray.length) t.warn(name, stray.slice(0, 12), fix)
      else t.pass(name, chatty.map((p) => `${p.id} ${wordsOf(p.id).length}`).join(' · '))
    }
  }

  // 2. no line is hard-coded (its words only in content/text/en.json — a translation is just another text file)
  {
    const name = BANTER_CHECKS.hardCoded
    const code = [...t.gameCode(), ...(t.exists('party') ? t.files({ dirs: ['party'] }).filter((f) => !/\.test\./.test(f.path)) : [])]
      .filter((f) => !f.path.startsWith(`${t.rel}/`))
    const words = Object.keys(banter).flatMap((id) => wordsOf(id).map(([, w]) => w.trim())).filter((w) => w.length >= 4)
    const found = []
    for (const f of code) {
      const body = withoutComments(f.text)
      for (const w of new Set(words)) {
        const quoted = new RegExp(`(['"\`>])\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(['"\`<])`)
        if (quoted.test(body)) found.push(`${f.path} — "${w}"`)
      }
    }
    if (found.length) t.fail(name, found.slice(0, 12), 'A bot\'s line is an emote id (banter.<personality>.<moment>), said with botBanter → emotes.say — its words live only in content/text/en.json "banter".')
    else t.pass(name, words.length ? `${words.length} lines' words only in content/text/en.json` : 'no lines yet')
  }

  // 3. the chatty bots are wired: botBanter hears the game's changes (local: src, online: party/)
  {
    const name = BANTER_CHECKS.wired
    if (!chatty.length) t.skip(name, 'no personality talks (chattiness 0)')
    else {
      const code = [...t.gameCode(), ...(t.exists('party') ? t.files({ dirs: ['party'] }).filter((f) => !/\.test\./.test(f.path)) : [])]
      // (botBanter<GameEvent>({ … }) counts too — the scratch Glyphtender proof wrote it that way)
      const makes = code.filter((f) => /\bbotBanter\s*(<[^>()]*>)?\s*\(/.test(withoutComments(f.text))).map((f) => f.path)
      const hears = code.filter((f) => /\.hear\s*\(/.test(withoutComments(f.text))).map((f) => f.path)
      const problems = []
      if (!makes.length) problems.push(`${chatty.map((p) => p.id).join(', ')} ${chatty.length === 1 ? 'has' : 'have'} chattiness > 0, but nothing makes the bots' voice (botBanter) — they never talk.`)
      else if (!hears.length) problems.push(`${makes.join(', ')} make botBanter, but nothing calls its hear(events) after a change — the bots never hear a moment.`)
      if (problems.length) t.fail(name, problems, 'const banter = botBanter({ moments: plug.moments, bots, settings: readBanterSettings(banterJson), lines: () => text.banter, say: (seat, id) => emotes.say(seatIdOf(seat), id).ok, seed }) — then banter.hear(events) after every change (online: in party/server.ts with say: room.emote). The AI README\'s "Banter".')
      else t.pass(name, `${makes[0]} · hear in ${hears[0]}`)
    }
  }

  // 4. (0.5.0) the player's "Bot chatter" (Settings → Off · Some · Lots) reaches the bots — a row that's shown must do
  // something; no row = a warning (Muzzy 2026-10-23: "this is usually a menu setting")
  {
    const name = BANTER_CHECKS.setting
    if (!chatty.length) t.skip(name, 'no personality talks (chattiness 0)')
    else {
      const tabs = t.json('content/ui/settings.json')?.tabs // (a broken file is the UI kit check's to report — never a crash here)
      const rows = (Array.isArray(tabs) ? tabs : []).flatMap((tab) => (Array.isArray(tab?.rows) ? tab.rows : []))
      const row = rows.find((r) => r?.id === 'botChatter' && r.on !== false)
      const code = [...t.gameCode(), ...(t.exists('party') ? t.files({ dirs: ['party'] }).filter((f) => !/\.test\./.test(f.path)) : [])]
        .filter((f) => !f.path.startsWith(`${t.rel}/`))
      const applied = code.filter((f) => /\b(applyBanterSetting|setChatter)\s*\(/.test(withoutComments(f.text))).map((f) => f.path)
      const fix = 'Paste BANTER_SETTINGS_ROWS (src/ai/kit/settingsRow.ts — "Bot chatter": Off · Some · Lots) into a tab\'s rows in content/ui/settings.json, then applyBanterSetting(banter, loadSettings(settingsJson)) when botBanter is made and applyBanterSetting(banter, values) in <Settings onChange>.'
      if (row && !applied.length) t.fail(name, ['Settings shows "Bot chatter", but nothing passes it to the bots (applyBanterSetting(banter, values) or banter.setChatter(level)) — it would do nothing.'], fix)
      else if (!row) t.warn(name, ['No "Bot chatter" row in content/ui/settings.json — players can\'t turn the bots\' talk down or off (they talk at content/ai/banter.json\'s own numbers).'], fix)
      else t.pass(name, `content/ui/settings.json botChatter · ${[...new Set(applied)].join(', ')}`)
    }
  }
}

// THE AI MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Table / AI": AI seats think on the rules clock (◐ Half pause stops a bot mid-think) and their
// personalities live in content/ai/. (The Personality Check, check.ts, is a balance tool the game runs on purpose —
// not a wiring promise, so it isn't run here.)
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
}

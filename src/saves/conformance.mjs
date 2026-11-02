// THE SAVES MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Saves":
//   - every save (createSave) has a golden save in tests/saves/ for each of its versions — so an update that would
//     break an old save is caught before players see it
//   - the game's save tests pass: every golden save loads with today's code, round trip, damaged saves, full storage
//   - a run (createRun) is ended somewhere in the game's code, and its test proves an ended run never comes back
//   - a game that keeps a seed + move record (recordRun) has a test that replays one and compares it (sameResult)
//   - the game's own code saves through the module, not straight into localStorage / sessionStorage
//     (room codes and player ids — the rooms module's "rooms:" keys — are fine; anything else that must stay is
//     listed in content/saves.json "storageAllowed" with why)
export const title = 'Saves'

const GOLDEN_DIR = 'tests/saves'
const SAVE_TEST = 'tests/saves/saves.test.ts'

/** The same file naming as oldSaves.ts goldenFileName: glyphtender:new-game → glyphtender_new-game-v2.json */
export const goldenPrefix = (key) => key.replace(/[^A-Za-z0-9._-]/g, '_') + '-v'

/**
 * Every createSave (and createRun — a run is a save too) in the game's code → { where, key, version, run?, name? }
 * or { where, problem }. key and version are read as plain values in the call (key: 'goops-progress', version: 2), or
 * from a const in the same file (version: VERSION with const VERSION = 2). name = what a run is called in the code
 * (const matchRun = createRun(…)), so the check can look for its end().
 */
export function findSaves(files) {
  const found = []
  for (const { path, text: original } of files) {
    // a createSave named in a comment isn't a save
    const text = withoutComments(original)
    const call = /\bcreate(Save|Run)\s*(<[^>]*>)?\s*\(/g
    let match
    while ((match = call.exec(text))) {
      const line = text.slice(0, match.index).split('\n').length
      const where = `${path}:${line}`
      const run = match[1] === 'Run'
      const body = topLevelOptions(text, match.index + match[0].length)
      const key = valueOf(body.match(/\bkey\s*:\s*([^,\n}]+)/)?.[1], text, 'string')
      const version = valueOf(body.match(/\bversion\s*:\s*([^,\n}]+)/)?.[1], text, 'number')
      if (key === null || version === null) {
        found.push({ where, problem: `${where} — can't read its ${key === null ? 'key' : 'version'}: write it as a plain value in create${match[1]} (key: 'mygame:progress', version: 2) or a const in the same file` })
      } else if (run) {
        const name = text.slice(0, match.index).match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*$/)?.[1] ?? null
        found.push({ where, key, version, run: true, name })
      } else {
        found.push({ where, key, version })
      }
    }
  }
  return found
}

/** The runs whose end() nothing in the game's code calls → the problems (a run never ended comes back as Continue). */
/** Code with its comments blanked out (kept as spaces, so line numbers stay right). */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/^(\s*)\/\/.*$/gm, '$1')
}

export function runsNeverEnded(runs, files) {
  const problems = []
  for (const run of runs) {
    if (!run.name) {
      problems.push(`${run.where} — can't tell what this run is called: give it a name (const matchRun = createRun({ … })) so the check can find its end()`)
      continue
    }
    const ends = new RegExp(`\\b${run.name.replace(/\$/g, '\\$')}\\s*\\??\\.\\s*end\\s*\\(`)
    // (a "// TODO matchRun.end()" isn't a call — review F93)
    if (!files.some((f) => ends.test(withoutComments(f.text)))) problems.push(`"${run.key}" (${run.where}): nothing calls ${run.name}.end() — a game that's won, lost or abandoned would come back as Continue`)
  }
  return problems
}

/**
 * The options object's OWN top level, from just after "createSave(" to its closing ")": anything nested deeper
 * (fresh: { version: 9 }) is blanked out, and nothing after the call is read (a neighbour's `version: 5`).
 * Strings are skipped over whole, so a bracket inside one doesn't count.
 */
function topLevelOptions(text, start) {
  let depth = 0
  let out = ''
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      let end = i + 1
      while (end < text.length && text[end] !== ch) end += text[end] === '\\' ? 2 : 1
      out += depth === 1 ? text.slice(i, end + 1) : ' '
      i = end
      continue
    }
    if (ch === '(' || ch === '{' || ch === '[') depth++
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) break // the call's own ")"
      depth--
    }
    out += depth === 1 ? ch : ' '
  }
  return out
}

/** 'goops-progress' → the string · 2 → 2 · NAME → the value of `const NAME = …` in the same file · else null */
function valueOf(expression, text, kind) {
  const raw = expression?.trim()
  if (!raw) return null
  const literal = kind === 'string' ? raw.match(/^(['"`])([^'"`$]+)\1$/)?.[2] : raw.match(/^(\d+)$/)?.[1]
  if (literal !== undefined) return kind === 'string' ? literal : Number(literal)
  if (!/^[A-Za-z_$][\w$]*$/.test(raw)) return null
  const constant = text.match(new RegExp(`\\bconst\\s+${raw}\\s*(?::[^=]+)?=\\s*([^\\n;]+)`))?.[1]
  return constant && constant.trim() !== raw ? valueOf(constant, '', kind) : null
}

/** The versions 1…version with no golden file for this key. */
export function missingVersions(key, version, fileNames) {
  const prefix = goldenPrefix(key)
  const have = new Set(fileNames.map((name) => name.replace(/^.*\//, '')).filter((n) => n.startsWith(prefix) && n.endsWith('.json'))
    .map((n) => Number(n.slice(prefix.length).match(/^(\d+)(-.*)?\.json$/)?.[1])).filter(Boolean))
  return Array.from({ length: version }, (_, i) => i + 1).filter((v) => !have.has(v))
}

export async function check(t) {
  // (this module's own copy is left out: an older Dev Kit's gameCode() still hands it over, and its createSave /
  //  createRun calls — run.ts, nudge.ts, the examples in comments of this file — aren't the game's saves)
  const code = t.gameCode().filter((f) => !f.path.startsWith(`${t.rel}/`))
  const saves = findSaves(code)
  {
    const name = 'every save has a golden copy for each version'
    if (!saves.length) {
      t.skip(name, 'no createSave in the game\'s code yet')
    } else {
      const goldens = t.files({ dirs: [GOLDEN_DIR], exts: /\.json$/ }).map((f) => f.path)
      const problems = []
      for (const save of saves) {
        if (save.problem) { problems.push(save.problem); continue }
        for (const v of missingVersions(save.key, save.version, goldens)) problems.push(`"${save.key}" (${save.where}) has no golden save for version ${v} → ${GOLDEN_DIR}/${goldenPrefix(save.key)}${v}.json`)
      }
      if (problems.length) t.fail(name, problems.slice(0, 16), `Add a real save from each version to ${GOLDEN_DIR}/ (README: Golden saves): { "about": "…", "stored": <the browser's stored value for the key>, "expect": { …values it must load with } }.`)
      else t.pass(name, saves.map((s) => `${s.key} v1–${s.version}`).join(' · '))
    }
  }
  {
    const name = 'the game\'s save tests pass (golden saves, round trip, damaged saves, full storage)'
    if (!saves.length) t.skip(name, 'no createSave in the game\'s code yet')
    else if (!t.exists(SAVE_TEST)) t.fail(name, [`${SAVE_TEST} is missing.`], `Run the saves installer again (it gives the starter once): ${'node <framework>/saves/scripts/install-saves.mjs .'}`)
    else if (!t.exists('node_modules/vitest')) t.skip(name, 'the game has no vitest')
    else {
      const run = t.run('npx', ['vitest', 'run', SAVE_TEST])
      if (run.code === 0) t.pass(name, SAVE_TEST)
      else t.fail(name, [`npx vitest run ${SAVE_TEST} failed:`, ...run.out.split(/\r?\n/).filter((l) => l.trim()).slice(-14).map((l) => '  ' + l)], `Run it yourself (npx vitest run ${SAVE_TEST}) — each failure names the save and what didn't load.`)
    }
  }
  {
    const name = 'a run cleared at the end never comes back'
    const runs = saves.filter((s) => s.run)
    if (!runs.length) {
      t.skip(name, 'no createRun in the game\'s code')
    } else {
      const problems = runsNeverEnded(runs, code)
      const testText = t.exists(SAVE_TEST) ? t.read(SAVE_TEST) : ''
      if (!/\bcheckRunEnds\s*\(/.test(testText)) problems.push(`${SAVE_TEST} doesn't run checkRunEnds — list each run in RUNS (the installer's newer starter has it: copy its RUNS part)`)
      for (const run of runs) {
        if (run.name && testText && !new RegExp(`\\b${run.name.replace(/\$/g, '\\$')}\\b`).test(testText)) problems.push(`"${run.key}": ${run.name} isn't listed in ${SAVE_TEST} RUNS`)
      }
      if (problems.length) t.fail(name, problems.slice(0, 12), 'Call run.end() when the game is won, lost or abandoned (and before a New game), and list the run in tests/saves/saves.test.ts RUNS — its test then proves end() leaves no copy behind.')
      else t.pass(name, runs.map((r) => `${r.key}: ${r.name}.end()`).join(' · '))
    }
  }
  {
    const name = 'the game saves through the module, not straight into the browser\'s storage'
    const settings = t.json('content/saves.json')
    const allowed = Array.isArray(settings?.storageAllowed) ? settings.storageAllowed.map((a) => (typeof a === 'string' ? a : a?.file)).filter(Boolean) : []
    const direct = t.linesMatching(code, /\b(localStorage|sessionStorage)\b/)
      .filter((line) => !line.startsWith(`${t.rel}/`)) // this module's own copy (an older Dev Kit doesn't know to skip it)
      .filter((line) => !/['"`]rooms:/.test(line)) // the rooms module's ids
      .filter((line) => !allowed.some((file) => line.startsWith(`${file}:`)))
    const problems = []
    if (!settings) problems.push('content/saves.json is missing (or isn\'t valid JSON) — the installer gives a starter once.')
    if (direct.length) problems.push('Game code uses the browser\'s storage directly (no version, no backups, no save code):', ...direct.map((l) => '  ' + l))
    if (problems.length) t.fail(name, problems.slice(0, 20), 'Move each onto createSave (src/saves). One that must stay (e.g. a room code, until F95) → list its file in content/saves.json "storageAllowed": [{ "file": "src/…", "why": "…" }].')
    else t.pass(name, allowed.length ? `${allowed.length} file${allowed.length === 1 ? '' : 's'} allowed in content/saves.json` : 'no direct storage use')
  }
  {
    // Layer 3 (0.4.0): a record is only worth keeping if replaying it gives back the SAME game — a rule that reads the
    // clock or Math.random would make Continue land on a different board. Only a test that replays and compares proves it.
    const name = 'a game kept as seed + moves has a replay test'
    // (recordRun<GameSetup, Action>({ … }) counts too — Glyphtender's record.ts writes it with its types)
    // (types may nest — recordRun<Foo<Bar>, A>( — so anything up to the "(" counts; review F94)
    const called = (name, text) => new RegExp(`\\b${name}\\s*(<[\\s\\S]*?>)?\\s*\\(`).test(withoutComments(text))
    const keeps = code.filter((f) => called('recordRun', f.text))
    if (!keeps.length) {
      t.skip(name, 'no recordRun in the game\'s code')
    } else {
      const tests = t.files({ dirs: ['tests', 'src'], skip: [t.rel] }).filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path))
      // (a replay only in a comment doesn't count; replayRun<S, A, Setup>( does — review F94)
      const replays = tests.filter((f) => called('replayRun', f.text) && called('sameResult', f.text))
      if (replays.length) t.pass(name, replays.map((f) => f.path).join(' · '))
      else t.fail(name, [`${keeps.map((f) => f.path).join(', ')} keep${keeps.length === 1 ? 's' : ''} a record (recordRun), but no test replays one and compares it with the live game.`], 'Add a test that plays a game the way the screen does (people + AI moves into the record), then replayRun(rules, record, { rulesVersion }) and expect sameResult(live, replayed, fingerprint) — after every move if you can (README → Seed + move log).')
    }
  }
}

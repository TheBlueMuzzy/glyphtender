// GOLDEN GAMES (F29) — proves a rebuild still plays exactly the same.
//   npm run golden:record   plays 300 seeded sim games and writes them to golden/ (only when the rules are MEANT to change)
//   npm run check:golden    replays every golden game through today's engine; says the first game + move that differs
// 2, 3 and 4 players × small and large boards × random and greedy players × 25 seeds = 300 games.
// The games also depend on the word list, the boards and the rule numbers — golden/inputs.json fingerprints those,
// so a change there is reported as "the inputs changed" rather than as a broken rebuild.
// The engine itself is src/engine/golden.ts (loaded through Vite, like npm run sim).
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { runnerImport } from 'vite'

const SEEDS_PER_SET = 25
const SETS = []
for (const players of [2, 3, 4]) for (const board of ['small', 'large']) for (const player of ['random', 'greedy']) SETS.push({ players, board, player })

const mode = process.argv[2] === 'record' ? 'record' : 'check'
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const golden = await load('/src/engine/golden.ts')
const words = await load('/src/engine/words.ts')
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const wordList = words.parseWordList(read('public/words/words.csv'))
const INPUT_FILES = ['public/words/words.csv', 'content/data/boards.json', 'content/tuning/rules.json']
// JSON files are compared by their values (not spacing, and not the Dev Kit's _labels / _sections notes).
const values = (f) => (f.endsWith('.json') ? JSON.stringify(JSON.parse(read(f)), (k, v) => (k.startsWith('_') ? undefined : v)) : read(f).replace(/\r\n/g, '\n'))
const inputs = Object.fromEntries(INPUT_FILES.map((f) => [f, golden.hashText(values(f))]))
const DIR = new URL('../golden/', import.meta.url)
const fileOf = (s) => `${s.players}p-${s.board}-${s.player}.json`
const started = Date.now()

if (mode === 'record') {
  mkdirSync(DIR, { recursive: true })
  for (const set of SETS) {
    const games = []
    for (let i = 1; i <= SEEDS_PER_SET; i++) games.push(golden.recordGame(set.players, set.board, i * 7919, set.player, wordList))
    // One game per line: small diffs in git, and still readable.
    writeFileSync(new URL(fileOf(set), DIR), '[\n' + games.map((g) => JSON.stringify(g)).join(',\n') + '\n]\n')
    console.log(`recorded ${fileOf(set)} — ${games.length} games, ${games.reduce((n, g) => n + g.steps.length, 0)} actions`)
  }
  writeFileSync(new URL('inputs.json', DIR), JSON.stringify(inputs, null, 2) + '\n')
  console.log(`\nRecorded ${SETS.length * SEEDS_PER_SET} golden games in ${((Date.now() - started) / 1000).toFixed(1)} s.`)
} else {
  let saved
  try {
    saved = JSON.parse(readFileSync(new URL('inputs.json', DIR), 'utf8'))
  } catch {
    console.log('No golden games yet — run: npm run golden:record')
    process.exit(1)
  }
  const changedInputs = INPUT_FILES.filter((f) => saved[f] !== inputs[f])
  if (changedInputs.length) {
    console.log(`The game's inputs changed since the golden games were recorded: ${changedInputs.join(', ')}.`)
    console.log('Golden games only prove the CODE plays the same. If the change was meant, re-record: npm run golden:record')
    process.exit(1)
  }
  const expected = SETS.map(fileOf)
  const found = readdirSync(DIR).filter((f) => f !== 'inputs.json')
  const missing = expected.filter((f) => !found.includes(f))
  if (missing.length) {
    console.log(`Golden game files missing: ${missing.join(', ')} — re-record: npm run golden:record`)
    process.exit(1)
  }
  let games = 0
  let actions = 0
  const problems = []
  for (const file of expected) {
    for (const game of JSON.parse(readFileSync(new URL(file, DIR), 'utf8'))) {
      games++
      actions += game.steps.length
      const problem = golden.replayGame(game, wordList)
      if (problem) problems.push(problem)
    }
  }
  const time = `${((Date.now() - started) / 1000).toFixed(1)} s`
  if (problems.length === 0) {
    console.log(`SAME — all ${games} golden games (${actions} actions) replay identically. (${time})`)
  } else {
    console.log(`DIFFERENT — ${problems.length} of ${games} golden games play differently now (first difference in each):`)
    for (const p of problems.slice(0, 20)) console.log('  ' + p)
    if (problems.length > 20) console.log(`  …and ${problems.length - 20} more`)
    process.exit(1)
  }
}

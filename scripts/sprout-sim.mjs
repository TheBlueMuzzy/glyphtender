// npm run sim:sprout — Sprout (the hidden tutorial AI, F75) vs a player-like AI on Small, 2-letter words off.
// Reports what its habits did (design/tutorial.md §5): how often it tangled ONE of its own glyphlings, on which of its
// turns, next to the rival's pieces?, how often it made the game-ending second tangle, who won, how long games were.
// Its settings: content/ai/personalities.json (Sprout) · skills.json (Seedling) · content/tuning/tutorial.json.
// Options:
//   --games 300                      how many games
//   --rival Survivor/Apprentice      the rival's personality/skill
//   --seed 5000                      the first game's seed (game n plays seed + n)
//   --jobs 4                         games played side by side (each in its own Node process)
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runnerImport } from 'vite'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const games = Number(arg('games', 300))
const [personality, skill] = arg('rival', 'Survivor/Apprentice').split('/')
const seed = Number(arg('seed', 5000))
const jobs = Number(arg('jobs', 4))
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const sim = await load('/src/ai/sproutSim.ts')

// A child process plays one slice and prints its games as JSON.
if (process.argv.includes('--slice')) {
  const words = (await load('/src/engine/words.ts')).parseWordList(readFileSync(new URL('../public/words/words.csv', import.meta.url), 'utf8'))
  const played = sim.playSproutGames(words, { games, rival: { personality, skill }, firstSeed: seed })
  process.stdout.write(JSON.stringify(played))
  process.exit(0)
}

const started = Date.now()
const per = Math.ceil(games / jobs)
let done = 0
const slices = Array.from({ length: jobs }, (_, j) => ({ from: seed + j * per, count: Math.max(0, Math.min(per, games - j * per)) })).filter((s) => s.count > 0)
const results = await Promise.all(slices.map((s) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--slice', '--games', String(s.count), '--seed', String(s.from), '--rival', `${personality}/${skill}`])
  let out = ''
  child.stdout.on('data', (d) => (out += d))
  child.stderr.on('data', (d) => process.stderr.write(d))
  child.on('close', (code) => {
    if (code !== 0) return reject(new Error(`a slice failed (exit ${code})`))
    done += s.count
    process.stdout.write(`\r${done}/${games} games`)
    resolve(JSON.parse(out))
  })
})))
const all = results.flat()
const s = sim.sproutSummary(all)
console.log(`\n\nSprout (Seedling) vs ${personality} (${skill}) · Small · 2-letter words off · ${s.games} games · ${Math.round((Date.now() - started) / 1000)} s\n`)
const rows = [
  ['Sprout tangled ONE of its glyphlings', `${s.selfTangledPct}% of games`],
  ['…median of its own turns when it did', `${s.medianSelfTangleTurn ?? '—'}`],
  ['…next to the rival\'s pieces', `${s.nextToRivalPct}% of those`],
  ['Sprout made the game-ending 2nd tangle', `${s.endedBySelfTanglePct}% of games`],
  ['Sprout ended the game at all', `${s.endedBySproutPct}% of games`],
  [`${personality} won`, `${s.rivalWonPct}%`],
  ['Sprout won', `${s.sproutWonPct}%`],
  ['Median game length', `${s.medianTurns} turns (both players) · ${s.medianOwnTurns} of Sprout's`],
]
for (const [k, v] of rows) console.log(`  ${k.padEnd(42)} ${v}`)

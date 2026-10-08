// npm run ai:arena — AI-vs-AI games + the Personality Check (F40 / F45).
// Loads the TypeScript engine + AI through Vite (like npm run sim). Writes the report page to e2e-shots/ai-check.html.
// Options:
//   --games 60          mixed tables (2–4 players, personalities shuffled) at the main skill
//   --skill FirstClass  the main skill
//   --seats Strategist,Scholar   play only these, every game (instead of mixed tables)
//   --ladder 6          for each personality, N two-player games of its Archmage vs its Apprentice (skill ladder); 0 = skip
//   --board auto        the game's default board for that many players (content/data/boards.json); or small / large
//   --notes             print every decision note of the first game
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { runnerImport } from 'vite'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(`--${name}`)
const games = Number(arg('games', 60))
const mainSkill = arg('skill', 'FirstClass')
const ladderGames = Number(arg('ladder', 6))
const boardArg = arg('board', 'auto')

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const arena = await load('/src/ai/arena.ts')
const { defaultBoardFor } = await load('/src/engine/boards.ts')
const bot = await load('/src/engine/bot.ts')
const words = (await load('/src/engine/words.ts')).parseWordList(readFileSync(new URL('../public/words/words.csv', import.meta.url), 'utf8'))
const { reportHtml } = await load('/src/ai/kit/report.ts')
const { meterNames } = await load('/src/ai/meters.ts')
const json = (p) => JSON.parse(readFileSync(new URL(`../content/ai/${p}`, import.meta.url), 'utf8'))
const personalities = json('personalities.json').personalities
const skills = json('skills.json').skills
const targets = json('feel-targets.json')
if (typeof bot.aiBot !== 'function') throw new Error('src/engine/bot.ts has no aiBot yet (F39) — nothing to play with')

const skillById = Object.fromEntries(skills.map((s) => [s.id, s]))
if (!skillById[mainSkill]) throw new Error(`No skill "${mainSkill}" in content/ai/skills.json (${skills.map((s) => s.id).join(', ')})`)
const only = arg('seats', '')
  .split(',')
  .filter(Boolean)
  .map((id) => personalities.find((p) => p.id.toLowerCase() === id.toLowerCase()) ?? (() => { throw new Error(`No personality "${id}"`) })())
const makeBot = (s, onNote) => bot.aiBot(s.personality, s.skill, words, (d) => onNote(d.note))
const boardFor = (n) => (boardArg === 'auto' ? defaultBoardFor(n) : boardArg)

// A small seeded shuffle so the same run always seats the same tables.
let pos = 12345
const rand = () => ((pos = (pos * 1103515245 + 12345) % 2147483648) / 2147483648)
const shuffled = (xs) => xs.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

const played = []
const started = Date.now()
for (let g = 0; g < games; g++) {
  const n = only.length || 2 + (g % 3)
  // n seats: every personality once, then repeats (there are 3 personalities, so a 4-player table has one twice)
  const table = only.length ? only : shuffled(Array.from({ length: n }, (_, i) => personalities[i % personalities.length]))
  const seats = table.map((p) => ({ personality: p, skill: skillById[mainSkill] }))
  played.push(arena.playArenaGame(seats, boardFor(n), 1000 + g, words, makeBot))
  process.stdout.write(`\rmixed games ${g + 1}/${games}`)
}
const ladder = []
if (ladderGames > 0 && skillById.Archmage && skillById.Apprentice) {
  for (const p of only.length ? only : personalities) {
    for (let g = 0; g < ladderGames; g++) {
      const seats = [{ personality: p, skill: skillById.Archmage }, { personality: p, skill: skillById.Apprentice }]
      ladder.push(arena.playArenaGame(g % 2 ? seats.reverse() : seats, boardFor(2), 5000 + g, words, makeBot))
    }
    process.stdout.write(`\rskill ladder ${p.id}            `)
  }
}
console.log(`\n${played.length + ladder.length} games in ${((Date.now() - started) / 1000).toFixed(0)} s`)

// Decision times (this machine; a phone is roughly 4× slower).
const ms = [...played, ...ladder].flatMap((g) => g.decisionMs).sort((a, b) => a - b)
const at = (q) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]?.toFixed(0)
console.log(`decision time: median ${at(0.5)} ms · 90% ${at(0.9)} ms · slowest ${at(1)} ms (phone ≈ ×4)`)

// Per-personality meter averages (main skill only).
const rows = arena.toResults(played)
const ids = [...new Set(rows.flatMap((r) => r.seats.map((s) => s.personality)))]
const shown = ['won', 'tanglesCaused', 'rivalTangledThisGame', 'nearRivalShare', 'rivalMovesCut', 'avgWordLength', 'multiWordShare', 'steals', 'setups', 'gotTangled', 'roomToMove', 'calledIt']
  .filter((m) => m === 'won' || m in meterNames)
console.log('\n' + ['personality'.padEnd(11), ...shown.map((m) => m.slice(0, 9).padStart(10))].join(''))
for (const id of ids) {
  const seats = rows.flatMap((r) => r.seats).filter((s) => s.personality === id)
  const avg = (m) => seats.reduce((n, s) => n + (m === 'won' ? s.won : s.meters[m] ?? 0), 0) / seats.length
  console.log([id.padEnd(11), ...shown.map((m) => avg(m).toFixed(2).padStart(10))].join(''))
}

const tellMeters = Object.keys(meterNames).filter((m) => !['won', 'calledItRight', 'awards'].includes(m))
const report = arena.personalityCheck([...played, ...ladder], targets, ['Apprentice', 'FirstClass', 'Archmage'], tellMeters, `${played.length} mixed games at ${mainSkill} (2–4 players) + ${ladder.length} skill-ladder games · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, mainSkill)
mkdirSync(new URL('../e2e-shots/', import.meta.url), { recursive: true })
writeFileSync(new URL('../e2e-shots/ai-check.html', import.meta.url), reportHtml(report))
const feelPass = Object.values(report.feel).flat()
console.log(`\nfeel targets: ${feelPass.filter((t) => t.pass).length}/${feelPass.length} green · tell-apart ${Math.round(report.tell.overall * 100)}% · for-all checks ${report.all.filter((a) => a.pass).length}/${report.all.length}`)
console.log('report: e2e-shots/ai-check.html')
if (has('notes')) console.log('\n' + played[0].notes.join('\n'))

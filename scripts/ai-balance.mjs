// npm run ai:balance — AI-vs-AI games that settle GDD §9 (F46): board size per player count, bag run-out, first-player edge.
// Plays every row (players × board) with the real AI, personalities shuffled per seat so seat order isn't mixed up with
// who's playing. Loads the TypeScript engine + AI through Vite (like npm run ai:arena). Spreads the games over several
// node processes (each plays every Kth game; the seeds don't depend on that, so the same run always plays the same games).
// Writes every game's facts to e2e-shots/ai-balance.json and prints the tables.
// Options:
//   --games 150        games per row
//   --board both       small / large / both
//   --players 2,3,4    player counts
//   --skill FirstClass every seat's skill (content/ai/skills.json)
//   --jobs 12          node processes playing at once
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const games = Number(arg('games', 150))
const boardArg = arg('board', 'both')
const boards = boardArg === 'both' ? ['small', 'large'] : [boardArg]
const playerCounts = arg('players', '2,3,4').split(',').map(Number)
const skillId = arg('skill', 'FirstClass')
const jobs = Number(arg('jobs', Math.max(1, Math.min(12, cpus().length - 2))))
const worker = arg('worker', null) // set by the parent: which share of the games this process plays

const rows = playerCounts.flatMap((players) => boards.map((board) => ({ players, board })))
const json = (p) => JSON.parse(readFileSync(new URL(`../content/ai/${p}`, import.meta.url), 'utf8'))
const personalities = json('personalities.json').personalities

// A small seeded shuffle per game, so who sits where only depends on the game's seed.
const seededShuffle = (xs, seed) => {
  let pos = seed
  const rand = () => ((pos = (pos * 1103515245 + 12345) % 2147483648) / 2147483648)
  return xs.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
}
/** Who sits where: every personality once (4 players: all three + one more picked at random), in a shuffled order. */
const tableFor = (players, seed) => {
  const extra = players > personalities.length ? seededShuffle(personalities, seed + 1).slice(0, players - personalities.length) : []
  return seededShuffle([...personalities, ...extra], seed).slice(0, players)
}
const seedFor = (rowIndex, g) => 100000 + rowIndex * 10000 + g

if (worker !== null) {
  // ── A worker: play its share of the games, print them as JSON ──
  const { runnerImport } = await import('vite')
  const root = fileURLToPath(new URL('..', import.meta.url))
  const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
  const arena = await load('/src/ai/arena.ts')
  const bot = await load('/src/engine/bot.ts')
  const words = (await load('/src/engine/words.ts')).parseWordList(readFileSync(new URL('../public/words/words.csv', import.meta.url), 'utf8'))
  const skill = json('skills.json').skills.find((s) => s.id === skillId)
  if (!skill) throw new Error(`No skill "${skillId}" in content/ai/skills.json`)
  const makeBot = (s, onNote) => bot.aiBot(s.personality, s.skill, words, (d) => onNote(d.note))
  const out = []
  let i = 0
  for (const [rowIndex, row] of rows.entries()) {
    for (let g = 0; g < games; g++, i++) {
      if (i % jobs !== Number(worker)) continue
      const seed = seedFor(rowIndex, g)
      const seats = tableFor(row.players, seed).map((personality) => ({ personality, skill }))
      const played = arena.playArenaGame(seats, row.board, seed, words, makeBot)
      const ms = played.decisionMs
      out.push({ seed, personalities: seats.map((s) => s.personality.id), ...played.facts, slowestMs: Math.round(Math.max(...ms)), avgMs: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) })
      process.stderr.write('.')
    }
  }
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

// ── The parent: start the workers, gather every game ──
const started = Date.now()
const total = rows.length * games
console.log(`${total} games (${games} per row × ${rows.length} rows) at ${skillId}, ${jobs} processes`)
let done = 0
const passOn = process.argv.slice(2)
const results = await Promise.all(
  Array.from({ length: jobs }, (_, w) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...passOn, '--jobs', String(jobs), '--worker', String(w)])
      let text = ''
      child.stdout.on('data', (d) => (text += d))
      child.stderr.on('data', (d) => {
        // progress dots (a chunk may also carry other text, e.g. a Vite warning — only whole runs of dots count)
        const dots = (String(d).match(/^\.+$|(?<=^|\s)\.+(?=\s|$)/gm) ?? []).join('').length
        if (dots) {
          done += dots
          const mins = (Date.now() - started) / 60000
          process.stdout.write(`\r${done}/${total} games · ${mins.toFixed(1)} min · ~${((mins / done) * (total - done)).toFixed(1)} min left   `)
        } else process.stderr.write(d)
      })
      child.on('close', (code) => (code === 0 ? resolve(JSON.parse(text)) : reject(new Error(`worker ${w} stopped (code ${code})`))))
    }),
  ),
)
const played = results.flat().sort((a, b) => a.seed - b.seed)
console.log(`\n${played.length} games in ${((Date.now() - started) / 60000).toFixed(1)} min`)
mkdirSync(new URL('../e2e-shots/', import.meta.url), { recursive: true })
writeFileSync(new URL('../e2e-shots/ai-balance.json', import.meta.url), JSON.stringify(played))
console.log('every game: e2e-shots/ai-balance.json')

// ── The tables ──
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const at = (xs, q) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]
const pct = (v) => `${(v * 100).toFixed(1)}%`
const winShare = (game, seat) => (game.winners.includes(seat) ? 1 / game.winners.length : 0)
/** A share and its 95% range (normal approximation), e.g. "34.2% ±4.1". */
const shareCI = (xs) => {
  const p = avg(xs)
  const sd = Math.sqrt(avg(xs.map((x) => (x - p) ** 2)))
  return `${pct(p)} ±${((1.96 * sd * 100) / Math.sqrt(xs.length)).toFixed(1)}`
}

console.log('\nGame shape')
console.log('row        games  turns (each)   p90  margin (median)  close ≤5  ties   win score  tangled  self-tangle  fill   scoring')
for (const row of rows) {
  const gs = played.filter((g) => g.players === row.players && g.boardName === row.board)
  if (!gs.length) continue
  const turns = gs.map((g) => g.turns)
  const margins = gs.map((g) => g.margin)
  console.log(
    [
      `${row.players}p ${row.board}`.padEnd(10),
      String(gs.length).padStart(5),
      `${avg(turns).toFixed(1)} (${(avg(turns) / row.players).toFixed(1)})`.padStart(14),
      String(at(turns, 0.9)).padStart(5),
      `${avg(margins).toFixed(1)} (${at(margins, 0.5)})`.padStart(16),
      pct(avg(margins.map((m) => (m <= 5 ? 1 : 0)))).padStart(9),
      pct(avg(gs.map((g) => (g.winners.length > 1 ? 1 : 0)))).padStart(6),
      avg(gs.map((g) => Math.max(...g.scores))).toFixed(1).padStart(10),
      avg(gs.map((g) => g.tangled)).toFixed(2).padStart(8),
      pct(avg(gs.map((g) => (g.selfTangle ? 1 : 0)))).padStart(12),
      pct(avg(gs.map((g) => g.boardFill))).padStart(6),
      pct(avg(gs.map((g) => g.scoringTurns))).padStart(9),
    ].join(' '),
  )
}

console.log('\nBag')
console.log('row        ran out   on turn (min / median)   bag left at end (median / min)')
for (const row of rows) {
  const gs = played.filter((g) => g.players === row.players && g.boardName === row.board)
  if (!gs.length) continue
  const out = gs.filter((g) => g.bagEmptyOnTurn !== null).map((g) => g.bagEmptyOnTurn)
  const left = gs.map((g) => g.bagLeft)
  console.log(`${`${row.players}p ${row.board}`.padEnd(10)} ${pct(out.length / gs.length).padStart(7)}   ${(out.length ? `${Math.min(...out)} / ${at(out, 0.5)}` : '—').padStart(22)}   ${`${at(left, 0.5)} / ${Math.min(...left)}`.padStart(30)}`)
}

console.log('\nSeat wins (seat 0 = Yellow, plays first) — share of games won, ±95% range; fair = 1 ÷ players')
for (const row of rows) {
  const gs = played.filter((g) => g.players === row.players && g.boardName === row.board)
  if (!gs.length) continue
  const seats = Array.from({ length: row.players }, (_, s) => shareCI(gs.map((g) => winShare(g, s))))
  console.log(`${`${row.players}p ${row.board}`.padEnd(10)} fair ${pct(1 / row.players).padStart(6)} · ${seats.join(' · ')}`)
}
for (const players of playerCounts) {
  const gs = played.filter((g) => g.players === players)
  console.log(`${`${players}p both`.padEnd(10)} fair ${pct(1 / players).padStart(6)} · ${Array.from({ length: players }, (_, s) => shareCI(gs.map((g) => winShare(g, s)))).join(' · ')}`)
}

console.log('\nPersonality wins per row (to check the seats are fair to the personalities)')
for (const row of rows) {
  const gs = played.filter((g) => g.players === row.players && g.boardName === row.board)
  const line = personalities.map((p) => {
    const seats = gs.flatMap((g) => g.personalities.flatMap((id, s) => (id === p.id ? [winShare(g, s)] : [])))
    return `${p.id} ${pct(avg(seats))}`
  })
  console.log(`${`${row.players}p ${row.board}`.padEnd(10)} ${line.join(' · ')}`)
}
const ms = played.map((g) => g.slowestMs)
console.log(`\nslowest decision per game: median ${at(ms, 0.5)} ms · worst ${Math.max(...ms)} ms (this machine, ${jobs} at once)`)

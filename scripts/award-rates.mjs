// npm run sim:awards — how often each end-of-game award is earned (research/sims.md, research/awards-ai.md).
// Two kinds of players:
//   --players mindless (default) — random / greedy sim bots (2026-10-02). They don't position or block on purpose, so
//       this is a FLOOR check: an award these players earn often is too easy — earned by accident.
//   --players ai — the real AI personalities (content/ai/personalities.json) playing each other at one skill (F47).
//       Mixed tables, personalities shuffled per seat (seeded), the game's default boards (content/data/boards.json — since F46: Small for 2–3, Large for 4).
//       Reports each award's rate overall, per player count, and per personality (share of its seats that earned it).
// Options:
//   --games 200          per row (mindless) / per player count (ai)
//   --tune '{"lockdownMinDrop":6}'   try other thresholds without editing content/tuning/endscreen.json
//   --skill FirstClass   (ai) the skill every seat plays at
//   --counts 2,3,4       (ai) which player counts to play
//   --min-word 3         (ai) shortest word that scores — 3 = two-letter words off (standard play, Muzzy 2026-10-07)
//   --first 0            (ai) the first game number — so several runs side by side can each play a different slice
//   --save file.json     (ai) keep the finished games, so thresholds can be re-tried in seconds with --load
//   --load a.json,b.json (ai) re-count saved games instead of playing new ones
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { runnerImport } from 'vite'
import { requireAiSignOff } from './ai-signoff.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const games = Number(arg('games', 200))
const playersArg = arg('players', 'mindless')
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const stats = await load('/src/game/stats.ts')
const { defaultBoardFor } = await load('/src/engine/boards.ts')
const words = (await load('/src/engine/words.ts')).parseWordList(readFileSync(new URL('../public/words/words.csv', import.meta.url), 'utf8'))
const tuning = { ...JSON.parse(readFileSync(new URL('../content/tuning/endscreen.json', import.meta.url), 'utf8')), ...JSON.parse(arg('tune', '{}')) }
const ids = Object.keys(tuning.awardOrder)
const pct = (hits, of) => `${(of ? Math.round((1000 * hits) / of) / 10 : 0).toFixed(1)}%`

if (playersArg === 'ai') await aiRun()
else await mindlessRun()

// ── Mindless sim bots (random / greedy) — the floor check ──
async function mindlessRun() {
  const sim = await load('/src/engine/sim.ts')
  const engine = await load('/src/engine/engine.ts')

  /** One whole game by the sim's player (the same as sim.ts simulateGame, keeping the finished state). */
  function play(players, boardName, seed, style) {
    let state = engine.newGame({ players, boardName, seed })
    let rng = seed ^ 0x5eed
    while (state.phase !== 'over') {
      const pick = style === 'greedy' ? sim.greedyAction(state, rng, words) : sim.randomAction(state, rng)
      rng = pick.rng
      state = engine.applyAction(state, pick.action, words)
    }
    return state
  }

  const totals = { random: Object.fromEntries(ids.map((id) => [id, 0])), greedy: Object.fromEntries(ids.map((id) => [id, 0])) }
  const counted = { random: 0, greedy: 0 }
  const perGame = { random: 0, greedy: 0 }
  console.log(`${games} games per row · share of games where each award was earned (by anyone)\n`)
  console.log(['style', 'game', ...ids].join('\t'))
  for (const style of ['random', 'greedy']) {
    for (const players of [2, 3, 4]) {
      for (const board of ['small', 'large']) {
        const hits = Object.fromEntries(ids.map((id) => [id, 0]))
        for (let i = 0; i < games; i++) {
          const game = play(players, board, i + 1, style)
          const awards = stats.earnedAwards(game, tuning)
          perGame[style] += awards.length
          for (const id of new Set(awards.map((a) => a.id))) hits[id]++
        }
        counted[style] += games
        for (const id of ids) totals[style][id] += hits[id]
        console.log([style, `${players}p ${board}`, ...ids.map((id) => pct(hits[id], games))].join('\t'))
      }
    }
  }
  console.log('\nAll rows:')
  for (const id of ids) {
    console.log(`${id.padEnd(15)} random ${pct(totals.random[id], counted.random).padStart(6)}   greedy ${pct(totals.greedy[id], counted.greedy).padStart(6)}`)
  }
  console.log(`awards per game: random ${(perGame.random / counted.random).toFixed(2)} · greedy ${(perGame.greedy / counted.greedy).toFixed(2)}`)
}

// ── Real AI personalities playing each other (F47) ──
async function aiRun() {
  const loadPath = arg('load', '')
  const savePath = arg('save', '')
  const skillId = arg('skill', 'FirstClass')
  // Each finished game, as { players, board, personalities: [one per seat], game }
  let played
  const started = Date.now()
  if (loadPath) {
    played = loadPath.split(',').flatMap((file) => JSON.parse(readFileSync(file, 'utf8')))
  } else {
    requireAiSignOff('npm run sim:awards -- --players ai') // new AI games only once Muzzy has signed the AI off
    played = playAiGames(await setupAi(skillId))
    console.log(`\n${played.length} games played in ${((Date.now() - started) / 1000).toFixed(0)} s`)
    if (savePath) {
      mkdirSync(dirname(savePath), { recursive: true })
      writeFileSync(savePath, JSON.stringify(played))
    }
  }

  // Each game's awards, worked out once
  const awardsOf = played.map((p) => stats.earnedAwards(p.game, tuning))

  // Per player count: share of games where anyone earned it
  const rowOf = (pick) => {
    const hits = Object.fromEntries(ids.map((id) => [id, 0]))
    let count = 0
    let awardsCount = 0
    played.forEach((p, i) => {
      if (!pick(p)) return
      count++
      awardsCount += awardsOf[i].length
      for (const id of new Set(awardsOf[i].map((a) => a.id))) hits[id]++
    })
    return { hits, count, perGame: count ? awardsCount / count : 0 }
  }
  const all = rowOf(() => true)
  const byRow = [2, 3, 4].map((n) => ({ label: `${n}p`, ...rowOf((p) => p.players === n) })).filter((r) => r.count)

  // Per personality: share of its seats that earned it
  const people = [...new Set(played.flatMap((p) => p.personalities))].sort()
  const seatHits = Object.fromEntries(people.map((name) => [name, { seats: 0, hits: Object.fromEntries(ids.map((id) => [id, 0])) }]))
  played.forEach((p, i) => {
    p.personalities.forEach((name, seat) => {
      seatHits[name].seats++
      for (const id of new Set(awardsOf[i].filter((a) => a.holder === seat).map((a) => a.id))) seatHits[name].hits[id]++
    })
  })

  console.log(`\nAI personalities at ${skillId} · ${played.length} games (${byRow.map((r) => `${r.count} × ${r.label}`).join(', ')})`)
  console.log("Share of games where each award was earned (by anyone) · then the share of each personality's seats that earned it\n")
  console.log(['award'.padEnd(15), 'all'.padStart(7), ...byRow.map((r) => r.label.padStart(7)), ...people.map((n) => n.slice(0, 10).padStart(11))].join(''))
  for (const id of ids) {
    console.log([
      id.padEnd(15),
      pct(all.hits[id], all.count).padStart(7),
      ...byRow.map((r) => pct(r.hits[id], r.count).padStart(7)),
      ...people.map((n) => pct(seatHits[n].hits[id], seatHits[n].seats).padStart(11)),
    ].join(''))
  }
  console.log(`\nawards per game: all ${all.perGame.toFixed(2)} · ${byRow.map((r) => `${r.label} ${r.perGame.toFixed(2)}`).join(' · ')}`)
}

/** Loads the AI (the same way as scripts/ai-arena.mjs). */
async function setupAi(skillId) {
  const arena = await load('/src/ai/arena.ts')
  const bot = await load('/src/engine/bot.ts')
  const json = (p) => JSON.parse(readFileSync(new URL(`../content/ai/${p}`, import.meta.url), 'utf8'))
  const personalities = json('personalities.json').personalities
  const skill = json('skills.json').skills.find((s) => s.id === skillId)
  if (!skill) throw new Error(`No skill "${skillId}" in content/ai/skills.json`)
  return { arena, bot, personalities, skill }
}

/** `games` mixed tables per player count, on the game's default board (content/data/boards.json). */
function playAiGames({ arena, bot, personalities, skill }) {
  const makeBot = (s) => bot.aiBot(s.personality, s.skill, words)
  const counts = arg('counts', '2,3,4').split(',').map(Number)
  const first = Number(arg('first', 0))
  // --min-word 3 = two-letter words off (Muzzy 2026-10-07: standard play); default = content/tuning/rules.json
  const minWord = Number(arg('min-word', 0))
  // A small seeded shuffle, seeded by the game's own seed, so game N always seats the same table.
  let pos = 0
  const rand = () => (pos = (pos * 1103515245 + 12345) % 2147483648) / 2147483648
  const shuffled = (xs) => xs.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
  // Every personality once before any sits twice (4 players, 3 personalities → one of them twice).
  const tableOf = (n) => shuffled([...shuffled(personalities), ...shuffled(personalities)].slice(0, n))

  const played = []
  for (const players of counts) {
    const board = defaultBoardFor(players) // the board players get (content/data/boards.json)
    for (let g = first; g < first + games; g++) {
      const seed = 7000 + players * 1000 + g
      pos = seed
      const table = tableOf(players)
      const seats = table.map((personality) => ({ personality, skill }))
      const { game } = arena.playArenaGame(seats, board, seed, words, makeBot, 1000, minWord ? { minWordLength: minWord } : {})
      played.push({ players, board, personalities: table.map((p) => p.id), game })
      process.stdout.write(`\r${players} players: game ${g + 1 - first}/${games}   `)
    }
  }
  return played
}

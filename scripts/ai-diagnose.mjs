// npm run ai:diagnose -- --a Bully --b Scholar --games 30 — head-to-head facts for tuning (F45).
// Per personality: final Magic (words vs tangle bonus), goals chosen, how often the chosen goal saw no difference,
// how games end. Prints a table; no files written.
import { readFileSync } from 'node:fs'
import { runnerImport } from 'vite'
const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : f }
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (p) => (await runnerImport(p, { root, configFile: false, logLevel: 'error' })).module
const arena = await load('/src/ai/arena.ts')
const bot = await load('/src/engine/bot.ts')
const words = (await load('/src/engine/words.ts')).parseWordList(readFileSync(new URL('../public/words/words.csv', import.meta.url), 'utf8'))
const json = (p) => JSON.parse(readFileSync(new URL(`../content/ai/${p}`, import.meta.url), 'utf8'))
const pers = Object.fromEntries(json('personalities.json').personalities.map((p) => [p.id, p]))
if (arg('nudge', '')) for (const p of Object.values(pers)) p.nudge = Number(arg('nudge')) // experiment: everyone's nudge
const skill = json('skills.json').skills.find((s) => s.id === arg('skill', 'FirstClass'))
const names = [arg('a', 'Bully'), arg('b', 'Scholar'), ...(arg('c', '') ? [arg('c')] : [])]
const games = Number(arg('games', 30))
const stats = Object.fromEntries(names.map((n) => [n, { wins: 0, words: 0, tangle: 0, goals: {}, flat: 0, decisions: 0, ended: 0, selfEnded: 0 }]))
let turns = 0
for (let g = 0; g < games; g++) {
  const order = g % 2 ? [...names].reverse() : names
  const seats = order.map((n) => ({ personality: pers[n], skill }))
  const makeBot = (s) => bot.aiBot(s.personality, s.skill, words, (d) => {
    const st = stats[s.personality.id]
    st.decisions++
    st.goals[d.goal] = (st.goals[d.goal] ?? 0) + 1
    if (!d.mainGoalMattered) st.flat++
  })
  const { game } = arena.playArenaGame(seats, names.length === 2 ? 'small' : 'large', 7000 + g, words, makeBot)
  turns += game.turnCount
  order.forEach((n, i) => {
    const st = stats[n]
    if (game.winners.includes(i)) st.wins += 1 / game.winners.length
    st.tangle += game.log.end.tangleMagic[i]
    st.words += game.log.end.totals[i] - game.log.end.tangleMagic[i]
    if (game.log.end.endedBy === i) { st.ended++; if (game.log.end.selfTangle) st.selfEnded++ }
  })
}
console.log(`${games} games, avg ${(turns / games).toFixed(1)} turns, skill ${skill.id}`)
for (const [n, s] of Object.entries(stats)) {
  const goals = Object.entries(s.goals).sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g} ${Math.round((100 * c) / s.decisions)}%`).join(' ')
  console.log(`${n.padEnd(10)} wins ${(s.wins / games * 100).toFixed(0)}% · Magic words ${(s.words / games).toFixed(1)} + tangles ${(s.tangle / games).toFixed(1)} · ended ${s.ended} (self ${s.selfEnded}) · main goal flat ${Math.round((100 * s.flat) / s.decisions)}% · ${goals}`)
}

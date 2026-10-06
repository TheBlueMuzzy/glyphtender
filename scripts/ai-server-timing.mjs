// npm run ai:server-timing — how long one AI decision takes, for the online server's budget (F43).
// Online the AI thinks inside the room (a Cloudflare Durable Object: up to 30 s of CPU per event, but the room waits
// while it thinks), so every skill must fit content/ai/pace.json serverBudgetMs. The Worker's clock stands still while
// code runs, so it can't time itself there — this measures the same thinking on this machine instead.
// Plays whole AI-only games (mixed personalities, 2 players on Small and 4 on Large — the slowest table) per skill and
// prints median / 90% / 99% / worst ms per decision. Exit code 1 if any decision went over the budget.
// Options: --games 2 (per table size and skill)
import { readFileSync } from 'node:fs'
import { runnerImport } from 'vite'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const games = Number(arg('games', 2))
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const arena = await load('/src/ai/arena.ts')
const bot = await load('/src/engine/bot.ts')
const started = performance.now()
const words = (await load('/src/engine/words.ts')).parseWordList(readFileSync(new URL('../public/words/words.csv', import.meta.url), 'utf8'))
const json = (p) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'))
const personalities = json('ai/personalities.json').personalities
const skills = json('ai/skills.json').skills
const budget = json('ai/pace.json').serverBudgetMs
console.log(`word list read in ${Math.round(performance.now() - started)} ms (once per server copy) · budget ${budget} ms per decision`)

let over = 0
for (const skill of skills) {
  for (const players of [2, 4]) {
    const ms = []
    for (let g = 0; g < games; g++) {
      const seats = Array.from({ length: players }, (_, i) => ({ personality: personalities[(g + i) % personalities.length], skill }))
      ms.push(...arena.playArenaGame(seats, players === 2 ? 'small' : 'large', 1000 + g, words, (s) => bot.aiBot(s.personality, s.skill, words)).decisionMs)
    }
    ms.sort((a, b) => a - b)
    const at = (share) => Math.round(ms[Math.floor(share * (ms.length - 1))])
    const worst = Math.round(ms.at(-1))
    if (worst > budget) over++
    console.log(`${skill.id.padEnd(10)} ${players}p  ${String(ms.length).padStart(4)} decisions · median ${at(0.5)} · 90% ${at(0.9)} · 99% ${at(0.99)} · worst ${worst} ms${worst > budget ? '  OVER BUDGET' : ''}`)
  }
}
console.log(over ? `${over} table(s) went over the ${budget} ms budget` : `every decision within ${budget} ms`)
process.exit(over ? 1 : 0)

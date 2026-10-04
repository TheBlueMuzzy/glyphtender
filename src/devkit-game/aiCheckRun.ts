// THE PERSONALITY CHECK, FOR THE DEV KIT — the same games and report as `npm run ai:arena` (scripts/ai-arena.mjs),
// in a smaller batch, with the personalities as they are in the AI tab (unsaved changes too). Pure: no screen, no
// store — it runs inside a Web Worker (aiCheck.worker.ts) so the game stays alive while it plays.
//   - N mixed tables at the main skill (2, 3, 4 players in turn; personalities shuffled, the same each run)
//   - for 20+ games, a small skill ladder too: each personality's Archmage vs its Apprentice, 2 games each
import { personalityCheck, playArenaGame, type ArenaGame, type ArenaSeat, type FeelTargetsFile } from '../ai/arena'
import { reportHtml } from '../ai/kit/report'
import type { Personality, Skill } from '../ai/kit/types'
import { meterNames } from '../ai/meters'
import { aiBot } from '../engine/bot'
import type { WordList } from '../engine/types'

export interface CheckRequest {
  games: number
  personalities: Personality[]
  skills: Skill[]
  targets: FeelTargetsFile
  /** The skill the mixed tables play at (FirstClass, as `npm run ai:arena` does). */
  mainSkill?: string
}

const LADDER_FROM = 20 // games asked for before the skill ladder joins in
const LADDER_GAMES = 2 // per personality

/** How many games a check of `games` plays in all (the progress bar's end). */
export const totalGames = (games: number, personalities: number) => games + (games >= LADDER_FROM ? personalities * LADDER_GAMES : 0)

/** Play the games and give back the report page (HTML). onProgress(done, total) after every game. */
export function runPersonalityCheck(request: CheckRequest, wordList: WordList, onProgress: (done: number, total: number) => void): string {
  const makeBot = (s: ArenaSeat, onNote: (note: string) => void) => aiBot(s.personality, s.skill, wordList, (d) => onNote(d.note))
  const { personalities, skills, targets } = request
  const skill = (id: string) => skills.find((s) => s.id === id)
  const main = skill(request.mainSkill ?? 'FirstClass') ?? skills[Math.floor(skills.length / 2)]
  const total = totalGames(request.games, personalities.length)
  const boardFor = (n: number) => (n === 2 ? 'small' : 'large')

  // A small seeded shuffle so the same check always seats the same tables (as scripts/ai-arena.mjs)
  let pos = 12345
  const rand = () => (pos = (pos * 1103515245 + 12345) % 2147483648) / 2147483648
  const shuffled = <T>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

  const played: ArenaGame[] = []
  for (let g = 0; g < request.games; g++) {
    const n = Math.min(2 + (g % 3), personalities.length)
    const seats = shuffled(personalities).slice(0, n).map((personality) => ({ personality, skill: main }))
    played.push(playArenaGame(seats, boardFor(n), 1000 + g, wordList, makeBot))
    onProgress(played.length, total)
  }
  const ladder: ArenaGame[] = []
  const top = skill('Archmage')
  const bottom = skill('Apprentice')
  if (request.games >= LADDER_FROM && top && bottom) {
    for (const p of personalities) {
      for (let g = 0; g < LADDER_GAMES; g++) {
        const seats = [{ personality: p, skill: top }, { personality: p, skill: bottom }]
        ladder.push(playArenaGame(g % 2 ? seats.reverse() : seats, 'small', 5000 + g, wordList, makeBot))
        onProgress(played.length + ladder.length, total)
      }
    }
  }

  const tellMeters = Object.keys(meterNames).filter((m) => !['won', 'calledItRight', 'awards'].includes(m))
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const subtitle = `Dev Kit: ${played.length} mixed games at ${main.id} (2–4 players)${ladder.length ? ` + ${ladder.length} skill-ladder games` : ''} · ${when}`
  const report = personalityCheck([...played, ...ladder], targets, skills.map((s) => s.id), tellMeters, subtitle, main.id)
  return reportHtml(report)
}

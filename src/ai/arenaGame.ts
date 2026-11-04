// THE GAME'S HALF OF THE ARENA (F104 — Framework AI arena): what `npm run ai:arena` (the AI kit's ai-arena.mjs) plays.
// The kit runs the games, the seating and the report; this says what's Glyphtender's: its rules, its board for each
// table, its bot, its meters, and its own "for all of them" checks.
// (src/ai/arena.ts is older and separate: the Dev Kit's Run check and the balance sims still play through it.)
import type { ArenaGameFile, ArenaPlug } from './kit/arena'
import { averages } from './kit/check'
import { allMeters, meterNames } from './meters'
import { defaultBoardFor } from '../engine/boards'
import { aiBot } from '../engine/bot'
import { glyphtenderRules, type GameSetup, type SeatView } from '../engine/rules'
import { parseWordList } from '../engine/words'
import type { Action, GameState, WordList } from '../engine/types'

// Meters that give the answer away: the tell-apart grid must recognise a personality by how it plays, not by these
const NOT_TELLS = ['won', 'calledItRight', 'awards']
// What the PC run prints per personality
const COLUMNS = ['tanglesCaused', 'rivalTangledThisGame', 'nearRivalShare', 'rivalMovesCut', 'avgWordLength', 'multiWordShare', 'steals', 'setups', 'gotTangled', 'roomToMove', 'calledIt']

function plugFor(words: WordList): ArenaPlug<GameState, Action, GameSetup, SeatView> {
  return {
    name: 'Glyphtender',
    rules: glyphtenderRules(words),
    setup: (seats, seed) => ({ players: seats.length, boardName: defaultBoardFor(seats.length), seed }),
    bot: (seat, onDecision) => aiBot(seat.personality, seat.skill, words, (decision) => onDecision(decision)),
    meters: (game) => allMeters(game.state).map((seat) => ({ ...seat })),
    winners: (state) => state.winners,
    tellMeters: Object.keys(meterNames).filter((m) => !NOT_TELLS.includes(m)),
    checks: {
      callsIt: (results, skill) => averages(results, 'calledIt', skill),
      // How often it called it and was wrong: its calls, less the right ones
      callsItWrong: (results, skill) => {
        const right = averages(results, 'calledItRight', skill)
        return new Map([...averages(results, 'calledIt', skill)].map(([name, calls]) => [name, calls - (right.get(name) ?? 0)]))
      },
    },
    // tuning-ok: keeps the numbers from before the move to the kit, so old reports still compare (the kit's own rule differs)
    seatRng: (seed, seat) => (seed ^ 0x5eed) + seat * 7919,
  }
}

export default async function arenaGame(files: { read(path: string): Promise<string> }): Promise<ArenaGameFile<GameState, Action, GameSetup, SeatView>> {
  const json = async (name: string) => JSON.parse(await files.read(`content/ai/${name}.json`))
  const { personalities } = await json('personalities')
  const { skills } = await json('skills')
  return {
    plug: plugFor(parseWordList(await files.read('public/words/words.csv'))),
    personalities: personalities.filter((p: { hidden?: boolean }) => !p.hidden), // (hidden = Sprout, the tutorial AI)
    skills: skills.filter((s: { id: string; hidden?: boolean }) => !s.hidden && s.id !== 'seedling'), // (Sprout's skill: never at the arena's tables)
    targets: await json('feel-targets'),
    columns: COLUMNS.filter((m) => m in meterNames),
  }
}

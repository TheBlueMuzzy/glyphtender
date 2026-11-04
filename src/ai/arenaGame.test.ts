// F104 — Framework AI arena: the kit's arena, through the game's arena file, plays the same game as src/ai/arena.ts
// (which the Dev Kit's Run check and the balance sims still use), so their numbers stay comparable.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { playArenaGame as oldArena } from './arena'
import arenaGame from './arenaGame'
import { playArenaGame as kitArena } from './kit/arena'
import { allMeters } from './meters'
import { defaultBoardFor } from '../engine/boards'
import { aiBot } from '../engine/bot'
import { parseWordList } from '../engine/words'

const files = { read: async (path: string) => readFileSync(path, 'utf8') }

describe('the game\'s arena file', () => {
  it('sits the real cast down: no tutorial AI, no tutorial skill, lowest skill first', async () => {
    const game = await arenaGame(files)
    expect(game.personalities.map((p) => p.id)).toEqual(['Scholar', 'Survivor', 'Strategist'])
    expect(game.skills.map((s) => s.id)).toEqual(['Apprentice', 'FirstClass', 'Archmage'])
  })

  it('plays the same game, seed for seed, as the older arena', async () => {
    const game = await arenaGame(files)
    const words = parseWordList(readFileSync('public/words/words.csv', 'utf8'))
    const skill = game.skills[1]
    const seats = [game.personalities[2], game.personalities[0]].map((personality) => ({ personality, skill }))
    const seed = 1000

    const kit = kitArena(game.plug, seats, seed, 'mixed')
    const old = oldArena(seats, defaultBoardFor(seats.length), seed, words, (s, onNote) => aiBot(s.personality, s.skill, words, (d) => onNote(d.note)))

    expect(kit.state.magic).toEqual(old.game.magic)
    expect(kit.state.winners).toEqual(old.game.winners)
    expect(kit.notes).toEqual(old.notes)
    expect(game.plug.meters(kit)).toEqual(allMeters(old.game).map((m) => ({ ...m })))
  })
})

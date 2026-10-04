// The AI bot plays whole games: 2–4 aiBots, through the one rules door, from their own seat's view only — never an
// illegal move, every game ends, and the same seed replays the same game.
import { describe, expect, it } from 'vitest'
import { aiBot } from '../engine/bot'
import { glyphtenderRules, viewFor } from '../engine/rules'
import { checkInvariants } from '../engine/sim'
import { botSeed } from './kit/brain'
import type { Decision } from './kit/types'
import type { Action } from '../engine/types'
import { APPRENTICE, ARCHMAGE, BULLY, FIRST_CLASS, SCHOLAR, SURVIVOR, VULTURE, officialWords } from './testkit'

const words = officialWords()

/** Plays one game with these bots; returns every action and every decision note. */
function playGame(players: number, seed: number, boardName: string) {
  const rules = glyphtenderRules(words)
  const lineup = [
    aiBot(BULLY, FIRST_CLASS, words, (d) => notes.push(d)),
    aiBot(SCHOLAR, APPRENTICE, words, (d) => notes.push(d)),
    aiBot(SURVIVOR, ARCHMAGE, words, (d) => notes.push(d)),
    aiBot(VULTURE, FIRST_CLASS, words, (d) => notes.push(d)),
  ]
  const notes: Decision<Action>[] = []
  const actions: Action[] = []
  const rngs = Array.from({ length: players }, (_, s) => botSeed(seed, s))
  let state = rules.setup({ players, boardName, seed })
  let slowest = 0
  while (state.phase !== 'over') {
    if (state.turnCount > 300) throw new Error('game never ended')
    const seat = state.current
    const started = performance.now()
    const picked = lineup[seat](viewFor(state, seat), seat, rngs[seat])
    slowest = Math.max(slowest, performance.now() - started)
    rngs[seat] = picked.rng
    expect(rules.check(state, seat, picked.action)).toBeNull() // never an illegal move
    const before = state
    state = rules.apply(state, seat, picked.action).state
    checkInvariants(before, picked.action, state)
    actions.push(picked.action)
  }
  return { state, actions, notes, slowest }
}

describe('aiBot plays whole games', () => {
  for (const players of [2, 3, 4]) {
    it(`${players} players: ends without an illegal move, every decision explained`, () => {
      const game = playGame(players, 1000 + players, players === 2 ? 'small' : 'large')
      expect(game.state.phase).toBe('over')
      expect(game.notes.length).toBe(game.actions.length)
      for (const n of game.notes) expect(n.note.length).toBeGreaterThan(10)
      console.log(`${players}p: ${game.state.turnCount} turns, slowest decision ${Math.round(game.slowest)} ms, Magic ${game.state.magic.join(' / ')}`)
      console.log(game.notes.filter((n) => n.goal !== 'DRAFT').slice(0, 6).map((n) => n.note).join('\n'))
    }, 120000)
  }

  it('the same seed plays the same game', () => {
    const a = playGame(2, 77, 'small')
    const b = playGame(2, 77, 'small')
    expect(b.actions).toEqual(a.actions)
    expect(b.notes.map((n) => n.note)).toEqual(a.notes.map((n) => n.note))
  }, 120000)
})

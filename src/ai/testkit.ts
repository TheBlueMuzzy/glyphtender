// Helpers for the AI's tests: small made-up personalities and skills (the real ones are data in content/ai/), a
// goal context for a hand-made position, and the official word list.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { parseWordList } from '../engine/words'
import { viewFor } from '../engine/rules'
import type { GameState } from '../engine/types'
import type { Personality, Skill } from './kit/types'
import type { GlyphContext } from './goals/shared'

export const officialWords = () => parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))

const GOALS = ['TRAP', 'SCORE', 'DENY', 'ESCAPE', 'BUILD', 'STEAL', 'DUMP']
const TRAITS = ['aggression', 'greed', 'spite', 'caution', 'patience', 'opportunism', 'pragmatism']

/** A personality: every trait 40–60 unless `traits` says otherwise; goals in this order (the rest after). */
export function testPersonality(id: string, first: string[] = [], traits: Record<string, [number, number]> = {}, extras: Record<string, number> = {}): Personality {
  return {
    id,
    traits: Object.fromEntries(TRAITS.map((t) => [t, { min: traits[t]?.[0] ?? 40, max: traits[t]?.[1] ?? 60 }])),
    goals: [...first, ...GOALS.filter((g) => !first.includes(g))],
    nudge: 0.2,
    shifts: [
      { reading: 'myDanger', from: 6, full: 10, trait: 'caution', by: 20 },
      { reading: 'behind', from: 2, full: 8, trait: 'greed', by: 15 },
    ],
    chattiness: 30,
    extras: { nerve: 10, vocabulary: 0, ...extras },
  }
}

export const BULLY = testPersonality('Bully', ['TRAP'], { aggression: [80, 95] })
export const SCHOLAR = testPersonality('Scholar', ['SCORE'], { greed: [80, 95] })
export const SURVIVOR = testPersonality('Survivor', ['ESCAPE'], { caution: [80, 95] })
export const VULTURE = testPersonality('Vulture', ['STEAL'], { opportunism: [80, 95] })

export const testSkill = (id: string, candidates: number, worlds: number, zipf: number): Skill => ({
  id, candidates, worlds, spread: 0.8, topN: 5, wobble: 0.1, beliefNoise: 0.4, extras: { zipf },
})
export const APPRENTICE = testSkill('Apprentice', 150, 1, 3)
export const FIRST_CLASS = testSkill('FirstClass', 300, 2, 2)
export const ARCHMAGE = testSkill('Archmage', 800, 4, 0)

/** A goal's context for the seat to play in a hand-made position (the position itself is the world: tests know all). */
export function contextFor(game: GameState, personality: Personality = BULLY, skill: Skill = ARCHMAGE): GlyphContext {
  return { view: viewFor(game, game.current), world: game, seat: game.current, readings: {}, traits: {}, personality, skill, cache: new Map() }
}

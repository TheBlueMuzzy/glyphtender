// Glyphtender's AI tab plug: its files and checks, and the Dev Kit's Personality Check run (outside the worker).
import { describe, expect, it } from 'vitest'
import feelTargets from '../../content/ai/feel-targets.json'
import type { FeelTargetsFile } from '../ai/arena'
import type { Personality, Skill } from '../ai/kit/types'
import type { AiPersonality } from '../devkit/ai/aiTypes'
import { officialWords } from '../ai/testkit'
import { glyphtenderAi } from './aiDevKit'
import { runPersonalityCheck, totalGames } from './aiCheckRun'

const people = glyphtenderAi.personalities.data.personalities as Personality[]
const skills = glyphtenderAi.skills.data.skills as Skill[]

describe("Glyphtender's AI tab plug", () => {
  it('every saved personality passes the check; a broken one is caught in plain words', () => {
    for (const p of people) expect(glyphtenderAi.validate!(p as unknown as AiPersonality)).toEqual([])
    const broken = { ...people[0], goals: people[0].goals.slice(1), traits: { ...people[0].traits, greed: { min: 60, max: 40 } } }
    const problems = glyphtenderAi.validate!(broken as unknown as AiPersonality).join('\n')
    expect(problems).toContain('missing from its priority list')
    expect(problems).toContain('range 60–40')
  })

  it('bios point at en.json → ai.personality.<id>.bio', () => {
    const [a, b, id, c] = glyphtenderAi.bios!.at('Bully')
    const en = glyphtenderAi.bios!.data as { ai: { personality: Record<string, { bio: string }> } }
    expect(en[a as 'ai'][b as 'personality'][id][c as 'bio']).toMatch(/\w/)
  })

  it('the Dev Kit check plays its games and makes the report page', () => {
    // A quick skill so the test stays fast; the real check uses the file's skills
    const quick = skills.map((s) => ({ ...s, candidates: 20, worlds: 1 }))
    const seen: [number, number][] = []
    const html = runPersonalityCheck({ games: 2, personalities: people.slice(0, 3), skills: quick, targets: feelTargets as unknown as FeelTargetsFile }, officialWords(), (d, t) => seen.push([d, t]))
    expect(seen).toEqual([[1, 2], [2, 2]])
    expect(html).toContain('Personality Check')
    expect(totalGames(20, 7)).toBe(34)
  }, 60_000)
})

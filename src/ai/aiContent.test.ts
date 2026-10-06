// The AI's data files (content/ai/) stay in the shapes the brain reads, with a plain-English note for every setting.
import modesFile from '../../content/ai/modes.json'
import { describe, expect, it } from 'vitest'
import type { Personality, Skill } from './kit/types'
import personalitiesFile from '../../content/ai/personalities.json'
import skillsFile from '../../content/ai/skills.json'
import feelFile from '../../content/ai/feel-targets.json'
import paceFile from '../../content/ai/pace.json'
import text from '../../content/text/en.json'
import { meterNames } from './meters'

const GOALS = ['TRAP', 'SCORE', 'DENY', 'ESCAPE', 'BUILD', 'STEAL', 'DUMP']
const TRAITS = ['aggression', 'greed', 'spite', 'caution', 'patience', 'opportunism', 'pragmatism']
const READINGS = ['handQuality', 'myDanger', 'rivalDanger', 'fill', 'territory', 'endNear', 'behind', 'ahead', 'garden']
const IDS = ['Scholar', 'Survivor', 'Strategist'] // the rock-paper-scissors three (Muzzy, 2026-10-04)

const personalities: Personality[] = personalitiesFile.personalities
const skills: Skill[] = skillsFile.skills

/** Every setting's path inside one item, the way _labels names it ("traits.aggression.min" → "traits.aggression"). */
function paths(item: object, prefix = ''): string[] {
  return Object.entries(item).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? [path, ...paths(value, path)] : [path]
  })
}
const labelled = (labels: Record<string, string>, path: string) =>
  path.split('.').some((_, i, parts) => labels[parts.slice(0, parts.length - i).join('.')] !== undefined)

describe('personalities.json', () => {
  it('has the 3 personalities, each with all 7 traits, all 7 goals once, and sane numbers', () => {
    expect(personalities.map((p) => p.id)).toEqual(IDS)
    for (const p of personalities) {
      expect(Object.keys(p.traits).sort()).toEqual([...TRAITS].sort())
      for (const r of Object.values(p.traits)) expect(0 <= r.min && r.min <= r.max && r.max <= 100).toBe(true)
      expect([...p.goals].sort()).toEqual([...GOALS].sort())
      expect(p.nudge).toBeGreaterThanOrEqual(0)
      expect(p.nudge).toBeLessThanOrEqual(1)
      expect(p.extras?.nerve).toBeGreaterThan(0)
      expect(p.extras?.vocabulary).toBeUndefined() // words known come from the skill only
      for (const s of p.shifts) {
        expect(READINGS).toContain(s.reading)
        expect(TRAITS).toContain(s.trait)
        expect(s.from).not.toBe(s.full)
      }
    }
  })
  it('its main trait is its highest (the goal roll leans its way)', () => {
    const traitOf: Record<string, string> = { TRAP: 'aggression', SCORE: 'greed', DENY: 'spite', ESCAPE: 'caution', BUILD: 'patience', STEAL: 'opportunism', DUMP: 'pragmatism' }
    for (const p of personalities) {
      const main = p.traits[traitOf[p.goals[0]]]
      for (const r of Object.values(p.traits)) expect(r.max).toBeLessThanOrEqual(main.max)
    }
  })
  it('every setting has a label and a section', () => {
    const sections = Object.values(personalitiesFile._sections).flat()
    for (const p of personalities) {
      for (const path of paths(p)) {
        expect(labelled(personalitiesFile._labels, path), path).toBe(true)
        expect(sections.some((s) => path === s || path.startsWith(`${s}.`)), path).toBe(true)
      }
    }
  })
  it('each has a name and a bio in en.json', () => {
    for (const id of IDS) {
      const t = text.ai.personality[id as keyof typeof text.ai.personality]
      expect(t.name).toMatch(/^the /)
      expect(t.bio.length).toBeGreaterThan(10)
    }
  })
})

describe('skills.json', () => {
  it('Apprentice → First Class → Archmage get sharper', () => {
    expect(skills.map((s) => s.id)).toEqual(['Apprentice', 'FirstClass', 'Archmage'])
    for (let i = 1; i < skills.length; i++) {
      expect(skills[i].candidates).toBeGreaterThan(skills[i - 1].candidates)
      expect(skills[i].spread).toBeGreaterThan(skills[i - 1].spread)
      expect(skills[i].beliefNoise).toBeLessThan(skills[i - 1].beliefNoise)
      expect(skills[i].extras!.zipf).toBeLessThan(skills[i - 1].extras!.zipf)
    }
    for (const s of skills) expect(text.ai.skill[s.id as keyof typeof text.ai.skill]).toBeTruthy()
  })
  it('every setting has a label and a section', () => {
    const sections = Object.values(skillsFile._sections).flat()
    for (const s of skills) for (const path of paths(s)) {
      expect(labelled(skillsFile._labels, path), path).toBe(true)
      expect(sections.some((x) => path === x || path.startsWith(`${x}.`)), path).toBe(true)
    }
  })
})

describe('feel-targets.json', () => {
  it('every personality has targets, each on a real meter', () => {
    const meters = Object.keys(meterNames)
    expect(Object.keys(feelFile.personalities)).toEqual(IDS)
    for (const targets of Object.values(feelFile.personalities)) {
      expect(targets.length).toBeGreaterThan(0)
      for (const t of targets as { meter: string; op: string; value?: number }[]) {
        if (t.meter !== '*') expect(meters).toContain(t.meter)
        expect(['>=', '<=', 'tableBest', 'tableWorst', 'nearAverage', 'neverExtreme', 'beats']).toContain(t.op)
        if (['>=', '<=', 'nearAverage', 'beats'].includes(t.op)) expect(typeof t.value).toBe('number')
        if (t.op === 'beats') expect(IDS).toContain((t as { against?: string }).against)
      }
    }
    expect(feelFile.all.map((c) => c.check)).toEqual(['tellApart', 'skillLadder', 'callsIt', 'callsItWrong'])
  })
})

describe('pace.json', () => {
  it('every number has a label and a section; min ≤ max', () => {
    const sections = Object.values(paceFile._sections).flat()
    const labels = paceFile._labels as Record<string, string>
    const leaves = paths(paceFile).filter((p) => !p.startsWith('_') && !['thinkSeconds', 'speeds'].includes(p) && !/^thinkSeconds\.\w+$/.test(p))
    for (const path of leaves) {
      expect(labels[path], path).toBeTruthy()
      expect(sections.some((s) => path === s || path.startsWith(`${s}.`)), path).toBe(true)
    }
    for (const t of Object.values(paceFile.thinkSeconds)) expect(t.min).toBeLessThanOrEqual(t.max)
  })
})

describe('modes.json (fight · flight · focus)', () => {
  const modes = modesFile.modes as unknown as { id: string; goals: string[]; traits: Record<string, { min: number; max: number }>; sight?: Record<string, number>; steady?: Record<string, number>; focus?: number }[]
  it('has Fight, Flight and Focus, each a full goal order with sane ranges', () => {
    expect(modes.map((m) => m.id)).toEqual(['Fight', 'Flight', 'Focus'])
    for (const m of modes) {
      expect([...m.goals].sort()).toEqual([...GOALS].sort())
      for (const r of Object.values(m.traits)) expect(0 <= r.min && r.min <= r.max && r.max <= 100).toBe(true)
      for (const [goal, v] of Object.entries({ ...(m.sight ?? {}), ...(m.steady ?? {}) })) {
        expect(GOALS).toContain(goal)
        expect(v >= 0 && v <= 1).toBe(true)
      }
    }
  })
  it("every personality has a home mode and switches into real modes on real readings", () => {
    for (const p of personalities as unknown as { id: string; homeMode: string; switches: { reading: string; to: string }[] }[]) {
      expect(modes.map((m) => m.id)).toContain(p.homeMode)
      for (const sw of p.switches) {
        expect(READINGS).toContain(sw.reading)
        expect(modes.map((m) => m.id)).toContain(sw.to)
        expect(sw.to).not.toBe(p.homeMode)
      }
    }
  })
})


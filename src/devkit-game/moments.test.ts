// The Dev Kit moments list (moments.ts) points at real things: every knob is a number in its content file (a missing
// key would show no slider), exact style values are inside the knob's range, and every moment's screen is a preview.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FEEL_STYLES } from '../devkit/moments/momentTypes'
import { moments } from './moments'

const root = new URL('../../', import.meta.url)
const json = (file: string) => JSON.parse(readFileSync(new URL(file, root), 'utf8')) as Record<string, unknown>

/** Follows "sounds.score.pop.volumeDb" through keys that may hold dots themselves ("score.pop"). */
function at(data: unknown, path: string): unknown {
  if (path === '') return data
  if (!data || typeof data !== 'object') return undefined
  const parts = path.split('.')
  for (let n = parts.length; n >= 1; n--) {
    const key = parts.slice(0, n).join('.')
    if (key in data) {
      const found = at((data as Record<string, unknown>)[key], parts.slice(n).join('.'))
      if (found !== undefined) return found
    }
  }
  return undefined
}

/** The knob's [min, max] from the file's _ranges — exact, or a wildcard like "sounds.*.volumeDb". */
function rangeOf(data: Record<string, unknown>, path: string): [number, number] | undefined {
  const ranges = (data._ranges ?? {}) as Record<string, [number, number, number]>
  if (ranges[path]) return [ranges[path][0], ranges[path][1]]
  const wild = Object.keys(ranges).find((key) => key.includes('*') && new RegExp(`^${key.replace(/\./g, '\\.').replace('*', '.+')}$`).test(path))
  return wild ? [ranges[wild][0], ranges[wild][1]] : undefined
}

// The preview ids, read from previews.tsx's source (that file needs a browser to load)
const previewIds = [...readFileSync(new URL('src/devkit-game/previews.tsx', root), 'utf8').matchAll(/^ {2}\{\s*\n\s+id: '([\w-]+)'/gm)].map((m) => m[1])

describe('Glyphtender Dev Kit moments', () => {
  it('has the 8 moments, each id once', () => {
    expect(moments.map((m) => m.id)).toEqual(['score-pop', 'seed-lands', 'two-birds', 'tangle', 'no-shake', 'your-turn', 'reveal-count', 'grand-glyphtender'])
  })

  it('finds the preview ids (board and reveal among them)', () => {
    expect(previewIds).toEqual(expect.arrayContaining(['board', 'reveal', 'end-table', 'handoff']))
  })

  it.each(moments.map((m) => [m.id, m] as const))('%s: plays on a preview screen', (_id, moment) => {
    expect(previewIds).toContain(moment.screen)
  })

  const knobs = moments.flatMap((m) => m.knobs.map((knob) => [`${m.id} → ${knob.file} ${knob.path}`, knob] as const))
  it.each(knobs)('%s: is a number in the file, with a range; exact values inside it', (_name, knob) => {
    const data = json(knob.file)
    const value = at(data, knob.path)
    expect(typeof value).toBe('number')
    const range = rangeOf(data, knob.path)
    expect(range).toBeDefined()
    for (const style of FEEL_STYLES) {
      const exact = knob.values?.[style]
      if (exact === undefined) continue
      expect(exact).toBeGreaterThanOrEqual(range![0])
      expect(exact).toBeLessThanOrEqual(range![1])
    }
    if (knob.values?.balanced !== undefined) expect(knob.values.balanced).toBe(value) // Balanced = the file as saved
  })
})

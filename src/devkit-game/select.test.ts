// The Dev Kit Select tab's list (content/devkit/select.json) and the game's data-knobs tags agree:
// every knob names a real setting / text line / sound, every object can be found on screen, every tag is listed.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalog, selectFile } from '../devkit/select/selectFiles'
import { checkSelectMap, readSelectObjects, tagsOf } from '../devkit/select/selectMap'

// Every data-knobs="…" (JSX) and 'data-knobs': '…' (attrs objects) written in src/
function tagsInSource(dir: string): Set<string> {
  const tags = new Set<string>()
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'devkit') continue // the kit itself
    if (statSync(path).isDirectory()) for (const t of tagsInSource(path)) tags.add(t)
    else if (/\.tsx?$/.test(name) && !name.includes('.test.')) {
      const code = readFileSync(path, 'utf8')
      for (const m of code.matchAll(/data-knobs(?:=|'\s*:\s*)["']([^"']+)["']/g)) for (const t of tagsOf(m[1])) tags.add(t)
    }
  }
  return tags
}

describe('Dev Kit Select: content/devkit/select.json', () => {
  const file = selectFile ?? {}
  const objects = readSelectObjects(file)
  const tags = tagsInSource(join(__dirname, '..'))

  it('exists and lists things', () => {
    expect(selectFile).not.toBeNull()
    expect(objects.length).toBeGreaterThanOrEqual(14)
  })
  it('every knob names a setting, text line, sound or UI style value that exists', () => {
    const { known } = catalog()
    expect(known.tuning.length * known.text.length * known.sounds.length * known.style.length).toBeGreaterThan(0) // the game's files were found
    expect(checkSelectMap(file, catalog().known)).toEqual([])
  })
  it('every object can be found on screen (a data-knobs tag in src, or a find selector)', () => {
    expect(objects.filter((o) => !o.find && !tags.has(o.id)).map((o) => o.id)).toEqual([])
  })
  it('every data-knobs tag in src is an object in the file', () => {
    const ids = new Set(objects.map((o) => o.id))
    expect([...tags].filter((t) => !ids.has(t))).toEqual([])
  })
})

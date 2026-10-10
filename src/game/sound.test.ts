// SOUND CONTENT CHECKS — content/audio.json against the code and public/audio/:
//   · every sound the code plays is named in content/audio.json (a typo would be a silent moment)
//   · every file content/audio.json names is in public/audio/
//   · content/audio.json reads without a single warning (the module's own check)
//   · every music track the code plays is in music.tracks, and every layer's file is in public/audio/
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import audioJson from '../../content/audio.json'
import feelJson from '../../content/tuning/feel.json'
import animJson from '../../content/tuning/anim.json'
import { DEFAULT_AUDIO_SETTINGS, readAudioConfig } from '../audio'
import settingsJson from '../../content/ui/settings.json'

const root = join(import.meta.dirname, '..', '..')
const sounds = audioJson.sounds as Record<string, { files: string[] }>
const tracks = audioJson.music.tracks as Record<string, { layers: Record<string, { file: string }> }>

/** Every .ts / .tsx file under src/, except the framework's own copies (they name no game sounds). */
function sourceFiles(dir = join(root, 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return ['audio', 'kit'].includes(name) ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

/** The sound names the code plays: playSound('x') · juiceSound(moment, 'x') · useLoop(audio, 'x') · audio.play('x'). */
function soundsInCode(): { name: string; where: string }[] {
  const found: { name: string; where: string }[] = []
  const patterns = [/playSound\(\s*'([^']+)'/g, /juiceSound\(\s*'[^']+',\s*'([^']+)'/g, /useLoop\([^,]+,[^'),]*'([^']+)'/g, /audio\.play\(\s*'([^']+)'/g]
  for (const file of sourceFiles()) {
    const code = readFileSync(file, 'utf8')
    for (const pattern of patterns) for (const m of code.matchAll(pattern)) found.push({ name: m[1], where: relative(root, file) })
  }
  return found
}

describe('content/audio.json', () => {
  it('names every sound the code plays', () => {
    const used = soundsInCode()
    expect(used.length).toBeGreaterThan(30) // (the scan found them — not an empty pass)
    const missing = used.filter((u) => !(u.name in sounds)).map((u) => `${u.name} (${u.where})`)
    expect(missing).toEqual([])
  })

  it('has the kit control sounds (ui.tap · ui.back · ui.toggle) and a sound for every feel tier', () => {
    for (const kind of ['tap', 'back', 'toggle']) expect(sounds[`ui.${kind}`]?.files.length).toBeGreaterThan(0)
    for (const tier of Object.keys(feelJson.tiers)) {
      const name = (audioJson.tiers as Record<string, string>)[tier]
      expect(sounds[name]?.files.length, `tier ${tier}`).toBeGreaterThan(0)
    }
  })

  it('every file it names is in public/audio/', () => {
    const missing = Object.entries(sounds).flatMap(([name, s]) =>
      s.files.filter((file) => !existsSync(join(root, 'public', 'audio', file))).map((file) => `${name}: ${file}`))
    expect(missing).toEqual([])
  })

  it('reads without a warning (the audio module checks every value)', () => {
    const warnings: string[] = []
    const config = readAudioConfig(audioJson, (message) => warnings.push(message))
    expect(warnings).toEqual([])
    expect(Object.keys(config.sounds)).toHaveLength(Object.keys(sounds).length)
  })

  it('every sound has a plain-English _help line (for Muzzy and the Sound Board)', () => {
    for (const name of Object.keys(sounds)) expect(audioJson._help, name).toHaveProperty([`sounds.${name}`])
  })
})

/** The music tracks the code plays: useMusic(audio, 'x') · playMusic('x'). */
function tracksInCode(): { name: string; where: string }[] {
  const found: { name: string; where: string }[] = []
  for (const file of sourceFiles()) {
    const code = readFileSync(file, 'utf8')
    for (const pattern of [/useMusic\([^,]+,[^'),]*'([^']+)'/g, /playMusic\(\s*'([^']+)'/g]) {
      for (const m of code.matchAll(pattern)) found.push({ name: m[1], where: relative(root, file) })
    }
  }
  return found
}

describe('content/audio.json music', () => {
  it("has every track the code plays (the menus' and the garden's)", () => {
    const used = tracksInCode()
    expect(new Set(used.map((u) => u.name))).toEqual(new Set(['menu', 'garden']))
    expect(used.filter((u) => !(u.name in tracks)).map((u) => `${u.name} (${u.where})`)).toEqual([])
  })

  it("every layer's file is in public/audio/", () => {
    const layers = Object.entries(tracks).flatMap(([track, t]) => Object.entries(t.layers).map(([layer, l]) => ({ where: `${track}.${layer}`, file: l.file })))
    expect(layers.length).toBeGreaterThanOrEqual(4) // garden: harp + pad + bells · menu: kalimba
    expect(layers.filter((l) => !existsSync(join(root, 'public', 'audio', l.file))).map((l) => `${l.where}: ${l.file}`)).toEqual([])
  })

  it('reads as written: the garden is a piece (the harp first — it counts the plays) that rests; the bells wait for the reveal', () => {
    const warnings: string[] = []
    const { music } = readAudioConfig(audioJson, (message) => warnings.push(message))
    expect(warnings).toEqual([])
    const garden = music.tracks.garden
    expect(Object.keys(garden.layers)[0]).toBe('harp')
    expect(garden.loop).toBe(false)
    expect(garden.playsBeforeRest).toBeGreaterThan(0)
    // the game's calm intensity (anim.json) sits under where the bells come in, and the reveal's peak brings them in
    expect(animJson.revealMusicCalm).toBeLessThan(garden.layers.bells.fromIntensity)
    expect(animJson.revealMusicPeak).toBeGreaterThan(garden.layers.bells.fromIntensity)
  })

  it('every music knob has a plain-English _help line (for Muzzy and the Sound tab)', () => {
    const help = audioJson._help as Record<string, string>
    for (const track of Object.keys(tracks)) expect(help, track).toHaveProperty([`music.tracks.${track}`])
    for (const key of ['playsBeforeRest', 'restSeconds', 'fadeInMs', 'fadeOutMs', 'loop', 'loopCrossfadeMs', 'loopStartMs', 'loopEndMs']) {
      expect(help, key).toHaveProperty([`music.tracks.*.${key}`])
    }
    for (const key of ['file', 'volumeDb', 'fromIntensity', 'fullAtIntensity']) expect(help, key).toHaveProperty([`music.tracks.*.layers.*.${key}`])
  })
})

describe('Settings → Audio rows', () => {
  it("are the UI kit's standard rows with the audio module's defaults (no Voices row)", () => {
    const audio = settingsJson.tabs.find((t) => t.id === 'audio')!
    const defaults = Object.fromEntries(audio.rows.map((r) => [r.id, (r as { default?: unknown }).default]))
    expect(defaults).toEqual(DEFAULT_AUDIO_SETTINGS)
  })
})

// THE GAME'S SAVE TESTS — from the saves module (framework/saves). Copied once by the installer; yours from now on.
// List every save the game makes (each createSave) in SAVES below, with a sample of real-looking data.
// For every save this proves:
//   - every golden save in this folder (a real save from each version: <key>-v<N>.json) loads with today's code
//   - a save → load round trip gives back the same data
//   - damaged saves (cut off, the wrong type, empty) fall back to the backup and never crash
//   - full or blocked storage never stops the game
// A game in progress (each createRun) goes in RUNS instead: the same checks on its save, and on top, a run ended with
// end() never comes back (not as Continue, not from a backup).
// Golden saves: see the top of src/saves/oldSaves.ts. check:framework also fails a save with no golden copy for a version.
import { describe, expect, it } from 'vitest'
import {
  checkDamagedSaves, checkFullStorage, checkGoldenSave, checkRoundTrip, checkRunEnds, goldenSavesFor, missingGoldenVersions, savesInCode,
  type RunUnderTest, type SaveUnderTest,
} from '../../src/saves/oldSaves'
// import { progressSave } from '../../src/progress/save'
// import { matchRun } from '../../src/game/run'

const SAVES: SaveUnderTest[] = [
  // { save: progressSave, sample: { totalXp: 1200, unlocks: ['hat'] } },
]

const RUNS: RunUnderTest[] = [
  // { run: matchRun, sample: { turn: 7, scores: [12, 9] } },
]

const golden = import.meta.glob('./*.json', { eager: true, import: 'default' })

// the game's own code (not the module's copy in src/saves/, not tests): a game with no createSave yet is skipped, not red
const gameCode = import.meta.glob(['../../src/**/*.{ts,tsx}', '!../../src/saves/**', '!../../src/**/*.test.*'], { eager: true, query: '?raw', import: 'default' })
const madeIn = savesInCode(gameCode)

if (!madeIn.length && !SAVES.length && !RUNS.length) {
  it.skip('no saves listed yet — add the game\'s first createSave (then list it in SAVES below)', () => {})
} else {
  it('every save the game makes is listed in SAVES or RUNS (tests/saves/saves.test.ts)', () => {
    expect(SAVES.length + RUNS.length, `add each createSave to SAVES (and each createRun to RUNS) at the top of this file — made in ${madeIn.join(', ')}`).toBeGreaterThan(0)
  })
}

// a run's save is tested like any other save
const everySave: SaveUnderTest[] = [...SAVES, ...RUNS.map(({ run, sample }) => ({ save: run.save, sample }))]

for (const { save, sample } of everySave) {
  describe(`save "${save.key}" (version ${save.version})`, () => {
    it('has a golden save for every version', () => {
      expect(missingGoldenVersions(save.key, save.version, Object.keys(golden)), 'missing tests/saves/ files for these versions').toEqual([])
    })
    for (const { file, golden: copy } of goldenSavesFor(save.key, golden)) {
      it(`${file} loads with today's code`, () => expect(checkGoldenSave(save, copy)).toEqual([]))
    }
    it('round trip: what is saved is what loads', () => expect(checkRoundTrip(save, sample)).toEqual([]))
    it('damaged saves fall back to the backup, never crash', () => expect(checkDamagedSaves(save, sample)).toEqual([]))
    it('full or blocked storage keeps the game running', () => expect(checkFullStorage(save, sample)).toEqual([]))
  })
}

for (const { run, sample } of RUNS) {
  it(`run "${run.key}": a run cleared at the end never comes back`, () => expect(checkRunEnds(run, sample)).toEqual([]))
}

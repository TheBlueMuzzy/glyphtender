// WHAT IS KEPT — the player's "Bot chatter" setting (Off · Some · Lots), through the saves module like every save, so
// a reload, a Rejoin and the next game keep it. No import of the saves module here, so a game without it still
// builds: the game makes the save itself, in its own code (so check:framework's Saves part sees it and asks for its
// golden save):
//   import { createSave } from './saves'
//   import { BANTER_SAVE } from './ai/kit/save'
//   const banterSave = createSave({ ...BANTER_SAVE, key: 'mygame:banter', version: 1 })   // version = BANTER_SAVE.version
//   const banter = botBanter({ …, save: banterSave })
// Golden save: tests/saves/mygame_banter-v1.json (the AI installer writes it once) and list banterSave in tests/saves/saves.test.ts.
import type { ChatterLevel } from './banter'

export interface BanterSaveData {
  /** The Settings row "Bot chatter": off = the bots say nothing, some = content/ai/banter.json's numbers, lots = more. */
  chatter: ChatterLevel
}

/** The smallest part of a saves-module save the bots' voice uses (createSave gives all of it). */
export interface BanterSaveLike {
  load(): BanterSaveData
  save(data: BanterSaveData): unknown
  readonly version?: number
}

/** The save's options for createSave, all but its key. Bump `version` (and add an upgrade) when the shape changes. */
export const BANTER_SAVE = {
  kind: 'settings' as const,
  version: 1,
  fresh: { chatter: 'some' } as BanterSaveData,
  /** A value out of shape → Some (a hand-edited or damaged save never breaks the game). */
  clean: (data: BanterSaveData): BanterSaveData => ({
    chatter: data && (data.chatter === 'off' || data.chatter === 'some' || data.chatter === 'lots') ? data.chatter : 'some',
  }),
}

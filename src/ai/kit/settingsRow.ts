// THE SETTINGS ROW — "Bot chatter" (Off · Some · Lots) for the UI kit's Settings (content/ui/settings.json). The UI
// kit draws it (a plain selector), so this part needs nothing from the UI kit. Muzzy 2026-10-23: "this is usually a
// menu setting".
// Paste BANTER_SETTINGS_ROWS into a tab's "rows" (under the Emotes heading is a good place), then:
//   applyBanterSetting(banter, loadSettings(settingsJson))                     // when the bots' voice is made (UI kit's loadSettings)
//   <Settings schema={settingsJson} onChange={(values) => applyBanterSetting(banter, values)} … />   // when it's changed: live
// The words (label, detail, the three options) are the row's own, in content/ui/settings.json once pasted — like the
// emotes row's. Settings' `labels` prop translates the label; the options are also the values, so keep them in English.
import { chatterLevelOf } from './banter'
import type { BotBanter } from './brain'

export const BANTER_SETTING = 'botChatter'

export const BANTER_SETTINGS_ROWS = [
  {
    id: BANTER_SETTING, type: 'selector', label: 'Bot chatter', options: ['Off', 'Some', 'Lots'], default: 'Some',
    detail: 'How often the computer players talk.',
  },
] as const

/** The Settings values → the bots' voice. A missing or unknown value leaves it as it is (the saved choice). */
export function applyBanterSetting(banter: Pick<BotBanter, 'setChatter'>, values: Record<string, unknown>) {
  const level = chatterLevelOf(values[BANTER_SETTING])
  if (level) banter.setChatter(level)
}

// THE SETTINGS ROWS — the crash reports switch for the UI kit's Settings (content/ui/settings.json). The UI kit draws
// them (a heading + a plain toggle), so this part needs nothing from the UI kit.
// Paste CRASH_SETTINGS_ROWS into a tab's "rows" (the About or Privacy tab), then in main.tsx after startCrashes:
//   applyCrashSetting(loadSettings(settingsJson))                     // the saved choice, at start-up (UI kit's loadSettings)
// and in the Settings screen:
//   <Settings schema={settingsJson} onChange={(values) => applyCrashSetting(values)} … />   // whenever the player flips it
import { setOn } from './capture'

export const CRASH_SETTING = 'crashReports'

export const CRASH_SETTINGS_ROWS = [
  { id: 'secCrashes', type: 'heading', label: 'Privacy' },
  {
    id: CRASH_SETTING, type: 'toggle', label: 'Send crash reports', default: true,
    detail: 'If the game breaks, it sends an anonymous report so it can be fixed. No name or IP is kept.',
  },
] as const

/** The Settings values → the switch. On unless the player turned it off (a missing value = the default, on). */
export function applyCrashSetting(values: Record<string, unknown>) {
  setOn(values[CRASH_SETTING] !== false)
}

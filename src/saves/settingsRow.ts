// THE SETTINGS ROW — the saves module's rows for the UI kit's Settings (content/ui/settings.json). The UI kit draws them
// (they're plain info + button rows), so the saves module needs nothing from the UI kit for this part.
// Paste SAVE_SETTINGS_ROWS into a tab's "rows" (the Account or About tab), then in the Settings screen:
//   info={{ ...info, saveHealth: healthLine(health) }}                         // "On this device" / "Safari may delete it"
//   onAction={(id) => { if (id === SAVE_CODE_ROW) screens.push('saveCode') }}  // opens SaveCodePanel (ui/SaveCodePanel.tsx)
export const SAVE_HEALTH_ROW = 'saveHealth'
export const SAVE_CODE_ROW = 'saveCode'

export const SAVE_SETTINGS_ROWS = [
  { id: 'secSaves', type: 'heading', label: 'Your save' },
  { id: SAVE_HEALTH_ROW, type: 'info', label: 'Saved' },
  { id: SAVE_CODE_ROW, type: 'button', label: 'Save code', detail: 'Copy your progress to keep it safe or move it to another device' },
] as const

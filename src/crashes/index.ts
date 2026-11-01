// THE CRASHES MODULE (F89) — catches a game's errors and sends each kind once per session to its own small server.
// Design: framework .planning/design/crashes.md. Import from 'src/crashes'.
//   startCrashes({ config: readCrashesConfig(crashesJson), version: appVersion })   main.tsx, once
//   applyCrashSetting(values)                                                         the Settings switch
//   watchCanvas(canvas) · moment('roundStart', 3) · reportError(error, { kind: 'game' })
// The "Something broke" screen + React's root options: './ui/crashRoot' (games with the UI kit only).
export { startCrashes, stopCrashes, setOn, reportError, moment, momentsFromGame, watchCanvas, fitInSize, type CrashOptions, type SendReport } from './capture'
export { CRASH_SETTING, CRASH_SETTINGS_ROWS, applyCrashSetting } from './settingsRow'
export { readCrashesConfig, DEFAULT_CRASHES_CONFIG, type CrashesConfig, type ClientConfig, type ServerConfig } from './config'
export { cleanTitle, fingerprint, fingerprintText, withoutBuildHash } from './fingerprint'
export * from './report'

// THE VERSION MODULE — import from 'src/version'. README: framework/version/README.md
// One source: version.json → versionPlugin() in vite.config (vitePlugin.mjs) bakes it in → these two names. Every
// place a player or a test looks shows versionLabel, so every game shows its version the same way:
//   <MainMenu version={versionLabel} …>      the main-menu footer (UI kit)
//   <Settings version={versionLabel} …>      the bottom of every Settings tab (UI kit 0.24.0)
//   version: versionLabel                    the Dev Kit adapter (snapshots + bug files)
// Without the plugin (a plain test run, a page built some other way) it says "dev" — never a made-up number.

/** "X.Y.Z.B" — version.json's version + build (or VERSION_BUILD), or "dev" when the build didn't bake one in. */
export const appVersion: string = import.meta.env.APP_VERSION ?? 'dev'

/** What every place shows: "vX.Y.Z.B" (or "dev"). */
export const versionLabel: string = appVersion === 'dev' ? 'dev' : `v${appVersion}`

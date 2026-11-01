// import.meta.env.APP_VERSION — "X.Y.Z.B", baked in by versionPlugin() (vitePlugin.mjs) from version.json.
// This file sits in the game's src/version/, so the game's TypeScript knows the name without any extra setup.
interface ImportMetaEnv {
  readonly APP_VERSION?: string
}

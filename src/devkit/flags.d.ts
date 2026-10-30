// Set by the Dev Kit's Vite plugin (vite-plugins/devkit/devkitVite.ts) from content/devkit.json "inReleaseBuilds":
// is the Dev Kit in release builds? main.tsx reads it.
declare const __DEVKIT_IN_RELEASE__: boolean

// The Tuning tab's extra files (0.28.0, F132): content/devkit.json "tuningFiles", checked and loaded by the plugin
declare module 'virtual:devkit-tuning-files' {
  const extra: { files: { name: string; path: string; after?: string; data: unknown }[]; problems: string[] }
  export default extra
}

// What the Dev Kit's own tests get for 'virtual:devkit-tuning-files' (devkit/vite.config.ts alias): no extra files.
// In a game the Dev Kit's Vite plugin makes the real one (vite-plugins/devkit/devkitVite.ts, step 6).
// (".test" in the name: install-devkit leaves it out of games.)
export default { files: [] as { name: string; path: string; after?: string; data: unknown }[], problems: [] as string[] }

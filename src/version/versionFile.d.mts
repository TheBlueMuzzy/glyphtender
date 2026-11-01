// Types for versionFile.mjs (used by vitePlugin.mjs and e2e.mjs; a game's TypeScript scripts may import it too).
export declare const VERSION_FILE: 'version.json'
export declare const BUILD_ENV: 'VERSION_BUILD'
export declare function versionOf(file: { version?: unknown; build?: unknown }, buildOverride?: string | number): string
export declare function readAppVersion(gameDir?: string, env?: Record<string, string | undefined>): string
export declare function labelOf(version: string): string
export declare function versionInHtml(html: string): string | null

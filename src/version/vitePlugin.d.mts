// Types for vitePlugin.mjs, so the game's vite.config.ts type-checks.
import type { Plugin } from 'vite'

export declare const META_NAME: 'app-version'
export declare const DEFINE_KEY: 'import.meta.env.APP_VERSION'
/** root = the folder with version.json (default: Vite's root). */
export declare function versionPlugin(options?: { root?: string }): Plugin

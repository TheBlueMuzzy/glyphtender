// Types for vitePlugin.mjs, so the game's vite.config.ts (and its e2e scripts) type-check.
import type { Plugin } from 'vite'

export declare const DEFAULT_PARTY_PORT: 1999
export declare const DEFINE_KEY: 'import.meta.env.PARTY_PORT'
export declare const WRANGLER_FILES: string[]
/** The game's local room port (wrangler.json dev.port, else 1999) and the wrangler file it came from (null: none). */
export declare function readPartyPort(root?: string): { port: number; file: string | null }
/** root = the folder with wrangler.json (default: Vite's root). */
export declare function roomsPort(options?: { root?: string }): Plugin

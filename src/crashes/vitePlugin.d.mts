// Types for vitePlugin.mjs, so the game's vite.config.ts type-checks.
import type { Plugin } from 'vite'

export declare const MAPS_FOLDER: 'releases'
/** The game folder's version.json → "X.Y.Z.B". */
export declare function readGameVersion(root: string, env?: Record<string, string | undefined>): string
/** Every .map file under a folder (relative paths). */
export declare function findMaps(folder: string): string[]
/** Moves every .map in outDir to mapsDir, keeping its path. → the paths moved. */
export declare function moveMaps(outDir: string, mapsDir: string): string[]
/** root = the game folder (default: Vite's root); version = what to file the maps under (default: version.json). */
export declare function crashesMaps(options?: { root?: string; version?: string }): Plugin

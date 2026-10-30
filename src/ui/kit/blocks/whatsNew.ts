import { settingsStorageKey } from './Settings'

// ───────────── WHAT'S NEW: SHOULD IT SHOW? ─────────────
// The rule behind the What's new panel (dialogs.tsx: showWhatsNew + WhatsNew). Design: .planning/design/ui-kit.md §4c.
// The game keeps its highlight lines in content/text/whats-new.json:
//   { "notesUrl": "https://…", "versions": { "0.4.0": ["Two new boards", "Faster dice", …] } }
// One entry per version it wants to announce (3–5 lines). A version with no entry (a hotfix, a build-only bump) shows
// nothing — the game decides by simply not writing one.
// Only X.Y.Z counts: "0.4.0.12" and "v0.4.0.13" are the same version here (the build number never shows the panel).

export type WhatsNewVersions = Record<string, readonly string[]>
export type WhatsNewEntry = { version: string; lines: readonly string[] }

/** Lines one panel shows at most (more → the first 5, and a dev-console note). */
export const MAX_WHATS_NEW_LINES = 5

type Parts = [number, number, number]
/** "0.4.0", "0.4.0.12" or "v0.4.0.12" → [0, 4, 0]. Anything else ("dev", "", "four") → null. */
export function versionParts(version: unknown): Parts | null {
  if (typeof version !== 'string') return null
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$/.exec(version.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
// Below 0 = a is older, 0 = the same X.Y.Z, above 0 = a is newer
const compare = (a: Parts, b: Parts) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
const plain = (p: Parts) => p.join('.')

/** What the title says: "0.4" for 0.4.0, "0.4.1" for 0.4.1. */
export function shortVersion(version: string): string {
  const p = versionParts(version)
  if (!p) return version
  return p[2] === 0 ? `${p[0]}.${p[1]}` : plain(p)
}

/** The decision for one launch:
 *  entry    — the panel to show now (null = show nothing)
 *  remember — the version to store as "last seen" now (null = leave the record as it is).
 *  The rules, in order:
 *  - this build's version can't be read ("dev", a plain test run) → nothing, remember nothing
 *  - no last seen (a first install) or a garbled one → remember this version, show nothing
 *  - the same X.Y.Z (a build-only bump too) or an older one (a downgrade) → nothing; the record stays
 *  - newer → the newest entry above last seen, up to this version (a skipped release's lines still show after a
 *    hotfix with none of its own) + remember this version; no such entry → just remember it */
export function whatsNewDecision(current: string, lastSeen: unknown, versions: WhatsNewVersions = {}):
  { entry: WhatsNewEntry | null; remember: string | null } {
  const now = versionParts(current)
  if (!now) return { entry: null, remember: null }
  const seen = versionParts(lastSeen)
  if (!seen) return { entry: null, remember: plain(now) }
  if (compare(now, seen) <= 0) return { entry: null, remember: null }

  let newest: { parts: Parts; lines: readonly string[] } | null = null
  for (const [key, lines] of Object.entries(versions)) {
    const parts = versionParts(key)
    if (!parts || !Array.isArray(lines)) continue
    const shown = lines.filter((line) => typeof line === 'string' && line.trim() !== '')
    if (!shown.length || compare(parts, seen) <= 0 || compare(parts, now) > 0) continue
    if (!newest || compare(parts, newest.parts) > 0) newest = { parts, lines: shown }
  }
  const entry = newest ? { version: plain(newest.parts), lines: newest.lines.slice(0, MAX_WHATS_NEW_LINES) } : null
  return { entry, remember: plain(now) }
}

/** What's wrong with a whats-new.json's versions, in plain words (the dev console shows these; a test can too). */
export function whatsNewProblems(versions: WhatsNewVersions = {}): string[] {
  const problems: string[] = []
  for (const [key, lines] of Object.entries(versions)) {
    if (!versionParts(key) || key.split('.').length !== 3) problems.push(`"${key}" isn't a version like "0.4.0" — it never shows`)
    else if (!Array.isArray(lines)) problems.push(`${key}: the lines must be a list ["…", "…"]`)
    else if (lines.length > MAX_WHATS_NEW_LINES) problems.push(`${key} has ${lines.length} lines — only the first ${MAX_WHATS_NEW_LINES} show (keep it to highlights)`)
  }
  return problems
}

// ── Last seen: one string in the browser, under "kit-whats-new:<game folder>" (the same slot naming as the
// settings and tips, so games on one site never share). Private browsing can refuse it: then nothing is
// remembered, the panel simply never shows (no last seen = treated as a first install), and nothing breaks.
export function whatsNewStorageKey() {
  return `kit-whats-new${settingsStorageKey().slice('kit-settings'.length)}`
}
export function readLastSeen(storageKey = whatsNewStorageKey()): string | null {
  try { return localStorage.getItem(storageKey) } catch { return null }
}
export function writeLastSeen(version: string, storageKey = whatsNewStorageKey()) {
  try { localStorage.setItem(storageKey, version) } catch { /* not remembered, still works */ }
}

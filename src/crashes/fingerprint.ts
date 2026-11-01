// THE FINGERPRINT — what makes two reports "the same bug" (design: .planning/design/crashes.md "One report").
// fp = the first 16 hex of SHA-256 of: kind + cleaned title + the top 3 in-game frames as file:function.
// No line, no column, and file names without their build hash — so the same bug has the same fp in every session and
// every build. Cleaning the title also keeps a player's name out: quoted text, numbers and ids never travel.
import { MAX_TITLE_CHARS, withoutHidden, type Frame, type ReportKind } from './report'

/** "Cannot find player 'Bob' at 12" → 'Cannot find player "…" at #'. Quoted text, hex ids and numbers go, cut to 200. */
export function cleanTitle(text: string): string {
  return withoutHidden(text)
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”/g, '"…"') // quoted text (a name, a key someone typed)
    .replace(/\b0x[0-9a-f]+\b/gi, '<id>') // 0x1f3a
    .replace(/\b[0-9a-f]{4,}(?:-[0-9a-f]{4,})*\b/gi, (word) => (looksLikeId(word) ? '<id>' : word)) // a1b2c3d4, uuids
    .replace(/\b\d+(?:\.\d+)?\b/g, '#') // 12, 3.5 (but not the 32 in Float32Array)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_CHARS)
}

// A hex word is an id when it mixes digits and letters ("a1b2c3d4"); "cafe" or "1234" alone are not.
const looksLikeId = (word: string) => /\d/.test(word) && /[a-f]/i.test(word)

/** "assets/index-Bx12.js" → "assets/index.js". Only a last "-part" with a capital or a digit counts as a hash,
 *  so "board-view.js" stays as it is. */
export function withoutBuildHash(file: string): string {
  return file.replace(/-(?=[A-Za-z0-9_]*[A-Z0-9])[A-Za-z0-9_]{4,12}(?=\.[A-Za-z0-9]+$)/, '')
}

/** The text the fingerprint is made from. Also used on its own, in memory, to spot a repeat straight away. */
export function fingerprintText(kind: ReportKind, title: string, frames: Frame[]): string {
  const top = frames.slice(0, 3).map((f) => `${withoutBuildHash(f.file)}:${f.fn ?? ''}`)
  return [kind, title, ...top].join('\n')
}

/** SHA-256 → the first 16 hex. null when the browser has no crypto.subtle (a page on plain http, not https) —
 *  then the report isn't sent, rather than sent under a different kind of fingerprint. */
export async function fingerprint(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
}

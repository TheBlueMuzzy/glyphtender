// The Fonts tab's line to the dev server's font library (vite/fontLibrary.ts). Dev only: a live build has no dev
// server, so the tab doesn't ask (CAN_SAVE) and shows no Library section.
import type { KitFont } from '../color/uiKit'
import { CAN_SAVE } from '../saveContent'

export type LibraryFont = { path: string; name: string; folder: string }
export type LibraryList = { folder: string; found: boolean; fonts: LibraryFont[]; more: boolean }

const URL_BASE = '/__devkit/font-library'

/** The fonts in the designer's font library folder. Throws with a plain reason. */
export async function loadLibrary(): Promise<LibraryList> {
  if (!CAN_SAVE) throw new Error('the font library needs npm run dev')
  let res: Response
  try {
    res = await fetch(URL_BASE)
  } catch {
    throw new Error('the dev server is not reachable (is npm run dev still running?)')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `the dev server said ${res.status}`)
  return body as LibraryList
}

/** Where a library font's file is served from (for a preview). */
export const libraryFontUrl = (path: string) => `${URL_BASE}/file?path=${encodeURIComponent(path)}`

/** Copy a library font into the game (public/fonts/, fonts.json, credits.json). Returns its fonts.json entry. */
export async function addLibraryFont(path: string): Promise<{ font: KitFont; wrote: string[]; already: boolean }> {
  let res: Response
  try {
    res = await fetch(`${URL_BASE}/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })
  } catch {
    throw new Error('the dev server is not reachable (is npm run dev still running?)')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `the dev server said ${res.status}`)
  return body
}

/** Load a font file under a family name so the page can draw with it (a library preview). */
export async function previewFont(name: string, url: string): Promise<void> {
  const face = new FontFace(name, `url("${url}")`)
  document.fonts.add(face)
  await face.load()
}

// SAVE CODE — the player's saves as one copy-paste text (and the same text as a file), the cheapest safety net
// against everything the browser can do (Safari's 7-day rule, the itch.io frame, "clear site data", a new phone).
//
//   const code = await makeSaveCode([progress, settings])   // "GOOPS-1z-eNqrVkrOz…"
//   const result = await readSaveCode(pasted, [progress, settings])
//   if (!result.ok) toast(result.message)                   // plain words; NOTHING was changed
//
// A code = <GAME>-<format><z|j>-<data>. z = compressed (the browser's own CompressionStream), j = plain (an old
// browser without it). The data is { game, made, saves: { <key>: <record> } } — each save's record exactly as the save
// keeps it (with its version), so a code made today still loads in every later build (upgrades run on it).
// Loading checks EVERY save in the code before writing ANY: a bad code never wipes the player's save. (If the browser
// then refuses a write part-way — full storage — the result names exactly which saves were and weren't restored.)
// Progress saves are MERGED with what's here (each field by its rule — a pasted older code can't lose progress);
// settings, runs and slots are replaced. Either way the copy it replaces stays as the newest backup.
import type { Save, SaveRecord, SlotSaves } from './saves'

export const SAVE_CODE_FORMAT = 1
type AnySave = Save<any> | SlotSaves<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- any of the game's saves

// A code is untrusted text (anyone can post "my 100% save, paste this"): a real save is a few KB, so anything far
// bigger is refused before it's unpacked, and unpacking stops early — a tiny code can't swell into hundreds of MB
// and freeze the tab, or fill the storage other games share on itch.io (security review, 2026-10-19)
export const MAX_CODE_CHARS = 300_000
export const MAX_UNPACKED_BYTES = 2_000_000

export const CODE_WORDS = {
  empty: 'Paste a save code first.',
  notACode: 'That isn\'t a save code. Copy the whole code and try again.',
  otherGame: (game: string) => `That save code is for another game (${game}).`,
  newerFormat: 'That save code comes from a newer version of the game. Reload the page to update the game, then try again.',
  damaged: 'That save code is damaged or incomplete. Copy the whole code again and paste it here.',
  tooBig: 'That save code is far bigger than any real save, so it wasn\'t loaded.',
  nothingForThisGame: 'That save code has no saves for this game.',
  newerSave: 'That save code comes from a newer version of the game. Reload the page to update the game, then try again.',
  notSaved: (why: string) => `The save code is fine, but it couldn't be saved here: ${why}`,
  partly: (restored: string[], notRestored: string[], why: string) =>
    `Part of the save code was loaded (${restored.join(', ')}), but not all of it (${notRestored.join(', ')}): ${why}`,
}

/** The game's name in a code: the start of the first save's key ("goops-progress" → "GOOPS"). */
export function gameLabel(saves: AnySave[]): string {
  return (saves[0]?.key.match(/^[A-Za-z0-9]+/)?.[0] ?? 'GAME').toUpperCase()
}

/** Every record to put in a code, by storage key (a slots save gives one per slot). */
function recordsOf(saves: AnySave[]): Record<string, SaveRecord> {
  const out: Record<string, SaveRecord> = {}
  for (const save of saves) {
    if ('slot' in save) {
      for (const { id } of save.slots()) {
        const record = save.slot(id).exportRecord()
        if (record) out[`${save.key}/${id}`] = record
      }
    } else {
      const record = save.exportRecord()
      if (record) out[save.key] = record
    }
  }
  return out
}

/** The player's saves → one code. */
export async function makeSaveCode(saves: AnySave[], now = new Date()): Promise<string> {
  const json = JSON.stringify({ game: gameLabel(saves).toLowerCase(), made: now.toISOString(), saves: recordsOf(saves) })
  const bytes = new TextEncoder().encode(json)
  const packed = await compress(bytes)
  return `${gameLabel(saves)}-${SAVE_CODE_FORMAT}${packed ? 'z' : 'j'}-${toBase64Url(packed ?? bytes)}`
}

export type CodeResult =
  | { ok: true; restored: string[]; skipped: string[] }
  /** restored / notRestored are there when writing started: then restored names what DID change (empty = nothing). */
  | { ok: false; message: string; restored?: string[]; notRestored?: string[] }

/** Did PART of a code come in? (0.6.3, F137) Then the game holds some new saves but still shows the old values —
 *  it needs the same reload as a full load (the Save code panel offers it). */
export const partlyLoaded = (result: CodeResult) => !result.ok && (result.restored?.length ?? 0) > 0

/** A pasted code (or a file's text) → checked, then written. { ok: false } without `restored` (or with it empty) =
 *  nothing was changed; with saves in `restored`, those were (the message says so). */
export async function readSaveCode(code: string, saves: AnySave[]): Promise<CodeResult> {
  const text = (code ?? '').replace(/\s+/g, '')
  if (!text) return { ok: false, message: CODE_WORDS.empty }
  if (text.length > MAX_CODE_CHARS) return { ok: false, message: CODE_WORDS.tooBig }
  const match = text.match(/^([A-Za-z0-9]+)-(\d+)([zj])-([A-Za-z0-9_-]+)$/)
  if (!match) return { ok: false, message: CODE_WORDS.notACode }
  const [, label, format, packing, data] = match
  if (label.toUpperCase() !== gameLabel(saves)) return { ok: false, message: CODE_WORDS.otherGame(label.toUpperCase()) }
  if (Number(format) > SAVE_CODE_FORMAT) return { ok: false, message: CODE_WORDS.newerFormat }
  let content: { saves?: Record<string, unknown> }
  try {
    const bytes = fromBase64Url(data)
    const unpacked = packing === 'z' ? await decompress(bytes) : bytes
    if (!unpacked) return { ok: false, message: CODE_WORDS.tooBig }
    content = JSON.parse(new TextDecoder().decode(unpacked))
  } catch {
    return { ok: false, message: CODE_WORDS.damaged }
  }
  if (!content || typeof content.saves !== 'object' || content.saves === null) return { ok: false, message: CODE_WORDS.damaged }

  // 1. check every record first — nothing is written unless all of them are good
  const plan: { target: Save<unknown>; record: SaveRecord<unknown> }[] = []
  const skipped: string[] = []
  for (const [key, raw] of Object.entries(content.saves)) {
    const target = targetFor(key, saves)
    if (!target) { skipped.push(key); continue }
    const checked = target.checkRecord(raw)
    if (!checked.ok) return { ok: false, message: checked.newer ? CODE_WORDS.newerSave : CODE_WORDS.damaged }
    plan.push({ target, record: checked.record })
  }
  if (!plan.length) return { ok: false, message: CODE_WORDS.nothingForThisGame }

  // 2. write them: progress merges with what's here, everything else is replaced (the old copy becomes a backup).
  //    The browser can still refuse a write part-way (full storage): every save is tried, and the result names
  //    exactly which were restored and which weren't — never "nothing changed" when something did.
  const restored: string[] = []
  const notRestored: string[] = []
  let why = ''
  for (const { target, record } of plan) {
    const here = target.kind === 'progress' ? target.exportRecord() : null
    const mine = here && here.version === target.version ? target.checkRecord(here) : null
    const result = target.restoreRecord(mine?.ok ? target.merge(mine.record, record) : record)
    if (result.ok) restored.push(target.key)
    else { notRestored.push(target.key); why ||= result.message }
  }
  if (!notRestored.length) return { ok: true, restored, skipped }
  if (!restored.length) return { ok: false, message: CODE_WORDS.notSaved(why), restored, notRestored }
  return { ok: false, message: CODE_WORDS.partly(restored, notRestored, why), restored, notRestored }
}

/** Which save a key in a code belongs to: a save's own key, or "<slots key>/<id>" → that slot. */
function targetFor(key: string, saves: AnySave[]): Save<unknown> | null {
  for (const save of saves) {
    if ('slot' in save) {
      if (key.startsWith(`${save.key}/`) && key !== `${save.key}/list`) return save.slot(key.slice(save.key.length + 1))
    } else if (save.key === key) {
      return save
    }
  }
  return null
}

// --- the file version of the code ---------------------------------------------------------------------------------

/** "goops-save-2026-10-19.txt" */
export function saveFileName(saves: AnySave[], now = new Date()): string {
  return `${gameLabel(saves).toLowerCase()}-save-${now.toISOString().slice(0, 10)}.txt`
}

/** Give the player the code as a file (their browser's download). false = this browser couldn't. */
export function downloadSaveFile(code: string, fileName: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([code + '\n'], { type: 'text/plain' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch {
    return false
  }
}

/** A file the player picked → its text (then readSaveCode). */
export async function readSaveFile(file: Blob): Promise<string> {
  // only as much as a code may be (+1, so a bigger file is still told "too big", not read whole)
  return await file.slice(0, MAX_CODE_CHARS + 1).text()
}

/** Copy text to the clipboard. Inside a frame from another site (itch.io) the clipboard API is often refused, so the
 *  old select-and-copy way is tried too. false = neither worked (the player can still select the text themselves). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = Object.assign(document.createElement('textarea'), { value: text })
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const done = document.execCommand('copy') // old, but the one way that works in a cross-site frame
      area.remove()
      return done
    } catch {
      return false
    }
  }
}

// --- packing ------------------------------------------------------------------------------------------------------

async function compress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

/** Unpacks a code; null when it would grow past MAX_UNPACKED_BYTES (it stops reading there). */
async function decompress(bytes: Uint8Array): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const pieces: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_UNPACKED_BYTES) { void reader.cancel(); return null }
    pieces.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const piece of pieces) { out.set(piece, at); at += piece.length }
  return out
}

/** Bytes → letters, digits, - and _ only (safe in a chat message, a URL, a file name). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

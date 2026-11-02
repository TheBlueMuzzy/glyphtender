// LINK CODES — the save code, short enough to type (F96). The player's save code goes to the game's OWN server
// (cloud/worker.ts, on Muzzy's Cloudflare) and comes back as "K7QM-2XRP"; typed on the other device, the save comes in
// through readSaveCode — the same checks as a pasted code, and progress MERGES by each field's rule (best kept,
// counts added). The code lasts content/saves.json cloud.keepDays (7), then the server deletes it.
//
//   const cloud = { url: cloudAddress(import.meta.env.VITE_SAVES_CLOUD) }    // null = this build has no cloud
//   const made = await makeLinkCode([progress], cloud)       // { ok, link: 'K7QM-2XRP', expiresAt } | { ok: false, message }
//   const result = await loadLinkCode(typed, [progress], cloud)   // a CodeResult, like readSaveCode
//   await deleteLinkCode([progress], cloud)                  // "Delete my data"
//
// Offline first: the save on this device is the real one; the cloud only carries a copy. No network, the server
// down or too slow → one plain sentence, and nothing on this device changed.
import { savesConfig } from './config'
import { readLinkCode, showLinkCode } from './cloudRoutes'
import { createSave, type Save, type SlotSaves } from './saves'
import { gameLabel, makeSaveCode, readSaveCode, type CodeResult } from './saveCode'
import type { StorageLike } from './storage'

type AnySave = Save<any> | SlotSaves<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- any of the game's saves

/** The cloud worker's local port (cloud/wrangler.json "dev"), next to the rooms server's 1999. */
export const CLOUD_PORT = 1998

export const CLOUD_WORDS = {
  nothingYet: 'There\'s no save on this device yet — play a little first.',
  offline: 'Couldn\'t reach the game\'s server — check your connection and try again. Nothing on this device was changed.',
  notALink: 'A link code has 8 letters and numbers, like K7QM-2XRP.',
  notFound: (days: number) => `That link code didn't work. Check it for typos — a link code stops working after ${days} days, or once it's deleted.`,
  tooManyTries: 'Too many wrong link codes from this connection. Try again in an hour.',
  tooManyCodes: 'That\'s a lot of link codes in one hour. Try again later, or use the save code.',
  tooBig: 'This save is too big to send as a link code — use the save code instead.',
  serverFull: 'The game\'s server is full right now — use the save code instead.',
  serverProblem: 'The game\'s server had a problem. Try again in a moment, or use the save code.',
  deleted: 'Deleted: your link code and the copy of your save on the server are gone.',
  alreadyGone: 'That link code was already gone (it expired or was deleted).',
  /** The privacy line: what's stored, where, how long, how to delete. */
  privacy: (days: number) => `A link code puts a copy of your save (nothing else — no name, no account) on this game's own server (Cloudflare) for ${days} days, then it deletes itself. "Delete my data" removes it now.`,
  /** "Works until Tue 27 Oct" */
  worksUntil: (expiresAt: number) => `Works on any device until ${new Date(expiresAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}.`,
}

export interface CloudOptions {
  /** The cloud worker's address (cloudAddress()), or null when this build has none. */
  url: string | null
  /** Where this device remembers its link code (default: the browser's storage). */
  storage?: StorageLike | null
  /** Tests pass their own. */
  fetch?: typeof fetch
  online?: () => boolean
  /** Give up after this long (ms) — a phone on a bad signal shouldn't wait forever. */
  timeoutMs?: number
  now?: () => number
}

export type LinkResult = { ok: true; link: string; expiresAt: number } | { ok: false; message: string }

/**
 * Where the game finds its cloud. The live build sets VITE_SAVES_CLOUD (e.g. goops-saves.joebrogno.workers.dev);
 * unset on this PC or a phone on the same Wi-Fi = the PC's own cloud worker (port 1998); unset anywhere else = no
 * cloud (null), and the Save code screen doesn't show link codes at all.
 */
export function cloudAddress(envValue?: string | null, page: { protocol: string; hostname: string } | null = typeof location === 'undefined' ? null : location): string | null {
  return serverAddress(envValue, CLOUD_PORT, page)
}

/** A small server of the game's own (the cloud, the board — F98): the build's setting, else the PC's own on `port` when
 *  the page is on this PC or the Wi-Fi, else none (null). */
export function serverAddress(envValue: string | null | undefined, port: number, page: { protocol: string; hostname: string } | null): string | null {
  const set = (envValue ?? '').trim().replace(/\/+$/, '')
  if (set) return /^https?:\/\//.test(set) ? set : `https://${set}`
  if (!page) return null
  const local = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/.test(page.hostname)
  return local ? `http://${page.hostname}:${port}` : null
}

// --- the link code this device made or used (so "Delete my data" knows what to delete) ---------------------------

function linkMemory(saves: AnySave[], storage: StorageLike | null | undefined) {
  return createSave<{ link: string; expiresAt: number }>({
    key: `${gameLabel(saves).toLowerCase()}:link-code`, kind: 'settings', version: 1, storage,
    fresh: { link: '', expiresAt: 0 },
  })
}

/** This device's link code, while it still works → { link: 'K7QM-2XRP', expiresAt }, else null. */
export function linkCodeHere(saves: AnySave[], { storage, now = () => Date.now() }: Pick<CloudOptions, 'storage' | 'now'> = {}): { link: string; expiresAt: number } | null {
  const { link, expiresAt } = linkMemory(saves, storage).load()
  return link && expiresAt > now() ? { link: showLinkCode(link), expiresAt } : null
}

// --- talking to the server ----------------------------------------------------------------------------------------

export type Answer = { ok: true; body: Record<string, unknown> } | { ok: false; code: string }

/** One POST to the cloud (or the board, board.ts). Never throws: no network / timed out → code 'offline'; a broken
 *  answer → 'server'. */
export async function ask(path: string, body: unknown, options: CloudOptions): Promise<Answer> {
  if (!options.url) return { ok: false, code: 'offline' }
  if (!(options.online?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false))) return { ok: false, code: 'offline' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
  try {
    const response = await (options.fetch ?? fetch)(`${options.url}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    })
    const answer = await response.json().catch(() => null) as Record<string, unknown> | null
    if (answer?.ok === true) return { ok: true, body: answer }
    return { ok: false, code: typeof answer?.code === 'string' ? answer.code : 'server' }
  } catch {
    return { ok: false, code: 'offline' }
  } finally {
    clearTimeout(timer)
  }
}

/** A refusal's code → one plain sentence. */
function message(code: string): string {
  switch (code) {
    case 'offline': return CLOUD_WORDS.offline
    case 'not-a-link': return CLOUD_WORDS.notALink
    case 'not-found': return CLOUD_WORDS.notFound(savesConfig().cloud.keepDays)
    case 'too-many-tries': return CLOUD_WORDS.tooManyTries
    case 'too-many-codes': return CLOUD_WORDS.tooManyCodes
    case 'too-big': return CLOUD_WORDS.tooBig
    case 'server-full': return CLOUD_WORDS.serverFull
    default: return CLOUD_WORDS.serverProblem
  }
}

/** The player's saves → a link code on the game's server ("K7QM-2XRP"), remembered on this device. */
export async function makeLinkCode(saves: AnySave[], options: CloudOptions): Promise<LinkResult> {
  const anything = saves.some((save) => ('slot' in save ? save.slots().length > 0 : save.exportRecord() !== null))
  if (!anything) return { ok: false, message: CLOUD_WORDS.nothingYet } // an empty code would only overwrite nothing
  const answer = await ask('/saves/link', { code: await makeSaveCode(saves) }, options)
  if (!answer.ok) return { ok: false, message: message(answer.code) }
  const link = String(answer.body.link)
  const expiresAt = Number(answer.body.expiresAt)
  linkMemory(saves, options.storage).save({ link, expiresAt })
  return { ok: true, link: showLinkCode(link), expiresAt }
}

/** A typed link code → the save from the server → checked and merged exactly like a pasted save code. */
export async function loadLinkCode(typed: string, saves: AnySave[], options: CloudOptions): Promise<CodeResult> {
  const link = readLinkCode(typed)
  if (!link) return { ok: false, message: CLOUD_WORDS.notALink }
  const answer = await ask('/saves/get', { link }, options)
  if (!answer.ok) return { ok: false, message: message(answer.code) }
  const result = await readSaveCode(String(answer.body.code), saves)
  // remembered here too, so "Delete my data" works from this device as well — but never over this device's OWN live
  // code: that one would be forgotten and "Delete my data" could no longer reach it (review F96). "Live" by the game's
  // own clock, like linkCodeHere (2026-10-27: the real clock here turned the test red once its fixed date was 7 days old)
  const memory = linkMemory(saves, options.storage)
  const own = memory.load()
  const now = options.now?.() ?? Date.now()
  if (result.ok && !(own.link && own.expiresAt > now)) memory.save({ link, expiresAt: Number(answer.body.expiresAt) })
  return result
}

/** "Delete my data": this device's link code and the copy of the save under it, gone from the server now. */
export async function deleteLinkCode(saves: AnySave[], options: CloudOptions): Promise<{ ok: boolean; message: string }> {
  const memory = linkMemory(saves, options.storage)
  const { link } = memory.load()
  if (!link) return { ok: true, message: CLOUD_WORDS.alreadyGone }
  const answer = await ask('/saves/delete', { link }, options)
  if (!answer.ok && answer.code !== 'not-found') return { ok: false, message: message(answer.code) } // kept: try again later
  memory.save({ link: '', expiresAt: 0 })
  return { ok: true, message: answer.ok ? CLOUD_WORDS.deleted : CLOUD_WORDS.alreadyGone }
}

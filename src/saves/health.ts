// STORAGE HEALTH — will this browser keep the player's saves? On web games, saves are mostly lost to the browser,
// not to bugs (framework/.planning/research/saves.md). This finds the risky cases and says them in plain words:
//   blocked   — the browser refuses to store anything: progress lasts until the page closes
//   private   — looks like a private window: everything is wiped when it closes
//   itch      — running in itch.io's frame: this save is separate from the game's own site, and some browsers clear it
//   frame     — running inside another site's frame (an embed): the same, without itch's name
//   safari    — Safari deletes a site's saved data after 7 days of using Safari without opening the game
//               (a game added to the Home Screen keeps its own days)
//   not-kept  — the browser hasn't promised to keep the data (it may clear it when the device is low on space)
// None of these can be fixed by the game — the answer is always the save code (saveCode.ts), and for Safari also
// "Add to Home Screen". Private-window detection is a best guess (browsers hide it on purpose): it says "looks like".
//
//   const health = await checkSaveHealth()      // once at start-up (no prompts)
//   await askToKeepSaves()                      // after the first real progress (Firefox shows a question)
import { readKey, removeKey, savesOnNativeStorage, savesStorage, writeKey, type StorageLike } from './storage'

export type WarningId = 'blocked' | 'private' | 'itch' | 'frame' | 'safari' | 'not-kept'

export interface SaveWarning {
  id: WarningId
  /** risk = saves may well be lost · note = worth knowing */
  level: 'risk' | 'note'
  message: string
}

export interface SaveHealth {
  /** The browser lets the game store data at all. */
  canSave: boolean
  /** The browser promised to keep the data (navigator.storage.persisted), or null when it can't say. */
  kept: boolean | null
  /** Running inside another site's frame (itch.io, an embed). */
  inFrame: boolean
  onItch: boolean
  /** Most serious first. Empty = nothing to worry about. */
  warnings: SaveWarning[]
}

export const HEALTH_WORDS: Record<WarningId, string> & { ok: string; okShort: string } = {
  blocked: 'This browser won\'t let the game save. Your progress lasts until you close the page — copy your save code to keep it.',
  private: 'This looks like a private window: your progress is wiped when it closes. Copy your save code to keep it.',
  itch: 'On itch.io, saves live inside itch\'s frame: they\'re separate from the game\'s own site, and some browsers clear them. Copy your save code now and then.',
  frame: 'The game is running inside another site, where some browsers clear saves. Copy your save code now and then.',
  safari: 'Safari deletes a site\'s saves after 7 days without a visit. Add the game to your Home Screen, or copy your save code now and then.',
  'not-kept': 'The browser may clear saves if the device runs low on space. Copying your save code now and then keeps them safe.',
  ok: 'Your progress is saved on this device.',
  okShort: 'On this device',
}

/** What the health check looks at — the real browser by default; tests pass their own. */
export interface HealthEnv {
  storage: StorageLike | null
  userAgent: string
  storageManager?: Partial<Pick<StorageManager, 'persisted' | 'persist' | 'estimate' | 'getDirectory'>>
  /** true when inside a frame whose page is on another site */
  crossSiteFrame: boolean
  hostname: string
  /** Started from the Home Screen (iPhone) or as an installed app. */
  standalone: boolean
  /** The JavaScript memory limit (Chrome only), for the private-window guess. */
  heapLimit?: number
  /** The saves are in a phone or desktop app's own storage (setSavesStorage(…, { native: true })): the browser's
   *  risks (Safari's 7 days, private windows, frames, "not kept") don't apply — only "can it save at all?". */
  native?: boolean
}

export function browserEnv(): HealthEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  let crossSiteFrame = false
  let standalone = false
  let hostname = ''
  try {
    if (typeof window !== 'undefined') {
      hostname = window.location.hostname
      if (window.self !== window.top) {
        try { crossSiteFrame = !window.top?.location.href } catch { crossSiteFrame = true } // reading another site's address throws
      }
      standalone = (nav as { standalone?: boolean } | undefined)?.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches
    }
  } catch { /* leave the defaults */ }
  return {
    storage: savesStorage(),
    native: savesOnNativeStorage(),
    userAgent: nav?.userAgent ?? '',
    storageManager: nav?.storage,
    crossSiteFrame, hostname, standalone,
    heapLimit: (typeof performance !== 'undefined' ? (performance as { memory?: { jsHeapSizeLimit?: number } }).memory?.jsHeapSizeLimit : undefined),
  }
}

const PROBE_KEY = '__saves-probe__'
const isItch = (hostname: string) => /(^|\.)itch\.(zone|io)$|(^|\.)hwcdn\.net$/.test(hostname)
/** Safari itself — not Chrome / Firefox / Edge on an iPhone, which say "Safari" too. */
const isSafari = (ua: string) => /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|EdgA|Edg\/|OPR|Android)/.test(ua)
const isChromium = (ua: string) => /(Chrome|Chromium|Edg)\//.test(ua) && !/Android.*wv/.test(ua)

/** Can this storage hold a value? (write, read back, remove) */
function storageWorks(storage: StorageLike | null): boolean {
  if (writeKey(storage, PROBE_KEY, '1') !== null) return false
  const ok = readKey(storage, PROBE_KEY) === '1'
  removeKey(storage, PROBE_KEY)
  return ok
}

/** A best guess, never a certainty: Firefox and Safari refuse their private-file storage in a private window;
 *  Chrome gives a private window far less room than a normal one. */
async function looksPrivate(env: HealthEnv): Promise<boolean> {
  const manager = env.storageManager
  try {
    if (manager?.getDirectory && !isChromium(env.userAgent)) {
      try { await manager.getDirectory() } catch { return true }
    }
    if (manager?.estimate && isChromium(env.userAgent)) {
      const { quota } = await manager.estimate()
      const limit = env.heapLimit ?? 1024 * 1024 * 1024
      if (typeof quota === 'number' && quota < limit * 2) return true
    }
  } catch { /* can't tell */ }
  return false
}

export async function checkSaveHealth(env: HealthEnv = browserEnv(), words = HEALTH_WORDS): Promise<SaveHealth> {
  const warnings: SaveWarning[] = []
  const canSave = storageWorks(env.storage)
  if (env.native) {
    if (!canSave) warnings.push({ id: 'blocked', level: 'risk', message: words.blocked })
    return { canSave, kept: canSave ? true : null, inFrame: false, onItch: false, warnings }
  }
  const onItch = isItch(env.hostname)
  const inFrame = env.crossSiteFrame || onItch
  let kept: boolean | null = null
  try { kept = env.storageManager?.persisted ? await env.storageManager.persisted() : null } catch { kept = null }

  if (!canSave) warnings.push({ id: 'blocked', level: 'risk', message: words.blocked })
  else if (await looksPrivate(env)) warnings.push({ id: 'private', level: 'risk', message: words.private })
  if (onItch) warnings.push({ id: 'itch', level: 'risk', message: words.itch })
  else if (inFrame) warnings.push({ id: 'frame', level: 'risk', message: words.frame })
  if (isSafari(env.userAgent) && !env.standalone) warnings.push({ id: 'safari', level: 'risk', message: words.safari })
  if (canSave && kept === false && !warnings.length) warnings.push({ id: 'not-kept', level: 'note', message: words['not-kept'] })
  return { canSave, kept, inFrame, onItch, warnings }
}

/** Ask the browser to keep the game's data (navigator.storage.persist). Chrome and Safari decide by themselves (how
 *  much the player uses the site); Firefox asks the player — so call this after the first real progress, not at start.
 *  true = promised. Never throws. */
export async function askToKeepSaves(env: Pick<HealthEnv, 'storageManager'> = browserEnv()): Promise<boolean> {
  try {
    const manager = env.storageManager
    if (!manager?.persist) return false
    if (manager.persisted && (await manager.persisted())) return true
    return await manager.persist()
  } catch {
    return false
  }
}

/** One short line for the Settings row ("Saved on this device: …"): the most serious warning, or "On this device". */
export function healthLine(health: SaveHealth | null, words = HEALTH_WORDS): string {
  const top = health?.warnings.find((w) => w.level === 'risk')
  if (!top) return words.okShort
  return ({ blocked: 'Not saving', private: 'Private window', itch: 'In itch.io\'s frame', frame: 'In another site', safari: 'Safari may delete it', 'not-kept': words.okShort } as const)[top.id]
}

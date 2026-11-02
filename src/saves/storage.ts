// WHERE SAVES ARE KEPT — the browser's localStorage, reached safely. Every read and write can fail
// (a private window that refuses storage, a full disk, Safari blocking a site inside a frame), so nothing
// here ever throws: a refused read is "nothing saved", a refused write is reported back.
// Tests pass their own storage with the same three methods; a phone or desktop build switches the whole kit to
// its platform's storage once at start-up (setSavesStorage, usually through openSaves in platform.ts).

/** What a save needs from a storage. localStorage has it all; so does memoryStorage below. A storage without
 *  removeItem (an older game's test helper) works too: a removed copy is written as "" instead (read as nothing). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

/** The browser's localStorage, or null where there is none (tests in Node, a browser that blocks it). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // some browsers throw just for looking at localStorage when storage is blocked
  }
}

// --- the one switch: where every save, run, link code, board memory and health check keeps its data ---------------

let chosen: { storage: StorageLike | null; native: boolean } | null = null

/** Point the whole saves kit at another storage (a phone app's or desktop app's — see openSaves). Call it once at
 *  start-up, before the first save is read. `native: true` = the platform's own storage, not the browser's, so the
 *  health check drops the browser-only warnings (Safari's 7 days, private windows, itch.io's frame).
 *  `setSavesStorage(undefined)` goes back to the browser's localStorage. A call that passes its own `storage` still wins. */
export function setSavesStorage(storage: StorageLike | null | undefined, { native = false }: { native?: boolean } = {}): void {
  chosen = storage === undefined ? null : { storage, native }
}

/** The storage the kit uses when a call doesn't pass its own: the one set with setSavesStorage, else localStorage. */
export function savesStorage(): StorageLike | null {
  return chosen ? chosen.storage : browserStorage()
}

/** A storage that asks savesStorage() on every read and write — what a save made without its own `storage` keeps.
 *  So a save created when the game's files load (before openSaves has finished) still uses the switched storage. */
export const switchedStorage: StorageLike & { readonly length?: number } = {
  /** How many keys the storage behind holds (undefined when it can't say) — writeKey's "empty storage" check. */
  get length() {
    const length = (savesStorage() as { length?: unknown } | null)?.length
    return typeof length === 'number' ? length : undefined
  },
  getItem: (key) => savesStorage()?.getItem(key) ?? null,
  setItem: (key, value) => {
    const storage = savesStorage()
    if (!storage) throw new Error('storage is blocked') // what writeKey reports as "blocked", like a null storage
    storage.setItem(key, value)
  },
  removeItem: (key) => {
    const storage = savesStorage()
    if (storage) removeKey(storage, key)
  },
}

/** true when the kit was switched to a platform's own storage (setSavesStorage(…, { native: true })). */
export function savesOnNativeStorage(): boolean {
  return chosen?.native ?? false
}

/** Read a key; any failure = nothing there. */
export function readKey(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Why a write didn't happen, in one word: the storage is full, or the browser refused it. */
export type WriteProblem = 'full' | 'blocked'

/** Write a key → null when it worked, or what went wrong. */
export function writeKey(storage: StorageLike | null, key: string, value: string): WriteProblem | null {
  if (!storage) return 'blocked'
  try {
    storage.setItem(key, value)
    return null
  } catch (error) {
    if (!isFullError(error)) return 'blocked'
    // "Quota exceeded" on a storage holding NOTHING isn't a full storage: it's one with no room at all — Safari's
    // private window up to Safari 10 threw exactly this on every write. The player hears "blocked" (a private window),
    // not "full" (F150; proven in the real-browser test, scripts/browsers.test.mjs). Storages without a `length`
    // (memoryStorage, a platform's storage) can't tell, so they keep "full".
    return holdsNothing(storage) ? 'blocked' : 'full'
  }
}

function holdsNothing(storage: StorageLike): boolean {
  try {
    return (storage as { length?: unknown }).length === 0
  } catch {
    return false
  }
}

export function removeKey(storage: StorageLike | null, key: string): void {
  try {
    if (storage?.removeItem) storage.removeItem(key)
    else if (storage && storage.getItem(key) !== null) storage.setItem(key, '')
  } catch {
    // refused: nothing to do
  }
}

/** Browsers name "storage is full" differently (QuotaExceededError, Firefox's NS_ERROR_DOM_QUOTA_REACHED, code 22 / 1014). */
export function isFullError(error: unknown): boolean {
  const e = error as { name?: string; code?: number } | null
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
}

/** A pretend storage for tests: keeps keys in memory. `full = true` makes every write fail like a full browser storage;
 *  `blocked = true` makes every read and write throw like a browser that refuses storage. */
export interface MemoryStorage extends StorageLike {
  removeItem(key: string): void
  data: Record<string, string>
  full: boolean
  blocked: boolean
}

export function memoryStorage(start: Record<string, string> = {}): MemoryStorage {
  const storage: MemoryStorage = {
    data: { ...start },
    full: false,
    blocked: false,
    getItem(key) {
      if (storage.blocked) throw new Error('storage is blocked')
      return Object.hasOwn(storage.data, key) ? storage.data[key] : null
    },
    setItem(key, value) {
      if (storage.blocked) throw new Error('storage is blocked')
      if (storage.full) throw Object.assign(new Error('storage is full'), { name: 'QuotaExceededError' })
      storage.data[key] = String(value)
    },
    removeItem(key) {
      if (storage.blocked) throw new Error('storage is blocked')
      delete storage.data[key]
    },
  }
  return storage
}

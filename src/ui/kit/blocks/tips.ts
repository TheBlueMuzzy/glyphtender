import { useSyncExternalStore } from 'react'
import { settingsStorageKey } from './Settings'

// ───────────── TIPS MEMORY ─────────────
// Which one-time tips this player has seen, and the Tips on / off switch (on by default). Saved in the browser
// under "kit-tips:<game folder>" — the same slot naming as the settings (see settingsStorageKey), so games on one
// site never share. Private browsing can refuse the save: then it lasts until the page reloads, and nothing breaks.
//   const tips = useTips()                 in a component (re-renders when anything changes)
//   tipsMemory()                           the same store from plain game code (an engine event handler)
//   tips.shouldShow('your-danger')         Tips on and not seen yet
//   tips.markSeen('your-danger')           shown once → never again (until Reset tips)
//   tips.setTipsOn(false) · tips.resetTips()   the Settings rows
export function tipsStorageKey() {
  return `kit-tips${settingsStorageKey().slice('kit-settings'.length)}`
}

type TipsSaved = { on: boolean; seen: string[] }
export type Tips = {
  tipsOn: boolean; seenIds: readonly string[]
  seen: (id: string) => boolean; shouldShow: (id: string) => boolean
  markSeen: (id: string) => void; setTipsOn: (on: boolean) => void; resetTips: () => void
  subscribe: (listener: () => void) => () => void
}

function readTips(storageKey: string): TipsSaved {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    return { on: saved?.on !== false, seen: Array.isArray(saved?.seen) ? saved.seen.filter((id: unknown) => typeof id === 'string') : [] }
  } catch { return { on: true, seen: [] } }
}
function writeTips(storageKey: string, saved: TipsSaved) {
  try { localStorage.setItem(storageKey, JSON.stringify(saved)) } catch { /* not remembered, still works */ }
}

const tipStores = new Map<string, Tips>()
export function tipsMemory(storageKey = tipsStorageKey()): Tips {
  const existing = tipStores.get(storageKey)
  if (existing) return existing
  let state = readTips(storageKey)
  const listeners = new Set<() => void>()
  const change = (next: TipsSaved) => {
    state = next
    writeTips(storageKey, state)
    snapshot = make()
    tipStores.set(storageKey, snapshot)
    listeners.forEach((l) => l())
  }
  // A fresh object after every change, so React sees something new (useSyncExternalStore compares by identity)
  const make = (): Tips => ({
    tipsOn: state.on, seenIds: state.seen,
    seen: (id) => state.seen.includes(id),
    shouldShow: (id) => state.on && !state.seen.includes(id),
    markSeen: (id) => { if (!state.seen.includes(id)) change({ ...state, seen: [...state.seen, id] }) },
    setTipsOn: (on) => { if (on !== state.on) change({ ...state, on }) },
    resetTips: () => { if (state.seen.length) change({ ...state, seen: [] }) },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  })
  let snapshot = make()
  tipStores.set(storageKey, snapshot)
  return snapshot
}

export function useTips(storageKey = tipsStorageKey()): Tips {
  const store = tipsMemory(storageKey)
  const current = () => tipStores.get(storageKey) ?? store
  return useSyncExternalStore(store.subscribe, current, current)
}

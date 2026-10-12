// SUBMIT A WORD — sending it (F69). POST <party host>/words/submit { word } to our own server (party/wordsRoutes.ts).
// The player always hears "Word submitted" (the server answers the same for a new word and a repeat). If the server
// can't be reached — no signal, server down, a build without a server — the word waits on this device (localStorage)
// and goes on the next app start or when the phone is back online. Only a "too short" answer is ever shown.
import { partyHost } from './session'
import submit from '../../../content/words/submit.json'

const QUEUE_KEY = 'glyphtender:wordsToSend'
// The same rule as Play online (menus.tsx): local dev always has a server; a live build only if VITE_PARTY_HOST was set
const hasServer = () => import.meta.env.DEV || !!import.meta.env.VITE_PARTY_HOST

/** What happened to a word: reached the server · kept to send later · refused as too short. */
export type SendResult = 'sent' | 'queued' | 'too-short'

/** The server's address for submitting. http for this computer / the home Wi-Fi (as PartySocket picks ws), else https. */
export function submitUrl(host: string): string {
  const local = /^(localhost:|127\.0\.0\.1:|192\.168\.|10\.|\[::ffff:7f00:1\]:)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  return `${local ? 'http' : 'https'}://${host}/words/submit`
}

/** One try at the server: 'sent' (it answered ok) · 'too-short' · 'refused' (not a word — nothing to retry) · 'failed'. */
async function post(word: string): Promise<'sent' | 'too-short' | 'refused' | 'failed'> {
  if (!hasServer()) return 'failed'
  try {
    // text/plain keeps it a "simple" request: the browser doesn't ask the server's permission first (CORS preflight)
    const response = await fetch(submitUrl(partyHost()), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ word }) })
    if (response.ok) return 'sent'
    if (response.status === 400) {
      const answer = (await response.json().catch(() => ({}))) as { code?: string }
      return answer.code === 'too-short' ? 'too-short' : 'refused'
    }
    return 'failed' // the server had a problem: try again later
  } catch {
    return 'failed' // offline / unreachable
  }
}

// ---- the words waiting on this device (a private window or blocked storage → just not kept) ----
function readQueue(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : []
  } catch {
    return []
  }
}
function writeQueue(list: string[]) {
  try {
    if (list.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-submit.queueMax)))
    else localStorage.removeItem(QUEUE_KEY)
  } catch { /* storage blocked: nothing to keep */ }
}
/** The words waiting to be sent (the e2e check reads this). */
export const queuedWords = readQueue

/** Sends a word the player picked. */
export async function sendWord(word: string): Promise<SendResult> {
  const answer = await post(word)
  if (answer === 'too-short') return 'too-short'
  if (answer === 'failed') {
    writeQueue([...readQueue().filter((w) => w !== word), word])
    return 'queued'
  }
  return 'sent'
}

let sending = false
/** Tries every waiting word once; those that still can't get through stay waiting. */
export async function sendQueuedWords(): Promise<void> {
  if (sending || !readQueue().length) return
  sending = true
  try {
    for (const word of readQueue()) {
      if ((await post(word)) === 'failed') continue
      writeQueue(readQueue().filter((w) => w !== word))
    }
  } finally {
    sending = false
  }
}

/** At app start (main.tsx): send what waited from last time, and again whenever the device comes back online. */
export function startWordOutbox() {
  void sendQueuedWords()
  addEventListener('online', () => void sendQueuedWords())
}

// The Sound tab's trips to the dev server and the sound files:
//   uploadSound  → POST /__devkit/save-audio (vite/audioSave.ts): the file becomes an MP3 in public/audio/<folder>/
//   addCredit    → POST /__devkit/add-credit: one entry appended to content/credits.json
//   loadWaveform → fetch + decode a file once (cached), for the waveform drawing
import type { creditEntry } from './soundLogic'

export type SavedSound = { path: string; file: string; trimmedMs: number }

async function answer(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `the dev server said ${res.status}`)
  return body
}

/** Sends a dropped-in file to the dev server. Resolves to where it landed ("sfx/sfx_seed_land_03.mp3"). Throws a plain reason. */
export async function uploadSound(file: Blob, target: { folder: string; stem: string; bus: string; ext: string }): Promise<SavedSound> {
  const query = new URLSearchParams(target).toString()
  let res: Response
  try {
    res = await fetch(`/__devkit/save-audio?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
  } catch {
    throw new Error('the dev server is not reachable (is npm run dev still running?)')
  }
  return answer(res)
}

export async function addCredit(entry: ReturnType<typeof creditEntry>): Promise<void> {
  let res: Response
  try {
    res = await fetch('/__devkit/add-credit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry }) })
  } catch {
    throw new Error('the dev server is not reachable (is npm run dev still running?)')
  }
  await answer(res)
}

/** "/glyphtender/" + "sfx/a.mp3" → "/glyphtender/audio/sfx/a.mp3" (same rule as the audio module's loader) */
export function soundUrl(baseUrl: string, file: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}audio/${file.replace(/^\/+/, '')}`
}

export type Waveform = { samples: Float32Array; durationMs: number }
const waveforms = new Map<string, Promise<Waveform>>()

/** A file's samples (first channel) and length — decoded once per file (forgetWaveform after it's replaced) */
export function loadWaveform(url: string): Promise<Waveform> {
  let pending = waveforms.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.arrayBuffer()
      })
      .then((data) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(data))
      .then((buffer) => ({ samples: buffer.getChannelData(0), durationMs: buffer.duration * 1000 }))
    pending.catch(() => waveforms.delete(url)) // a failed load can be tried again
    waveforms.set(url, pending)
  }
  return pending
}

export const forgetWaveform = (url: string) => waveforms.delete(url)

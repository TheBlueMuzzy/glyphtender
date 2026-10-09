// THE LOADER — fetches each sound file once, decodes it, and keeps it (a cache by file name).
// Files live in the game's public/audio/ folder; the game passes its base URL because it may be served under a
// subpath (GitHub Pages: /glyphtender/), so "sfx/pop_01.mp3" loads from <baseUrl>audio/sfx/pop_01.mp3.
// TODO (framework F28): long music and ambience should STREAM through an <audio> element (MediaElementSource) instead of
// being decoded whole — a decoded 3-minute stereo track is ~69 MB. For now everything is decoded; keep beta loops short.

export type FetchFile = (url: string) => Promise<ArrayBuffer>
export type Decode = (data: ArrayBuffer) => Promise<AudioBuffer>

export interface Loader {
  /** The decoded file if it is ready, else undefined (never waits) */
  get(file: string): AudioBuffer | undefined
  /** Loads a file (once — later calls share the same load). Resolves to null if it can't be loaded or decoded. */
  load(file: string): Promise<AudioBuffer | null>
  /** Loads many files; never rejects */
  preload(files: readonly string[]): Promise<void>
  /** Forget a file (the Dev Kit replaced it) so the next play loads it fresh */
  forget(file: string): void
}

/** "/glyphtender/" + "sfx/a.mp3" → "/glyphtender/audio/sfx/a.mp3" */
export function audioUrl(baseUrl: string, file: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}audio/${file.replace(/^\/+/, '')}`
}

export const fetchArrayBuffer: FetchFile = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.arrayBuffer()
}

export function createLoader(options: { decode: Decode; baseUrl?: string; fetchFile?: FetchFile; warn?: (message: string) => void }): Loader {
  const { decode, baseUrl = '/', fetchFile = fetchArrayBuffer, warn = (m) => console.warn(`[audio] ${m}`) } = options
  const ready = new Map<string, AudioBuffer>()
  const loading = new Map<string, Promise<AudioBuffer | null>>()

  function load(file: string): Promise<AudioBuffer | null> {
    const done = ready.get(file)
    if (done) return Promise.resolve(done)
    const pending = loading.get(file)
    if (pending) return pending
    const url = audioUrl(baseUrl, file)
    const promise = fetchFile(url)
      .then((data) => decode(data))
      .then((buffer) => {
        ready.set(file, buffer)
        return buffer
      })
      .catch((error: unknown) => {
        // A missing or broken file stays silent (and is logged as not-loaded), the game carries on
        warn(`couldn't load ${url} (${error instanceof Error ? error.message : String(error)}) — that sound will be silent.`)
        return null
      })
    loading.set(file, promise)
    return promise
  }

  return {
    get: (file) => ready.get(file),
    load,
    async preload(files) {
      await Promise.all([...new Set(files)].map(load))
    },
    forget(file) {
      ready.delete(file)
      loading.delete(file)
    },
  }
}

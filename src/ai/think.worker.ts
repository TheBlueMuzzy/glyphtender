// THE AI'S BACKGROUND THINKER — a Web Worker, so the screen never freezes while an AI picks its move (F42, framework
// F21). It loads the official word list itself, once (the same file the game fetches — the browser's cache serves it
// the second time), then answers every "think" request with seatBrain.ts (serveThinking, src/ai/kit/pace.ts).
// Requests that arrive while the words are still loading wait for them, in order. If the words can't be loaded, each
// request gets a plain-English error back (the page then tries again on the main thread — thinker.ts).
import { serveThinking, type WorkerLike } from './kit/pace'
import { seatThinking, type ThinkRequest, type ThinkResult } from './seatBrain'
import { parseWordFile, wordListFor } from '../engine/words'
import type { WordList } from '../engine/types'
import { wordListUrl } from '../game/art'

// (the worker's global scope; typed as just the two calls used, so the page's DOM types stay as they are)
const scope = self as unknown as {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

/** The thinking, once the words are here. Each request's view carries its game's config, so the AI plays with that
 *  game's list (F71: + British spellings / vulgar words when the game switched them on) — one thinking per list. */
const ready: Promise<(request: ThinkRequest) => ThinkResult> = fetch(wordListUrl())
  .then((response) => {
    if (!response.ok) throw new Error(`The AI couldn't load the word list (HTTP ${response.status})`)
    return response.text()
  })
  .then((csv) => {
    const file = parseWordFile(csv)
    const thinkings = new Map<WordList, (request: ThinkRequest) => ThinkResult>()
    return (request: ThinkRequest) => {
      const words = wordListFor(file, request.view.config.extraWords)
      let thinking = thinkings.get(words)
      if (!thinking) thinkings.set(words, (thinking = seatThinking(words)))
      return thinking(request)
    }
  })

let think: ((request: ThinkRequest) => ThinkResult) | null = null
ready.then((fn) => { think = fn }, () => {})

/** The worker's own messages, but each one held until the words are loaded (or answered with the loading error). */
const waitingForWords: WorkerLike = {
  postMessage: (message) => scope.postMessage(message),
  addEventListener: (_type, listener) => {
    scope.addEventListener('message', (event) => {
      ready.then(
        () => listener(event),
        (error: Error) => scope.postMessage({ id: (event.data as { id: number }).id, error: error.message }),
      )
    })
  },
}

serveThinking<ThinkRequest, ThinkResult>(waitingForWords, (request) => think!(request))

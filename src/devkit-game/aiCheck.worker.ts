// The Dev Kit's Personality Check, off the main thread (a Web Worker), so the game and the Dev Kit stay alive while
// dozens of AI-vs-AI games play. Messages:
//   in:   { request: CheckRequest, wordsUrl }                  (aiCheck.ts sends it)
//   out:  { progress: [done, total] } … then { html } or { error }
import { parseWordList } from '../engine/words'
import { runPersonalityCheck, type CheckRequest } from './aiCheckRun'

self.onmessage = async (e: MessageEvent<{ request: CheckRequest; wordsUrl: string }>) => {
  try {
    const res = await fetch(e.data.wordsUrl)
    if (!res.ok) throw new Error(`the word list didn't load (${res.status})`)
    const words = parseWordList(await res.text())
    const html = runPersonalityCheck(e.data.request, words, (done, total) => self.postMessage({ progress: [done, total] }))
    self.postMessage({ html })
  } catch (error) {
    self.postMessage({ error: (error as Error).message })
  }
}

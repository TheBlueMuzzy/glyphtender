// THE AI'S THINKER FOR ONE GAME (F42) — where an AI seat's decisions are worked out. In the browser: a Web Worker
// (think.worker.ts) so the screen never freezes. Where there are no workers (tests, Node): the same thinking right
// here (inlineThinker). Both give back a promise, so the bot driver (store/localBot.ts) doesn't care which.
// If the worker ever fails (it couldn't load the words, say), that one decision is worked out on the page instead
// with the game's own word list — slower, but the game carries on.
// Make one per game; stop() it when the game ends or is left (answers still on the way are then dropped).
import { inlineThinker, makeThinker, type Thinker } from './kit/pace'
import { seatThinking, type ThinkRequest, type ThinkResult } from './seatBrain'
import type { WordList } from '../engine/types'

export type AiThinker = Thinker<ThinkRequest, ThinkResult>

/** A thinker for a new game. `words` = the game's word list (already loaded on the page; used without a worker). */
export function makeGameThinker(words: WordList): AiThinker {
  const onPage = inlineThinker(seatThinking(words))
  if (typeof Worker === 'undefined') return onPage
  let inWorker: AiThinker
  try {
    inWorker = makeThinker<ThinkRequest, ThinkResult>(new Worker(new URL('./think.worker.ts', import.meta.url), { type: 'module' }))
  } catch (error) {
    console.warn('The AI thinks on the page (no background worker)', error)
    return onPage
  }
  let stopped = false
  return {
    think: (request) => inWorker.think(request).catch((error: Error) => {
      if (stopped) throw error
      console.warn('The AI worker failed — thinking on the page this time', error)
      return onPage.think(request)
    }),
    stop: () => {
      stopped = true
      inWorker.stop()
      onPage.stop()
    },
  }
}

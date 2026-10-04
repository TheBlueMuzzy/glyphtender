// THE AI MODULE — PACE + THINKING IN THE BACKGROUND.
//
// Pace: a bot takes a person-like moment before it acts — a random think time per kind of action (draft, turn,
// refresh…) divided by the player's speed setting (Slow 0.5 · Normal 1 · Fast 2 · Instant 0 = no wait). The time the
// brain actually spent thinking counts toward that moment, so a slow phone doesn't make it slower still.
// Background: the brain runs in a Web Worker so the screen never freezes. The game makes the worker (that's
// bundler-specific: `new Worker(new URL('./think.worker.ts', import.meta.url), { type: 'module' })`); this file gives
// both ends of the conversation: `serveThinking` inside the worker, `makeThinker` on the page. No worker (tests,
// Node, the server) → `inlineThinker` runs the same function right there.
import { nextRandom } from './random'

export interface Pace {
  /** Seconds a bot "thinks" before each kind of action, picked between min and max. Unknown kinds use `default`. */
  think: Record<string, { min: number; max: number }>
  /** Speed setting → how much faster than Normal (Normal 1). 0 = no wait at all (Instant). */
  speeds: Record<string, number>
  /** The most real thinking time one decision should take, in ms (the plug's candidate counts are tuned to it). */
  timeBudgetMs: number
}

/** How long this bot waits before acting, in ms, for an action kind at a speed. */
export function thinkDelay(pace: Pace, kind: string, speed: string, rng: number): { ms: number; rng: number } {
  const range = pace.think[kind] ?? pace.think.default ?? { min: 1, max: 1 }
  const factor = pace.speeds[speed] ?? 1
  const r = nextRandom(rng)
  if (factor <= 0) return { ms: 0, rng: r.rng }
  return { ms: Math.round(((range.min + r.value * (range.max - range.min)) / factor) * 1000), rng: r.rng }
}

/** How much longer to wait after thinking took `spentMs` of the `delayMs` moment (never below 0). */
export const waitLeft = (delayMs: number, spentMs: number) => Math.max(0, delayMs - spentMs)

// ─── Thinking in the background ───

interface Ask<Request> { id: number; request: Request }
type Answer<Result> = { id: number; result: Result } | { id: number; error: string }

/** The small part of a Worker this needs (so tests can pass a fake). */
export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void
  terminate?(): void
}

export interface Thinker<Request, Result> {
  think(request: Request): Promise<Result>
  stop(): void
}

/** Inside the worker: answer every request with `fn` (errors come back as plain-English messages). */
export function serveThinking<Request, Result>(scope: WorkerLike, fn: (request: Request) => Result): void {
  scope.addEventListener('message', (event) => {
    const { id, request } = event.data as Ask<Request>
    try {
      scope.postMessage({ id, result: fn(request) } satisfies Answer<Result>)
    } catch (e) {
      scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies Answer<Result>)
    }
  })
}

/** On the page: send requests to the worker, get promises back. After stop(), answers still on the way are dropped. */
export function makeThinker<Request, Result>(worker: WorkerLike): Thinker<Request, Result> {
  let nextId = 1
  let stopped = false
  const waiting = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>()
  worker.addEventListener('message', (event) => {
    const answer = event.data as Answer<Result>
    const w = waiting.get(answer.id)
    if (!w || stopped) return
    waiting.delete(answer.id)
    if ('error' in answer) w.reject(new Error(answer.error))
    else w.resolve(answer.result)
  })
  // The worker itself crashed (failed to load, ran out of memory…): every question still waiting gets an error, and so
  // does every later one — the game can fall back to thinking on the page instead of waiting forever.
  let crashed: string | null = null
  worker.addEventListener('error', (event) => {
    crashed = event.message || 'the thinking worker stopped working'
    for (const w of waiting.values()) w.reject(new Error(crashed))
    waiting.clear()
  })
  return {
    think(request) {
      if (stopped) return Promise.reject(new Error('This thinker was stopped'))
      if (crashed) return Promise.reject(new Error(crashed))
      const id = nextId++
      return new Promise<Result>((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        worker.postMessage({ id, request } satisfies Ask<Request>)
      })
    },
    stop() {
      stopped = true
      waiting.clear()
      worker.terminate?.()
    },
  }
}

/** Same promise shape, no worker: runs `fn` right away (tests, Node, the online server). */
export function inlineThinker<Request, Result>(fn: (request: Request) => Result): Thinker<Request, Result> {
  let stopped = false
  return {
    think: (request) => (stopped ? Promise.reject(new Error('This thinker was stopped')) : new Promise<Result>((resolve) => resolve(fn(request)))),
    stop: () => {
      stopped = true
    },
  }
}

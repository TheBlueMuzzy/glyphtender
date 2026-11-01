// RUN CHECK OFF THE PAGE'S MAIN THREAD — both ends of the Web Worker that plays the AI tab's Personality Check (and,
// 0.26.0, its "Suggest sliders"), so the game and the Dev Kit stay alive (and smooth) while dozens of AI-vs-AI games
// play. The Dev Kit never imports the game's AI: the game writes a tiny worker file that hands its own check function
// (and tune function) to `serveCheck`, and its runCheck / suggest start that worker with `runCheckInWorker` /
// `suggestInWorker`:
//
//   // src/devkit-game/aiCheck.worker.ts — inside the worker
//   import { serveCheck } from '../devkit/ai/checkWorker'
//   import { runArena, devKitSettings } from '../ai/kit/arena'
//   import { tunePersonality } from '../ai/kit/tune'
//   import { reportHtml } from '../ai/kit/report'
//   serveCheck(self,
//     (job, onProgress) => reportHtml(runArena(plug, { ...job, targets, settings: devKitSettings(arenaJson, job.games) }, onProgress).report),
//     (job, onProgress) => tunePersonality(plug, { personalities: job.personalities, skills: job.skills, targets }, job.personality, { settings: arenaJson, onProgress }))
//
//   // src/devkit-game/aiDevKit.ts — on the page
//   const start = () => new Worker(new URL('./aiCheck.worker.ts', import.meta.url), { type: 'module' })
//   runCheck: (options) => runCheckInWorker(start, options),
//   suggest: (options) => suggestInWorker(start, options),
//
// Messages: page → worker { job, extra, kind? } (the games or the personality to tune, the personalities and skills
// as they are in the tab, unsaved edits too; extra = anything else the game's worker needs; kind 'tune' = suggest);
// worker → page { progress: [done, total] } after every game, then { html } — or for a tune { tuneProgress } after
// every game, then { tune } — or { error }. One job per worker; the page closes the worker when it's done.
import type { AiTuneProgress, AiTuneResult, DevKitAi } from './aiTypes'

/** What the AI tab's Run check hands the game. */
export type CheckOptions = Parameters<NonNullable<DevKitAi['runCheck']>>[0]
/** The same without the progress callback (a function can't be posted to a worker). */
export type CheckJob = Omit<CheckOptions, 'onProgress'>
/** What the AI tab's "Suggest sliders" hands the game (0.26.0). */
export type SuggestOptions = Parameters<NonNullable<DevKitAi['suggest']>>[0]
/** The same without the progress callback: which personality, and the cast as it is in the tab. */
export type SuggestJob = Omit<SuggestOptions, 'onProgress' | 'signal'>

/** A Web Worker, or the worker's own `self` (anything that posts and hears messages the same way). */
export interface CheckWorkerLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void
  terminate?(): void
}

type FromWorker = { progress: [number, number] } | { html: string } | { tuneProgress: AiTuneProgress } | { tune: AiTuneResult } | { error: string }

/** Start a worker, send it one job, and settle with what `read` makes of its messages ({ value } = done; nothing =
 *  keep listening). Anything it doesn't know, a crash or a worker that won't start rejects, in plain English. */
function ask<T>(start: () => CheckWorkerLike, payload: unknown, read: (data: FromWorker) => { value: T } | 'more' | undefined, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('stopped'))
    let worker: CheckWorkerLike
    try {
      worker = start()
    } catch (e) {
      return reject(new Error(`the check's worker didn't start: ${(e as Error).message}`))
    }
    let done = false
    const finish = (then: () => void) => {
      if (done) return
      done = true
      worker.terminate?.()
      then()
    }
    worker.addEventListener('message', (event) => {
      if (done) return
      const data = event.data as FromWorker
      const got = read(data)
      if (got === 'more') return
      if (got) finish(() => resolve(got.value))
      else finish(() => reject(new Error(('error' in data && data.error) || 'the check stopped')))
    })
    worker.addEventListener('error', (event) => finish(() => reject(new Error(event.message || "the check's worker stopped working"))))
    // Stopped by the page (the panel closed mid-run): the worker is closed too, so its games stop using the computer
    signal?.addEventListener('abort', () => finish(() => reject(new Error('stopped'))), { once: true })
    // Plain data only (a personality edited in the tab is plain JSON already)
    worker.postMessage(JSON.parse(JSON.stringify(payload)))
  })
}

/** On the page: start the worker, send it the job, pass its progress on, and resolve with the report page (HTML).
 *  `extra` = anything else the game's worker needs, as plain data (e.g. its word list's full address — a worker's own
 *  address differs from the page's). A check that fails (or a worker that won't start) rejects with the reason. */
export function runCheckInWorker(start: () => CheckWorkerLike, { onProgress, ...job }: CheckOptions, extra?: unknown): Promise<string> {
  return ask<string>(start, { job, extra }, (data) => {
    if ('progress' in data) {
      onProgress(...data.progress)
      return 'more'
    }
    return 'html' in data ? { value: data.html } : undefined
  })
}

/** On the page (0.26.0): "Suggest sliders" — the same worker, a tune job; progress per game ("Try 4 / 20"), then the
 *  tuner's result. It only suggests: nothing is written anywhere. */
export function suggestInWorker(start: () => CheckWorkerLike, { onProgress, signal, ...job }: SuggestOptions, extra?: unknown): Promise<AiTuneResult> {
  return ask<AiTuneResult>(start, { job, extra, kind: 'tune' }, (data) => {
    if ('tuneProgress' in data) {
      onProgress(data.tuneProgress)
      return 'more'
    }
    return 'tune' in data ? { value: data.tune } : undefined
  }, signal)
}

/** Inside the worker: run each job with the game's own check function (it may be async — e.g. to fetch a word list
 *  first) and send back progress, then the report page or what went wrong. `extra` = what the page passed along.
 *  `tune` (0.26.0, optional) = the game's "Suggest sliders": the AI kit's tunePersonality for job.personality — its
 *  result goes back as plain data. Without it, a suggest job says so in plain English. */
export function serveCheck<Extra = unknown>(
  scope: CheckWorkerLike,
  run: (job: CheckJob, onProgress: (done: number, total: number) => void, extra: Extra) => string | Promise<string>,
  tune?: (job: SuggestJob, onProgress: (p: AiTuneProgress) => void, extra: Extra) => unknown,
): void {
  scope.addEventListener('message', async (event) => {
    const { job, extra, kind } = event.data as { job: CheckJob & SuggestJob; extra: Extra; kind?: 'tune' }
    try {
      if (kind === 'tune') {
        if (!tune) throw new Error("this game's check worker can't suggest sliders yet — give serveCheck a tune function (the AI README's \"Suggest sliders\")")
        const result = await tune(job, (p) => scope.postMessage({ tuneProgress: p } satisfies FromWorker), extra)
        scope.postMessage({ tune: JSON.parse(JSON.stringify(result)) as AiTuneResult } satisfies FromWorker)
        return
      }
      const html = await run(job, (done, total) => scope.postMessage({ progress: [done, total] } satisfies FromWorker), extra)
      scope.postMessage({ html } satisfies FromWorker)
    } catch (e) {
      scope.postMessage({ error: e instanceof Error ? e.message : String(e) } satisfies FromWorker)
    }
  })
}

// Runs the Dev Kit AI tab's "Run check" in a Web Worker (aiCheck.worker.ts) and hands back the report page (HTML).
// One check at a time; the worker is closed when it's done.
import feelTargets from '../../content/ai/feel-targets.json'
import type { FeelTargetsFile } from '../ai/arena'
import type { Personality, Skill } from '../ai/kit/types'
import type { AiPersonality, AiSkill } from '../devkit/ai/aiTypes'
import { wordListUrl } from '../game/art'
import type { CheckRequest } from './aiCheckRun'

type Options = { games: number; personalities: AiPersonality[]; skills: AiSkill[]; onProgress: (done: number, total: number) => void }

export function runCheckInWorker({ games, personalities, skills, onProgress }: Options): Promise<string> {
  const request: CheckRequest = {
    games,
    personalities: personalities as unknown as Personality[],
    skills: skills as unknown as Skill[],
    targets: feelTargets as unknown as FeelTargetsFile,
  }
  // The word list's full address: the worker's own address differs from the page's
  const wordsUrl = new URL(wordListUrl(), location.href).href
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./aiCheck.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ progress?: [number, number]; html?: string; error?: string }>) => {
      if (e.data.progress) return onProgress(...e.data.progress)
      worker.terminate()
      if (e.data.html !== undefined) resolve(e.data.html)
      else reject(new Error(e.data.error ?? 'the check stopped'))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || "the check's worker failed to start"))
    }
    worker.postMessage({ request, wordsUrl })
  })
}

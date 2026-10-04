// RUN THE PERSONALITY CHECK — plays N AI-vs-AI games with the personalities and skills as they are in the tab right
// now (unsaved changes too) and opens the report page in a new browser tab. The game does the playing (its runCheck
// callback — Glyphtender runs it in a Web Worker so the screen stays alive); this shows progress and the link.
import { useEffect, useState } from 'react'
import type { AiPersonality, AiSkill, DevKitAi } from './aiTypes'

const GAME_CHOICES = [6, 20, 60] // a quick look · a fair read · a proper check (slow)

type Props = {
  runCheck: NonNullable<DevKitAi['runCheck']>
  personalities: AiPersonality[]
  skills: AiSkill[]
}

export function CheckPanel({ runCheck, personalities, skills }: Props) {
  const [games, setGames] = useState(GAME_CHOICES[0])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [reportUrl, setReportUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => { if (reportUrl) URL.revokeObjectURL(reportUrl) }, [reportUrl])

  async function run() {
    setError(null)
    setReportUrl(null)
    setProgress({ done: 0, total: games })
    try {
      const html = await runCheck({ games, personalities, skills, onProgress: (done, total) => setProgress({ done, total }) })
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      setReportUrl(url)
      window.open(url, '_blank') // may be blocked (it isn't straight after a click) — the link below always works
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="ai-check">
      <p className="tt-help">
        Plays AI-vs-AI games with the personalities as they are here (unsaved changes too) and checks each one's feel
        targets, tell-apart, wins and the skill ladder. The report opens in a new tab.
      </p>
      <div className="ai-watch-bar">
        <label>
          Games{' '}
          <select value={games} onChange={(e) => setGames(Number(e.target.value))} disabled={!!progress}>
            {GAME_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="devkit-btn devkit-btn-main" onClick={run} disabled={!!progress}>
          {progress ? `Playing… ${progress.done}/${progress.total}` : 'Run check'}
        </button>
      </div>
      {progress && (
        <span className="ai-bar ai-bar-progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
          <span className="ai-bar-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        </span>
      )}
      {reportUrl && (
        <p className="devkit-status is-ok">
          Done — <a href={reportUrl} target="_blank" rel="noreferrer" className="ai-link">open the report</a>
        </p>
      )}
      {error && <p className="devkit-status is-error">The check stopped: {error}</p>}
    </div>
  )
}

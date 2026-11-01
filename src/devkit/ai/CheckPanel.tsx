// RUN THE PERSONALITY CHECK — plays N AI-vs-AI games with the personalities and skills as they are in the tab right
// now (unsaved changes too) and opens the report page in a new browser tab. The game does the playing (its runCheck
// callback, played in a Web Worker so the screen stays alive — checkWorker.ts does both ends); this shows progress and
// the link.
import { useEffect, useRef, useState } from 'react'
import type { AiPersonality, AiSkill, AiTuneProgress, AiTuneResult, DevKitAi } from './aiTypes'

const GAME_CHOICES = [6, 20, 60] // a quick look · a fair read · a proper check (slow)

/** "What wins?" (AI kit 0.6.0) read off the report page itself — its sentences sit in `[data-what-wins] li` — so a
 *  game's runCheck stays as it is (it returns the page). An older report has none: null, the panel shows nothing. */
export function whatWinsFrom(html: string): { top: string[]; none: boolean; leftOut: number } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const list = doc.querySelector('[data-what-wins]')
  const none = !!doc.querySelector('[data-what-wins-none]')
  if (!list && !none) return null
  const leftOut = Number(doc.querySelector('[data-what-wins-left]')?.getAttribute('data-what-wins-left') ?? 0)
  return { top: list ? [...list.querySelectorAll('li')].map((li) => li.textContent ?? '') : [], none, leftOut }
}

type Props = {
  runCheck: NonNullable<DevKitAi['runCheck']>
  personalities: AiPersonality[]
  skills: AiSkill[]
  /** "Suggest sliders" (0.26.0): the game's tuner, the personality picked in the tab, and Apply (unsaved edits). */
  suggest?: DevKitAi['suggest']
  picked?: string
  onApply?: (result: AiTuneResult) => void
}

export function CheckPanel({ runCheck, personalities, skills, suggest, picked, onApply }: Props) {
  const [games, setGames] = useState(GAME_CHOICES[0])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [reportUrl, setReportUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wins, setWins] = useState<ReturnType<typeof whatWinsFrom>>(null)

  useEffect(() => () => { if (reportUrl) URL.revokeObjectURL(reportUrl) }, [reportUrl])

  async function run() {
    setError(null)
    setReportUrl(null)
    setWins(null)
    setProgress({ done: 0, total: games })
    try {
      const html = await runCheck({ games, personalities, skills, onProgress: (done, total) => setProgress({ done, total }) })
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      setReportUrl(url)
      setWins(whatWinsFrom(html))
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
        targets, tell-apart, wins and the skill ladder — and, when the game names its situations, what wins. The
        report opens in a new tab.
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
      {wins && (
        <div className="ai-wins">
          <div className="ai-wins-title">What wins?</div>
          {wins.top.length > 0 && <ol className="ai-wins-list">{wins.top.map((line, i) => <li key={i}>{line}</li>)}</ol>}
          {wins.none && <p className="ai-wins-none">No situation has enough games yet — try 60 games, or npm run ai:arena on the PC.</p>}
          {wins.leftOut > 0 && <p className="ai-wins-none">{wins.leftOut} left out for too few games (listed on the report).</p>}
        </div>
      )}
      {error && <p className="devkit-status is-error">The check stopped: {error}</p>}
      {suggest && picked && onApply && <SuggestPart suggest={suggest} picked={picked} personalities={personalities} skills={skills} onApply={onApply} />}
    </div>
  )
}

/** How far a tune run is, 0–1: the tries so far (each its games), then the fresh check at the end. */
export function tuneShare(p: AiTuneProgress): number {
  if (p.phase === 'fresh') return 1
  return Math.min(1, (p.tryNo - 1 + p.game / Math.max(1, p.games)) / Math.max(1, p.tries))
}

const num = (v: number) => (Number.isFinite(v) ? String(v) : '—')
const Mark = ({ pass }: { pass: boolean }) => <span className={pass ? 'ai-pass' : 'ai-fail'} aria-label={pass ? 'green' : 'red'}>{pass ? '✓' : '✗'}</span>

/** "Suggest sliders" (0.26.0, framework F26): the AI kit's tuner for the picked personality, in the check's worker.
 *  It only suggests — Apply puts the changed sliders in as unsaved edits (Save / Undo unsaved as usual). */
function SuggestPart({ suggest, picked, personalities, skills, onApply }: Required<Pick<Props, 'suggest' | 'picked' | 'onApply'>> & Pick<Props, 'personalities' | 'skills'>) {
  const [progress, setProgress] = useState<AiTuneProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiTuneResult | null>(null)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A run still going when the panel closes (section folded, search hides it, Dev Kit closed) is stopped — its worker
  // closed — so a long tune never keeps playing unseen, its result lost, beside the next one.
  const running = useRef<AbortController | null>(null)
  useEffect(() => () => running.current?.abort(), [])

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    setApplied(false)
    setProgress(null)
    const stop = new AbortController()
    running.current = stop
    try {
      const got = await suggest({ personality: picked, personalities, skills, onProgress: setProgress, signal: stop.signal })
      if (!stop.signal.aborted) setResult(got)
    } catch (e) {
      if (!stop.signal.aborted) setError((e as Error).message)
    } finally {
      if (running.current === stop) running.current = null
      setBusy(false)
      setProgress(null)
    }
  }

  const changed = result?.sliders.filter((s) => s.changed) ?? []
  const label = !busy ? `Suggest sliders for ${picked}` : !progress ? 'Starting…' : progress.phase === 'fresh' ? `Checking on fresh games… ${progress.game}/${progress.games}` : `Try ${progress.tryNo} / ${progress.tries} · game ${progress.game}/${progress.games}`
  return (
    <div className="ai-suggest">
      <div className="ai-wins-title">Suggest sliders</div>
      <p className="tt-help">
        The computer plays small batches of games moving {picked}'s sliders (each inside its range) to hit more of its
        feel targets, then checks the best on new games. It only suggests: Apply puts the values in as unsaved edits —
        Save keeps them, Undo unsaved takes them back.
      </p>
      <div className="ai-watch-bar">
        <button className="devkit-btn" onClick={run} disabled={busy}>{label}</button>
      </div>
      {busy && (
        <span className="ai-bar ai-bar-progress" role="progressbar" aria-label="Suggest sliders" aria-valuenow={Math.round((progress ? tuneShare(progress) : 0) * 100)} aria-valuemax={100}>
          <span className="ai-bar-fill" style={{ width: `${(progress ? tuneShare(progress) : 0) * 100}%` }} />
        </span>
      )}
      {error && <p className="devkit-status is-error">Suggest sliders stopped: {error}</p>}
      {result && (
        <div className="ai-wins" data-tune={result.verdict}>
          <div className="ai-wins-title">{result.personality}</div>
          <p className={`devkit-status ${result.suggested ? 'is-ok' : ''}`}>{result.message}</p>
          {changed.length > 0 && (
            <table className="ai-tune-table">
              <thead><tr><th>Slider</th><th>Now</th><th>{result.suggested ? 'Suggested' : 'Best found'}</th></tr></thead>
              <tbody>{changed.map((s) => <tr key={s.path}><th>{s.path}</th><td>{s.from}</td><td className="ai-tune-new">{s.to}</td></tr>)}</tbody>
            </table>
          )}
          {result.targets.length > 0 && (
            <table className="ai-tune-table">
              <thead><tr><th>Feel target <span className="ai-wins-none">({result.settings.tuneFreshGames} fresh games)</span></th><th>Now</th><th>{result.suggested ? 'Suggested' : 'Best found'}</th></tr></thead>
              <tbody>{result.targets.map((t, i) => (
                <tr key={i}>
                  <th>{t.label} <span className="ai-wins-none">— {t.meter}, wants {t.wants}</span></th>
                  <td><Mark pass={t.before.pass} /> {num(t.before.measured)}</td>
                  <td><Mark pass={t.after.pass} /> {num(t.after.measured)}{t.after.borderline && <span className="ai-wins-none"> just over</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {result.cantReach.map((c, i) => <p key={i} className="ai-wins-none">Couldn't reach “{c.label}”: {c.why}</p>)}
          {result.others.map((o, i) => <p key={i} className="ai-wins-none">Also: {o.personality}'s “{o.label}” went {o.before ? 'green' : 'red'} → {o.after ? 'green' : 'red'}</p>)}
          <p className="ai-wins-none">{result.tries} tries · {result.games} games · {result.seconds} s</p>
          {result.suggested && !applied && (
            <div className="ai-watch-bar">
              <button className="devkit-btn devkit-btn-main" onClick={() => { onApply(result); setApplied(true) }}>Apply to {result.personality}</button>
            </div>
          )}
          {applied && <p className="devkit-status is-ok">Applied to {result.personality} as unsaved edits — Save keeps them, Undo unsaved takes them back.</p>}
        </div>
      )}
    </div>
  )
}

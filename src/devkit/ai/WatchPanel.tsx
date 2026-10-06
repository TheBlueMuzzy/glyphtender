// WATCH A GAME — AIs play each other on the real board, and every decision's note appears here as it plays,
// with each AI's beliefs about everyone's score (estimate + how sure it is). The game does the playing (its
// watch callback, DevKitAi in aiTypes.ts); this just starts it, lists the notes and draws the belief bars.
// Seat 1 is the personality you're editing (with your unsaved changes); the others are the next ones in the list.
import { useEffect, useRef, useState } from 'react'
import type { AiPersonality, AiSkill, AiWatchEvent, DevKitAi } from './aiTypes'

const KEEP_NOTES = 200 // the feed keeps the latest this many notes

type Props = {
  watch: NonNullable<DevKitAi['watch']>
  picked: AiPersonality
  everyone: AiPersonality[]
  skill: AiSkill
}

export function WatchPanel({ watch, picked, everyone, skill }: Props) {
  const [players, setPlayers] = useState(2)
  const [running, setRunning] = useState(false)
  const [notes, setNotes] = useState<AiWatchEvent[]>([])
  const [latest, setLatest] = useState<Record<number, AiWatchEvent>>({}) // seat → its last decision (for the bars)
  const [ended, setEnded] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), []) // leaving the Dev Kit stops the game's driver

  function start() {
    stopRef.current?.()
    const others = everyone.filter((p) => p.id !== picked.id)
    const table = [picked, ...Array.from({ length: players - 1 }, (_, i) => others[i % Math.max(1, others.length)] ?? picked)]
    setNotes([])
    setLatest({})
    setEnded(null)
    setRunning(true)
    stopRef.current = watch(table.map((personality) => ({ personality, skill })), (e) => {
      setNotes((n) => [...n, e].slice(-KEEP_NOTES))
      setLatest((l) => ({ ...l, [e.seat]: e }))
      if (e.end) {
        setEnded(e.end)
        setRunning(false)
      }
    })
  }

  function stop() {
    stopRef.current?.()
    stopRef.current = null
    setRunning(false)
  }

  // Bars share one scale: the biggest score anyone believes in right now
  const seats = Object.values(latest).sort((a, b) => a.seat - b.seat)
  const top = Math.max(1, ...seats.flatMap((e) => [e.mine ?? 0, ...(e.beliefs ?? []).map((b) => b.estimate)]))
  const whoAt = (seat: number) => latest[seat]?.who ?? `seat ${seat + 1}`

  return (
    <div className="ai-watch">
      <p className="tt-help">
        Starts a new all-AI game on the board behind this panel (it replaces the game on screen). Seat 1 = {picked.id} with
        your unsaved changes, at the {skill.id} skill.
      </p>
      <div className="ai-watch-bar">
        <label>
          Players{' '}
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))} disabled={running}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {running ? (
          <button className="devkit-btn" onClick={stop}>■ Stop</button>
        ) : (
          <button className="devkit-btn devkit-btn-main" onClick={start}>▶ Watch</button>
        )}
      </div>
      {ended && <p className="devkit-status is-ok">Game over — {ended}</p>}

      {seats.length > 0 && (
        <div className="ai-beliefs" aria-label="What each AI believes">
          {seats.map((e) => (
            <div key={e.seat} className="ai-belief-seat">
              <div className="ai-belief-who">
                {e.seat + 1} · {e.who} {e.mine !== undefined && <small>— counts its own: {Math.round(e.mine)}</small>}
              </div>
              {(e.beliefs ?? []).map((b) => (
                <div key={b.seat} className="ai-belief" title={`Thinks ${whoAt(b.seat)} has about ${Math.round(b.estimate)}, ${Math.round(b.confidence * 100)}% sure`}>
                  <span className="ai-belief-name">{b.seat + 1} {whoAt(b.seat)}</span>
                  <span className="ai-bar"><span className="ai-bar-fill" style={{ width: `${(b.estimate / top) * 100}%` }} /></span>
                  <span className="ai-belief-num">≈{Math.round(b.estimate)}</span>
                  <span className="ai-bar ai-bar-sure"><span className="ai-bar-fill" style={{ width: `${b.confidence * 100}%` }} /></span>
                  <span className="ai-belief-num">{Math.round(b.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          ))}
          <p className="tt-help">Each row: the score it guesses (blue) and how sure it is (green).</p>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="ai-notes" aria-label="Decision notes (newest first)">
          {[...notes].reverse().map((e, i) => (
            <li key={notes.length - i} className="ai-note">
              {/* the seat number, and the name unless the note already starts with it */}
              <b>{e.seat + 1}{e.note.startsWith(e.who) ? '' : ` ${e.who}`}</b> {e.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

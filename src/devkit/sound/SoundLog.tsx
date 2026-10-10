// THE LOG — every sound the game played or dropped while you play, newest first, with why a drop happened
// ("cooldown", "voice limit", "audio locked"…). Starts with what the engine already logged.
import { useEffect, useState } from 'react'
import { termsOf } from './soundLogic'
import type { SoundBoardAudio, SoundLogEntry } from './soundTypes'

const KEEP = 100

/** Plain words for the engine's drop reasons */
const DROP_WORDS: Record<string, string> = {
  'unknown-sound': 'no sound by that name in content/audio.json',
  'no-files': 'it has no files',
  'catch-up': 'catch-up (the screen jumped — silent on purpose)',
  locked: 'audio locked (no tap yet)',
  suspended: 'paused (tab hidden, call, lock screen)',
  muted: 'muted',
  stale: 'too late (asked for long after its moment)',
  cooldown: 'cooldown (repeated too soon)',
  'already-playing': 'already playing (a loop)',
  'global-limit': 'too many sounds at once (voice limit)',
  'not-loaded': 'file still loading (it plays next time)',
}

// The engine's clock is performance.now() (ms since the page opened) → the time of day it happened
const clock = (t: number) => new Date(performance.timeOrigin + t).toLocaleTimeString([], { hour12: false })

export function SoundLog({ audio, query }: { audio: SoundBoardAudio; query: string }) {
  const [entries, setEntries] = useState<SoundLogEntry[]>(() => audio.log.entries().slice(-KEEP).reverse())
  useEffect(() => audio.onLog((entry) => setEntries((list) => [entry, ...list].slice(0, KEEP))), [audio])

  const terms = termsOf(query)
  const shown = entries.filter((e) => terms.every((t) => `${e.id} ${e.file ?? ''} ${e.reason ?? ''}`.toLowerCase().includes(t)))

  return (
    <div className="sb-log">
      <div className="sb-log-top">
        <span className="sb-note">{entries.length ? `${shown.length} of the last ${entries.length}` : 'Nothing yet — play the game (or ▶ a sound).'}</span>
        <button
          type="button"
          className="devkit-btn sb-small"
          disabled={entries.length === 0}
          onClick={() => {
            audio.log.clear()
            setEntries([])
          }}
        >
          Clear
        </button>
      </div>
      <ol className="sb-log-list">
        {shown.map((e, i) => (
          <li key={`${e.t}-${i}`} className={e.result === 'played' ? 'is-played' : 'is-dropped'}>
            <span className="sb-log-time">{clock(e.t)}</span>
            <span className="sb-log-mark" aria-label={e.result}>{e.result === 'played' ? '▶' : '✕'}</span>
            <code>{e.id}</code>
            <span className="sb-log-what">
              {e.result === 'played'
                ? `${e.file ?? ''}${e.step !== undefined ? ` · ladder step ${e.step}` : ''}${e.delayMs ? ` · in ${Math.round(e.delayMs)} ms` : ''}`
                : `${DROP_WORDS[e.reason ?? ''] ?? e.reason ?? 'dropped'}${e.detail ? ` — ${e.detail}` : ''}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

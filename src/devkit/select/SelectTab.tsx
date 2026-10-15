// SELECT TAB (framework F55/F56) — click a thing in the game, get every knob for it in one place.
//   Select mode on → hover the game (thin pink outline + name) → click/tap = pick it (SelectLayer.tsx draws, catches).
//   Outline: how solid the outlines are (remembered in this browser). The pick is forgotten when the Dev Kit closes.
//   Recently on screen: everything seen while the Dev Kit was open, newest first, then the rest greyed — tap one to
//   pick it without catching it on screen (score pops, a flying seed, a tip that's gone).
//   The pick: its name, how many are showing, Copy for Claude, ✕. Under this tab the Dev Kit then shows the pick's
//   knobs with the real Tuning / Color / Text / Sound rows (DevKit.tsx + select/pickContext.ts) — each with its own Save.
//   What each thing shows comes from content/devkit/select.json, which Claude keeps complete (the game's test fails if a
//   setting is on no object) — nothing to manage here (Muzzy, 2026-10-14). Problems in the file show in red.
import { useEffect, useState } from 'react'
import { copyText } from '../saveContent'
import { valueAt } from '../tuning/tuningLogic'
import { tuningFiles } from '../tuning/tuningFiles'
import { catalog, SELECT_FILE } from './selectFiles'
import { checkSelectMap, countKnobs, type SelectObject } from './selectMap'
import { OUTLINE_MIN, pickedObject, setSelect, useSelect } from './selectStore'
import './select.css'

type Status = { kind: 'ok' | 'error'; text: string }

function ago(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : 'a while ago'
}

export function SelectTab() {
  const s = useSelect()
  const { known } = catalog()
  const picked = pickedObject(s)
  const problems = checkSelectMap(s.file, known)
  const [status, setStatus] = useState<Status | null>(null)
  const [recentOpen, setRecentOpen] = useState(!s.picked)
  // The "x s ago" times tick while this tab is showing
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const pick = (id: string | null) => {
    setSelect({ picked: id, pickedEl: null })
    setStatus(null)
  }

  async function copyForClaude(obj: SelectObject) {
    const lines = [
      `Dev Kit Select — I picked "${obj.label}" (data-knobs="${obj.id}"${obj.find ? ` or ${obj.find}` : ''}) in ${document.title}.`,
      ...obj.knobs.flatMap(({ title, ids }) => [
        `${title}:`,
        ...ids.map((id) => {
          const [file, ...rest] = id.split('.')
          const data = tuningFiles.find((f) => f.name === file)?.data
          const value = rest.length ? valueAt(data, rest.join('.')) : undefined
          return `  content/tuning/${file}.json ${rest.join('.')}${value !== undefined && typeof value !== 'object' ? ` = ${JSON.stringify(value)}` : ''}`
        }),
      ]),
      ...(obj.text.length ? [`Text (content/text/en.json): ${obj.text.join(', ')}`] : []),
      ...(obj.sounds.length ? [`Sounds (content/audio.json): ${obj.sounds.join(', ')}`] : []),
      ...(obj.style.length ? [`UI style, shared (content/ui/style.json): ${obj.style.join(', ')}`] : []),
    ]
    const ok = await copyText(lines.join('\n'))
    setStatus(ok ? { kind: 'ok', text: 'Copied — paste it into your chat with Claude.' } : { kind: 'error', text: 'The browser blocked copying.' })
  }

  // Recently on screen: showing now, then by when they were last seen, then never seen (greyed)
  const order = [...s.objects].sort((a, b) => {
    // (finite numbers: Infinity − Infinity would be NaN and scramble the order; ties keep the file's order)
    const rank = (o: SelectObject) => (s.onScreen.includes(o.id) ? Number.MAX_SAFE_INTEGER : s.seen[o.id] ?? -1)
    return rank(b) - rank(a)
  })

  return (
    <div className="sel">
      <div className="sel-mode">
        <button
          type="button"
          className={`devkit-btn sel-toggle${s.on ? ' is-on' : ''}`}
          aria-pressed={s.on}
          onClick={() => setSelect({ on: !s.on, hover: null })}
        >
          {s.on ? '● Select mode: on' : '○ Select mode: off'}
        </button>
        <p className="tt-help">
          {s.on ? 'Hover the game to see what things are · click or tap one to pick it · the game ignores clicks until you turn this off.' : 'Turn on, then click something in the game to see every knob for it.'}
        </p>
      </div>
      <label className="sel-outline">
        <span>Outline</span>
        <input
          type="range"
          min={OUTLINE_MIN}
          max={1}
          step={0.05}
          value={s.outline}
          onChange={(e) => setSelect({ outline: Number(e.target.value) })}
          aria-label="How solid the pink outlines are"
        />
      </label>

      {problems.length > 0 && (
        <div className="sel-problems" role="alert">
          <strong>{problems.length === 1 ? '1 problem' : `${problems.length} problems`} in {SELECT_FILE}:</strong>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <section className="sb-section sel-recent" data-open={recentOpen || undefined}>
        <h3 className="sb-section-head">
          <button type="button" aria-expanded={recentOpen} onClick={() => setRecentOpen((o) => !o)}>
            <span aria-hidden="true">{recentOpen ? '▾' : '▸'}</span> Recently on screen <span className="sb-count">{s.onScreen.length} showing · {s.objects.length} things</span>
          </button>
        </h3>
        {recentOpen && (
          <ul className="sel-list">
            {order.map((o) => {
              const showing = s.onScreen.includes(o.id)
              const seenAt = s.seen[o.id]
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={`sel-item${o.id === s.picked ? ' is-picked' : ''}${!showing && seenAt === undefined ? ' is-unseen' : ''}`}
                    onClick={() => pick(o.id)}
                  >
                    <span className="sel-item-name">{o.label}</span>
                    <span className="sel-item-when">{showing ? 'on screen' : seenAt !== undefined ? ago(now - seenAt) : 'not seen yet'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {picked ? (
        <div className="sel-picked">
          <div className="sel-picked-head">
            <strong className="sel-picked-name">{picked.label}</strong>
            <span className="sel-picked-count">
              {countKnobs(picked, known)} knobs · {s.onScreen.includes(picked.id) ? 'on screen' : 'not on screen now'}
            </span>
            <button type="button" className="devkit-close sel-clear" onClick={() => pick(null)} aria-label="Clear the pick" title="Clear the pick">
              ✕
            </button>
          </div>
          {picked.help && <p className="tt-help">{picked.help}</p>}
          <div className="sel-actions">
            <button type="button" className="devkit-btn" onClick={() => void copyForClaude(picked)}>
              Copy for Claude
            </button>
          </div>
          {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
          {countKnobs(picked, known) === 0 && <p className="tt-help">No knobs on {picked.label} yet — tell Claude what it should show.</p>}
        </div>
      ) : (
        <p className="tt-help sel-nothing">Nothing picked yet — turn on select mode and click something in the game, or pick one from the list.</p>
      )}
    </div>
  )
}

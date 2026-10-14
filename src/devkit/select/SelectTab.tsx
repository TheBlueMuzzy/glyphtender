// SELECT TAB (framework F55/F56) — click a thing in the game, get every knob for it in one place.
//   Select mode on → hover the game (thin pink outline + name) → click/tap = pick it (SelectLayer.tsx draws, catches).
//   Outline: how solid the outlines are (remembered in this browser, with the pick).
//   Recently on screen: everything seen while the Dev Kit was open, newest first, then the rest greyed — tap one to
//   pick it without catching it on screen (score pops, a flying seed, a tip that's gone).
//   The pick: its name, how many are showing, Copy for Claude, ✕. Under this tab the Dev Kit then shows the pick's
//   knobs with the real Tuning / Text / Sound rows (DevKit.tsx + select/pickContext.ts) — each with its own Save.
//   + Add a knob: search every setting, text line and sound → it joins the pick (content/devkit/select.json, saved at
//   once in dev). ✕ on a knob row takes it off. Problems in the file (a name that doesn't exist) show in red.
import { useEffect, useState } from 'react'
import { copyText } from '../saveContent'
import { matchesAll, searchTerms } from '../search/searchLogic'
import { valueAt } from '../tuning/tuningLogic'
import { tuningFiles } from '../tuning/tuningFiles'
import { catalog, SELECT_FILE, type Addable } from './selectFiles'
import { checkSelectMap, countKnobs, withKnob, type KnobKind, type SelectObject } from './selectMap'
import { getSelect, OUTLINE_MIN, pickedObject, saveSelectFile, setSelect, useSelect, type SaveStatus as Status } from './selectStore'
import './select.css'

const NEW_SECTION = '__new__'
const MAX_RESULTS = 40

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
  const [adding, setAdding] = useState(false)
  // The "x s ago" times tick while this tab is showing
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const pick = (id: string | null) => {
    setSelect({ picked: id, pickedEl: null })
    setAdding(false)
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
      ...(JSON.stringify(s.file) !== JSON.stringify(s.savedFile)
        ? [`Not saved yet — please put this object into ${SELECT_FILE}:`, JSON.stringify({ [obj.id]: (s.file.objects as Record<string, unknown>)[obj.id] })]
        : []),
    ]
    const ok = await copyText(lines.join('\n'))
    setStatus(ok ? { kind: 'ok', text: 'Copied — paste it into your chat with Claude.' } : { kind: 'error', text: 'The browser blocked copying.' })
  }

  // Recently on screen: showing now, then by when they were last seen, then never seen (greyed)
  const order = [...s.objects].sort((a, b) => {
    const rank = (o: SelectObject) => (s.onScreen.includes(o.id) ? Infinity : s.seen[o.id] ?? -Infinity)
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
            <button type="button" className="devkit-btn" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
              + Add a knob
            </button>
            <button type="button" className="devkit-btn" onClick={() => void copyForClaude(picked)}>
              Copy for Claude
            </button>
          </div>
          {adding && <AddKnob obj={picked} onDone={(st) => setStatus(st)} />}
          {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
          {countKnobs(picked, known) === 0 && <p className="tt-help">No knobs on {picked.label} yet — + Add a knob.</p>}
        </div>
      ) : (
        <p className="tt-help sel-nothing">Nothing picked yet — turn on select mode and click something in the game, or pick one from the list.</p>
      )}
    </div>
  )
}

function AddKnob({ obj, onDone }: { obj: SelectObject; onDone: (status: Status) => void }) {
  const { addable } = catalog()
  const [query, setQuery] = useState('')
  const sections = obj.knobs.map((k) => k.title)
  const [section, setSection] = useState(sections[0] ?? NEW_SECTION)
  const [newSection, setNewSection] = useState('')
  const has = (a: Addable) =>
    a.kind === 'tuning' ? obj.knobs.some((k) => k.ids.includes(a.id)) : (a.kind === 'text' ? obj.text : obj.sounds).includes(a.id)
  const terms = searchTerms(query)
  const results = terms.length === 0 ? [] : addable.filter((a) => !has(a) && matchesAll(terms, [a.id, a.label, a.where])).slice(0, MAX_RESULTS)

  async function add(a: Addable) {
    const title = section === NEW_SECTION ? newSection.trim() || 'More' : section
    const file = withKnob(getSelect().file, obj.id, a.kind as KnobKind, a.id, title)
    onDone(await saveSelectFile(file))
  }

  return (
    <div className="sel-add">
      <input
        type="search"
        className="sel-add-search"
        placeholder="Search settings, text lines, sounds…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search for a knob to add"
        autoFocus
      />
      <label className="sel-add-section">
        <span>Settings go in</span>
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          {sections.map((t) => <option key={t} value={t}>{t}</option>)}
          <option value={NEW_SECTION}>New section…</option>
        </select>
        {section === NEW_SECTION && (
          <input type="text" value={newSection} placeholder="Section name" onChange={(e) => setNewSection(e.target.value)} aria-label="New section name" />
        )}
      </label>
      {terms.length > 0 && results.length === 0 && <p className="tt-help">Nothing matches “{query}”.</p>}
      <ul className="sel-list">
        {results.map((a) => (
          <li key={`${a.kind}:${a.id}`}>
            <button type="button" className="sel-item" onClick={() => void add(a)}>
              <span className="sel-item-name">+ {a.label}</span>
              <span className="sel-item-when">{a.where}{a.label !== a.id ? ` · ${a.id}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

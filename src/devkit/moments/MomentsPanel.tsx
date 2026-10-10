// MOMENTS — the side panel of a Screens preview (PreviewOverlay.tsx) when the screen has moments.
//   ▶ plays a moment once in the preview; 🔁 loops it every few seconds (the slider at the top) until 🔁 again,
//   another 🔁, ↻ Replay, a variant change or closing.
//   Soft · Balanced · Punchy sets ALL the moment's knobs at once (momentLogic.ts) — then every slider stays
//   tweakable, and the picker says "custom". Changes are live (the same devkit:tuning edit the Tuning tab sends,
//   so the real game AND the preview follow). Save writes each changed file whole (its _help etc. come along).
// The moments come from the game: src/devkit-game/previews.tsx (moments/momentTypes.ts).
import { useEffect, useRef, useState } from 'react'
import { saveContentFile } from '../saveContent'
import { FieldRow } from '../tuning/FieldRow'
import { sendTuning } from '../tuning/liveTuning'
import { loadContentFile } from './momentFiles'
import { activeStyle, allStyles, knobInfo, liveName, nextFireDelay, readKnob, sharedWith, writeKnob } from './momentLogic'
import { FEEL_STYLES, STYLE_NAMES, type DevKitMoment, type FeelStyle, type MomentKnob } from './momentTypes'
import '../tuning/tuning.css'
import './moments.css'

type FileState = { loaded: object; saved: object; values: object } // as the screen opened · in the file · in the game now
type Files = Record<string, FileState>
type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null

type Props = {
  moments: DevKitMoment[] // this screen's
  all?: DevKitMoment[] // every moment (to say which share a knob)
  fire: (id: string, round: number, looping: boolean) => Promise<void> // plays it in the preview frame
  run?: number // the frame restarted (↻, a variant): stop looping
  focus?: string // open this moment first
  load?: typeof loadContentFile
  save?: typeof saveContentFile
}

const DEFAULT_LOOP_S = 2.5
const changedFile = (f: FileState) => JSON.stringify(f.values) !== JSON.stringify(f.saved)

export function MomentsPanel({ moments, all = moments, fire, run = 0, focus, load = loadContentFile, save = saveContentFile }: Props) {
  const [files, setFiles] = useState<Files | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | undefined>(focus ?? moments[0]?.id)
  const [looping, setLooping] = useState<string | null>(null)
  const [loopS, setLoopS] = useState(DEFAULT_LOOP_S)
  const [status, setStatus] = useState<Status>(null)
  const loopMs = useRef(loopS * 1000) // read by the running loop, so a new interval doesn't restart it
  useEffect(() => { loopMs.current = loopS * 1000 }, [loopS])

  // Load every file the moments' knobs live in (once — the list is compared as text, so a re-render never reloads it)
  const fileNames = [...new Set(moments.flatMap((m) => m.knobs.map((k) => k.file)))].join('|')
  useEffect(() => {
    Promise.all(fileNames.split('|').filter(Boolean).map(async (file) => {
      const { disk, now } = await load(file)
      return [file, { loaded: disk, saved: disk, values: now }] as const
    })).then((list) => setFiles(Object.fromEntries(list)), (e: Error) => setProblem(e.message))
  }, [fileNames, load])

  // The frame restarted: its loop is gone with it (set while drawing, not in an effect — React's "adjust state when a
  // prop changes" pattern, so no extra render pass)
  const [loopRun, setLoopRun] = useState(run)
  if (loopRun !== run) {
    setLoopRun(run)
    setLooping(null)
  }

  // 🔁: play, wait out the rest of the interval (never overlapping a long play), play again…
  useEffect(() => {
    if (!looping) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let round = 0
    const go = async () => {
      const started = performance.now()
      await fire(looping, round++, true).catch(() => {}) // a problem shows in the preview's bar
      if (!stopped) timer = setTimeout(go, nextFireDelay(started, performance.now(), loopMs.current))
    }
    void go()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [looping, fire])

  if (problem) return <aside className="mo"><p className="mo-problem" role="alert">Couldn't load the moments' files: {problem}</p></aside>
  if (!files) return <aside className="mo"><p className="mo-note">Loading…</p></aside>

  const base = (k: MomentKnob) => readKnob(files[k.file]?.loaded, k.path)
  const now = (k: MomentKnob) => readKnob(files[k.file]?.values, k.path)
  const rangeOf = (k: MomentKnob) => knobInfo(k, files[k.file]?.loaded, base(k)).range
  const unsaved = Object.keys(files).filter((f) => changedFile(files[f]))

  // Set several knobs at once (a style) or one (a slider): live in the game + the preview
  function setKnobs(changes: { knob: MomentKnob; value: unknown }[]) {
    if (!files) return
    const next = { ...files }
    const touched = new Set<string>()
    for (const { knob, value } of changes) {
      if (readKnob(next[knob.file].values, knob.path) === undefined) continue // a path that leads nowhere
      next[knob.file] = { ...next[knob.file], values: writeKnob(next[knob.file].values, knob.path, value) }
      touched.add(knob.file)
    }
    setFiles(next)
    for (const file of touched) sendTuning(liveName(file), next[file].values)
    setStatus(null)
  }

  function pickStyle(m: DevKitMoment, style: FeelStyle) {
    const values = allStyles(m.knobs, base, rangeOf)[style]
    setKnobs(m.knobs.map((knob, i) => ({ knob, value: values[i] })))
  }

  async function saveAll() {
    if (!files) return
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      for (const file of unsaved) {
        const written = files[file].values
        await save(file, written)
        // Mark only what was written as saved, on the LATEST state: a slider moved during the save stays (still unsaved)
        setFiles((now) => (now && now[file] ? { ...now, [file]: { ...now[file], saved: written } } : now))
      }
      setStatus({ kind: 'ok', text: `Saved ${unsaved.join(', ')}.` })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }

  function undo() {
    if (!files) return
    for (const file of unsaved) sendTuning(liveName(file), files[file].saved)
    setFiles(Object.fromEntries(Object.entries(files).map(([f, s]) => [f, { ...s, values: s.saved }])))
    setStatus(null)
  }

  const playOnce = (m: DevKitMoment) => void fire(m.id, 0, false).catch(() => {})

  return (
    <aside className="mo" aria-label="Moments">
      <h2 className="mo-title">Moments</h2>
      <label className="mo-loop">
        <span>🔁 every</span>
        <input type="range" min={0.5} max={8} step={0.5} value={loopS} onChange={(e) => setLoopS(Number(e.target.value))} aria-label="Loop every (seconds)" />
        <span className="mo-loop-s">{loopS} s</span>
      </label>
      <ul className="mo-list">
        {moments.map((m) => {
          const open = m.id === openId
          const styles = allStyles(m.knobs, base, rangeOf)
          const active = activeStyle(m.knobs.map(now), styles)
          return (
            <li key={m.id} className="mo-moment" data-moment={m.id}>
              <div className="mo-head">
                <button className="mo-name" aria-expanded={open} onClick={() => setOpenId(open ? undefined : m.id)}>
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span> {m.label}
                  <span className="mo-active">{active === 'custom' ? 'custom' : STYLE_NAMES[active]}</span>
                </button>
                <button className="devkit-btn mo-play" onClick={() => playOnce(m)} aria-label={`Play ${m.label}`} title="Play it once">▶</button>
                <button className="devkit-btn mo-play" aria-pressed={looping === m.id} onClick={() => setLooping(looping === m.id ? null : m.id)}
                  aria-label={`Loop ${m.label}`} title={looping === m.id ? 'Stop looping' : `Play it every ${loopS} s`}>🔁</button>
              </div>
              {m.note && <p className="mo-note">{m.note}</p>}
              {open && (
                <div className="mo-body">
                  <div className="mo-styles" role="group" aria-label={`${m.label} style`}>
                    {FEEL_STYLES.map((style) => (
                      <button key={style} className="dp-chip" aria-pressed={active === style} onClick={() => pickStyle(m, style)}>
                        {STYLE_NAMES[style]}
                      </button>
                    ))}
                    {active === 'custom' && <span className="mo-custom">custom</span>}
                  </div>
                  {m.knobs.map((knob) => (
                    <KnobRow key={`${knob.file}:${knob.path}`} knob={knob} file={files[knob.file]} shared={sharedWith(all, m, knob)}
                      onChange={(value) => setKnobs([{ knob, value }])} />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <footer className="devkit-footer mo-footer">
        <button className="devkit-btn devkit-btn-main" disabled={unsaved.length === 0} onClick={saveAll}>Save</button>
        <button className="devkit-btn" disabled={unsaved.length === 0} onClick={undo} title="Put every value back to what's saved">Undo unsaved</button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
      </footer>
    </aside>
  )
}

// One knob: the Tuning tab's row (slider, number, ↺, help), plus who else uses it
function KnobRow({ knob, file, shared, onChange }: { knob: MomentKnob; file: FileState; shared: string[]; onChange: (v: unknown) => void }) {
  const loadedValue = readKnob(file.loaded, knob.path)
  const value = readKnob(file.values, knob.path)
  if (value === undefined) return <p className="mo-problem">{knob.path} isn't in {knob.file}</p>
  const info = knobInfo(knob, file.loaded, loadedValue)
  const kind = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text'
  return (
    <div className="mo-knob">
      <FieldRow
        filePath={knob.file}
        item={{ file: liveName(knob.file), path: knob.path, kind, label: info.label, help: info.help }}
        value={value}
        savedValue={readKnob(file.saved, knob.path)}
        loadedValue={loadedValue}
        ranges={info.ranges}
        terms={[]}
        onChange={onChange}
      />
      {shared.length > 0 && <p className="mo-shared">Also changes: {shared.join(', ')}</p>}
    </div>
  )
}

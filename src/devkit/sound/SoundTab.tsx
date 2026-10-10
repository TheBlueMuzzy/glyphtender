// THE SOUND TAB (framework F30) — tune every sound in content/audio.json by ear, while the game runs.
//   Sounds — every sound, grouped by volume group, filtered by the Dev Kit's search box (only this tab's).
//            Each row: ▶ · ▶×5 (five plays to hear the variation) · ■ for loops · its feel tier · how many files.
//            Tap a name → its editor opens under it (SoundEditor.tsx).
//   Music  — the music tracks: ▶ / ■, layers, a live intensity slider, rests (MusicSection.tsx, framework F28).
//   Mixer  — the volume groups' levels + meters, and the named mixes (Mixer.tsx).
//   Log    — what played and what was dropped, and why (SoundLog.tsx).
// Every change is live: the engine gets the edited file (audio.setConfig) and the game hears the Dev Kit's usual
// tuning event for "audio" (liveTuning.ts sendTuning) — Save writes content/audio.json (its _help stays).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CAN_SAVE, copyText, saveContentFile } from '../saveContent'
import { sendTuning } from '../tuning/liveTuning'
import { Mixer } from './Mixer'
import { MusicSection } from './MusicSection'
import { trackNames } from './musicLogic'
import { SoundEditor } from './SoundEditor'
import { SoundLog } from './SoundLog'
import {
  abConfig, countSounds, fileChanged, soundChanged, soundGroups, soundsOf, withFiles, withMixValue, withSoundValue,
  type RawAudio,
} from './soundLogic'
import { playTimes } from './soundPreview'
import type { SoundBoardAudio } from './soundTypes'
import '../tuning/tuning.css'
import './sound.css'

export type SoundTabProps = {
  getAudio: () => SoundBoardAudio | null // the game's engine (null before it's made)
  file: RawAudio // content/audio.json as the game imported it
  path: string // where it's saved, e.g. "content/audio.json"
  tuningName: string // the name the game listens for with onTuning (e.g. "audio")
  baseUrl: string // where public/ is served (import.meta.env.BASE_URL)
  query?: string // the Dev Kit's search box — only this tab's
}

type Status = { kind: 'ok' | 'error' | 'info'; text: string }

export function SoundTab({ getAudio, file, path, tuningName, baseUrl, query = '' }: SoundTabProps) {
  const audio = getAudio()
  const [edited, setEdited] = useState<RawAudio>(() => structuredClone(file))
  const [saved, setSaved] = useState<RawAudio>(() => structuredClone(file))
  const [selected, setSelected] = useState<string | null>(null)
  const [gameHearsSaved, setGameHearsSaved] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState({ sounds: true, music: false, mixer: false, log: false })

  // What the game uses right now: the edit — or, while A is chosen, the edit with the open sound as saved
  const live = gameHearsSaved && selected ? abConfig(edited, saved, selected, 'A') : edited
  const liveText = JSON.stringify(live)
  // Only a real change is sent: the game already has the file as loaded, and React may run this effect again with
  // nothing changed (StrictMode, or the Dev Kit's hidden tabs reconnecting) — re-sending then would undo any other
  // live edit of the file (a Moments knob, a test's setConfig)
  const sent = useRef(liveText)
  useEffect(() => {
    if (liveText === sent.current) return
    sent.current = liveText
    const data = JSON.parse(liveText) as RawAudio
    audio?.setConfig(data)
    sendTuning(tuningName, data)
  }, [liveText, audio, tuningName])

  if (!audio) {
    return (
      <p className="devkit-not-plugged">
        Sound isn't started yet. The game makes its engine with <code>createAudio</code> + <code>setAudio</code> (framework/audio) — then this tab works.
      </p>
    )
  }

  const change = (next: RawAudio) => {
    setEdited(next)
    setGameHearsSaved(false) // any edit: the game plays the edit again
  }
  const unsaved = fileChanged(edited, saved)

  async function save() {
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      await saveContentFile(path, edited)
      setSaved(edited)
      setStatus({ kind: 'ok', text: `Saved ${path} — refresh and it stays.` })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }
  async function copyForClaude() {
    const changed = Object.keys(soundsOf(edited)).filter((name) => soundChanged(edited, saved, name))
    const text = [
      `Dev Kit Sound tab — please put these into ${path}${CAN_SAVE ? '' : ' (from the live build, where Save is off)'}:`,
      ...changed.map((name) => `"${name}": ${JSON.stringify(soundsOf(edited)[name])}`),
      ...(JSON.stringify(edited.buses) !== JSON.stringify(saved.buses) ? [`"buses": ${JSON.stringify(edited.buses)}`] : []),
      ...(JSON.stringify(edited.master) !== JSON.stringify(saved.master) ? [`"master": ${JSON.stringify(edited.master)}`] : []),
      ...(JSON.stringify(edited.music) !== JSON.stringify(saved.music) ? [`"music": ${JSON.stringify(edited.music)}`] : []),
    ].join('\n')
    const ok = await copyText(text)
    setStatus(ok ? { kind: 'ok', text: 'Copied — paste it into your chat with Claude.' } : { kind: 'error', text: 'The browser blocked copying.' })
  }

  const groups = soundGroups(edited, query)
  const total = countSounds(soundGroups(edited))
  const searching = query.trim() !== ''
  const section = (key: keyof typeof open, title: string, count: string, body: () => ReactNode) => (
    <section className="sb-section" data-open={open[key] || undefined}>
      <h3 className="sb-section-head">
        <button type="button" aria-expanded={open[key]} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
          <span aria-hidden="true">{open[key] ? '▾' : '▸'}</span> {title} <span className="sb-count">{count}</span>
        </button>
      </h3>
      {open[key] && <div className="sb-section-body">{body()}</div>}
    </section>
  )

  return (
    <div className="tt sb">
      <p className="tt-legend"><span className="tt-dot" /> = changed, not saved yet · ↺ = back to saved · every change plays in the game at once</p>

      {section('sounds', 'Sounds', searching ? `${countSounds(groups)} of ${total}` : String(total), () => (
        <>
          {groups.length === 0 && <p className="sb-note">No sound matches “{query}”.</p>}
          {groups.map((group) => (
            <div key={group.bus} className="sb-bus">
              <h4 className="tt-group">{group.title} <span className="sb-count">{group.sounds.length}</span></h4>
              <ul className="sb-list">
                {group.sounds.map((row) => {
                  const isOpen = selected === row.name
                  const isLoop = soundsOf(edited)[row.name]?.loop === true
                  return (
                    <li key={row.name} className={isOpen ? 'is-open' : undefined}>
                      <div className="sb-sound">
                        <button type="button" className="sb-sound-name" aria-expanded={isOpen} onClick={() => { setSelected(isOpen ? null : row.name); setGameHearsSaved(false) }} title={row.help}>
                          {soundChanged(edited, saved, row.name) && <span className="tt-dot" title="Changed, not saved yet" />}
                          {row.name}
                        </button>
                        {row.tier && <span className="sb-badge" title={`The ${row.tier} feel tier's sound`}>{row.tier}</span>}
                        <span className="sb-files-count" title="How many files (variants)">{row.files.length} {row.files.length === 1 ? 'file' : 'files'}</span>
                        <button type="button" className="sb-icon" onClick={() => void playTimes(audio, row.name, 1)} aria-label={`Play ${row.name}`}>▶</button>
                        {isLoop
                          ? <button type="button" className="sb-icon" onClick={() => audio.stop(row.name, { fadeMs: 300 })} aria-label={`Stop ${row.name}`}>■</button>
                          : <button type="button" className="sb-icon sb-x5" onClick={() => void playTimes(audio, row.name, 5)} aria-label={`Play ${row.name} 5 times`} title="5 plays, to hear the variation">▶×5</button>}
                      </div>
                      {isOpen && (
                        <SoundEditor
                          key={row.name}
                          audio={audio}
                          name={row.name}
                          edited={edited}
                          saved={saved}
                          live={live}
                          baseUrl={baseUrl}
                          canSave={CAN_SAVE}
                          gameHearsSaved={gameHearsSaved}
                          onGameHearsSaved={setGameHearsSaved}
                          onKnob={(key, value) => change(withSoundValue(edited, row.name, key, value, saved))}
                          onFiles={(files) => change(withFiles(edited, row.name, files))}
                          onStatus={setStatus}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </>
      ))}

      {section('music', 'Music', searching ? `${trackNames(edited, query).length} of ${trackNames(edited).length}` : `${trackNames(edited).length} · layers · intensity · rests`, () => (
        <MusicSection audio={audio} edited={edited} saved={saved} query={query} onChange={change} />
      ))}

      {section('mixer', 'Mixer', 'levels · meters · named mixes', () => (
        <Mixer audio={audio} edited={edited} saved={saved} onChange={(group, key, value) => change(withMixValue(edited, group, key, value))} />
      ))}

      {section('log', 'Log', 'what played, what was dropped', () => <SoundLog audio={audio} query={query} />)}

      <footer className="devkit-footer">
        {CAN_SAVE && <button className="devkit-btn devkit-btn-main" disabled={!unsaved} onClick={save}>Save</button>}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} disabled={!unsaved} onClick={copyForClaude}>Copy for Claude</button>
        <button className="devkit-btn" disabled={!unsaved} onClick={() => { setEdited(saved); setGameHearsSaved(false) }} title="Put every sound back to what's saved">
          Undo unsaved
        </button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
      </footer>
    </div>
  )
}

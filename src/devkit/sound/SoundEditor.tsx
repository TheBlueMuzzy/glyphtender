// ONE SOUND'S EDITOR (opens under its row in the Sound tab):
//   A / B    — hear the saved sound against your edit (same file both ways), and choose which one the game uses meanwhile
//   Files    — its variants: ▶ each, pick one for the waveform, move up / down, remove; drop a file (or pick one) to add it:
//              the dev server converts it to MP3, trims its silent start and saves it in public/audio/ (vite/audioSave.ts),
//              then asks where it came from for content/credits.json
//   Waveform — the picked file with trim (and loop) handles
//   Knobs    — every setting as a slider / checkbox / choice, with the file's plain-English labels and help (_labels, _help,
//              _ranges — the "sounds.*.knob" wildcard), ↺ back to saved
import { useState, type DragEvent } from 'react'
import { FieldRow } from '../tuning/FieldRow'
import type { TuningItem } from '../tuning/tuningSections'
import { addCredit, forgetWaveform, soundUrl, uploadSound } from './soundFiles'
import {
  AUDIO_FOLDERS, KNOBS, abConfig, checkLicence, creditEntry, extensionOf, filesOf, folderFor, knobHelp, knobLabel,
  knobRange, knobValue, moveItem, soundHelp, soundsOf, stemFor, withOnlyFile, type HandleKey, type Knob, type RawAudio,
} from './soundLogic'
import { playWith } from './soundPreview'
import type { SoundBoardAudio } from './soundTypes'
import { Waveform } from './Waveform'

type Status = { kind: 'ok' | 'error' | 'info'; text: string }

type Props = {
  audio: SoundBoardAudio
  name: string
  edited: RawAudio
  saved: RawAudio
  live: RawAudio // what the game uses right now (the edit, or this sound as saved while A is chosen)
  baseUrl: string
  canSave: boolean
  gameHearsSaved: boolean
  onGameHearsSaved: (saved: boolean) => void
  onKnob: (key: string, value: unknown) => void
  onFiles: (files: string[], added?: string) => void
  onStatus: (status: Status) => void
}

const LICENCES = ['CC0', 'CC-BY 4.0', 'CC-BY 3.0', 'own work', 'CC-BY-NC 4.0', 'other']

export function SoundEditor({ audio, name, edited, saved, live, baseUrl, canSave, gameHearsSaved, onGameHearsSaved, onKnob, onFiles, onStatus }: Props) {
  const sound = soundsOf(edited)[name]
  const files = filesOf(sound)
  const savedSound = soundsOf(saved)[name]
  const [picked, setPicked] = useState(0)
  const [folder, setFolder] = useState(() => folderFor(sound))
  const [dropping, setDropping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [credit, setCredit] = useState<{ path: string; source: string; author: string; licence: string; url: string } | null>(null)
  const file = files[Math.min(picked, files.length - 1)]
  const value = (key: string) => knobValue(edited, name, key)

  // ---- hearing it ----
  const playFile = (f: string, version?: 'A' | 'B') => {
    const base = version ? abConfig(edited, saved, name, version) : edited
    void playWith(audio, live, withOnlyFile(base, name, f), name)
  }

  // ---- adding a file ----
  async function add(dropped: File) {
    const ext = extensionOf(dropped.name)
    setBusy(true)
    onStatus({ kind: 'info', text: `Converting ${dropped.name}…` })
    try {
      const savedFile = await uploadSound(dropped, { folder, stem: stemFor(name, folder), bus: String(value('bus')), ext })
      audio.reloadFile(savedFile.path)
      forgetWaveform(soundUrl(baseUrl, savedFile.path))
      onFiles([...files, savedFile.path], savedFile.path)
      setPicked(files.length)
      setCredit({ path: savedFile.path, source: dropped.name, author: '', licence: 'CC0', url: '' })
      onStatus({
        kind: 'ok',
        text: `Added ${savedFile.file}${savedFile.trimmedMs ? ` (silent start trimmed: ${savedFile.trimmedMs} ms)` : ''}. Press Save to keep it in the sound list.`,
      })
    } catch (e) {
      onStatus({ kind: 'error', text: `Couldn't add ${dropped.name}: ${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) void add(dropped)
  }

  async function saveCredit() {
    if (!credit) return
    try {
      await addCredit(creditEntry(credit))
      onStatus({ kind: 'ok', text: `Credit added to content/credits.json for ${credit.path}.` })
      setCredit(null)
    } catch (e) {
      onStatus({ kind: 'error', text: `Couldn't add the credit: ${(e as Error).message}` })
    }
  }

  // ---- knobs ----
  const knobRow = (knob: Knob) => {
    const path = `sounds.${name}.${knob.key}`
    const label = knobLabel(edited, name, knob.key)
    const help = knobHelp(edited, name, knob.key)
    const current = value(knob.key)
    const savedValue = savedSound ? knobValue(saved, name, knob.key) : knob.fallback
    if (knob.kind === 'choice') {
      return (
        <div key={knob.key} className="tt-row sb-choice">
          <span className="tt-name">
            {current !== savedValue && <span className="tt-dot" title="Changed, not saved yet" />}
            <span className="tt-label">{label}</span>
            <code className="tt-key">{`audio · ${path}`}</code>
          </span>
          <select value={String(current)} onChange={(e) => onKnob(knob.key, e.target.value)} aria-label={path}>
            {knob.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="tt-reset" disabled={current === savedValue} onClick={() => onKnob(knob.key, savedValue)} aria-label={`Reset ${path} to the saved value (${String(savedValue)})`}>↺</button>
          {help && <p className="tt-row-help">{help}</p>}
        </div>
      )
    }
    const item: TuningItem = { file: 'audio', path, kind: knob.kind === 'boolean' ? 'boolean' : 'number', label, help }
    return (
      <FieldRow
        key={knob.key}
        filePath="content/audio.json"
        item={item}
        value={current}
        savedValue={savedValue}
        loadedValue={savedValue}
        ranges={{ [path]: knobRange(edited, name, knob.key) }}
        terms={[]}
        onChange={(v) => onKnob(knob.key, v)}
      />
    )
  }
  const groups = [...new Set(KNOBS.map((k) => k.group))]
  const loop = value('loop') === true
  const shownKnobs = (group: string) => KNOBS.filter((k) => k.group === group && (loop || (k.key !== 'loopStartMs' && k.key !== 'loopEndMs')))
  const steps = Object.fromEntries((['trimStartMs', 'trimEndMs', 'loopStartMs', 'loopEndMs'] as HandleKey[]).map((k) => [k, knobRange(edited, name, k)[2]])) as Record<HandleKey, number>
  const differs = JSON.stringify(sound) !== JSON.stringify(savedSound)

  return (
    <div className="sb-editor">
      {soundHelp(edited, name) && <p className="tt-help">{soundHelp(edited, name)}</p>}

      <div className="sb-ab" role="group" aria-label="A / B">
        <button type="button" className="devkit-btn sb-small" disabled={!file || !savedSound} onClick={() => playFile(file, 'A')} title="The sound as saved in content/audio.json">▶ A saved</button>
        <button type="button" className="devkit-btn sb-small" disabled={!file} onClick={() => playFile(file, 'B')} title="The sound with your changes">▶ B edit</button>
        <label className="sb-ab-toggle" title="Which version the running game plays while you compare">
          <input type="checkbox" checked={gameHearsSaved} disabled={!savedSound || !differs} onChange={(e) => onGameHearsSaved(e.target.checked)} />
          game plays A (saved)
        </label>
      </div>

      <h4 className="tt-group">Files {file && <small className="sb-note">· {files.length} · the picked one is used by A / B and the waveform</small>}</h4>
      <ol className="sb-files">
        {files.map((f, i) => (
          <li key={`${f}-${i}`} className={i === picked ? 'is-picked' : undefined}>
            <button type="button" className="sb-file-name" onClick={() => setPicked(i)} aria-pressed={i === picked} title="Show this file's waveform">{f}</button>
            <button type="button" className="sb-icon" onClick={() => playFile(f)} aria-label={`Play ${f}`} title="Play just this file">▶</button>
            <button type="button" className="sb-icon" disabled={i === 0} onClick={() => { onFiles(moveItem(files, i, -1)); setPicked(i - 1) }} aria-label={`Move ${f} up`}>↑</button>
            <button type="button" className="sb-icon" disabled={i === files.length - 1} onClick={() => { onFiles(moveItem(files, i, 1)); setPicked(i + 1) }} aria-label={`Move ${f} down`}>↓</button>
            <button type="button" className="sb-icon" onClick={() => { onFiles(files.filter((_, j) => j !== i)); setPicked(0) }} aria-label={`Remove ${f} from this sound`} title="Take it out of this sound (the file stays in public/audio/)">✕</button>
          </li>
        ))}
        {files.length === 0 && <li className="sb-note">No files yet — drop one below.</li>}
      </ol>

      {canSave ? (
        <div
          className={`sb-drop${dropping ? ' is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDropping(true) }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
        >
          <span>{busy ? 'Converting…' : 'Drop a sound here (wav, ogg, m4a, flac, mp3) or'}</span>
          <label className="devkit-btn sb-small">
            pick a file
            <input type="file" accept="audio/*,.wav,.ogg,.m4a,.flac,.mp3,.aac,.opus,.aif,.aiff" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void add(f) }} />
          </label>
          <label className="sb-folder">
            into public/audio/
            <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
              {AUDIO_FOLDERS.map((f) => <option key={f} value={f}>{f}/</option>)}
            </select>
            as {stemFor(name, folder)}_NN.mp3
          </label>
        </div>
      ) : (
        <p className="sb-note">Adding files needs the dev server (npm run dev).</p>
      )}

      {credit && <CreditForm credit={credit} onChange={setCredit} onSave={saveCredit} onSkip={() => setCredit(null)} />}

      {file && (
        <Waveform
          url={soundUrl(baseUrl, file)}
          values={{
            trimStartMs: Number(value('trimStartMs')),
            trimEndMs: Number(value('trimEndMs')),
            loop,
            loopStartMs: Number(value('loopStartMs')),
            loopEndMs: Number(value('loopEndMs')),
          }}
          steps={steps}
          onChange={(key, v) => onKnob(key, v)}
        />
      )}

      {groups.map((group) => (
        <div key={group}>
          <h4 className="tt-group">{group}</h4>
          {shownKnobs(group).map(knobRow)}
        </div>
      ))}
    </div>
  )
}

type Credit = { path: string; source: string; author: string; licence: string; url: string }

/** Where did it come from? → one entry in content/credits.json (CC0 🟢 · CC-BY 🟡 + a credit line · NC 🔴 warned) */
function CreditForm({ credit, onChange, onSave, onSkip }: { credit: Credit; onChange: (c: Credit) => void; onSave: () => void; onSkip: () => void }) {
  const check = checkLicence(credit.licence)
  const entry = creditEntry(credit)
  const field = (key: keyof Credit, label: string, placeholder: string) => (
    <label className="sb-credit-field">
      <span>{label}</span>
      <input value={credit[key]} placeholder={placeholder} onChange={(e) => onChange({ ...credit, [key]: e.target.value })} />
    </label>
  )
  return (
    <div className="sb-credit" role="group" aria-label="Credits">
      <p className="sb-note"><strong>Where did {credit.path} come from?</strong> (goes in content/credits.json)</p>
      {field('source', 'Source', 'Freesound — pop.wav')}
      {field('author', 'Author', 'who made it')}
      <label className="sb-credit-field">
        <span>Licence</span>
        <select value={LICENCES.includes(credit.licence) ? credit.licence : 'other'} onChange={(e) => onChange({ ...credit, licence: e.target.value === 'other' ? '' : e.target.value })}>
          {LICENCES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {!LICENCES.includes(credit.licence) && <input value={credit.licence} placeholder="the licence's name" onChange={(e) => onChange({ ...credit, licence: e.target.value })} />}
      </label>
      {field('url', 'Link', 'https://freesound.org/…')}
      <p className="sb-note">{check.light} {entry.credit ? `Credit line: “${entry.credit}”` : 'No credit line needed.'}</p>
      {check.warning && <p className="sb-note is-error">{check.warning}</p>}
      <div className="sb-row">
        <button type="button" className="devkit-btn devkit-btn-main sb-small" disabled={!credit.source.trim() || !credit.licence.trim()} onClick={onSave}>Add to credits</button>
        <button type="button" className="devkit-btn sb-small" onClick={onSkip}>Later</button>
      </div>
    </div>
  )
}

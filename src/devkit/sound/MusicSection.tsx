// THE SOUND TAB'S MUSIC SECTION (framework F28) — the music tracks in content/audio.json "music.tracks":
//   Now        — what the music is doing (play 2 of 3 · resting, back in 42 s), with Rest now / Come back now to test rests
//   Intensity  — one live slider (0–1) to hear the layers fade in and out; the game sets it while you play, it isn't saved
//   Each track — ▶ / ■ · its layers (volume, comes in at, full at) · its rests and loop settings, as sliders
// Every change is live (the Sound tab hands the edited file to the engine); Save writes content/audio.json.
import { useEffect, useState } from 'react'
import { FieldRow } from '../tuning/FieldRow'
import type { TuningItem } from '../tuning/tuningSections'
import {
  LAYER_KNOBS, TRACK_KNOBS, layerFile, layerValue, layersOf, musicHelp, musicLabel, musicRange, musicStatusText,
  trackChanged, trackHelp, trackNames, trackValue, withLayerValue, withTrackValue, type MusicKnob,
} from './musicLogic'
import type { RawAudio } from './soundLogic'
import type { SoundBoardAudio, SoundMusicState } from './soundTypes'

/** How often the "Now" line is refreshed (ms) */
const STATE_EVERY_MS = 250

type Props = {
  audio: SoundBoardAudio
  edited: RawAudio
  saved: RawAudio
  query: string
  onChange: (next: RawAudio) => void
}

export function MusicSection({ audio, edited, saved, query, onChange }: Props) {
  const [openTrack, setOpenTrack] = useState<string | null>(null)
  const [state, setState] = useState<SoundMusicState | null>(() => audio.musicState?.() ?? null)
  const [intensity, setIntensity] = useState(() => audio.musicState?.().intensity ?? 0)

  // The "Now" line follows the engine (plays and rests happen on their own)
  useEffect(() => {
    if (!audio.musicState) return
    const timer = setInterval(() => setState(audio.musicState?.() ?? null), STATE_EVERY_MS)
    return () => clearInterval(timer)
  }, [audio])

  if (!audio.playMusic || !audio.musicState) {
    return <p className="sb-note">Music needs the audio module 0.2.0 or newer (playMusic, musicState) — update it with install-audio.</p>
  }

  const names = trackNames(edited, query)
  const total = trackNames(edited).length
  const refresh = () => setState(audio.musicState?.() ?? null)
  const play = (name: string) => {
    audio.unlock() // a Dev Kit button press is a tap: audio may start here
    audio.playMusic?.(name)
    refresh()
  }
  const changeIntensity = (value: number) => {
    setIntensity(value)
    audio.setMusicIntensity?.(value, { rampMs: 150 })
  }

  /** One slider / checkbox row for a track knob (layer = null) or a layer knob */
  const knobRow = (track: string, layer: string | null, knob: MusicKnob) => {
    const path = layer === null ? `music.tracks.${track}.${knob.key}` : `music.tracks.${track}.layers.${layer}.${knob.key}`
    const value = layer === null ? trackValue(edited, track, knob.key) : layerValue(edited, track, layer, knob.key)
    const savedValue = layer === null ? trackValue(saved, track, knob.key) : layerValue(saved, track, layer, knob.key)
    const item: TuningItem = {
      file: 'audio',
      path,
      kind: knob.kind,
      label: musicLabel(edited, track, layer, knob),
      help: musicHelp(edited, track, layer, knob),
    }
    return (
      <FieldRow
        key={path}
        filePath="content/audio.json"
        item={item}
        value={value}
        savedValue={savedValue}
        loadedValue={savedValue}
        ranges={{ [path]: musicRange(edited, track, layer, knob) }}
        terms={[]}
        onChange={(v) => onChange(layer === null ? withTrackValue(edited, track, knob.key, v) : withLayerValue(edited, track, layer, knob.key, v))}
      />
    )
  }

  const phase = state?.phase ?? 'off'
  return (
    <div className="sb-music">
      <div className="sb-music-now">
        <span className="sb-note" role="status">Now: <b>{musicStatusText(state)}</b></span>
        <span className="sb-row">
          <button type="button" className="devkit-btn sb-small" disabled={phase !== 'playing'} onClick={() => { audio.restMusic?.(); refresh() }} title="Fade out now and rest (as if the plays were done)">
            Rest now
          </button>
          <button type="button" className="devkit-btn sb-small" disabled={phase !== 'resting' && phase !== 'fading'} onClick={() => { audio.endMusicRest?.(); refresh() }} title="End the rest: the music comes back now">
            Come back now
          </button>
        </span>
      </div>

      <div className="tt-row sb-intensity">
        <span className="tt-name">
          <span className="tt-label">Intensity (live — the game sets it; not saved)</span>
        </span>
        <input
          className="tt-slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          onChange={(e) => changeIntensity(Number(e.target.value))}
          aria-label="Music intensity slider (0 to 1)"
        />
        <input
          className="tt-number"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          onChange={(e) => { if (Number.isFinite(e.target.valueAsNumber)) changeIntensity(e.target.valueAsNumber) }}
          aria-label="Music intensity"
        />
        <p className="tt-row-help">Layers fade in between their “comes in at” and “full at” intensity. Drag it with a track playing to hear them.</p>
      </div>

      {total === 0 && <p className="sb-note">No music tracks yet — add <code>"music": {'{ "tracks": { … } }'}</code> to content/audio.json (see the audio README).</p>}
      {total > 0 && names.length === 0 && <p className="sb-note">No track matches “{query}”.</p>}
      <ul className="sb-list">
        {names.map((name) => {
          const isOpen = openTrack === name
          const layers = layersOf(edited, name)
          const layerNames = Object.keys(layers)
          const isPlaying = state?.track === name && phase !== 'off'
          return (
            <li key={name} className={isOpen ? 'is-open' : undefined}>
              <div className="sb-sound">
                <button type="button" className="sb-sound-name" aria-expanded={isOpen} onClick={() => setOpenTrack(isOpen ? null : name)} title={trackHelp(edited, name)}>
                  {trackChanged(edited, saved, name) && <span className="tt-dot" title="Changed, not saved yet" />}
                  {name}
                </button>
                {isPlaying && <span className="sb-badge" title="The track the engine is on">{phase}</span>}
                <span className="sb-files-count">{layerNames.length} {layerNames.length === 1 ? 'layer' : 'layers'}</span>
                <button type="button" className="sb-icon" onClick={() => play(name)} aria-label={`Play music ${name}`}>▶</button>
                <button type="button" className="sb-icon" onClick={() => { audio.stopMusic?.({ track: name }); refresh() }} aria-label={`Stop music ${name}`}>■</button>
              </div>
              {isOpen && (
                <div className="sb-editor">
                  {layerNames.map((layer) => {
                    const gain = isPlaying ? state?.layers.find((l) => l.name === layer)?.gain : undefined
                    return (
                      <div key={layer} className="sb-layer">
                        <h4 className="tt-group">
                          Layer: {layer} <code className="sb-layer-file">{layerFile(layers[layer])}</code>
                          {gain !== undefined && <span className="sb-count"> · now {Math.round(gain * 100)}%</span>}
                        </h4>
                        {LAYER_KNOBS.map((knob) => knobRow(name, layer, knob))}
                      </div>
                    )
                  })}
                  {layerNames.length === 0 && <p className="sb-note">No layers yet — add one in content/audio.json: "layers": {'{ "main": { "file": "mus/…mp3" } }'}.</p>}
                  {(['Rests', 'Loop'] as const).map((group) => (
                    <div key={group}>
                      <h4 className="tt-group">{group}</h4>
                      {TRACK_KNOBS.filter((k) => k.group === group).map((knob) => knobRow(name, null, knob))}
                    </div>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

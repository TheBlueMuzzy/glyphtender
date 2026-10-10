// THE MIXER — the volume groups' levels as content/audio.json sets them ("buses", dB under master) plus the limiter,
// each with a level meter, and buttons to hear the named mixes (snapshots: paused, reveal…).
// These are the GAME's defaults, not the player's Settings sliders (those work on top of these).
// Meters: the engine's level(bus) read every frame and written straight into the bar's style (no React re-render).
import { useEffect, useRef, useState } from 'react'
import { FieldRow } from '../tuning/FieldRow'
import type { TuningItem } from '../tuning/tuningSections'
import type { RawAudio } from './soundLogic'
import type { SoundBoardAudio, SoundBus } from './soundTypes'

const BUS_ROWS: { bus: SoundBus; label: string }[] = [
  { bus: 'sfx', label: 'Sound effects (dB)' },
  { bus: 'ui', label: 'Menus & buttons (dB)' },
  { bus: 'ambience', label: 'Ambience (dB)' },
  { bus: 'music', label: 'Music (dB)' },
]
const DEFAULT_RANGES: Record<string, [number, number, number]> = {
  'buses.sfx': [-40, 6, 0.5], 'buses.ui': [-40, 6, 0.5], 'buses.ambience': [-40, 6, 0.5], 'buses.music': [-40, 6, 0.5],
  'master.limiterDb': [-12, 0, 0.5],
}
const DEFAULT_VALUES: Record<string, number> = { 'buses.sfx': 0, 'buses.ui': -8, 'buses.ambience': -10, 'buses.music': -8, 'master.limiterDb': -1 }

const record = (v: unknown) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const valueAt = (raw: RawAudio, path: string) => {
  const [group, key] = path.split('.')
  const own = record(raw[group])[key]
  return typeof own === 'number' ? own : DEFAULT_VALUES[path]
}

type Props = {
  audio: SoundBoardAudio
  edited: RawAudio
  saved: RawAudio
  onChange: (group: 'buses' | 'master', key: string, value: number) => void
}

export function Mixer({ audio, edited, saved, onChange }: Props) {
  const bars = useRef(new Map<SoundBus, HTMLSpanElement>())
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const snapshots = Object.keys(record(edited.snapshots)).filter((name) => !name.startsWith('_'))
  const labels = record(edited._labels)
  const helps = record(edited._help)
  const ranges = { ...DEFAULT_RANGES, ...record(edited._ranges) }

  // The meters: one animation-frame loop while the Mixer is on screen
  useEffect(() => {
    if (!audio.level) return
    let frame = 0
    const tick = () => {
      for (const [bus, bar] of bars.current) {
        const level = audio.level!(bus)
        const db = level > 0 ? 20 * Math.log10(level) : -60
        bar.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%` // −60 dB … 0 dB
        bar.dataset.hot = db > -3 ? 'true' : ''
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [audio])

  const meter = (bus: SoundBus) => (
    <span className="sb-meter" title={`${bus} level right now`}>
      <span className="sb-meter-bar" ref={(el) => { if (el) bars.current.set(bus, el); else bars.current.delete(bus) }} />
    </span>
  )

  const row = (path: string, fallbackLabel: string, bus: SoundBus) => {
    const [group, key] = path.split('.') as ['buses' | 'master', string]
    const item: TuningItem = {
      file: 'audio',
      path,
      kind: 'number',
      label: typeof labels[path] === 'string' ? (labels[path] as string) : fallbackLabel,
      help: typeof helps[path] === 'string' ? (helps[path] as string) : undefined,
    }
    return (
      <div key={path} className="sb-mix-row">
        <FieldRow
          filePath="content/audio.json"
          item={item}
          value={valueAt(edited, path)}
          savedValue={valueAt(saved, path)}
          loadedValue={valueAt(saved, path)}
          ranges={ranges}
          terms={[]}
          onChange={(value) => onChange(group, key, Number(value))}
        />
        {meter(bus)}
      </div>
    )
  }

  return (
    <div className="sb-mixer">
      <p className="sb-note">The game's own levels (content/audio.json). The player's Settings sliders work on top of these. Meters: −60 … 0 dB.</p>
      {BUS_ROWS.map(({ bus, label }) => row(`buses.${bus}`, label, bus))}
      {row('master.limiterDb', 'Loudest allowed (dB)', 'master')}
      {!audio.level && <p className="sb-note">Meters need the audio module 0.1.2 or newer (audio.level).</p>}
      <div className="sb-snapshots" role="group" aria-label="Named mixes">
        <span className="sb-note">Hear a named mix:</span>
        {[null, ...snapshots].map((name) => (
          <button
            key={name ?? 'none'}
            type="button"
            className="devkit-btn sb-small"
            aria-pressed={snapshot === name}
            onClick={() => {
              audio.snapshot(name)
              setSnapshot(name)
            }}
          >
            {name ?? 'normal'}
          </button>
        ))}
      </div>
    </div>
  )
}

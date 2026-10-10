// THE WAVEFORM — one sound file drawn on a canvas, with drag handles for where it starts and ends (trim) and, for a
// loop, where the loop jumps back from and to. Dragging a handle moves the matching slider (and the game hears it live).
// The cut-off parts are shaded. Pure maths (peaks, handle positions, drag → value) is in soundLogic.ts.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { loadWaveform, type Waveform as WaveData } from './soundFiles'
import { dragValue, handlesFor, msToX, nearestHandle, peaksOf, xToMs, type HandleKey } from './soundLogic'

type Values = { trimStartMs: number; trimEndMs: number; loop: boolean; loopStartMs: number; loopEndMs: number }

type Props = {
  url: string // the file to draw
  values: Values
  steps: Record<HandleKey, number> // the sliders' steps, so a drag lands on a value the slider can show
  onChange: (key: HandleKey, value: number) => void
}

const HEIGHT = 84
const COLOURS = { wave: '#8fb3ff', cut: 'rgb(0 0 0 / 0.55)', trim: '#ffb020', loop: '#7bd88f', mid: '#34353f' }
const HANDLE_NAMES: Record<HandleKey, string> = { trimStartMs: 'start', trimEndMs: 'end', loopStartMs: 'loop from', loopEndMs: 'loop to' }

export function Waveform({ url, values, steps, onChange }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // The waveform of the file it was loaded for — another file shows "Loading…" until its own arrives
  const [loaded, setLoaded] = useState<{ url: string; wave: WaveData | null; error: string | null } | null>(null)
  const wave = loaded?.url === url ? loaded.wave : null
  const error = loaded?.url === url ? loaded.error : null
  const [width, setWidth] = useState(360)
  const dragging = useRef<HandleKey | null>(null)

  useEffect(() => {
    let current = true
    loadWaveform(url).then(
      (data) => current && setLoaded({ url, wave: data, error: null }),
      (e: Error) => current && setLoaded({ url, wave: null, error: `Couldn't load ${url}: ${e.message}` }),
    )
    return () => { current = false }
  }, [url])

  // Fit the panel's width (it changes when the Dev Kit is resized or a phone turns)
  useEffect(() => {
    const el = canvas.current?.parentElement
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(Math.max(120, Math.floor(el.clientWidth))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [wave]) // the canvas only exists once the file has loaded

  // Draw: the cut-off parts shaded, the wave, then the handles
  useEffect(() => {
    const el = canvas.current
    const g = el?.getContext('2d')
    if (!el || !g || !wave) return
    const ratio = window.devicePixelRatio || 1
    el.width = width * ratio
    el.height = HEIGHT * ratio
    g.setTransform(ratio, 0, 0, ratio, 0, 0)
    g.clearRect(0, 0, width, HEIGHT)
    const mid = HEIGHT / 2
    g.fillStyle = COLOURS.mid
    g.fillRect(0, mid, width, 1)
    g.fillStyle = COLOURS.wave
    peaksOf(wave.samples, width).forEach(([min, max], x) => {
      g.fillRect(x, mid - max * (mid - 2), 1, Math.max(1, (max - min) * (mid - 2)))
    })
    const { durationMs } = wave
    const handles = handlesFor(values, durationMs)
    const at = (key: HandleKey) => msToX(handles.find((h) => h.key === key)!.ms, durationMs, width)
    g.fillStyle = COLOURS.cut
    g.fillRect(0, 0, at('trimStartMs'), HEIGHT)
    g.fillRect(at('trimEndMs'), 0, width - at('trimEndMs'), HEIGHT)
    g.font = '10px system-ui, sans-serif'
    for (const h of handles) {
      const x = Math.round(msToX(h.ms, durationMs, width))
      const loop = h.key.startsWith('loop')
      g.fillStyle = loop ? COLOURS.loop : COLOURS.trim
      g.fillRect(x - 1, 0, 2, HEIGHT)
      g.fillRect(x - 5, loop ? HEIGHT - 8 : 0, 10, 8) // a grip: trims at the top, loops at the bottom
    }
  }, [wave, values, width])

  if (error) return <p className="sb-note is-error">{error}</p>
  if (!wave) return <p className="sb-note">Loading the waveform…</p>

  const { durationMs } = wave
  const xOf = (e: PointerEvent<HTMLCanvasElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left
  const moveTo = (key: HandleKey, x: number) => onChange(key, dragValue(key, xToMs(x, durationMs, width), durationMs, steps[key]))

  return (
    <div className="sb-wave">
      <canvas
        ref={canvas}
        style={{ width, height: HEIGHT }}
        aria-label={`Waveform, ${Math.round(durationMs)} ms long — drag the orange handles to trim${values.loop ? ', the green ones to set the loop' : ''}`}
        onPointerDown={(e) => {
          const key = nearestHandle(handlesFor(values, durationMs), xOf(e), durationMs, width, 12)
          if (!key) return
          dragging.current = key
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (dragging.current) moveTo(dragging.current, xOf(e))
          else e.currentTarget.style.cursor = nearestHandle(handlesFor(values, durationMs), xOf(e), durationMs, width, 12) ? 'ew-resize' : 'default'
        }}
        onPointerUp={() => { dragging.current = null }}
        onPointerCancel={() => { dragging.current = null }}
      />
      <p className="sb-note">
        {Math.round(durationMs)} ms · drag <span className="sb-key-trim">▮ {HANDLE_NAMES.trimStartMs} / {HANDLE_NAMES.trimEndMs}</span>
        {values.loop && <> · <span className="sb-key-loop">▮ {HANDLE_NAMES.loopStartMs} / {HANDLE_NAMES.loopEndMs}</span></>}
      </p>
    </div>
  )
}

// One UI shape & feel row: [● name] [slider or dropdown] [value box] [↺] — the Color tab's partner to ColourRow,
// for corners, outlines, press feel, timings, menu sizes (styleValues.ts says which get a slider or a dropdown).
// The value box takes any CSS value (a shadow, a font, "999px"); the slider shows when the value is a number in a unit
// it knows; a dropdown row (choices) needs no box, so the dropdown takes its place too. Looks: color.css (.ct-row.is-style).
import { useState, type ReactNode } from 'react'
import { joinNumber, shapeOf, sliderFor } from './styleValues'

type RowProps = {
  token: string
  label: string
  display?: ReactNode
  value: string
  changed: boolean
  resetTo: string
  resetHint: string
  onChange: (value: string) => void
}

export function StyleRow({ token, label, display, value, changed, resetTo, resetHint, onChange }: RowProps) {
  const choices = shapeOf(token)?.choices
  const slider = choices ? null : sliderFor(token, value)
  return (
    <div className="ct-row is-style">
      <span className="ct-label">
        {changed && <span className="ct-dot" title="Changed, not saved yet" />}
        {display ?? label}
      </span>
      {choices ? (
        <select className="ct-choice" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — pick one`}>
          {!choices.includes(value) && <option value={value}>{value}</option>}
          {choices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : slider ? (
        <input
          className="ct-slider"
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={slider.n}
          onChange={(e) => onChange(joinNumber(Number(e.target.value), slider.unit))}
          aria-label={`${label} — slide`}
        />
      ) : (
        <span />
      )}
      {!choices && <ValueField value={value} label={label} onChange={onChange} />}
      <button
        className="ct-reset"
        disabled={value.trim() === resetTo}
        onClick={() => onChange(resetTo)}
        title={`${resetHint}: ${resetTo}`}
        aria-label={`Reset ${label} — ${resetHint.toLowerCase()} (${resetTo})`}
      >
        ↺
      </button>
    </div>
  )
}

/** A text box for the value itself. It applies on Enter or leaving the box (a half-typed shadow never flickers in). */
function ValueField({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  // When the value changes elsewhere (slider, ↺), the box follows it
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  const commit = () => {
    if (draft.trim() !== '' && draft.trim() !== value) onChange(draft.trim())
    else setDraft(value)
  }
  return (
    <input
      className="ct-hex ct-value"
      value={draft}
      spellCheck={false}
      autoCapitalize="off"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      aria-label={`${label} — value`}
      title={value}
    />
  )
}

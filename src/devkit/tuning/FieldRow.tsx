// ONE TUNING SETTING ON SCREEN — a row of the Tuning tab (TuningTab.tsx), also used by the AI tab for the game's
// AI settings files (goals.json, pace.json). A number gets a slider + number box + ↺ (back to saved); true/false a
// checkbox; a colour ("#rrggbb") a colour picker; text with "_choices" a dropdown; other text is shown, not edited.
// Help line under it.
// Slider ranges: the file's "_ranges", else a guess (tuningLogic.ts sliderRange).
import type { ReactNode } from 'react'
import { normalizeHex } from '../color/colorLogic'
import { ColourRow } from '../color/ColourRow'
import { Highlight } from '../search/Section'
import { choicesFor, sliderRange } from './tuningLogic'
import type { TuningItem } from './tuningSections'

type RowProps = {
  filePath: string // where the setting lives, e.g. "content/tuning/garden.json" (shown on hover)
  item: TuningItem
  value: unknown
  savedValue: unknown
  loadedValue: unknown
  ranges: unknown
  choices?: unknown // the file's "_choices" (tuningLogic.ts choicesFor)
  terms: string[] // search words to highlight
  onChange: (value: unknown) => void
}

// One setting: [● readable name · file · key] then [slider] [number] [↺] — or a checkbox, a colour, or plain
// text — and its help line under it.
export function FieldRow({ filePath, item, value, savedValue, loadedValue, ranges, choices, terms, onChange }: RowProps) {
  const { path, kind, label } = item
  const changed = value !== savedValue
  const dot = changed && <span className="tt-dot" title="Changed, not saved yet" />
  const names: ReactNode = (
    <>
      <span className="tt-label"><Highlight text={label} terms={terms} /></span>
      <code className="tt-key" title={`${filePath} → ${path}`}>
        <Highlight text={`${item.file} · ${path}`} terms={terms} />
      </code>
    </>
  )
  const helpLine = item.help && <p className="tt-row-help"><Highlight text={item.help} terms={terms} /></p>

  // A colour as it's saved ("#rrggbb"): a picker, like the Color tab
  if (kind === 'text' && /^#[0-9a-f]{6}$/i.test(String(savedValue)) && normalizeHex(String(value))) {
    return (
      <div className="tt-row tt-row-colour">
        <ColourRow
          label={label}
          display={names}
          value={String(value)}
          changed={changed}
          resetTo={String(savedValue)}
          resetHint="Back to the saved value"
          onChange={onChange}
        />
        {helpLine}
      </div>
    )
  }

  // Text with a list of options (the file's "_choices"): a dropdown + ↺
  const options = kind === 'text' ? choicesFor(path, choices, savedValue) : undefined
  if (options) {
    return (
      <div className="tt-row tt-row-choice">
        <span className="tt-name">{dot}{names}</span>
        <select className="tt-select" value={String(value)} onChange={(e) => onChange(e.target.value)} aria-label={path}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          className="tt-reset"
          disabled={!changed}
          onClick={() => onChange(savedValue)}
          title={`Back to the saved value: ${String(savedValue)}`}
          aria-label={`Reset ${path} to the saved value (${String(savedValue)})`}
        >
          ↺
        </button>
        {helpLine}
      </div>
    )
  }

  if (kind === 'text') {
    return (
      <div className="tt-row tt-row-text">
        <span className="tt-name">{dot}{names}</span>
        <span className="tt-text" title="Text — edit it in the file">{String(value)}</span>
        {helpLine}
      </div>
    )
  }

  const reset = (
    <button
      className="tt-reset"
      disabled={!changed}
      onClick={() => onChange(savedValue)}
      title={`Back to the saved value: ${String(savedValue)}`}
      aria-label={`Reset ${path} to the saved value (${String(savedValue)})`}
    >
      ↺
    </button>
  )

  if (kind === 'boolean') {
    return (
      <div className="tt-row tt-row-bool">
        <label className="tt-name">
          <input type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
          {dot}
          {names}
        </label>
        {reset}
        {helpLine}
      </div>
    )
  }

  // A number. The range comes from the value as loaded, so it doesn't shift while you drag.
  const { min, max, step } = sliderRange(typeof loadedValue === 'number' ? loadedValue : (value as number), path, ranges)
  return (
    <div className="tt-row">
      <span className="tt-name">{dot}{names}</span>
      <input
        className="tt-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value as number}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${path} slider (${min} to ${max})`}
      />
      <input
        className="tt-number"
        type="number"
        step={step}
        value={value as number}
        onChange={(e) => {
          if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber)
        }}
        aria-label={path}
      />
      {reset}
      {helpLine}
    </div>
  )
}

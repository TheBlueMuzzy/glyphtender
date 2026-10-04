// A TWO-HANDLED SLIDER for a 0–100 range (an AI trait: "somewhere between 30 and 50 each turn").
// Two ordinary range inputs laid on top of each other — only their round handles take touches (ai.css), so both can
// be dragged, and each works with the keyboard (arrow keys) too. Number boxes on either side for exact values.
// The low handle can't pass the high one: moving one past the other pushes it along (withRange in aiLogic.ts).
type Props = {
  label: string // "aggression" — used for the inputs' names ("aggression low end")
  min: number
  max: number
  onChange: (min: number, max: number, moved: 'min' | 'max') => void
  changed?: boolean
}

export function RangeSlider({ label, min, max, onChange, changed }: Props) {
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback)
  return (
    <div className={changed ? 'ai-range is-changed' : 'ai-range'}>
      <input
        className="ai-num"
        type="number"
        min={0}
        max={100}
        value={min}
        aria-label={`${label} low end`}
        onChange={(e) => onChange(num(e.target.value, min), max, 'min')}
      />
      <div className="ai-range-track">
        {/* the chosen part of the track, between the two handles */}
        <div className="ai-range-fill" style={{ left: `${min}%`, width: `${max - min}%` }} />
        <input
          type="range"
          min={0}
          max={100}
          value={min}
          style={{ zIndex: min > 50 ? 2 : 1 }} // when the handles meet near the top, the low one must stay grabbable
          aria-label={`${label} low end slider`}
          onChange={(e) => onChange(Number(e.target.value), max, 'min')}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={max}
          aria-label={`${label} high end slider`}
          onChange={(e) => onChange(min, Number(e.target.value), 'max')}
        />
      </div>
      <input
        className="ai-num"
        type="number"
        min={0}
        max={100}
        value={max}
        aria-label={`${label} high end`}
        onChange={(e) => onChange(min, num(e.target.value, max), 'max')}
      />
    </div>
  )
}

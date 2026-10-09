// TOGGLE — an on/off switch. The visible label usually comes from the ListRow it sits in.
// ← turns it off, → turns it on (keyboard, or a gamepad d-pad sent as arrow keys), like the switch's look.
import type { KeyboardEvent } from 'react'
import { controlSound } from './controlSound'

type ToggleProps = { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }

export function Toggle({ on, onChange, label, disabled }: ToggleProps) {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const want = e.key === 'ArrowRight'
    if (want === on) return
    controlSound('toggle')
    onChange(want)
  }
  return (
    <button
      type="button"
      role="switch"
      className="kit-toggle kit-target"
      aria-checked={on}
      aria-label={label}
      data-state={on ? 'on' : 'off'}
      disabled={disabled}
      onClick={() => {
        controlSound('toggle')
        onChange(!on)
      }}
      onKeyDown={onKeyDown}
    >
      <span className="kit-toggle-track"><span className="kit-toggle-thumb" /></span>
    </button>
  )
}

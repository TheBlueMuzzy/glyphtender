// The shared "◀ value ▶" shape behind Selector and Stepper.
// It is ONE focus stop: ← / → (keyboard, or a gamepad d-pad sent as arrow keys) step the value — also after a
// click on ◀ or ▶ (the key reaches the picker from the arrow). ↑ / ↓ move on to the next control (arrowKeys.ts).
import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from './Button'

type ArrowPickerProps = {
  label: string; display: ReactNode; onStep: (direction: -1 | 1) => void
  canPrev: boolean; canNext: boolean; prevIcon: string; nextIcon: string; kind: string
}

export function ArrowPicker({ label, display, onStep, canPrev, canNext, prevIcon, nextIcon, kind }: ArrowPickerProps) {
  // (At an end the key still belongs to the picker: nothing happens, rather than the page scrolling sideways)
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (e.key === 'ArrowLeft' && canPrev) onStep(-1)
    if (e.key === 'ArrowRight' && canNext) onStep(1)
  }
  return (
    <div className={`kit-picker kit-${kind}`} role="group" aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
      <Button variant="ghost" icon tabIndex={-1} aria-label={`Previous ${label}`} disabled={!canPrev} onClick={() => onStep(-1)}>{prevIcon}</Button>
      <output className="kit-picker-value" aria-live="polite">{display}</output>
      <Button variant="ghost" icon tabIndex={-1} aria-label={`Next ${label}`} disabled={!canNext} onClick={() => onStep(1)}>{nextIcon}</Button>
    </div>
  )
}

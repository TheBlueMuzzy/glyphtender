// BUTTON — variant: primary (main action) | secondary | ghost (quiet) | danger (destructive).
// icon: square icon-only button — always give it an aria-label.  loading: shows a spinner, can't be pressed.
// size: how tall (and at least how wide) it is, in px — for a game whose buttons should match its pieces
//   (e.g. as big as a board hex). Never smaller than the style's target-min (44px).
// compact: less room each side of the label — a row of 3 big buttons that must fit a narrow phone on ONE line.
// sound: what the game hears when it's pressed (controlSound.ts) — 'tap' (default), 'back' (Back / Close / Resume),
//   or false when the press has its own sound in the game (so it never sounds twice).
// art (0.11.0): the game's own button pictures instead of the style's pill — { up, down?, label?, size? }.
//   up = the picture at rest, down = the picture while it's held (pressed in; drawn bottom-aligned in the same box,
//   so a shorter "pushed in" picture sinks into its base). Pictures keep their own shape — never stretched.
//   label: 'beside' (default: picture, then the words) · 'below' (words under the picture) · 'hidden' (picture only;
//   the words are still read out). size: s / m / l = how wide the picture is (3 / 4 / 5.5rem; l also gets heading-size
//   words). Still ≥ 44px to press. size 'fill' (0.13.0): the picture is as wide as the button's spot — a button drawn
//   into an art scene (an ArtLayer's box); pair it with label 'hidden'. Still ≥ 44px, centred on its spot.
import type { ButtonHTMLAttributes, CSSProperties, PointerEvent } from 'react'
import { controlSound, type ControlSoundKind } from './controlSound'

export type ButtonArt = { up: string; down?: string; label?: 'beside' | 'below' | 'hidden'; size?: 's' | 'm' | 'l' | 'fill' }

// Held down (finger, mouse or pen) → data-pressed, so the down picture shows on every phone (iOS skips :active)
const press = (on: boolean) => (e: PointerEvent<HTMLButtonElement>) => {
  if (on) e.currentTarget.dataset.pressed = ''
  else delete e.currentTarget.dataset.pressed
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: boolean
  loading?: boolean
  size?: number
  compact?: boolean
  sound?: ControlSoundKind | false
  art?: ButtonArt
}

export function Button({ variant = 'primary', icon, loading, size, compact, sound = 'tap', art, disabled, className = '', style, children, onClick, ...rest }: ButtonProps) {
  const px = size && size > 0 ? Math.round(size) : 0 // 0 = the normal size
  if (art) return (
    <button
      type="button"
      className={`kit-button kit-target ${className}`}
      data-variant={variant}
      data-art={art.label ?? 'beside'}
      data-art-size={art.size ?? 'm'}
      data-state={loading ? 'loading' : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      style={{ ...style }}
      onClick={(e) => {
        if (sound) controlSound(sound)
        onClick?.(e)
      }}
      onPointerDown={press(true)} onPointerUp={press(false)} onPointerCancel={press(false)} onPointerLeave={press(false)}
      {...rest}
    >
      <span className="kit-art-face" aria-hidden="true">
        <img className="kit-art-up" src={art.up} alt="" draggable={false} />
        {art.down && <img className="kit-art-down" src={art.down} alt="" draggable={false} />}
      </span>
      <span className="kit-art-label">{loading && <span className="kit-spinner" aria-hidden="true" />}{children}</span>
    </button>
  )
  return (
    <button
      type="button"
      className={`kit-button kit-target ${className}`}
      data-variant={variant}
      data-icon={icon || undefined}
      data-sized={px > 0 || undefined}
      data-compact={compact || undefined}
      data-state={loading ? 'loading' : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      style={{ ...style, '--kit-button-size': px > 0 ? `${px}px` : undefined } as CSSProperties}
      onClick={(e) => {
        if (sound) controlSound(sound)
        onClick?.(e)
      }}
      {...rest}
    >
      {loading && <span className="kit-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}

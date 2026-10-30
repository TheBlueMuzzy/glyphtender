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
import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent } from 'react'
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
  // An icon button holding a typed symbol (⚙ ✕ ◀): the symbol sits in its own box, measured so it always fits (useGlyphFit)
  const symbol = !!icon && !art && (typeof children === 'string' || typeof children === 'number')
  const glyph = useGlyphFit(symbol)
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
      {symbol ? <span ref={glyph} className="kit-button-glyph">{children}</span> : children}
    </button>
  )
}

// GLYPH FIT (0.35.5, F149) — an icon button is always its own size (44 px, or `size`), whatever font draws its symbol.
// The same ⚙ or ❤ is a narrow text symbol in one font and a wide colour emoji in another (WebKit, every iPhone): an
// emoji is about 1.37 em wide, a text symbol 0.85, so the 44 px button grew to 55–61 px around one. The button's box no
// longer follows its symbol (kit.css); this measures how wide the symbol is for its size (--kit-glyph-em: its width ÷
// its font size) so the CSS draws a wide one a little smaller, inside the button with room each side. A symbol that
// fits already (every text symbol in every style) keeps its size. Measured again when its width changes (a font
// arriving, a restyle, the text size) — on the next frame, never inside the observer (that loops).
function useGlyphFit(on: boolean) {
  const glyph = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = glyph.current
    const button = el?.parentElement
    if (!on || !el || !button || typeof ResizeObserver === 'undefined') return // (tests without a browser: no layout)
    let pending = 0
    fitGlyph(el)
    const watch = new ResizeObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; fitGlyph(el) }) })
    watch.observe(el)
    return () => { watch.disconnect(); cancelAnimationFrame(pending) }
  }, [on])
  return glyph
}

/** An icon button's symbol (.kit-button-glyph) → its button's --kit-glyph-em: the symbol's width ÷ its font size. */
// A symbol's width doesn't shrink exactly with its size (F149 fix, GitHub's Linux: text drawn there snaps to whole
// pixels, so the smaller symbol came out up to ~1 px wider than its share and left 1 px of room, not 1.5): measured
// again at the size it was just given, until it holds — a few rounds at most. It only takes a SMALLER width-per-size
// when that's clearly another font (5 % less: a restyle), never a pixel's rounding back and forth, so the observer
// that calls it settles instead of flipping between two sizes every frame.
export function fitGlyph(glyph: HTMLElement) {
  const button = glyph.parentElement
  if (!button || !button.offsetWidth) return
  const current = parseFloat(button.style.getPropertyValue('--kit-glyph-em')) || 0
  let em = 0
  for (let round = 0; round < 4; round++) {
    const fontSize = parseFloat(getComputedStyle(glyph).fontSize)
    if (!fontSize) return
    // (its width before any transform: a pressed button is scaled down)
    const scale = button.getBoundingClientRect().width / button.offsetWidth || 1
    const measured = glyph.getBoundingClientRect().width / scale / fontSize
    let next: number
    if (round > 0) next = Math.max(em, measured) // measured at the size just given: only ever wider
    else if (measured < current * 0.95) next = measured // a clearly narrower symbol (another font): start again from it
    else next = Math.max(measured, current) // the same symbol: a pixel's rounding never makes it bigger again
    if (round > 0 && next - em < 0.0005) break
    em = next
    const value = em.toFixed(3)
    if (button.style.getPropertyValue('--kit-glyph-em') === value) break
    button.style.setProperty('--kit-glyph-em', value)
  }
}

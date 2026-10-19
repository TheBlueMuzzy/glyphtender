// ART STAGE (0.12.0) — a scene drawn from the game's own pictures, laid out exactly as the artist placed them
// (Goops: Muzzy's console — the monitor, periscope, rank meter and repair panels, cut from his full-screen mock-up).
// The scene keeps its shape: it fits its box (the whole picture shows, centred) and is never stretched.
// Everything is placed in the PICTURE's own units (its viewBox), so positions copied from the art file just work:
//   <ArtStage size={[648, 1983]} view={[0, 831, 648, 1046]} viewShort={[0, 831, 648, 620]} label="Console">
//     <ArtLayer src="art/body.svg" at={[17, 1057, 614, 808]} />
//     <ArtLayer src="art/laser.svg" at={[68, 1240, 517, 141]} off label="Reset laser (not working yet)" />
//     <ArtLayer at={[255, 1298, 142, 26]} text={21} tone="primary">Reset laser</ArtLayer>
//   </ArtStage>
// size = the whole scene [width, height] · view = the part of it that shows [x, y, width, height] (default: all) ·
// viewShort = the part shown on short windows (30rem tall or less — a phone on its side), e.g. just the top half, so
// what's left is big enough to read and press.
// Layers stack in the order given (later = on top). A layer is a picture (`src`), words (`text` = their size in the
// picture's units, so they grow and shrink with the art), or any kit part (children fill the layer's box).
// `off` = drawn switched off: dimmed, can't be pressed or focused, read out as unavailable (a part that does nothing
// yet). `dim` = darkened but still working (e.g. the rest of a machine while one lever is pulled).
// The only kit part that places things freely — and it does it with a grid and margins, never absolute positioning.
import type { CSSProperties, ReactNode } from 'react'

export type ArtRect = [x: number, y: number, width: number, height: number]

const n = (v: number) => +v.toFixed(3)

type ArtStageProps = {
  size: [number, number]
  view?: ArtRect
  viewShort?: ArtRect
  label?: string
  // bleed: the scene past the view still shows (to the edge of the stage's box and the screen's padding round it) — e.g. a
  // tall monitor running off the top of the window, as the artist drew it. Without it the view is a clean cut-out.
  bleed?: boolean
  // align: where the view sits in a box that's taller / wider than it (center by default; end = at the bottom)
  align?: 'start' | 'center' | 'end'
  className?: string
  children?: ReactNode
}
export function ArtStage({ size: [w, h], view = [0, 0, w, h], viewShort = view, label, bleed, align, className = '', children }: ArtStageProps) {
  const vars = {
    '--kit-scene-w': n(w), '--kit-scene-ratio': `${n(w)} / ${n(h)}`,
    '--kit-view-x': n(view[0]), '--kit-view-y': n(view[1]), '--kit-view-w': n(view[2]), '--kit-view-ratio': n(view[2] / view[3]),
    '--kit-view-short-x': n(viewShort[0]), '--kit-view-short-y': n(viewShort[1]), '--kit-view-short-w': n(viewShort[2]),
    '--kit-view-short-ratio': n(viewShort[2] / viewShort[3]),
  } as CSSProperties
  return (
    <div className={`kit-art-stage ${className}`} style={{ ...vars }} role={label ? 'group' : undefined} aria-label={label}
      data-bleed={bleed || undefined} data-align={align && align !== 'center' ? align : undefined}>
      <div className="kit-art-view">
        <div className="kit-art-scene">{children}</div>
      </div>
    </div>
  )
}

type ArtLayerProps = {
  at: ArtRect | [x: number, y: number, width: number] // no height: a picture's own shape decides it
  src?: string
  text?: number // words: their size in the picture's units
  tone?: 'normal' | 'primary' | 'accent' | 'muted'
  align?: 'start' | 'center' | 'end'
  off?: boolean
  dim?: boolean
  label?: string // what a screen reader calls this layer (a picture with meaning, or an off part)
  blink?: 'fast' | 'slow' // 0.13.0: a lamp asking for attention — on / off in steps (put its "off" picture under it)
  shake?: number // 0.13.0: a count — each time it changes the layer gives one small "no" wobble (e.g. a wrong press)
  className?: string
  children?: ReactNode
}
export function ArtLayer({ at, src, text, tone, align, off, dim, label, blink, shake, className = '', children }: ArtLayerProps) {
  const [x, y, w, h] = at
  const vars = {
    '--kit-at-x': n(x), '--kit-at-y': n(y), '--kit-at-w': n(w),
    '--kit-at-ratio': h ? `${n(w)} / ${n(h)}` : undefined,
    '--kit-art-text': text ? n(text) : undefined,
  } as CSSProperties
  return (
    <div className={`kit-art-layer ${className}`} style={{ ...vars }} data-sized={h ? '' : undefined}
      data-text={text ? '' : undefined} data-tone={tone && tone !== 'normal' ? tone : undefined} data-align={align}
      data-off={off || undefined} data-dim={(dim && !off) || undefined}
      data-blink={(!off && blink) || undefined} data-shake={shake ? (shake % 2 ? 'a' : 'b') : undefined}
      aria-disabled={off || undefined}
      role={label ? 'img' : undefined} aria-label={label}>
      {src && <img className="kit-art-layer-picture" src={src} alt="" draggable={false} />}
      {off && children ? <div className="kit-art-layer-off" inert>{children}</div> : children}
    </div>
  )
}

// A TITLE PICTURE — the game's logo, as tall as `size` says (m = the main menu's 7rem, s = 3.5rem for a corner or a
// bottom row), as wide as its shape says, never wider than its box. alt = its name for screen readers.
export function TitleArt({ src, alt, size = 'm' }: { src: string; alt: string; size?: 's' | 'm' }) {
  return <img className="kit-title-art" data-size={size === 'm' ? undefined : size} src={src} alt={alt} draggable={false} />
}

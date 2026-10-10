// CARRY STYLES — how a dragged piece is carried. It knows nothing about any game or its rules (the Table referee
// says yes / no; this only decides the LOOK). Three questions, answered per drag type ("draft", "plan a seed"…):
//   carried — what follows the pointer:     solid (the piece itself) · ghost (a see-through copy)
//   origin  — what its home shows meanwhile: solid (the piece stays) · ghost (a faint mark) · empty (nothing)
//   land    — how a VALID drop ends:        settle (the carried piece eases onto the target) ·
//                                            solid (a ghost turns solid where it was dropped) ·
//                                            fly (the real piece flies from its home to the target — aiming)
//   back    — how an INVALID drop ends:      fly (it flies back home from the pointer) · fade (it fades where it is)
// The presets are the four named styles; a game picks one per drag type (content/tuning) and may override a part.
// Every carried piece also LIFTS (a little bigger, with a shadow) so it reads as "in your hand" in any style.
//
// The CARRIER moves one element (an svg <g>/<image> or an html element) inside a layer that covers the play area,
// by its centre in that layer's pixels, and plays the endings with Web Animations — never React state per frame.
// Reduce motion → no animation: it just shows / hides.
import { reduceMotion } from '../blocks/motion'
import { pulledToward, type Snap } from './target'

export type CarriedLook = 'solid' | 'ghost'
export type OriginLook = 'solid' | 'ghost' | 'empty'
export type Landing = 'settle' | 'solid' | 'fly'
export type Return = 'fly' | 'fade'
export type CarryStyle = { carried: CarriedLook; origin: OriginLook; land: Landing; back: Return }

export const CARRY_PRESETS = {
  A: { carried: 'solid', origin: 'empty', land: 'settle', back: 'fly' }, // Pick it up
  B: { carried: 'solid', origin: 'ghost', land: 'settle', back: 'fly' }, // Lift, mark home
  C: { carried: 'ghost', origin: 'solid', land: 'fly', back: 'fade' }, // Aim
  D: { carried: 'ghost', origin: 'empty', land: 'solid', back: 'fly' }, // Float
} as const satisfies Record<string, CarryStyle>

export type CarryPreset = keyof typeof CARRY_PRESETS

/** The names players (and the Dev Kit) see for the presets. */
export const CARRY_NAMES: Record<CarryPreset, string> = { A: 'Pick it up', B: 'Lift, mark home', C: 'Aim', D: 'Float' }

/** A preset by its letter (an unknown letter → A), with any parts overridden. */
export function carryStyle(preset: string, parts: Partial<CarryStyle> = {}): CarryStyle {
  const base = CARRY_PRESETS[preset as CarryPreset] ?? CARRY_PRESETS.A
  return { ...base, ...parts }
}

/** The look numbers and timings (seconds). A game keeps them in content/tuning so they can be dialled in. */
export type CarryFeel = {
  ghostOpacity: number // a ghost (carried or at home) is this see-through (0.45)
  liftScale: number // a carried piece is this much bigger (1.12)
  liftShadow: number // its shadow's strength, 0 = none (0.35) — drawn in the style's background colour (--bg)
  liftTime: number // growing into the hand (0.08)
  landTime: number // settle / turn solid on the target (0.14)
  flyTime: number // the real piece flying home → target, or back home on a wrong drop (0.22)
  fadeTime: number // a wrong drop fading away (0.15)
  easing?: string // ('ease-out')
}

export const DEFAULT_CARRY_FEEL: CarryFeel = {
  ghostOpacity: 0.45, liftScale: 1.12, liftShadow: 0.35, liftTime: 0.08, landTime: 0.14, flyTime: 0.22, fadeTime: 0.15,
}

/** How see-through the carried piece is. */
export const carriedOpacity = (style: CarryStyle, feel: CarryFeel) => (style.carried === 'ghost' ? feel.ghostOpacity : 1)

/** What a piece's home shows while it is carried: undefined = itself, as usual. (HandPlace.origin takes this.) */
export const originWhileCarried = (style: CarryStyle): 'ghost' | 'empty' | undefined =>
  style.origin === 'solid' ? undefined : style.origin

/** How a piece that moves BY ITSELF along its own path (e.g. a glide on the board) wears the style while it travels,
 *  so it looks like a carried one: null = it travels as itself (a style whose landing flies the real piece — C);
 *  else its opacity, how much bigger, and its shadow strength (0–1) on the way, back to normal as it lands. */
export const travellingLook = (style: CarryStyle, feel: CarryFeel) =>
  style.land === 'fly' ? null : { opacity: carriedOpacity(style, feel), scale: feel.liftScale, shadow: feel.liftShadow }

/** The lift shadow as a CSS filter, for a piece `size` px across (the carrier's own shadow). */
export const liftShadowFilter = (size: number, strength: number) =>
  strength > 0 ? `drop-shadow(0 ${size * 0.08}px ${size * 0.1}px color-mix(in srgb, var(--bg) ${Math.round(strength * 100)}%, transparent))` : 'none'

/** A point in the carrier's layer, in pixels. */
export type Point = { x: number; y: number }

/** How a drop ended — the game commits the move when the promise resolves (or right away, and hides the target). */
export type DropEnd = 'landed' | 'returned'

export type Carrier = {
  /** Start carrying: shows the element at `at` (its centre), `size` px across, in the style's look, and lifts it. */
  start: (style: CarryStyle, at: Point, size: number) => void
  /** Follow the pointer. `snap` (target.ts snapTarget found a valid spot near it) = shown pulled toward that spot. */
  move: (at: Point, snap?: Snap | null) => void
  /** Carry it to `to` by itself, over `seconds` — an AI or another player's piece, moved the way a person's drag
   *  moves it ("AI looks human"): lifted, in the style's look. Then drop() it as usual. */
  travel: (to: Point, seconds: number, easing?: string) => Promise<void>
  /** Let go. `target` = where a valid drop lands (null = invalid). `home` = the piece's home (for fly / fly back). */
  drop: (target: Point | null, home: Point) => Promise<DropEnd>
  /** Stop at once, no ending (a cancelled press, a new screen). */
  cancel: () => void
  readonly carrying: boolean
}

type Animatable = Element & { style: CSSStyleDeclaration }

/** A carrier for `el` (hidden until start). `feel` is read on every start, so live tuning applies to the next drag. */
export function createCarrier(el: Animatable, feel: () => CarryFeel = () => DEFAULT_CARRY_FEEL): Carrier {
  let style: CarryStyle = CARRY_PRESETS.A
  let size = 0
  let at: Point = { x: 0, y: 0 }
  let carrying = false
  let current: Animation | null = null

  const shadow = (strength: number) => liftShadowFilter(size, strength)
  const transform = (p: Point, scale: number) => `translate(${p.x - size / 2}px, ${p.y - size / 2}px) scale(${scale})`
  const frame = (p: Point, scale: number, opacity: number, shadowStrength: number): Keyframe =>
    ({ transform: transform(p, scale), opacity, filter: shadow(shadowStrength) })
  const show = (f: Keyframe) => {
    el.style.transform = String(f.transform)
    el.style.opacity = String(f.opacity)
    el.style.filter = String(f.filter)
    el.style.visibility = 'visible'
  }
  const hide = () => { el.style.visibility = 'hidden' }
  const stop = () => { current?.cancel(); current = null }
  const canAnimate = () => typeof el.animate === 'function' && !reduceMotion()

  // Play keyframes, keep the last one as the element's own look, resolve when done (at once without animation)
  const play = (frames: Keyframe[], seconds: number, easing?: string) => new Promise<void>(resolve => {
    stop()
    show(frames[frames.length - 1])
    if (!canAnimate() || seconds <= 0) return resolve()
    const f = feel()
    current = el.animate(frames, { duration: seconds * 1000, easing: easing ?? f.easing ?? 'ease-out' })
    const done = () => { current = null; resolve() }
    current.onfinish = done
    current.oncancel = done
  })

  // The look while carried: lifted (bigger, shadowed), solid or ghost
  const carriedFrame = (p: Point) => { const f = feel(); return frame(p, f.liftScale, carriedOpacity(style, f), f.liftShadow) }
  // The look at rest: normal size, no shadow
  const restFrame = (p: Point, opacity: number) => frame(p, 1, opacity, 0)

  return {
    get carrying() { return carrying },
    start(s, p, px) {
      style = s; size = px; at = p; carrying = true
      el.style.transformOrigin = 'center'
      el.style.transformBox = 'fill-box'
      void play([restFrame(p, carriedOpacity(s, feel())), carriedFrame(p)], feel().liftTime)
    },
    move(p, snap) {
      at = snap ? pulledToward(p, snap) : p // (where it SHOWS, so a drop starts from there)
      if (!carrying) return
      if (current) stop() // (the lift is over the moment it moves)
      show(carriedFrame(at))
    },
    async travel(to, seconds, easing = 'ease-in-out') {
      if (!carrying) return
      const from = carriedFrame(at)
      at = to
      await play([from, carriedFrame(to)], seconds, easing)
    },
    async drop(target, home) {
      if (!carrying) return target ? 'landed' : 'returned'
      carrying = false
      const f = feel()
      const from = carriedFrame(at)
      if (target) {
        if (style.land === 'fly') {
          // Aiming: the ghost lets go, and the real piece travels from its home to the target
          await play([restFrame(home, 1), restFrame(target, 1)], f.flyTime)
        } else if (style.land === 'solid') {
          await play([{ ...from, transform: transform(target, f.liftScale) }, restFrame(target, 1)], f.landTime)
        } else {
          await play([from, restFrame(target, 1)], f.landTime)
        }
        hide()
        return 'landed'
      }
      if (style.back === 'fly') await play([from, restFrame(home, 1)], f.flyTime)
      else await play([from, { ...from, opacity: 0 }], f.fadeTime)
      hide()
      return 'returned'
    },
    cancel() { carrying = false; stop(); hide() },
  }
}

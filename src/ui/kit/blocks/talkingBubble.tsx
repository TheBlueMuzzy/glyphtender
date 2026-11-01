// TALKING BUBBLE — a story line someone SAYS (framework F111, from Goops' sketch S9 "speaker bubble", the Veteran).
//
// <TalkingBubble target="#speaker" text="Found some scraps. Don't tell the screen." feel={tuning.talk} onConfirm={next} />
//   Same intention as the emote SpeechBubble (words pointing at a thing) → the same Callout underneath: the same
//   placement maths (flips to fit, stays in the window or game picture, `avoid` = a CSS selector it stays clear of),
//   the same pointer and the same colours in every style. What's new is how it TALKS:
//   1. It grows open from its pointer's tip (320 ms, ease-out-back). No words while it grows.
//   2. The words type out (`typeSpeed` letters a second) and rest at . ! ? … (`pauseMs`) and at , — (half that).
//   3. While it types, a stretch of the outline (`waveStart` → `waveEnd`, a share of the outline from the top-left
//      corner, clockwise) fizzes as a spiky speech wave: spikes about `spikeGap` apart, up to `talkHeight` tall, their
//      heights re-picked ~25 times a second, their widths drifting (`variability`), their shape from `roundness`
//      (0 needle → 5 sine → 10 semicircle). The pointer never fizzes. At a rest the wave relaxes flat.
//   4. Each syllable pops the OUTLINE a little (`popSize`) — the words never move.
//   5. Done, waiting to be confirmed: now and then (`squelchEvery` ± 1.5 s) the outline squelches — a burst of static.
//   outline "wave" (default) or "plain" (the same grow, typing, rests and pops — no wave, no squelch). (Not named
//   `style`: that's the CSS prop — check-ui would flag every game that passes it.)
//   FIXED SIZE from the start: the whole line is laid out (the untyped part unseen), so it never grows while typing.
//   onConfirm: the bubble becomes a button ("Next" — `words`): a tap / Enter / Space while typing shows the whole line;
//   once it's all there, it calls onConfirm. Without onConfirm it never catches taps. onTyped: the whole line is showing.
//   0.32.0: a confirmable bubble takes the keyboard focus when it appears (not out of a text box the player is typing
//   in) and gives it back when it goes. lineId: a new one restarts the bubble even with the same words (a line said
//   twice) — pass the script's line number or a counter you bump per line.
//   feel: the numbers (DEFAULT_TALK_FEEL = Muzzy's approved S9 values). A game keeps them in content/tuning/talk.json and
//   passes that object; they're read every frame, so Dev Kit edits apply live. Spike sizes are px at 100% text size.
//   Reduce motion (device or the kit's switch): no grow, no wave, no pops — the whole line just shows.
//   Screen readers: the full line is said once (the page's one live region — announce(), 0.32.0 — `speaker` in
//   front), never letter by letter.
//   Pause: animation frames only (the Dev Kit's full pause holds them; a frame's time is capped, so no jump after).
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Text } from '../controls'
import { type CalloutPlacement, type CalloutSide, type CalloutTarget } from './callout'
import { announce, liveRegion } from './emotes'
import { reduceMotion } from './motion'
import { useCalloutPlace, useShownPopover, type CalloutPlaceInput } from './teach'
import { focusRing } from '../keysOrPad'

// ─── The numbers ────────────────────────────────────────────────────

export type TalkFeel = {
  /** Where the wave starts, as a share of the outline (0 = top-left corner, going clockwise). */
  waveStart: number
  /** Where it ends. Start = end (or 0 → 1) = all the way round, with no seam. */
  waveEnd: number
  /** px between spikes (at 100% text size). */
  spikeGap: number
  /** px: how tall the spikes get while it talks (and in a squelch). */
  talkHeight: number
  /** 0 = needle-sharp spikes · 5 = sine bumps · 10 = round bumps. */
  roundness: number
  /** 0 = every spike the same width … 1 = very uneven (they keep shifting while it talks). */
  variability: number
  /** How much the outline swells on each syllable (0.025 = 2.5%). The words never move. */
  popSize: number
  /** Letters a second. */
  typeSpeed: number
  /** ms of rest after . ! ? … (half after , and —). */
  pauseMs: number
  /** Seconds between squelches while it waits (± 1.5 s at random). 0 = never. */
  squelchEvery: number
}

/** Muzzy's approved values (Goops sketch S9, 2026-10-23). */
export const DEFAULT_TALK_FEEL: TalkFeel = {
  waveStart: 0, waveEnd: 0.34, spikeGap: 19, talkHeight: 51, roundness: 3, variability: 0.45,
  popSize: 0.025, typeSpeed: 22, pauseMs: 380, squelchEvery: 2.5,
}

/** The safe range of each number (0.32.0): wider than the sketch's sliders, narrow enough that nothing draws broken
 *  (variability over ~1.18 turned spikes inside out; a spike gap near 0 meant thousands of spikes). */
export const TALK_FEEL_RANGES: Record<keyof TalkFeel, readonly [number, number]> = {
  waveStart: [0, 1], waveEnd: [0, 1], spikeGap: [2, 200], talkHeight: [0, 120], roundness: [0, 10], variability: [0, 1],
  popSize: [0, 0.25], typeSpeed: [1, 1000], pauseMs: [0, 10000], squelchEvery: [0, 60],
}

/** The numbers the bubble uses: each of `feel`'s pulled into its safe range; a missing, null, NaN or non-number one
 *  (a bad talk.json) is DEFAULT_TALK_FEEL's. */
export function talkFeel(feel?: Partial<Record<keyof TalkFeel, unknown>> | null): TalkFeel {
  const out = { ...DEFAULT_TALK_FEEL }
  if (!feel || typeof feel !== 'object') return out
  for (const key of Object.keys(TALK_FEEL_RANGES) as (keyof TalkFeel)[]) {
    const value = feel[key], [low, high] = TALK_FEEL_RANGES[key]
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.min(high, Math.max(low, value))
  }
  return out
}

// Fixed (S9 picks.json "_fixed"): the grow, the beat before typing starts, the squelch spread
export const TALK_GROW_MS = 320
const PRE_TYPE_S = 0.15
const SQUELCH_SPREAD_S = 1.5
const STEP_S = 1 / 120 // the sketch's fixed step
const MAX_FRAME_S = 0.1 // a long frame (a tab back from the background, a pause let go) counts as this at most

export const talkWords = { next: 'Next' }

// ─── The talking (the sketch's update(), pure: tested without a page) ─

export type TalkPhase = 'grow' | 'pre' | 'type' | 'wait'
export type TalkState = {
  phase: TalkPhase; t: number; shown: number; wait: number
  level: number; levelTarget: number; pop: number; popV: number
  squelch: number; nextSquelch: number; flickerT: number
  heights: number[]; heightTargets: number[]; widths: number[]; widthTargets: number[]
}
type Random = () => number

export function startTalk(): TalkState {
  return { phase: 'grow', t: 0, shown: 0, wait: 0.2, level: 0, levelTarget: 0, pop: 0, popV: 0, squelch: 0, nextSquelch: Infinity,
    flickerT: 0, heights: [], heightTargets: [], widths: [], widthTargets: [] }
}

/** Seconds until the next squelch: squelchEvery ± 1.5 s (never under 0.2 s); squelchEvery 0 = never. */
export const squelchGap = (feel: TalkFeel, rnd: Random) =>
  feel.squelchEvery > 0 ? Math.max(0.2, feel.squelchEvery + (rnd() * 2 - 1) * SQUELCH_SPREAD_S) : Infinity

/** The rest after this letter, in seconds (and whether the voice goes quiet): . ! ? … full, , — half. */
export function restAfter(text: string, index: number, feel: TalkFeel) {
  const c = text[index]
  if ('.!?…'.includes(c) && text[index + 1] !== '.') return feel.pauseMs / 1000 // ("..." rests once, after the last dot)
  if (',—'.includes(c)) return feel.pauseMs / 2000
  return 0
}

const isVowel = (c: string) => 'aeiouyAEIOUY'.includes(c)

/** Show the whole line now (a tap while it types, or reduce motion) → waiting. */
export function finishTalk(s: TalkState, text: string, feel: TalkFeel, rnd: Random) {
  s.phase = 'wait'; s.shown = text.length; s.levelTarget = 0; s.nextSquelch = squelchGap(feel, rnd)
}

/** One step of `dt` seconds. `outline` plain: no voice level (so no wave, no squelch); pops stay. */
export function stepTalk(s: TalkState, dt: number, text: string, feel: TalkFeel, rnd: Random = Math.random, plain = false) {
  s.t += dt
  if (s.phase === 'grow' && s.t * 1000 >= TALK_GROW_MS) { s.phase = 'pre'; s.t = 0 }
  if (s.phase === 'pre' && s.t >= PRE_TYPE_S) { s.phase = 'type'; s.wait = 0 }
  if (s.phase === 'type') {
    s.wait -= dt
    while (s.wait <= 0 && s.shown < text.length) {
      const c = text[s.shown], prev = text[s.shown - 1] ?? ' '
      const rest = restAfter(text, s.shown, feel)
      s.shown++
      if (rest > 0) s.levelTarget = 0
      else if (c === ' ') s.levelTarget *= 0.5
      else s.levelTarget = 0.65 + rnd() * 0.35
      // a syllable starts at a vowel after a non-vowel → a small pop
      if (isVowel(c) && !isVowel(prev)) s.popV += feel.popSize * 40
      s.wait += 1 / Math.max(1, feel.typeSpeed) + rest
    }
    if (s.shown >= text.length && s.wait <= 0) finishTalk(s, text, feel, rnd)
  }
  if (s.phase === 'wait') {
    s.nextSquelch -= dt
    if (s.nextSquelch <= 0) { s.squelch = 0.25 + rnd() * 0.2; s.nextSquelch = squelchGap(feel, rnd) }
    if (s.squelch > 0) { s.squelch -= dt; s.levelTarget = 0.6 + rnd() * 0.6 } else s.levelTarget = 0
  }
  if (plain) s.levelTarget = 0
  // the voice level eases toward its target (fast up, slower down = relaxing)
  const k = s.levelTarget > s.level ? 40 : 10
  s.level += (s.levelTarget - s.level) * Math.min(1, k * dt)
  // the pop spring
  s.popV += (-300 * s.pop - 18 * s.popV) * dt; s.pop += s.popV * dt
  // spikes re-pick their heights ~25 times a second (uneven: a few tall, many small), then glide there
  s.flickerT -= dt
  if (s.flickerT <= 0) { s.flickerT = 0.04; for (let i = 0; i < s.heightTargets.length; i++) s.heightTargets[i] = Math.pow(rnd(), 1.6) }
  for (let i = 0; i < s.heights.length; i++) s.heights[i] += (s.heightTargets[i] - s.heights[i]) * Math.min(1, 30 * dt)
  // widths drift to new random widths while it talks (variability), slower than the heights
  if (s.level > 0.05 && rnd() < dt * 8) for (let i = 0; i < s.widthTargets.length; i++) s.widthTargets[i] = spikeWidth(feel, rnd)
  for (let i = 0; i < s.widths.length; i++) s.widths[i] += (s.widthTargets[i] - s.widths[i]) * Math.min(1, 12 * dt)
}

const spikeWidth = (feel: TalkFeel, rnd: Random) => 1 + feel.variability * (rnd() * 2 - 1) * 0.85

/** As many spikes as the stretch holds (a whole number → a full loop closes with no seam). */
function fitSpikes(s: TalkState, count: number, feel: TalkFeel, rnd: Random) {
  if (s.heights.length === count) return
  s.heights = Array.from({ length: count }, () => 0.5); s.heightTargets = s.heights.slice()
  s.widths = Array.from({ length: count }, () => spikeWidth(feel, rnd)); s.widthTargets = s.widths.slice()
}

// ─── The outline (the sketch's outline() + draw(), pure) ─────────────

/** One spike, f = 0..1 across it → 0..1 high. roundness 0 = needle (concave sides), 5 = sine bump, 10 = semicircle. */
export function spikeShape(f: number, roundness: number) {
  const tri = 1 - Math.abs(2 * f - 1), sine = Math.sin(Math.PI * f), circle = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2))
  const t = Math.max(0, Math.min(1, roundness / 10))
  return t < 0.5 ? tri ** 2 + (sine - tri ** 2) * (t * 2) : sine + (circle - sine) * (t * 2 - 1)
}
const smooth01 = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }

export type OutlinePoint = { x: number; y: number; nx: number; ny: number; keep: number }
export type OutlineBox = {
  /** The outline's rectangle (the middle of the border line). */
  x: number; y: number; w: number; h: number
  /** Corner radius; bevel = the corners are cut straight (Neon, Pixel). */
  r: number; bevel: boolean
  /** Which side of its target the bubble is on (the pointer is on the opposite edge), the pointer's middle on that
   *  edge, and how far it sticks out (its base is twice that wide — the Callout's turned square). */
  side: CalloutSide; tipX: number; tipY: number; reach: number
}

/** The outline as points 1 px apart, clockwise from the top-left corner, with outward normals and `keep` (0 on the
 *  pointer, fading to 1 over 10 px either side: the pointer never fizzes). Also the pointer's tip. */
export function talkOutline(b: OutlineBox): { points: OutlinePoint[]; tip: { x: number; y: number } } {
  const pts: [number, number][] = []
  const r = Math.max(0, Math.min(b.r, b.w / 2, b.h / 2))
  const { x, y, w, h, reach } = b
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)))
    for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n])
  }
  const corner = (cx: number, cy: number, a0: number, a1: number) => {
    if (r <= 0) return
    if (b.bevel) { line(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r); return }
    const n = Math.max(2, Math.round(r * Math.abs(a1 - a0)))
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) }
  }
  // The pointer's edge: a bubble above its target points from its bottom edge, and so on
  const tailEdge = ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const)[b.side]
  let t0 = -1, t1 = -1, tip = { x: b.tipX, y: b.tipY }
  // An edge from (x0, y0) to (x1, y1), with the pointer on it when it's the pointer's edge
  const edge = (name: CalloutSide, x0: number, y0: number, x1: number, y1: number) => {
    if (name !== tailEdge) return line(x0, y0, x1, y1)
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, tx = (x1 - x0) / len, ty = (y1 - y0) / len
    const half = Math.min(reach, len / 2)
    // where the pointer's middle falls along this edge (kept clear of the corners)
    const along = Math.max(half, Math.min(len - half, (b.tipX - x0) * tx + (b.tipY - y0) * ty))
    const ax = x0 + tx * (along - half), ay = y0 + ty * (along - half)
    const bx = x0 + tx * (along + half), by = y0 + ty * (along + half)
    tip = { x: x0 + tx * along + ty * reach, y: y0 + ty * along - tx * reach } // outward = (ty, −tx)
    line(x0, y0, ax, ay)
    t0 = pts.length
    line(ax, ay, tip.x, tip.y); line(tip.x, tip.y, bx, by)
    t1 = pts.length
    line(bx, by, x1, y1)
  }
  const P = Math.PI
  edge('top', x + r, y, x + w - r, y)
  corner(x + w - r, y + r, -P / 2, 0)
  edge('right', x + w, y + r, x + w, y + h - r)
  corner(x + w - r, y + h - r, 0, P / 2)
  edge('bottom', x + w - r, y + h, x + r, y + h)
  corner(x + r, y + h - r, P / 2, P)
  edge('left', x, y + h - r, x, y + r)
  corner(x + r, y + r, P, P * 1.5)
  const n = pts.length
  const points = pts.map(([px, py], i) => {
    const a = pts[(i - 2 + n) % n], c = pts[(i + 2) % n]
    let tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l
    const dist = t0 < 0 ? Infinity : i < t0 ? Math.min(t0 - i, n - t1 + i) : i >= t1 ? Math.min(i - t1 + 1, n - i + t0) : 0
    return { x: px, y: py, nx: ty, ny: -tx, keep: smooth01(dist / 10) }
  })
  return { points, tip }
}

/** How far each outline point is pushed out right now (px), from the talk state: the speech wave's stretch, its
 *  spikes and the voice level. Also which sides of the bubble the stretch reaches (for the room it keeps round it). */
export function waveOffsets(points: OutlinePoint[], s: TalkState, feel: TalkFeel, scale: number, rnd: Random = Math.random) {
  const N = points.length
  const a = ((feel.waveStart % 1) + 1) % 1
  let span = feel.waveEnd - feel.waveStart; if (span <= 0.0001) span += 1
  span = Math.min(1, span)
  const full = span >= 0.999, spanPx = span * N
  const waves = Math.max(1, Math.round(spanPx / Math.max(1, feel.spikeGap * scale)))
  fitSpikes(s, waves, feel, rnd)
  let total = 0; for (const w of s.widths) total += w
  const edges = [0]; for (let k = 0; k < waves; k++) edges.push(edges[k] + s.widths[k] / total)
  const taper = Math.min(spanPx * 0.2, 24 * scale)
  const amp = feel.talkHeight * scale * s.level
  const out = new Float32Array(N)
  const sides = { top: false, right: false, bottom: false, left: false }
  let k = 0
  for (let i = 0; i < N; i++) {
    let sIn = (i / N - a) % 1; if (sIn < 0) sIn += 1 // where it is inside the stretch, 0..1 of the outline
    if (sIn > span) continue
    const p = points[i]
    if (p.keep > 0) {
      if (p.ny < -0.5) sides.top = true; if (p.nx > 0.5) sides.right = true
      if (p.ny > 0.5) sides.bottom = true; if (p.nx < -0.5) sides.left = true
    }
    if (amp <= 0.05) continue
    const u = sIn / span
    if (edges[k] > u) k = 0
    while (k < waves - 1 && edges[k + 1] <= u) k++
    const f = (u - edges[k]) / (edges[k + 1] - edges[k])
    const env = full ? 1 : smooth01(sIn * N / taper) * smooth01((span - sIn) * N / taper)
    out[i] = amp * s.heights[k] * spikeShape(f, feel.roundness) * env * p.keep
  }
  return { out, sides }
}

/** The wave never leaves the screen (0.35.4, F147: at 200% text a bubble as wide as the phone allows had no room left
 *  beside it, and its right-hand spikes ran past the screen's edge). Each point's push-out `out` is cut to what keeps it
 *  inside `room` (screen px: the window or game picture, minus the edge room). `origin` = where the outline's 0,0 is on
 *  screen; `centre` + `pop` = the swell round the bubble's middle (outline px). Changes `out` in place. */
export function keepWaveInside(points: OutlinePoint[], out: Float32Array, origin: { x: number; y: number },
  room: { left: number; top: number; right: number; bottom: number }, centre: { x: number; y: number }, pop = 1) {
  const cx = origin.x + centre.x, cy = origin.y + centre.y
  // the swell moves a point away from the middle: where it may sit before the swell, so it's inside after
  const left = cx + (room.left - cx) / pop, right = cx + (room.right - cx) / pop
  const top = cy + (room.top - cy) / pop, bottom = cy + (room.bottom - cy) / pop
  for (let i = 0; i < points.length; i++) {
    if (out[i] <= 0) continue
    const q = points[i], px = origin.x + q.x, py = origin.y + q.y
    let most = out[i]
    if (q.nx > 0.001) most = Math.min(most, (right - px) / q.nx)
    if (q.nx < -0.001) most = Math.min(most, (left - px) / q.nx)
    if (q.ny > 0.001) most = Math.min(most, (bottom - py) / q.ny)
    if (q.ny < -0.001) most = Math.min(most, (top - py) / q.ny)
    out[i] = Math.max(0, most)
  }
  return out
}

/** The grow (0.15 → 1, ease-out-back) at `t` 0..1. */
export const growScale = (t: number) => { const c1 = 1.7, u = Math.min(1, Math.max(0, t)) - 1; return 0.15 + 0.85 * (1 + (c1 + 1) * u ** 3 + c1 * u ** 2) }

// ─── The game's colours (0.33.0, F121 — Goops' Veteran: a light bubble with dark words) ─────

/** A game's own bubble colours (content/tuning/talk.json): each one left out = the style's. The part holds no colours —
 *  these come in as the game's data. */
export type TalkColours = {
  /** The bubble's inside (the style's surface). */
  fill?: string
  /** The words (the style's text colour). Kept only if it reads on the fill: at least 4.5 : 1. */
  ink?: string
  /** The outline (the style's border). */
  outline?: string
  /** The outline's width in px at 100% text size, 0–8 (the style's edge width). */
  outlineWidth?: number
  /** The ▼ "tap to go on" mark (the style's muted colour). */
  more?: string
}
export const TALK_OUTLINE_WIDTH_RANGE = [0, 8] as const
export const TALK_MIN_CONTRAST = 4.5

const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`
const HEX = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i
// rgb / hsl with commas or spaces, an optional alpha ("rgb" + "(" kept apart so check-ui never reads them as a colour)
const FUNCTION = new RegExp(`^(rgba?|hsla?)\\(\\s*(${NUMBER})(%|deg)?\\s*,?\\s*(${NUMBER})(%)?\\s*,?\\s*(${NUMBER})(%)?\\s*(?:[,/]\\s*(${NUMBER})%?\\s*)?\\)$`, 'i')
// What the browser hands back for a colour it resolved ("color" + "(srgb …" for the newer kinds)
const SRGB = new RegExp(`^color\\(srgb\\s+(${NUMBER})\\s+(${NUMBER})\\s+(${NUMBER})`, 'i')

/** Is this a real colour? The browser says (CSS.supports); where there is none (tests, a server), only hex, rgb() and
 *  hsl() count. Anything else (a number, a word that isn't a colour, a sneaky "red; …") is no colour. */
export function isColour(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v || v.length > 64 || /[;{}<>]/.test(v)) return false
  // Not a colour of its own (the browser says yes to these): currentColor paints the fill in the words' own colour,
  // var() / env() / attr() and inherit … revert point somewhere else — the contrast floor couldn't judge what they show
  if (/currentcolor|\b(?:var|env|attr)\s*\(|^(?:inherit|initial|unset|revert|revert-layer)$/i.test(v)) return false
  const css = browserCss()
  return css ? css.supports('color', v) : readRgb(v) !== null
}
const browserCss = () => (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS : null)

/** A colour as red, green, blue (0–255), or null when it can't be read. Hex, rgb() and hsl() are read here; any other
 *  colour the browser knows (a name like "ivory") is read through the browser. Alpha is ignored. */
export function colourRgb(value: string): [number, number, number] | null {
  const v = value.trim()
  const read = readRgb(v)
  if (read) return read
  // Any other colour: let the browser resolve it (a probe never shown), then read what it hands back
  if (!browserCss() || typeof document === 'undefined' || !document.body || !isColour(v)) return null
  const probe = document.createElement('span')
  probe.style.color = v
  probe.hidden = true
  document.body.appendChild(probe)
  const seen = getComputedStyle(probe).color
  probe.remove()
  return readRgb(seen)
}

// Hex, rgb(), hsl() and the browser's color(srgb …), read here; anything else → null
function readRgb(v: string): [number, number, number] | null {
  const hex = HEX.exec(v)
  if (hex) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  }
  const fn = FUNCTION.exec(v)
  if (fn) {
    const [, kind, a, aUnit, b, bPct, c, cPct] = fn
    const n = (s: string) => Number(s)
    if (/^rgb/i.test(kind)) {
      if (aUnit === 'deg') return null
      const ch = (s: string, pct?: string) => Math.max(0, Math.min(255, pct ? n(s) * 2.55 : n(s)))
      return [ch(a, aUnit), ch(b, bPct), ch(c, cPct)]
    }
    // hsl → rgb
    const hue = (((n(a) % 360) + 360) % 360) / 360, sat = Math.max(0, Math.min(1, n(b) / 100)), lig = Math.max(0, Math.min(1, n(c) / 100))
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat, p = 2 * lig - q
    const part = (t: number) => {
      t = ((t % 1) + 1) % 1
      const x = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
      return x * 255
    }
    return [part(hue + 1 / 3), part(hue), part(hue - 1 / 3)]
  }
  const srgb = SRGB.exec(v)
  if (srgb) return [1, 2, 3].map((i) => Math.max(0, Math.min(255, Number(srgb[i]) * 255))) as [number, number, number]
  return null
}

/** WCAG contrast of two colours (1 … 21), or null when either can't be read. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = colourRgb(a), rb = colourRgb(b)
  if (!ra || !rb) return null
  const lum = ([r, g, bl]: number[]) => {
    const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl)
  }
  const [hi, lo] = [lum(ra), lum(rb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The colours the bubble paints with: the game's ones that are real (bad ones dropped), the width pulled into 0–8,
 *  and the contrast floor — the words must read on the fill (4.5 : 1). The game's ink fails → the style's text colour;
 *  the style's text fails on the game's fill too → the style's fill as well (never unreadable). `style` = the style's
 *  own fill + text colours (to judge against). `problems` = what was dropped, for the dev console. */
export function talkColours(colours: unknown, style: { fill: string; ink: string }) {
  const out: TalkColours = {}
  const problems: string[] = []
  if (!colours || typeof colours !== 'object') return { colours: out, problems }
  const given = colours as Record<keyof TalkColours, unknown>
  for (const key of ['fill', 'ink', 'outline', 'more'] as const) {
    const v = given[key]
    if (v === undefined || v === null) continue
    if (isColour(v)) out[key] = v.trim()
    else problems.push(`colours.${key} ${JSON.stringify(v)} is not a colour — the style's is used`)
  }
  const width = given.outlineWidth
  if (typeof width === 'number' && Number.isFinite(width)) out.outlineWidth = Math.min(TALK_OUTLINE_WIDTH_RANGE[1], Math.max(TALK_OUTLINE_WIDTH_RANGE[0], width))
  else if (width !== undefined && width !== null) problems.push(`colours.outlineWidth ${JSON.stringify(width)} is not a number — the style's is used`)
  // The contrast floor (a colour that can't be read for contrast counts as failing it)
  const reads = (ink: string, fill: string) => (contrastRatio(ink, fill) ?? 0) >= TALK_MIN_CONTRAST
  if ((out.ink || out.fill) && !reads(out.ink ?? style.ink, out.fill ?? style.fill)) {
    if (out.ink) {
      problems.push(`colours.ink ${out.ink} on ${out.fill ?? style.fill} is under ${TALK_MIN_CONTRAST} : 1 — the style's text colour is used`)
      delete out.ink
    }
    if (out.fill && !reads(style.ink, out.fill)) {
      problems.push(`colours.fill ${out.fill} doesn't read with the style's text colour either — the style's fill is used (set a darker or lighter ink)`)
      delete out.fill
    }
  }
  return { colours: out, problems }
}

// Each problem is said once a page (in dev), not every frame
const told = new Set<string>()
function tell(problems: string[]) {
  if (!import.meta.env?.DEV) return
  for (const p of problems) if (!told.has(p)) { told.add(p); console.warn(`[ui-kit] TalkingBubble: ${p}`) }
}

// ─── The part ───────────────────────────────────────────────────────

export type TalkingBubbleProps = {
  target: CalloutTarget
  /** The line, in the current language. A new line restarts it (grow, then type). */
  text: string
  /** Which line this is — the script's line number, or a counter the game bumps per line (0.32.0). A new lineId
   *  restarts the bubble (and says it again) even when the words are the same: a line said twice. Without it, only
   *  new words restart it. */
  lineId?: string | number
  /** Who's talking, said in front of the line for screen readers ("The Veteran: …"). */
  speaker?: string
  /** "wave" (default) — the outline fizzes while it talks · "plain" — no wave, no squelch. */
  outline?: 'wave' | 'plain'
  /** The numbers (content/tuning/talk.json) — any left out are DEFAULT_TALK_FEEL's. Read every frame (live). Each is
   *  kept in its safe range (TALK_FEEL_RANGES); a null / NaN / non-number one is the default (talkFeel). */
  feel?: Partial<Record<keyof TalkFeel, unknown>> | null
  /** The game's own colours (0.33.0, F121 — content/tuning/talk.json): fill, ink (the words), outline, outlineWidth,
   *  more (the ▼). Each left out = the style's, exactly as without it. Read every frame (live, like `feel`). Bad ones are
   *  ignored; ink that doesn't read on the fill (under 4.5 : 1) → the style's text colour (talkColours). */
  colours?: Partial<Record<keyof TalkColours, unknown>> | null
  placement?: CalloutPlacement
  /** A CSS selector of what it must stay clear of (the HUD). */
  avoid?: string
  /** Makes it a button: a tap while typing shows the whole line; once it's all there, this. */
  onConfirm?: () => void
  /** The whole line is showing (typed out, tapped through, or reduce motion). */
  onTyped?: () => void
  words?: Partial<typeof talkWords>
}

const cssVar = (style: CSSStyleDeclaration, name: string) => style.getPropertyValue(name).trim()
// The style's --depth-2 shadow as a filter for the drawn outline (its first shadow; a box shadow's spread can't be)
function shadowFilter(depth: string) {
  const first = depth.split(/,(?![^(]*\))/)[0]?.trim()
  if (!first || first === 'none' || /inset/.test(first)) return 'none'
  const parts = first.match(/(?:[a-z-]+\([^)]*\)|[^\s]+)/gi) ?? []
  const lengths = parts.filter((p) => /^-?[\d.]+(px|rem|em)?$/.test(p)).slice(0, 3) // x y blur (no spread)
  const colour = parts.filter((p) => !/^-?[\d.]+(px|rem|em)?$/.test(p)).join(' ')
  return lengths.length >= 2 ? `drop-shadow(${lengths.join(' ')} ${colour})` : 'none'
}

export function TalkingBubble({ target, text, lineId, speaker, outline = 'wave', feel, colours, placement = 'top', avoid, onConfirm, onTyped, words }: TalkingBubbleProps) {
  const w = { ...talkWords, ...words }
  const layer = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const shape = useRef<SVGPathElement>(null)
  const group = useRef<SVGGElement>(null)
  const typed = useRef<HTMLSpanElement>(null)
  const rest = useRef<HTMLSpanElement>(null)
  const now = useRef<CalloutPlaceInput>({ target, placement, avoid })
  const props = useRef({ text, outline, feel, colours, onConfirm, onTyped })
  const talk = useRef<TalkState>(startTalk())
  useLayoutEffect(() => { now.current = { target, placement, avoid }; props.current = { text, outline, feel, colours, onConfirm, onTyped } })
  useShownPopover(layer)
  useCalloutPlace(layer, bubble, now)

  // A new line (new words, or a new lineId: the same words said again) starts over (grow, then type)
  useLayoutEffect(() => { talk.current = startTalk() }, [text, lineId])
  // …and is said once through the page's one live region (made on mount, so it's there before the first line)
  useEffect(() => { liveRegion() }, [])
  const said = speaker ? `${speaker}: ${text}` : text
  useEffect(() => { announce(said) }, [text, lineId]) // eslint-disable-line react-hooks/exhaustive-deps -- once per line, not per speaker change

  // A bubble you confirm takes the keyboard focus when it appears (Enter / Space go on; a screen reader lands on it),
  // a frame later like a pausing Callout's button — but never out of a text box, select or editable the player is
  // typing in. When it goes, the focus goes back where it was (in a LAYOUT cleanup: before React removes it — F109).
  const button = !!onConfirm
  useLayoutEffect(() => {
    if (!button) return
    const before = document.activeElement as HTMLElement | null
    const el = bubble.current
    const frame = schedule(() => { if (!typingIn(document.activeElement)) el?.focus(focusRing({ preventScroll: true })) })
    return () => {
      cancel(frame)
      if (before?.isConnected && before !== el && el?.contains(document.activeElement)) before.focus({ preventScroll: true })
    }
  }, [button])

  // The frame loop: steps the talking at the sketch's fixed step, then draws the outline and the typed words.
  // Everything here writes to the page directly (refs) — never React state per frame.
  useLayoutEffect(() => {
    let frame = 0, last = performance.now(), carry = 0, drawn = '', room = '', phase = '', words = '', painted = '', typedFired = false
    let line: TalkState | null = null // the talk onTyped was last judged for (a new line = a new TalkState)
    const tick = () => {
      const at = performance.now()
      const dt = Math.min((at - last) / 1000, MAX_FRAME_S); last = at
      const p = props.current, f = talkFeel(p.feel), s = talk.current
      // A new line gets its own onTyped — even under reduce motion, where it's whole before this frame ever sees it type
      if (s !== line) { line = s; typedFired = false }
      const still = reduceMotion(), plain = p.outline === 'plain'
      if (still) { if (s.phase !== 'wait') finishTalk(s, p.text, f, Math.random); s.level = 0; s.levelTarget = 0; s.pop = 0; s.popV = 0 }
      carry += dt
      while (carry >= STEP_S) { stepTalk(s, STEP_S, p.text, f, Math.random, plain); carry -= STEP_S }
      if (still) { s.level = 0; s.pop = 0; s.popV = 0 }
      draw(s, f, still, plain)
      if (s.phase === 'wait' && !typedFired) { typedFired = true; p.onTyped?.() }
      if (s.phase !== 'wait') typedFired = false
      frame = schedule(tick)
    }
    const draw = (s: TalkState, f: TalkFeel, still: boolean, plain: boolean) => {
      const el = layer.current, box = bubble.current, path = shape.current, g = group.current
      if (!el || !box || !path || !g) return
      // The words: the typed part shown, the rest laid out but unseen (so nothing reflows as it types)
      const line = props.current.text
      if (`${s.shown}|${line}` !== words && typed.current && rest.current) {
        words = `${s.shown}|${line}`
        typed.current.textContent = line.slice(0, s.shown)
        rest.current.textContent = line.slice(s.shown)
      }
      if (s.phase !== phase) { phase = s.phase; box.setAttribute('data-phase', phase) }
      const look = getComputedStyle(box)
      paint(box, look)
      if (!el.hasAttribute('data-ready')) return
      // The look, read live from the style: border width, corner radius + shape, the shadow, the text size
      const border = (box.offsetWidth - box.clientWidth) / 2
      const scale = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16
      const layerStyle = el.style
      const side = (el.getAttribute('data-side') ?? 'top') as CalloutSide
      const tipEl = box.querySelector<HTMLElement>('.kit-callout-tip')
      const reach = (tipEl?.offsetWidth ?? 16 * scale) * Math.SQRT1_2
      const { points, tip } = talkOutline({
        x: -border / 2, y: -border / 2, w: box.clientWidth + border, h: box.clientHeight + border,
        r: parseFloat(look.borderTopLeftRadius) || 0, bevel: cssVar(look, '--corner-shape') === 'bevel',
        side, tipX: parseFloat(layerStyle.getPropertyValue('--kit-callout-tip-x')) || 0,
        tipY: parseFloat(layerStyle.getPropertyValue('--kit-callout-tip-y')) || 0, reach,
      })
      const { out, sides } = waveOffsets(points, s, f, scale)
      // …cut where it would leave the screen: the window or game picture, minus the edge room every bubble keeps (gap-m,
      // its words' padding). The bubble sits at --kit-callout-x / -y; the outline's 0,0 is inside its border.
      const frameEl = el.querySelector<HTMLElement>('.kit-callout-frame'), bodyEl = box.querySelector<HTMLElement>('.kit-talk-body')
      if (frameEl && bodyEl && !plain && !still) {
        const fr = frameEl.getBoundingClientRect(), edge = parseFloat(getComputedStyle(bodyEl).paddingLeft) || 0
        keepWaveInside(points, out,
          { x: (parseFloat(layerStyle.getPropertyValue('--kit-callout-x')) || 0) + border, y: (parseFloat(layerStyle.getPropertyValue('--kit-callout-y')) || 0) + border },
          { left: fr.left + edge, top: fr.top + edge, right: fr.right - edge, bottom: fr.bottom - edge },
          { x: box.clientWidth / 2, y: box.clientHeight / 2 }, 1 + s.pop)
      }
      let d = ''
      for (let i = 0; i < points.length; i++) {
        const q = points[i], o = plain || still ? 0 : out[i]
        d += `${i ? 'L' : 'M'}${(q.x + q.nx * o).toFixed(1)} ${(q.y + q.ny * o).toFixed(1)}`
      }
      d += 'Z'
      if (d !== drawn) { drawn = d; path.setAttribute('d', d) }
      // Grows open from the pointer's tip, then swells round its middle on each syllable (the words stay put)
      const grow = still || s.phase !== 'grow' ? 1 : growScale(s.t * 1000 / TALK_GROW_MS)
      const cx = box.clientWidth / 2, cy = box.clientHeight / 2, pop = still ? 1 : 1 + s.pop
      g.setAttribute('transform', `translate(${tip.x} ${tip.y}) scale(${grow.toFixed(4)}) translate(${-tip.x} ${-tip.y}) translate(${cx} ${cy}) scale(${pop.toFixed(4)}) translate(${-cx} ${-cy})`)
      g.style.filter = shadowFilter(cssVar(look, '--depth-2'))
      // Room round it on the sides the wave reaches, so the spikes stay inside the window (rem: grows with the text)
      const reachRem = plain ? 0 : (f.talkHeight * 1.2) / 16
      const want = (['top', 'right', 'bottom', 'left'] as const).map((k) => (sides[k] ? reachRem : 0).toFixed(3)).join()
      if (want !== room) {
        room = want
        const [t, r, b, l] = want.split(',')
        el.style.setProperty('--kit-talk-room-t', `${t}rem`); el.style.setProperty('--kit-talk-room-r', `${r}rem`)
        el.style.setProperty('--kit-talk-room-b', `${b}rem`); el.style.setProperty('--kit-talk-room-l', `${l}rem`)
      }
    }
    // The game's colours → the bubble's --kit-talk-* variables (blocks.css falls back to the style's for each one
    // not set). Only when the game's values or the style's fill / text change; none set = no variables at all.
    const paint = (box: HTMLElement, look: CSSStyleDeclaration) => {
      const given = props.current.colours
      const style = { fill: cssVar(look, '--surface'), ink: cssVar(look, '--on-surface') }
      const key = given && typeof given === 'object'
        ? `${style.fill}|${style.ink}|${(['fill', 'ink', 'outline', 'outlineWidth', 'more'] as const).map((k) => String(given[k])).join('|')}`
        : ''
      if (key === painted) return
      painted = key
      const { colours: use, problems } = talkColours(given, style)
      tell(problems)
      const set = (name: string, value: string | undefined) => (value === undefined ? box.style.removeProperty(name) : box.style.setProperty(name, value))
      set('--kit-talk-fill', use.fill)
      set('--kit-talk-ink', use.ink)
      set('--kit-talk-outline', use.outline)
      set('--kit-talk-outline-width', use.outlineWidth === undefined ? undefined : `${use.outlineWidth / 16}rem`)
      set('--kit-talk-more', use.more)
      if (!box.getAttribute('style')) box.removeAttribute('style') // none set → no style attribute at all (as before)
    }
    tick()
    return () => cancel(frame)
  }, [])

  const confirm = () => {
    const s = talk.current, p = props.current
    if (s.phase !== 'wait') finishTalk(s, p.text, talkFeel(p.feel), Math.random)
    else p.onConfirm?.()
  }
  // A held key's repeats are ignored, or holding Enter skipped through every line
  const key = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (!event.repeat) confirm()
  }
  const content = (
    <div ref={layer} {...{ popover: 'manual' }} className="kit-scope kit-callout-layer kit-talk-layer" data-outline={outline}>
      <div className="kit-callout-frame" aria-hidden />
      <div ref={bubble} className="kit-callout kit-talk" data-phase="grow" data-confirm={button || undefined}
        role={button ? 'button' : undefined} tabIndex={button ? 0 : undefined} aria-label={button ? w.next : undefined}
        aria-hidden={button ? undefined : true} onClick={button ? confirm : undefined} onKeyDown={button ? key : undefined}>
        <svg className="kit-talk-outline" aria-hidden="true" focusable="false"><g ref={group}><path ref={shape} className="kit-talk-shape" /></g></svg>
        <div className="kit-callout-body kit-talk-body" aria-hidden="true">
          <Text><span ref={typed} className="kit-talk-typed" /><span ref={rest} className="kit-talk-rest" /></Text>
          <span className="kit-talk-more"><Text kind="caption">▼</Text></span>
        </div>
        <span className="kit-callout-tip" aria-hidden />
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(content, document.body)
}

// The player is typing there: a text box (any input but a button-like one), a textarea, a select or an editable
const typingIn = (el: Element | null) => {
  if (!el) return false
  if (el instanceof HTMLInputElement) return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(el.type)
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable === true
}

// One frame later (a timer where there are no animation frames, e.g. tests)
const schedule = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : (setTimeout(fn, 16) as unknown as number))
const cancel = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id))

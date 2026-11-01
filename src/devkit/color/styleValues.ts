// The UI kit's style values that AREN'T colours — corners, outlines, shadows, press feel, timings, menu sizes — with
// names Muzzy would use, for the Color tab's "UI shape & feel" section (and the Select tab: a button's knobs).
// The full list with the kit's own notes is ui-kit/kit/style/tokens.ts. Nothing here touches the page or the files.
//   slider: [min, max, step] for each unit a preset may use ("1rem" → rem, "4px" → px, "0.97" → ''); a value in
//     another unit, or past the end (a 999px pill), still edits in the text box — the slider stretches to reach it
//   choices: a dropdown instead of a text box
//   fallback: what the game shows when neither the preset nor the file sets it (menu sizes, optional extras)

export type StyleValue = {
  token: string
  name: string
  slider?: Record<string, [number, number, number]>
  choices?: string[]
  fallback?: string
}

export const UI_SHAPES: StyleValue[] = [
  { token: 'radius-control', name: 'Button & input corners', slider: { rem: [0, 3, 0.05], px: [0, 48, 1] } },
  { token: 'radius-panel', name: 'Panel & card corners', slider: { rem: [0, 3, 0.05], px: [0, 48, 1] } },
  { token: 'corner-shape', name: 'Corner cut', choices: ['round', 'bevel'] },
  { token: 'border-width', name: 'Outline thickness', slider: { px: [0, 8, 0.5], rem: [0, 0.5, 0.025] } },
  { token: 'depth-0', name: 'Shadow: flat things (buttons)' },
  { token: 'depth-1', name: 'Shadow: raised things (panels)' },
  { token: 'depth-2', name: 'Shadow: floating things (popups)' },
  { token: 'depth-success', name: 'Shadow: success cards (owned, done)', fallback: 'var(--depth-1)' },
  { token: 'glow', name: 'Glow on lit things', fallback: 'none' },
  { token: 'glow-danger', name: 'Glow on danger buttons', fallback: 'none' },
  { token: 'press-scale', name: 'Press: shrink to', slider: { '': [0.8, 1, 0.01] } },
  { token: 'press-shift', name: 'Press: sink by', slider: { px: [0, 6, 0.5], rem: [0, 0.4, 0.025] } },
  { token: 'motion-fast', name: 'Quick animations (press, toggle)', slider: { ms: [0, 600, 10], s: [0, 0.6, 0.01] } },
  { token: 'motion-normal', name: 'Normal animations (panels)', slider: { ms: [0, 1200, 10], s: [0, 1.2, 0.01] } },
  { token: 'ease', name: 'Animation curve' },
  { token: 'enter', name: 'How panels appear', choices: ['kit-fade', 'kit-float', 'kit-pop', 'kit-blink', 'kit-flicker', 'none'] },
  { token: 'text-case', name: 'Letter case (titles, buttons, tabs)', choices: ['none', 'uppercase'] },
  { token: 'text-size', name: 'Text size (1 = 18px)', slider: { '': [1, 1.6, 0.05] } },
  { token: 'font-scale', name: 'Heading size step', slider: { '': [1, 1.6, 0.01] } },
  { token: 'density', name: 'Spacing (1 = normal)', slider: { '': [0.6, 1.6, 0.05] } },
  // Fonts — the Fonts tab (fonts/FontsTab.tsx) picks these side by side; here they're plain text boxes
  { token: 'font-display', name: "Style's title font (titles & headings follow it)" },
  { token: 'font-title', name: 'Title font', fallback: 'var(--font-display)' },
  { token: 'font-heading', name: 'Heading font', fallback: 'var(--font-display)' },
  { token: 'font-body', name: 'Body font' },
  { token: 'font-numbers', name: 'Number font' },
  { token: 'panel-texture', name: 'Panel texture', fallback: 'none' },
  // Menu sizes (ui-kit 0.10.0) — the defaults are the kit CSS's own (tokens.ts menuSizeTokens)
  { token: 'kit-menu-w', name: 'Menu card width', slider: { rem: [20, 60, 0.5] }, fallback: '36rem' },
  { token: 'kit-menu-max-h', name: 'Menu card tallest (phone)', slider: { rem: [20, 70, 0.5] }, fallback: '44rem' },
  { token: 'kit-menu-max-h-wide', name: 'Menu card tallest (desktop)', slider: { rem: [20, 70, 0.5] }, fallback: '52rem' },
  { token: 'kit-ask-w', name: 'Yes / no question width', slider: { rem: [16, 40, 0.5] }, fallback: '28rem' },
  { token: 'kit-scroll-fade', name: 'Scroll fade height', slider: { rem: [0, 4, 0.25] }, fallback: '2rem' },
]

/** Values to take off the page after applyStyle: only menu sizes left at the kit's default (applyStyle only sets
 *  values, and the kit CSS has its own menu-size defaults). Optional extras (glow, panel texture) are never cleared —
 *  applyStyle always writes them, and a missing --panel-texture blanks every panel's background. */
export function shapesToClear(preset: Record<string, unknown>, tweaks: Record<string, unknown>): string[] {
  return UI_SHAPES.filter(({ token }) => token.startsWith('kit-') && preset[token] === undefined && tweaks[token] === undefined).map((s) => s.token)
}

export const isUiShape = (token: string) => UI_SHAPES.some((s) => s.token === token)
export const shapeOf = (token: string) => UI_SHAPES.find((s) => s.token === token)

/** What the game shows for a shape value when the file doesn't change it: the preset's, else the kit's default. */
export function shapeDefault(preset: Record<string, unknown>, token: string): string {
  const v = preset[token]
  return v === undefined || v === null ? shapeOf(token)?.fallback ?? '' : String(v)
}

/** The shape values the game shows: the preset's (or default), with the file's tweaks on top. */
export function uiShapesFrom(preset: Record<string, unknown>, tweaks: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { token } of UI_SHAPES) out[token] = tweaks[token] !== undefined ? String(tweaks[token]) : shapeDefault(preset, token)
  return out
}

/** "1.5rem" → { n: 1.5, unit: 'rem' } · "0.97" → { n: 0.97, unit: '' } · a shadow or a font → null (text box only). */
export function splitNumber(value: string): { n: number; unit: string } | null {
  const m = /^\s*(-?\d*\.?\d+)\s*(px|rem|em|ms|s|%)?\s*$/.exec(value)
  return m ? { n: Number(m[1]), unit: m[2] ?? '' } : null
}

/** A number back into the value, keeping its unit, without float noise (0.30000000000000004 → 0.3). */
export const joinNumber = (n: number, unit: string) => `${Math.round(n * 1000) / 1000}${unit}`

/** The slider for a value, or null (no slider for this value's unit — the text box still edits it). */
export function sliderFor(token: string, value: string): { n: number; unit: string; min: number; max: number; step: number } | null {
  const parts = splitNumber(value)
  const range = parts && shapeOf(token)?.slider?.[parts.unit]
  if (!parts || !range) return null
  const [min, max, step] = range
  return { ...parts, min: Math.min(min, parts.n), max: Math.max(max, parts.n), step }
}

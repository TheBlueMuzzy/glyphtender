// THE STYLE SETTINGS — every name a style preset must fill in.
// Each name becomes a CSS variable: "primary" → var(--primary).
// Parts never use raw colours, sizes or fonts, only these names.

// Colours come in pairs: a background and the text/icon colour that sits on it ("on-…").
export const colourTokens = {
  'bg': 'Page background',
  'on-bg': 'Text on the page background',
  'surface': 'Panels, cards, inputs',
  'on-surface': 'Text on panels',
  'primary': 'Main buttons and selected things',
  'on-primary': 'Text on primary',
  'accent': 'Highlights: fills, active rings (never behind text)',
  'danger': 'Destructive buttons, errors',
  'on-danger': 'Text on danger',
  'success': 'Good / done / owned: a bought upgrade\'s card edge (Card tone="success"), a success badge. Reads as green in every style (0.27.0)',
  'on-success': 'Text on success',
  'muted': 'Quiet text: hints, captions',
  'border': 'Outlines, dividers, empty tracks',
  'focus': 'Keyboard/gamepad focus ring',
  'on-game': 'HUD text drawn straight on the game (no plate): instructions, "Round 1". Light, e.g. white',
} as const

// Colours that never have text on them, so the contrast test skips them.
export const lineColourTokens = {
  'ink': 'Outline around filled buttons and badges (the cartoon ink line). "transparent" = none',
  'game-shade': 'The soft shadow behind on-game text, so it reads over any game art. Dark',
} as const

export const otherTokens = {
  'font-display': "The style's title font (font names live only in presets). Titles and headings use it unless font-title / font-heading say otherwise",
  'font-body': 'Font for everything else (body text, buttons, lists)',
  'font-numbers': 'Font for game numbers: scores, timers, places. Usually var(--font-display); Pixel uses its body font (clearer digits)',
  'text-size': 'Body text size, 1 = 18px (never smaller than 1)',
  'font-scale': 'How much bigger each heading level is, e.g. 1.25',
  'radius-control': 'Corner roundness of buttons and inputs',
  'radius-panel': 'Corner roundness of panels and cards',
  'density': 'Spacing multiplier: 0.75 tight, 1 normal, 1.25 roomy',
  'depth-0': 'Shadow for flat things (buttons at rest)',
  'depth-1': 'Shadow for raised things (panels, cards)',
  'depth-2': 'Shadow for floating things (dialogs, popups)',
  'border-width': 'Outline thickness',
  'motion-fast': 'Quick animations (presses, toggles)',
  'motion-normal': 'Normal animations (panels, screens)',
  'press-scale': 'How much a button shrinks when pressed, e.g. 0.96',
  'ease': 'Animation curve. steps(2) = choppy retro, an overshooting cubic-bezier = bouncy',
  // Added for the 5 presets (F02) — each is one plain CSS value:
  'corner-shape': 'How corners are cut: round (curved) or bevel (chamfered, sci-fi). Needs radius > 0',
  'text-case': 'Letter case for titles, buttons, tabs and badges: none or uppercase',
  'press-shift': 'How far a button sinks when pressed; its rest shadow vanishes (hard-shadow styles)',
  'enter': 'How panels and cards appear: kit-fade, kit-float, kit-pop, kit-blink, kit-flicker or none',
} as const

// Optional extras: a preset may leave these out and gets the default.
export const optionalTokens = {
  'glow': 'none', // a CSS filter on lit things (primary buttons, on-switches, bars, focus), e.g. drop-shadow(…)
  'panel-texture': 'none',
  'glow-danger': 'none', // the same, in the danger colour, on danger buttons (0.27.0) — Neon: − glows red as + glows cyan
  'depth-success': 'var(--depth-1)', // a success card's shadow (Card tone="success", 0.27.0) — Neon: its glow in green
} as const

// The three text roles (0.16.0) — like a web page: a title font, a heading font and a body font (font-body, above).
// Presets leave these out; a game's tweaks may set them (the Dev Kit's Fonts tab does). Left out, both follow the
// style's font-display, so a game without them looks exactly as before.
export const fontRoleTokens = {
  'font-title': 'var(--font-display)', // big titles: Text kind display + title ("GOOPS", a screen's name)
  'font-heading': 'var(--font-display)', // headings: Text kind heading, card titles, room-code boxes, art buttons' words
} as const

// In-game words at big text (0.35.2, F145). Presets leave it out; a game's tweaks may set it. The player's Text size
// grows every word, but HUD words (HudText, HUD chips, seats, player chips, the timer, pinned pieces) stop growing at
// this many times their normal size — at 200% a phone's HUD had no room left for the game (words over words, Roll off
// the screen). Menus and dialogs, read at rest, keep growing all the way. 1 = HUD words never grow; never below 1.
export const hudTokens = {
  'hud-text-max': 1.25,
} as const

// Menu sizes (0.10.0): a style or a game's tweaks MAY set these; left out, the kit's CSS uses the default shown.
// They're not written onto the page unless set, so the desktop default (menu-max-h-wide) can differ from the phone one.
export const menuSizeTokens = {
  'kit-menu-w': '36rem — the ONE width of every menu card (Main menu, Pause, Settings, Credits, lobby, results…); never wider than the screen',
  'kit-menu-max-h': '44rem — tallest a menu card gets before its body scrolls inside (phones and short windows)',
  'kit-menu-max-h-wide': '52rem — the same on desktop windows (at least 40rem wide and 30rem tall)',
  'kit-ask-w': '28rem — a yes / no question on top of another screen (Confirm) stays narrower: it is a question, not a menu',
  'kit-scroll-fade': '2rem — how tall the soft "more this way" fade is at a scroll box\'s top / bottom edge',
} as const

// Worked out by applyStyle from the settings above — presets don't set these.
export const derivedTokens = {
  'gap-xs': '1 step of the 4-based spacing scale × density',
  'gap-s': '2 steps',
  'gap-m': '4 steps',
  'gap-l': '6 steps',
  'gap-xl': '8 steps',
  'text-body': 'Body text size (floor: 18px)',
  'text-heading': 'body × font-scale',
  'text-title': 'body × font-scale²',
  'text-display': 'body × font-scale³',
  'hud-rem': 'A rem for HUD pieces: grows with Text size up to hud-text-max × 16px, then stops (timer ring, bar lengths, pips)',
  'hud-text-body': 'text-body for HUD words (stops at hud-text-max × its normal size)',
  'hud-text-heading': 'text-heading for HUD words',
  'hud-text-title': 'text-title for HUD words',
  'hud-text-display': 'text-display for HUD words',
  'target-min': 'Smallest tap target (accessibility floor: 44px)',
} as const

type RequiredName = keyof typeof colourTokens | keyof typeof lineColourTokens | keyof typeof otherTokens
export type TokenName = RequiredName | keyof typeof optionalTokens | keyof typeof fontRoleTokens | keyof typeof hudTokens | keyof typeof menuSizeTokens
export type StylePreset = Record<RequiredName, string | number> & Partial<Record<TokenName, string | number>>
export type StyleTweaks = Partial<Record<TokenName, string | number>>

// Names every preset must have (F02's test checks all presets match this list).
export const requiredTokenNames = [...Object.keys(colourTokens), ...Object.keys(lineColourTokens), ...Object.keys(otherTokens)] as TokenName[]

// Every CSS variable the kit may read (the rule checker uses this list).
export const allVariableNames = [
  ...requiredTokenNames, ...Object.keys(optionalTokens), ...Object.keys(fontRoleTokens), ...Object.keys(hudTokens), ...Object.keys(menuSizeTokens), ...Object.keys(derivedTokens),
]

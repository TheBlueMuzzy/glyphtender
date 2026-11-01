// FONTS A GAME CAN USE — the kit's own (fonts.css) and the game's own (content/ui/fonts.json).
//
// A game adds its OWN fonts like this (0.16.0):
//   1. Put the font file (and its licence / readme, when the licence asks for that) in public/fonts/<folder>/.
//   2. List it in content/ui/fonts.json:
//        { "fonts": [ { "name": "Press Start DX", "file": "press_start_dx/Press Start DX.ttf",
//                       "licence": "unknown", "licenceNote": "No licence came with it — ask the author",
//                       "note": "Pixel font: crisp at 8 px and its multiples (16, 24, 32)", "pixelSize": 8 } ] }
//      name   = the font's name in the game (what style.json's tweaks say: "'Press Start DX', system-ui, sans-serif")
//      file   = its path inside public/fonts/
//      licence = commercial-ok 🟢 · credit-needed 🟡 · non-commercial 🔴 · unknown 🔴 (licenceLights below)
//      note / pixelSize = optional: a pixel font's native size — it's crisp at that size and its whole multiples,
//      soft (blurred) in between
//   3. Credit it in content/credits.json like any other asset.
//   4. At start-up, next to applyStyle: loadGameFonts(fontsJson, import.meta.env.BASE_URL)
// Then any text role can use it: content/ui/style.json "tweaks": { "font-title": "'Press Start DX', system-ui, sans-serif" }
// (the Dev Kit's Fonts tab picks and saves these for you). A browser only downloads a font a page actually uses.

export type FontLicence = 'commercial-ok' | 'credit-needed' | 'non-commercial' | 'unknown'

export type GameFont = {
  name: string
  file: string
  licence: FontLicence | string
  licenceNote?: string
  note?: string
  pixelSize?: number
}

export type GameFontsFile = { fonts?: GameFont[] }

/** The kit's own fonts (fonts.css) — all Google Fonts under the SIL Open Font License: commercial use fine, keep the credit. */
export const kitFonts: GameFont[] = [
  { name: 'Nunito', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Rounded, friendly (Cozy)' },
  { name: 'Fredoka', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Round and bold (Cartoon body)' },
  { name: 'Lilita One', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Chunky titles (Cartoon)' },
  { name: 'Silkscreen', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Pixel titles (Pixel)' },
  { name: 'VT323', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Terminal pixel text (Pixel body)' },
  { name: 'Orbitron', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Wide sci-fi titles (Neon)' },
  { name: 'Exo 2', file: '', licence: 'credit-needed', licenceNote: 'SIL OFL 1.1 — free for games you sell; keep the credit', note: 'Clean sci-fi text (Neon body)' },
]

/** 🟢 🟡 🔴 for a licence, and what it means in plain words. */
export function licenceLight(licence: string): { light: '🟢' | '🟡' | '🔴'; words: string } {
  if (licence === 'commercial-ok') return { light: '🟢', words: 'Fine in a game you sell' }
  if (licence === 'credit-needed') return { light: '🟡', words: 'Fine in a game you sell — credit it' }
  if (licence === 'non-commercial') return { light: '🔴', words: 'Not for a game you sell' }
  return { light: '🔴', words: 'Licence unknown — check it before shipping' }
}

/** The CSS font value for a font name: "'Press Start DX', system-ui, sans-serif" (a fallback while it loads). */
export const fontValue = (name: string) => `'${name.replace(/'/g, '')}', system-ui, sans-serif`

/** The first font named in a CSS font value: "'Orbitron', 'Exo 2', sans-serif" → "Orbitron". */
export function firstFontName(value: string): string {
  return (value.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
}

/** The @font-face rules for a game's fonts. baseUrl = where public/ is served ("/" in dev, "/GOOPS/" live). */
export function gameFontFaceCss(file: GameFontsFile, baseUrl = '/'): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return (file.fonts ?? [])
    .filter((f) => f.name && f.file)
    .map((f) => {
      const url = `${base}fonts/${f.file.split('/').map(encodeURIComponent).join('/')}`
      return `@font-face { font-family: '${f.name.replace(/'/g, '')}'; src: url("${url}"); font-display: swap; }`
    })
    .join('\n')
}

/** Declare the game's fonts on the page (call again after fonts.json changes — it replaces the old rules). */
export function loadGameFonts(file: GameFontsFile, baseUrl = '/') {
  let tag = document.getElementById('kit-game-fonts') as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = 'kit-game-fonts'
    document.head.appendChild(tag)
  }
  tag.textContent = gameFontFaceCss(file, baseUrl)
}

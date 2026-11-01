// THE DEVICE, IN A FEW WORDS — "Chrome 141", "Android 15", "390x844@3", "en". Read on the device from the browser's
// user-agent text; only a name + a major version leaves it — the full user-agent text never travels.
import { withoutHidden } from './report'

/** "Chrome 141", "Safari 18", "Firefox 132", "Edge 141", "Samsung Internet 27", "Opera 115" — or "" when unknown. */
export function browserName(ua: string): string {
  const find = (pattern: RegExp, name: string) => { const m = pattern.exec(ua); return m ? `${name} ${m[1]}` : null }
  return find(/Edg(?:A|iOS)?\/(\d+)/, 'Edge')
    ?? find(/OPR\/(\d+)/, 'Opera')
    ?? find(/SamsungBrowser\/(\d+)/, 'Samsung Internet')
    ?? find(/Electron\/(\d+)/, 'Electron')
    ?? find(/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox')
    ?? find(/CriOS\/(\d+)/, 'Chrome')
    ?? find(/Chrome\/(\d+)/, 'Chrome')
    ?? find(/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, 'Safari')
    ?? ''
}

/** "Android 15", "iOS 18", "Windows", "macOS", "ChromeOS", "Linux" — or "" when unknown. Windows and macOS hide their
 *  real version in this text (Windows 11 still says 10, macOS stays at 10.15), so they're named without one. */
export function osName(ua: string): string {
  const android = /Android (\d+)/.exec(ua)
  if (android) return `Android ${android[1]}`
  const ios = /(?:iPhone|CPU) OS (\d+)_/.exec(ua)
  if (ios) return `iOS ${ios[1]}`
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS' // an iPad asking for the desktop site says this too
  if (/Linux/.test(ua)) return 'Linux'
  return ''
}

/** "390x844@3" — the screen in CSS pixels and how many real pixels each one has (at most 2 decimals). */
export function screenText(): string {
  const s = globalThis.screen
  if (!s || !s.width) return ''
  const ratio = Math.round((globalThis.devicePixelRatio || 1) * 100) / 100
  return `${Math.round(s.width)}x${Math.round(s.height)}@${ratio}`
}

/** "en" — the language only, never the region ("en-GB" → "en"). "" when it isn't a plain language code. */
export function languageOnly(language: string | undefined): string {
  const lang = (language ?? '').split(/[-_]/)[0].toLowerCase()
  return /^[a-z]{2,3}$/.test(lang) ? lang : ''
}

/** The WebGL renderer's name ("Adreno (TM) 740"), "" when there's no WebGL or the browser won't say. */
export function gpuName(canvas: HTMLCanvasElement): string {
  try {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return ''
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const name = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return typeof name === 'string' ? withoutHidden(name).slice(0, 120) : ''
  } catch {
    return ''
  }
}

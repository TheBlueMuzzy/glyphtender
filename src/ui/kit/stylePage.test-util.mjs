// A real-browser page for the kit's look tests (0.27.0): the kit's CSS, its fonts (inlined, so nothing loads from a
// server) and one style's variables, around markup a test passes in. Not a test itself, and not shipped to games
// (install-kit skips ".test." files). Used by controls/cardLook.test.tsx and blocks/menuHeaderFit.test.tsx.
// Types: stylePage.test-util.d.mts (the kit's TypeScript setup has no Node types).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { resolveStyle } from './style/applyStyle.ts'

const kit = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(kit, path), 'utf8')
const fontsCss = read('fonts/fonts.css').replace(/url\('\.\/([\w-]+\.woff2)'\)/g, (_, file) =>
  `url(data:font/woff2;base64,${readFileSync(join(kit, 'fonts', file)).toString('base64')})`)
const css = [fontsCss, read('kit.css'), read('art.css'), read('blocks/blocks.css')].join('\n')

export function openBrowser() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
}

/** Puts `markup` on the page in style `preset`, fonts loaded and entrances off; resolves when it's ready to measure. */
export async function showInStyle(page, preset, markup) {
  const vars = Object.entries(resolveStyle({ preset })).map(([k, v]) => `--${k}: ${v};`).join(' ')
  await page.setContent(`<!doctype html><html style="${vars.replace(/"/g, '&quot;')}"><head><style>${css}</style>
    <style>*, *::before, *::after { animation: none !important; transition: none !important; }</style></head>
    <body class="kit-page"><div class="kit-scope" style="padding: 16px">${markup}</div></body></html>`)
  await page.evaluate(async () => {
    const used = new Set([...document.querySelectorAll('*')].map((el) => getComputedStyle(el).fontFamily))
    await Promise.all([...used].map((family) => Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 20px ${family}`)))))
    await document.fonts.ready
  })
}

/** Layout size of every element matching `selector`, in order: "w×h". */
export const sizesOf = (page, selector) =>
  page.$$eval(selector, (els) => els.map((el) => `${el.offsetWidth}×${el.offsetHeight}`))

// FIXED SIZE (0.21.0, dev builds only) — a card that fills in during a sequence (a player chip whose score counts up,
// a tile that collects rewards) is its final size from the start, so nothing around it gets shoved mid-sequence.
// How it's checked: each watched box remembers its size once it has settled (fonts loaded, then two frames — the very
// first layout doesn't count), and any later growth of more than 1 px is noted on window.__uiGrowth. findProblems
// (uiProblems.mjs) reports those as "grows:" — in the gallery's npm run shoot and a game's npm run check:framework.
// Sizes are layout sizes (not the drawn one), so an entrance that scales or slides a card in doesn't count; the screen
// changing size or the style changing (a phone turned, the text size setting, a Dev Kit restyle) starts it over.
// Only growth from the card filling in counts (something inside it changed); pictures still loading are waited for.
// Shrinking is fine. In a release build it does nothing.
// The kit's Card and PlayerChip use it; a game's own card can too:  const fixed = useFixedSize()  →  <div ref={fixed}>
import { useCallback, useRef } from 'react'

export type Growth = { name: string; from: string; to: string }
declare global { interface Window { __uiGrowth?: Growth[] } }

/** Watch one box; returns the function that stops watching. */
export function watchFixedSize(el: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined' || typeof window === 'undefined') return () => {}
  let settled: { w: number; h: number } | null = null // null while the first layout settles
  let round = 0 // a newer settle replaces an older one still waiting
  let noted = false // one note per card
  // pictures inside the card that are still loading (a reward image) — the card's size counts once they're in
  const pictures = () => Promise.all([...el.querySelectorAll('img')].filter((img) => !img.complete).map((img) =>
    new Promise((done) => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }) })))
  // "Filling in" = something inside the card changed (a score, a line added). A card that grew with nothing changed
  // inside it (its column widened, a sidebar or scrollbar came and went) just takes that as its size.
  let filledIn = false
  const contents = new MutationObserver(() => { filledIn = true })
  const settle = () => {
    settled = null
    const mine = ++round
    void Promise.all([document.fonts?.ready, pictures()]).then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mine === round) { settled = { w: el.offsetWidth, h: el.offsetHeight }; filledIn = false }
    })))
  }
  const sizes = new ResizeObserver(() => {
    if (!settled || noted) return
    const w = el.offsetWidth, h = el.offsetHeight
    if (w <= settled.w + 1 && h <= settled.h + 1) return
    if (contents.takeRecords().length) filledIn = true // changes not reported yet still count
    if (!filledIn) { settled = { w, h }; return }
    noted = true
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)
    ;(window.__uiGrowth ??= []).push({ name, from: `${settled.w}×${settled.h}`, to: `${w}×${h}` })
  })
  const restyled = new MutationObserver(settle) // applyStyle and the text size write on <html>
  sizes.observe(el)
  contents.observe(el, { subtree: true, childList: true, characterData: true, attributes: true })
  restyled.observe(document.documentElement, { attributes: true })
  addEventListener('resize', settle)
  settle()
  return () => { round++; sizes.disconnect(); contents.disconnect(); restyled.disconnect(); removeEventListener('resize', settle) }
}

/** A ref for a box that must keep its size once it's on screen (watched in dev builds only). */
export function useFixedSize() {
  const stop = useRef<(() => void) | undefined>(undefined)
  return useCallback((el: HTMLElement | null) => {
    stop.current?.()
    stop.current = el && import.meta.env.DEV ? watchFixedSize(el) : undefined
  }, [])
}

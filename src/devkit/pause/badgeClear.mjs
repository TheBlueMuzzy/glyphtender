// IS THE PAUSED PILL CLEAR OF THE GAME'S HUD? (Dev Kit 0.21.0, from Goops: the pill sat on "CRACKS 0/10" on a 390 phone)
// badgeOverHud runs IN the browser — page.evaluate(badgeOverHud, { spots: BADGE_SPOTS }) — while the game is paused and
// the panel is closed (so the pill shows). It moves the pill to each spot in turn (its data-spot, devkit.css) and lists
// the game's visible words and controls it would cover there:
//   { current: 'top', over: { top: ['CRACKS 0/10'], left: [], … } }   or   { missing: true } when no pill is showing.
// "Visible" = really drawn at that point: asked of the browser with every element hit-testable for a moment (HUD words
// are often pointer-events: none, which elementsFromPoint looks through — the same trick as the UI kit's uiProblems.mjs),
// and not under something else that paints (a dialog over the HUD). The Dev Kit's own parts don't count.

// The spots devkit.css knows — the same list as badgeSpot.ts BADGE_SPOTS (a test keeps them equal).
export const BADGE_SPOTS = ['bottom', 'bottom-left', 'bottom-right', 'top', 'top-left', 'top-right', 'left', 'right']

/** content/devkit.json's spot as the pill draws it (data-spot), or 'left' (badgeSpot.ts's default) when it has none. */
export function badgeOverHud({ spots }) {
  const badge = document.querySelector('.devkit-pause-badge')
  if (!badge) return { missing: true }
  const current = badge.getAttribute('data-spot') || 'left'

  const ours = (el) => !!el.closest('[class*="devkit"]') // the Dev Kit's own panel, pill and corner button
  const shown = (el) => {
    const s = getComputedStyle(el)
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && el.getClientRects().length > 0
  }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName.toLowerCase()).trim().replace(/\s+/g, ' ').slice(0, 40)
  const textNodes = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())

  // The game's words (an element with text of its own: the boxes of its text, not its whole box), controls and meters
  // (a health bar the pill hides is a reading lost) — their box
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="slider"], [role="switch"], [role="tab"], [role="progressbar"], [role="meter"]')]
    .filter((el) => !ours(el) && shown(el))
  const texts = [...document.body.querySelectorAll('*')]
    .filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) && !ours(el) && textNodes(el).length && shown(el))
  const things = []
  for (const el of controls) things.push({ el, rects: [el.getBoundingClientRect()] })
  for (const el of texts) {
    if (controls.some((c) => c.contains(el))) continue // the words on a button: the button counts already
    const rects = textNodes(el).flatMap((n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()] })
    things.push({ el, rects })
  }

  const crossing = (a, b) => {
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right), top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom)
    return right - left > 1 && bottom - top > 1 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null
  }
  const paints = (el) => {
    if (['CANVAS', 'IMG', 'VIDEO', 'svg', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
    const s = getComputedStyle(el)
    return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || textNodes(el).length > 0
  }
  // Is `el` what the player sees at (x, y)? Going down from the top (the pill hidden), it comes before anything else that paints.
  const seenAt = (el, { x, y }) => {
    for (const hit of document.elementsFromPoint(x, y)) {
      if (hit === el || el.contains(hit)) return true
      if (ours(hit) || hit.contains(el)) continue // the Dev Kit's own parts, or a box around it (under it)
      if (paints(hit)) return false
    }
    return false
  }

  const hitAll = document.createElement('style')
  hitAll.textContent = '* { pointer-events: auto !important; } .devkit-pause-badge { visibility: hidden !important; }'
  const over = {}
  try {
    for (const spot of spots) {
      badge.setAttribute('data-spot', spot)
      const box = badge.getBoundingClientRect() // measured while it still shows
      document.head.appendChild(hitAll)
      const covered = []
      for (const { el, rects } of things) {
        const at = rects.map((r) => crossing(r, box)).find(Boolean)
        if (at && seenAt(el, at)) covered.push(name(el))
      }
      hitAll.remove()
      over[spot] = [...new Set(covered)]
    }
  } finally {
    hitAll.remove()
    badge.setAttribute('data-spot', current)
  }
  return { current, over }
}

/**
 * One check result from the runs at each phone size: [{ size: '390×844', current, over }] →
 * { ok, current, problems: ['390×844: at "top" it covers "CRACKS 0/10"'], clear: spots clear at every size }.
 */
export function judgeBadge(runs) {
  const current = runs[0]?.current ?? 'left'
  const problems = runs.filter((r) => r.over[current]?.length)
    .map((r) => `${r.size}: at "${current}" it covers ${r.over[current].map((n) => `"${n}"`).join(', ')}`)
  const clear = BADGE_SPOTS.filter((spot) => runs.every((r) => r.over[spot] && !r.over[spot].length))
  return { ok: problems.length === 0, current, problems, clear }
}

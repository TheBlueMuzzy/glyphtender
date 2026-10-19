// UI PROBLEMS ON A REAL PAGE — one function that runs IN the browser (page.evaluate(findProblems, options)) and lists
// what's wrong with what's on screen right now, each as one plain line starting with its kind:
//   "wider:"   the page is wider than the screen (a phone quietly zooms out to fit it)
//   "small:"   a control smaller than 44×44 px (a fingertip misses it)
//   "clipped:" a control cut off at the edge of a box that hides overflow (its outline / shadow too) or past the
//              screen edge (and not in something that scrolls), or text cut off
//   "overlap:" two things on screen sit on top of each other (text over text, a control over text…) — new in 0.18.0
//   "focus:"   a focus ring showing although nobody used the keyboard
// Used by the gallery's screenshots (scripts/shoot.mjs) and by a game's npm run check:framework (conformance.mjs).
// Skipped: the Dev Kit (#devkit-root), anything hidden, inert or aria-hidden, anything inside [data-ui-check="skip"]
// (a game's on-purpose overlap, e.g. a title drawn over its own shadow copy), and things covered by something else
// (a dialog over the HUD: the HUD underneath isn't "overlapping" it).
// Self-contained on purpose: page.evaluate sends the function's text to the page, so it can't use imports.
export function findProblems({ screenWidth = innerWidth, checkFocus = true } = {}) {
  const problems = []
  const SKIP = '#devkit-root, [data-ui-check="skip"], [inert], [aria-hidden="true"]'
  const name = (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30) || `<${el.tagName.toLowerCase()}>`
  // The part of an element you can actually see: its box cut by every ancestor that hides overflow (a scroll area, a
  // panel) and by the screen — null when nothing of it shows (a row scrolled out of its list)
  const visibleBox = (el) => {
    const b = el.getBoundingClientRect()
    let left = b.left, top = b.top, right = b.right, bottom = b.bottom
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const c = p.getBoundingClientRect()
      if (s.overflowX !== 'visible') { left = Math.max(left, c.left); right = Math.min(right, c.right) }
      if (s.overflowY !== 'visible') { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom) }
    }
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight)
    return right - left > 0.5 && bottom - top > 0.5 ? { left, top, right, bottom } : null
  }
  const shown = (el, { onScreen = true } = {}) => {
    if (el.closest(SKIP)) return false
    const box = el.getBoundingClientRect()
    if (box.width <= 2 || box.height <= 2) return false // hidden, or "for screen readers only" (1×1, clipped away)
    if (onScreen && !visibleBox(el)) return false // off the screen, or scrolled out of its box
    let opacity = 1
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.visibility === 'hidden' || s.display === 'none') return false
      opacity *= Number(s.opacity)
    }
    return opacity > 0.05
  }

  if (document.documentElement.scrollWidth > screenWidth) {
    problems.push(`wider: the page is wider than the screen (${document.documentElement.scrollWidth} > ${screenWidth})`)
  }
  const allControls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="tab"], [role="slider"], [tabindex="0"]')]
  // A control past the screen's edge (part or all of it) can't be pressed — unless it sits in something that scrolls
  for (const el of allControls.filter((e) => shown(e, { onScreen: false }))) {
    const box = el.getBoundingClientRect()
    const pageScrolls = document.documentElement.scrollHeight > innerHeight + 1 // a long page: below the fold is fine
    const outSideways = box.left < -0.5 || box.right > innerWidth + 0.5
    const outUpDown = !pageScrolls && (box.top < -0.5 || box.bottom > innerHeight + 0.5)
    if (!outSideways && !outUpDown) continue
    let scrolls = false
    for (let p = el.parentElement; p && p !== document.documentElement && !scrolls; p = p.parentElement) {
      const s = getComputedStyle(p)
      scrolls = /(auto|scroll)/.test(s.overflowX + s.overflowY) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)
    }
    if (!scrolls) problems.push(`clipped: "${name(el)}" is past the edge of the screen`)
  }
  const controls = allControls.filter((e) => shown(e))
  for (const el of controls) {
    const box = el.getBoundingClientRect()
    if (box.width < 43.5 || box.height < 43.5) problems.push(`small: ${Math.round(box.width)}×${Math.round(box.height)} px — "${name(el)}"`)
    // Clipped inside a box: a scroll area or panel that hides overflow cuts off outlines and drop shadows drawn just
    // outside a control (Cartoon's ink). Controls need a little room from the box's left/right edge.
    for (let clip = el.parentElement; clip && clip !== document.body; clip = clip.parentElement) {
      if (getComputedStyle(clip).overflowX === 'visible') continue
      const edge = clip.getBoundingClientRect()
      const room = 3 // px of clearance for an outline or shadow
      if (box.left < edge.left + room - 0.5 || box.right > edge.right - room + 0.5) problems.push(`clipped: "${name(el)}" at the edge of a box that hides overflow`)
      break // only the nearest clipping box matters
    }
  }

  // Text: elements holding words themselves (not only through children)
  const texts = [...document.querySelectorAll('body *')].filter((el) =>
    !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) &&
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && shown(el))
  for (const el of texts) {
    const s = getComputedStyle(el)
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) problems.push(`clipped: text cut off — "${name(el)}"`)
  }

  // Overlap: two shown things whose VISIBLE parts cross (each cut by the boxes that clip it) and neither holds the
  // other — and both really show at that point: going down from the top, both are reached before anything else that
  // paints (a dialog over the HUD, the scroll area's own background). What's on top is asked of the browser with every
  // element hit-testable for a moment (HUD words are often pointer-events: none, which elementsFromPoint looks through).
  const things = [...new Set([...controls, ...texts])]
  const crossing = (a, b) => {
    if (!a || !b) return null
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right), top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom)
    return right - left > 2 && bottom - top > 2 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null
  }
  const paints = (el) => {
    if (['CANVAS', 'IMG', 'VIDEO', 'svg', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
    const s = getComputedStyle(el)
    return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  }
  const part = (el, x) => el === x || x.contains(el) // x itself or something inside it
  const boxes = things.map(visibleBox)
  const hitAll = document.createElement('style')
  hitAll.textContent = '* { pointer-events: auto !important; }'
  document.head.appendChild(hitAll)
  try {
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i], b = things[j]
        if (a.contains(b) || b.contains(a)) continue
        const at = crossing(boxes[i], boxes[j])
        if (!at) continue
        let seenA = false, seenB = false
        for (const el of document.elementsFromPoint(at.x, at.y)) {
          if (part(el, a)) seenA = true
          else if (part(el, b)) seenB = true
          else if (el.contains(a) && el.contains(b)) continue // a box around both: under them
          else if (paints(el)) break // something else — or one's own card / dialog — covers the other there
          if (seenA && seenB) break
        }
        if (seenA && seenB) problems.push(`overlap: "${name(a)}" × "${name(b)}"`)
      }
    }
  } finally {
    hitAll.remove()
  }

  const ring = checkFocus && document.querySelector(':focus-visible')
  if (ring && !ring.closest('#devkit-root')) problems.push(`focus: a focus ring shows without keyboard use — "${name(ring)}"`)
  return [...new Set(problems)]
}

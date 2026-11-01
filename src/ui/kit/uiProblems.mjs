// UI PROBLEMS ON A REAL PAGE — one function that runs IN the browser (page.evaluate(findProblems, options)) and lists
// what's wrong with what's on screen right now, each as one plain line starting with its kind:
//   "wider:"   the page is wider than the screen (a phone quietly zooms out to fit it)
//   "small:"   a control smaller than 44×44 px (a fingertip misses it)
//   "clipped:" a control cut off at the edge of a box that hides overflow (its outline / shadow too) or past the
//              screen edge (and not in something that scrolls), or text cut off — by its own box, or (0.38.0) by a box
//              around it that hides what runs past its side, top or bottom (a card's title losing its last letter)
//   "squeezed:" a scroll list too short to show 2 of its rows at once (the Room's players at 200% text) — 0.38.0
//   "overlap:" two things on screen sit on top of each other (text over text, a control over text…) — new in 0.18.0;
//              and a solid chip, badge or panel slid part-way onto a bar, meter or picture — 0.33.1 — or onto
//              another card's words — 0.33.2. A toast or tooltip (the top layer) over the page is on top by design
//              and never counts — two of them over each other do (0.35.3)
//   "focus:"   a focus ring showing although nobody used the keyboard
//   "faint:"   text too faint to read against what's behind it: under 4.5:1, or 3:1 for big text (24 px, or 18.66 px
//              bold) — the WCAG AA line. Skipped where it can't be judged: text over a picture, gradient, canvas or
//              video, text with an outline or shadow (Cartoon ink, Neon glow), and disabled controls. — 0.21.0
//   "edge:"    something in a drawn box (a card, chip, badge, button: a border, shadow or its own background) closer than
//              2 px to the box's inside edge — text, an icon, a picture, an avatar or a badge. Things meant to run edge
//              to edge (a cover picture, a divider) carry data-ui-bleed; things in a scroll area, hanging outside the
//              box or moving right now (a "+4" floating away) are skipped. Words are measured by their ink. — 0.21.0
//              Words out past the box's edge say "runs N px past the edge of its box" — 0.38.0
//   "grows:"   a card that grew after it first appeared (noted by the kit's useFixedSize, fixedSize.ts) — 0.21.0
//   "ring:"    words or a badge closer than ~2 px to an avatar's visible edge, measured as drawn: its ring (an outline)
//              included and its round shape (a circle, not its box) — 0.35.8
//   "contrast:" light on-game words (HudText, a plain toast, a bar's inside label) on a plain light background: under
//              3:1 against what's behind their letters, their halo not counted (it's for busy game art) — 0.35.9
//   "split:"   a word broken across lines in the middle ("Accessibil / ity") although it would fit on one line of the
//              box it's drawn in; a word wider than that box may still wrap — 0.34.1 — unless it's in a title (0.35.1:
//              a title can drop a size instead — "Reconnecti / ng…"). A part whose words have nowhere else to go and no
//              smaller size (ConnectionDot's chip: its dot never moves, its corner gives way) carries data-ui-split-ok:
//              there a word too long for the room left beside its fixed parts breaks as the last resort; so may a word
//              in a ◀ ▶ picker that's already stacked (data-fit="stack": the value has the picker's whole width) — 0.37.0
// Used by the gallery's screenshots (scripts/shoot.mjs) and by a game's npm run check:framework (conformance.mjs).
// Skipped: the Dev Kit (#devkit-root), anything hidden, inert or aria-hidden, anything inside [data-ui-check="skip"]
// (a game's on-purpose overlap, e.g. a title drawn over its own shadow copy), and things covered by something else
// (a dialog over the HUD: the HUD underneath isn't "overlapping" it).
// Self-contained on purpose: page.evaluate sends the function's text to the page, so it can't use imports.
export function findProblems({ screenWidth = innerWidth, checkFocus = true } = {}) {
  const problems = []
  const SKIP = '#devkit-root, [data-ui-check="skip"], [inert], [aria-hidden="true"]'
  const name = (el) => (el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30) || `<${el.tagName.toLowerCase()}>`
  // The boxes around an element that can cut it off, nearest first: its ancestors — but none for something in the top
  // layer (a popover, a modal dialog) or placed by the screen (position: fixed), and for one placed by a box further out
  // (position: absolute) only that box and the ones around it (0.38.0, F162: the Idle warning, a popover over the
  // gallery's stage, read as cut off by the stage). (A transform that makes a box the one a fixed part is placed by
  // isn't followed: the kit draws none around its fixed parts.)
  const clippers = (el) => {
    const out = []
    let placedBy = null // an absolute box's own box to be placed in: the ones between don't clip it
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      if (e !== el && (!placedBy || e === placedBy)) { out.push(e); placedBy = null }
      const s = getComputedStyle(e)
      if (s.position === 'fixed' || e.matches(':popover-open, dialog:modal')) break
      if (s.position === 'absolute') placedBy = e.offsetParent
    }
    return out
  }
  // The part of an element you can actually see: its box cut by every ancestor that hides overflow (a scroll area, a
  // panel) and by the screen — null when nothing of it shows (a row scrolled out of its list)
  const visibleBox = (el) => {
    const b = el.getBoundingClientRect()
    let left = b.left, top = b.top, right = b.right, bottom = b.bottom
    for (const p of clippers(el)) {
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
  // A sticky piece over words of its own scroll box (F149: a card that has to scroll keeps its last row of buttons at
  // its bottom, kit.css, and the words scroll under it): not an overlap when scrolling the box moves the words out
  // from under it — tried at both ends of the box's scroll, then put back. A sticky piece over words that no scroll
  // ever uncovers is still an overlap.
  const scrollsOutFromUnder = (a, b) => {
    const stickyOf = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === 'sticky') return e; return null }
    const sticky = stickyOf(a) ?? stickyOf(b)
    if (!sticky || (sticky.contains(a) && sticky.contains(b))) return false
    const words = sticky.contains(a) ? b : a
    let box = sticky.parentElement
    for (; box && box !== document.documentElement; box = box.parentElement) if (/(auto|scroll)/.test(getComputedStyle(box).overflowY)) break
    if (!box || box === document.documentElement || !box.contains(words) || box.scrollHeight <= box.clientHeight + 1) return false
    const was = box.scrollTop
    let uncovered = false
    for (const top of [0, box.scrollHeight - box.clientHeight]) {
      box.scrollTo({ top, behavior: 'instant' })
      if (!crossing(visibleBox(sticky), visibleBox(words))) uncovered = true
    }
    box.scrollTo({ top: was, behavior: 'instant' })
    return uncovered
  }

  // ---- colours (0.21.0) ----
  // A colour as [r, g, b, alpha] whatever way CSS wrote it (rgb(), color-mix(), oklch()…): the browser paints it on
  // one pixel and we read the pixel back.
  const pixel = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
  const colours = new Map()
  const rgba = (css) => {
    if (!colours.has(css)) {
      pixel.clearRect(0, 0, 1, 1)
      pixel.fillStyle = 'rgba(0, 0, 0, 0)'
      pixel.fillStyle = css
      pixel.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data
      colours.set(css, [r, g, b, a / 255])
    }
    return colours.get(css)
  }
  const seeThrough = (css) => rgba(css)[3] < 0.05
  // One colour laid over another (both [r, g, b, alpha]; the one under is solid) → the solid colour you see
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
  const light = ([r, g, b]) => { // WCAG relative luminance
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const contrast = (a, b) => { const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
  const pictureLike = (el) => ['IMG', 'CANVAS', 'VIDEO', 'svg', 'PICTURE'].includes(el.tagName) || getComputedStyle(el).backgroundImage !== 'none'

  // Faint text: the text's colour against everything painted behind it at the middle of its first line (going down from
  // the text: each background colour until a solid one; see-through ones mixed in; the page itself is white).
  // Fading by opacity counts on the text and its holders up to its background — a faded whole card (dim) fades its
  // background too, so it's left alone. Returns the plain-words problem, or '' (fine, or can't be judged).
  // The solid colour you see behind text `el` at point x, y: going down from the text, each background colour until a
  // solid one (see-through ones mixed in; the page itself is white). null when it can't be judged: off the screen,
  // something else covers the text there, or a picture / gradient / canvas / video is behind it.
  const colourBehind = (el, x, y) => coloursBehind(el, x, y)?.[0] ?? null
  // …and every colour that can be behind it there, when `gradients`: a CSS gradient is made of plain colours (its
  // stops), so each stop is one of them (the gallery's striped stand-in game, F153). A picture (url()), canvas or video
  // still can't be judged: null.
  const gradientStops = (el) => {
    const image = getComputedStyle(el).backgroundImage
    if (['IMG', 'CANVAS', 'VIDEO', 'svg', 'PICTURE'].includes(el.tagName) || /url\(/.test(image) || !/gradient\(/.test(image)) return null
    const stops = image.match(/(?:rgba?|hsla?|color|oklch|oklab|lab|lch)\([^()]*\)|#[0-9a-f]{3,8}\b/gi)
    return stops?.length ? stops.map(rgba) : null
  }
  const coloursBehind = (el, x, y, { gradients = false } = {}) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
    const layers = [] // top to bottom; each is the colours it can be there (one, or a gradient's stops)
    let reached = false
    for (const below of document.elementsFromPoint(x, y)) {
      if (!reached) {
        if (below === el) reached = true
        else if (el.contains(below)) continue // a word inside the text (a <strong>)
        else if (paints(below)) return null // something covers the text here
        else continue
      }
      if (pictureLike(below)) {
        const stops = gradients && gradientStops(below)
        if (!stops) return null
        layers.push(stops.filter((c) => c[3] > 0.01))
        if (stops.every((c) => c[3] > 0.99)) break
      }
      const bg = rgba(getComputedStyle(below).backgroundColor) // (painted under its own picture or gradient)
      if (bg[3] > 0.01) layers.push([bg])
      if (bg[3] > 0.99) break
    }
    if (!reached) return null
    return layers.reduceRight((unders, tops) => tops.length ? tops.flatMap((top) => unders.map((under) => over(top, under))) : unders, [[255, 255, 255, 1]])
  }
  // The text's colour as [r, g, b, alpha], faded by opacity on the text and its holders up to its background (a faded
  // whole card fades its background too, so that doesn't count) — null when it's invisible
  const inkOf = (el) => {
    let alpha = rgba(getComputedStyle(el).color)[3]
    for (let e = el; e && e !== document.documentElement && seeThrough(getComputedStyle(e).backgroundColor); e = e.parentElement) alpha *= Number(getComputedStyle(e).opacity)
    return alpha < 0.05 ? null : [...rgba(getComputedStyle(el).color).slice(0, 3), alpha]
  }
  const faintText = (el) => {
    if (el.closest('svg, [disabled], [aria-disabled="true"]')) return ''
    const s = getComputedStyle(el)
    if (s.textShadow !== 'none' || parseFloat(s.webkitTextStrokeWidth) > 0) return '' // an outline or glow: can't judge
    const words = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    const range = document.createRange()
    range.selectNodeContents(words)
    const line = range.getClientRects()[0]
    if (!line) return ''
    const x = line.left + line.width / 2, y = line.top + line.height / 2
    const behind = colourBehind(el, x, y)
    if (!behind) return ''
    const ink = inkOf(el)
    if (!ink) return '' // invisible text (e.g. a gradient painted through it): not "faint"
    const ratio = contrast(over(ink, behind), behind)
    const size = parseFloat(s.fontSize)
    const big = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
    const needs = big ? 3 : 4.5
    return ratio < needs ? `${ratio.toFixed(1)}:1 against its background (needs ${needs}:1${big ? ' for big text' : ''})` : ''
  }

  // ---- light words on a light background (0.35.9, F153) ----
  // On-game words — HudText ("Your turn", "Game over"), a plain toast, a bar's inside label — are drawn in the light
  // on-game colour with a dark halo, made for the GAME's own picture. On a plain light page they all but vanish (the
  // turn-based starter, Sprint 42) and the faint check never saw it: it skips words with a halo. So here the halo
  // doesn't count (it's for busy game art, not a plain page): what's behind the letters, at 5 points along each line,
  // against the words' own colour. A plain colour, or a gradient's best stop, must give 3:1 (white on light grey fails,
  // white on a mid-to-dark table passes: the starter's felt #235b45 is 7.9:1). A picture, canvas or video behind them
  // can't be judged and is left alone; so are words under a dialog's dim or inside a dialog (not really on show).
  const lightWords = (el) => {
    if (!el.closest('.kit-hud-text, .kit-bar-label-inside')) return ''
    if (el.closest('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return ''
    const ink = inkOf(el)
    if (!ink) return ''
    const range = document.createRange()
    let worst = null
    for (const n of wordsIn(el, false)) {
      range.selectNodeContents(n)
      for (const line of range.getClientRects()) {
        for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const behinds = coloursBehind(el, line.left + line.width * f, line.top + line.height / 2, { gradients: true })
          if (!behinds) continue
          // (a gradient: the stop that reads best — words across a light and a dark stripe are fine)
          const ratio = Math.max(...behinds.map((b) => contrast(over(ink, b), b)))
          if (worst === null || ratio < worst) worst = ratio
        }
      }
    }
    return worst !== null && worst < 3 ? `is light on-game words on a plain light background — ${worst.toFixed(1)}:1 (needs 3:1; their halo is for busy game art, not a plain page: put the game's picture or table colour behind them)` : ''
  }

  // ---- breathing room (0.21.0) ----
  // A drawn box: a border all round, a shadow, a picture or gradient, or its own background colour (different from the
  // one it sits on). A line on one side only is a divider (list rows), not a box. The page and anything as big as the
  // screen don't count.
  const drawsBox = (el) => {
    if (el === document.body || el === document.documentElement) return false
    const box = el.getBoundingClientRect()
    if (box.width >= innerWidth - 1 && box.height >= innerHeight - 1) return false
    const s = getComputedStyle(el)
    if (['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(s[`border${side}Width`]) > 0 && !seeThrough(s[`border${side}Color`]))) return true
    if (s.boxShadow !== 'none' || s.backgroundImage !== 'none') return true
    if (seeThrough(s.backgroundColor)) return false
    let p = el.parentElement
    while (p && seeThrough(getComputedStyle(p).backgroundColor)) p = p.parentElement
    return !p || getComputedStyle(p).backgroundColor !== s.backgroundColor
  }
  const scrolls = (el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowX + s.overflowY) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) }
  // Words are measured by the words themselves (not their element, which may be wider): side to side as wide as they
  // run, top to bottom by their ink — the letters' real top and bottom (the browser measures them in that font), not
  // the extra space a font keeps above and below (a ‹ in an icon button is much smaller than its line).
  const wordsBox = (nodes) => {
    const range = document.createRange()
    const rects = nodes.flatMap((n) => {
      range.selectNodeContents(n)
      const s = getComputedStyle(n.parentElement)
      // (from its parts: the `font` shorthand reads "" when the text has a font-variant the shorthand can't say — the kit's
      // lining-nums, 0.34.0 — and the canvas then kept its last font, 10px sans-serif: every word was measured in the
      // wrong font, so "Settings" in Cozy read as touching its button's edge with 6 px of room — 0.35.4, F147)
      pixel.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      const words = n.textContent.trim()
      const ink = pixel.measureText(s.textTransform === 'uppercase' ? words.toUpperCase() : words)
      return [...range.getClientRects()].map((r) => {
        const scale = r.height / (ink.fontBoundingBoxAscent + ink.fontBoundingBoxDescent) // < 1 when shrunk (a pinned chip)
        const baseline = r.top + ink.fontBoundingBoxAscent * scale // a line's box starts that far above its baseline
        return { left: r.left, right: r.right, top: baseline - ink.actualBoundingBoxAscent * scale, bottom: baseline + ink.actualBoundingBoxDescent * scale }
      })
    })
    if (!rects.length) return null
    return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) }
  }
  const wordsIn = (el, deep) => {
    if (!deep) return [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const out = []
    while (walker.nextNode()) if (walker.currentNode.textContent.trim() && !moving(walker.currentNode.parentElement)) out.push(walker.currentNode)
    return out
  }
  // Something moving right now (a "+4" floating up and away) is passing by, not sitting in the box: not judged
  const moving = (el) => el.getAnimations?.().some((a) => a.playState === 'running') ?? false
  // Text, an icon or a picture closer than ~2 px to the inside edge of the box around it → the plain-words problem, or ''.
  // (flagged under 1.5 px, so half a pixel of rounding doesn't count)
  // Text: its own box counts too (a badge's words). A picture, avatar or badge is measured against the box it sits in;
  // an icon made of a character (role="img" around ★) by its character.
  const tooClose = (el, isText) => {
    if (!shown(el) || moving(el) || el.closest('[data-ui-bleed]') || el.parentElement?.closest('svg')) return '' // (an svg's own insides: its icon counts as one)
    const boxItem = ['IMG', 'svg', 'CANVAS', 'VIDEO'].includes(el.tagName) || el.matches('.kit-avatar, .kit-badge')
    const content = !isText && boxItem ? el.getBoundingClientRect() : wordsBox(wordsIn(el, !isText))
    if (!content) return ''
    let box = isText ? el : el.parentElement
    for (; box && !drawsBox(box); box = box.parentElement) if (scrolls(box)) return ''
    if (!box || scrolls(box)) return ''
    const b = box.getBoundingClientRect()
    const s = getComputedStyle(box)
    // Its border as drawn: a box shrunk by a transform (a chip pinned to the table) has a thinner border on screen than
    // its style says (0.33.2: Pixel's 4px border at a pin scale of 0.44 is 1.75px, not 4 — the words had 3.5px of room)
    const k = box.offsetWidth ? b.width / box.offsetWidth : 1
    const inside = { left: b.left + parseFloat(s.borderLeftWidth) * k, top: b.top + parseFloat(s.borderTopWidth) * k, right: b.right - parseFloat(s.borderRightWidth) * k, bottom: b.bottom - parseFloat(s.borderBottomWidth) * k }
    const midX = (content.left + content.right) / 2, midY = (content.top + content.bottom) / 2
    if (midX < b.left || midX > b.right || midY < b.top || midY > b.bottom) return '' // it sits outside the box, not in it
    const room = Math.min(content.left - inside.left, content.top - inside.top, inside.right - content.right, inside.bottom - content.bottom)
    // (a box shrunk onto the table is a small copy of one that has room: its 1.5 px shrinks with it, like the ring's
    // below — 0.37.1, F161: the gallery's pinned chips at 200% text sideways had 3 px, drawn at 0.4 as 1)
    if (room >= 1.5 * Math.min(1, k)) return ''
    const what = box.classList[0] ? `.${box.classList[0]}` : `<${box.tagName.toLowerCase()}>`
    // (0.38.0, F162: Mode select's titles in Pixel, fake language, ran ~30 px out past their cards and read "touches —
    // 0 px", like a near miss) — out past the box's inside edge by a pixel or more: said as it is
    if (room <= -1) return `runs ${Math.round(-room)} px past the edge of its box (${what}${box === el ? ', its own' : ''})`
    return `touches the edge of its box (${what}${box === el ? ', its own' : ''}) — ${Math.max(0, Math.round(room))} px of room`
  }

  // ---- words split in the middle (0.34.1) ----
  // A word broken across two lines in the middle ("Accessibil / ity" in a ◀ tab ▶ picker at 200% text). Flagged only
  // when the word would fit on one line of the box it's drawn in (the nearest card, chip, button or panel around it —
  // or the screen, when there's none): then the layout squeezed it (arrows too wide, a row's neighbour taking the room).
  // A word wider than that box has nowhere to go and may still wrap. Breaks at a space, hyphen, dash or slash are
  // where words end, not "in the middle".
  const splitWords = (el) => {
    const out = []
    // (a part that marks it OK, or a ◀ ▶ picker already stacked — its last step: the value has the picker's whole width)
    if (el.closest('[data-ui-split-ok], .kit-picker[data-fit="stack"]')) return out
    const range = document.createRange()
    for (const n of wordsIn(el, false)) {
      for (const m of n.textContent.matchAll(/[^\s\-­‐-—/]{2,}/g)) {
        range.setStart(n, m.index)
        range.setEnd(n, m.index + m[0].length)
        const lines = [...range.getClientRects()].filter((r) => r.width > 0.5)
        if (lines.length < 2) continue
        const tops = lines.map((r) => r.top)
        if (Math.max(...tops) - Math.min(...tops) < Math.min(...lines.map((r) => r.height)) / 2) continue // one line
        // (…and no wider than a window on the way that hides what runs past its sides — 0.38.0, F162: a Carousel's
        // window between its ◀ ▶ is narrower than the card around it)
        let box = el, view = Infinity
        while (box && box !== document.body && !drawsBox(box)) {
          if (box !== el && /^(hidden|clip)$/.test(getComputedStyle(box).overflowX)) view = Math.min(view, box.getBoundingClientRect().width)
          box = box.parentElement
        }
        let room = innerWidth, what = 'the screen'
        if (box && box !== document.body) {
          const s = getComputedStyle(box)
          const k = box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1 // (shrunk by a transform)
          room = box.getBoundingClientRect().width - k * ['borderLeftWidth', 'borderRightWidth', 'paddingLeft', 'paddingRight'].reduce((sum, side) => sum + parseFloat(s[side]), 0)
          what = box.classList[0] ? `.${box.classList[0]}` : `<${box.tagName.toLowerCase()}>`
        }
        room = Math.min(room, view)
        const wide = lines.reduce((sum, r) => sum + r.width, 0)
        // (fits = with room to spare: within half a pixel either way the browser decides, and a word a hair wider than its
        // line — 0.3 px, Mode select's "[Öñļíñéöñ]" on a phone, 0.38.0 — really doesn't fit)
        if (wide <= room - 0.5) out.push(`split: "${m[0]}" is broken in the middle across ${lines.length} lines, though it fits on one line of its box (${what})`)
        // …and a TITLE's word even when it's wider than its box (0.35.1, F145: "Reconnecti / ng…" at 200% text): a title
        // has a smaller size to go to (MenuHeader and the end screens drop a step), so a split one was never fitted —
        // unless its fit already went all the way down (data-fit="split": body size, the last resort — 0.37.0, F156)
        else if (el.matches('.kit-text:is([data-kind="title"], [data-kind="display"])') && !el.closest('[data-fit="split"]')) out.push(`split: "${m[0]}" is broken in the middle across ${lines.length} lines — a title word wider than its box (${what}): drop the title a size instead (MenuHeader / useTitleFit)`)
      }
    }
    return out
  }
  for (const el of texts) problems.push(...splitWords(el))

  // …and words cut off by a box AROUND them that hides what runs past it (0.38.0, F162: Settings in Pixel at 200% text,
  // in the fake language — the card scrolls up and down but hides its sides, and its title's "]" was cut off at the
  // card's right edge). Only a side that can't be scrolled to counts: overflow hidden or clip that way. Rows scrolled
  // part-way under a scroll box's edge are fine (they scroll into view); so are words moving right now. Words are
  // measured by their ink (Countdown's "3" at 200% sideways: its line ran past the stage, its letter didn't), and only
  // the boxes that can clip them count (clippers: not for a popover or a fixed part).
  for (const el of texts) {
    if (moving(el)) continue
    const words = wordsIn(el, false)
    if (!words.length) continue
    const run = wordsBox(words)
    if (!run) continue
    let sideSeen = false, endSeen = false // (only the nearest box that hides each way: one line per words)
    for (const p of clippers(el)) {
      if (sideSeen && endSeen) break
      if (moving(p)) break // a carousel sliding, a card on its way in
      const s = getComputedStyle(p)
      // (a box that scrolls that way brings the words into view: what's further out only cuts the scroll box itself)
      if (/(auto|scroll)/.test(s.overflowX)) sideSeen = true
      if (/(auto|scroll)/.test(s.overflowY)) endSeen = true
      const hidesSides = !sideSeen && /^(hidden|clip)$/.test(s.overflowX)
      const hidesEnds = !endSeen && /^(hidden|clip)$/.test(s.overflowY)
      if (!hidesSides && !hidesEnds) continue
      const b = p.getBoundingClientRect()
      const k = p.offsetWidth ? b.width / p.offsetWidth : 1 // (shrunk by a transform)
      // what it shows: its box inside its border (overflow is cut at the padding's edge)
      const left = b.left + p.clientLeft * k, top = b.top + p.clientTop * k, right = left + p.clientWidth * k, bottom = top + p.clientHeight * k
      const what = p.classList[0] ? `.${p.classList[0]}` : `<${p.tagName.toLowerCase()}>`
      if (hidesSides) {
        sideSeen = true
        const hidden = Math.max(left - run.left, run.right - right)
        if (hidden > 1) problems.push(`clipped: "${name(el)}" is cut off by the side of its box (${what}), which hides what runs past it — ${Math.round(hidden)} px hidden`)
      }
      if (hidesEnds) {
        endSeen = true
        const hidden = Math.max(top - run.top, run.bottom - bottom)
        if (hidden > 1) problems.push(`clipped: "${name(el)}" is cut off by the top or bottom of its box (${what}), which hides what runs past it — ${Math.round(hidden)} px hidden`)
      }
    }
  }

  // A scroll list squeezed to about one row (0.38.0, F162: the Room's players at 200% text on an upright phone — a
  // 128 px list for rows of ~156 px; it scrolled, so nothing was "cut off"). Its rows: what's in it (through a lone
  // wrapper — a ScrollArea's Stack or Grid); measured by the shortest, so a list that shows 2 of its smallest rows is
  // fine. One row or one long text in a short box isn't a list. Moving rows (still arriving) aren't judged; nor rows
  // taller than half the screen — two of them can't show at once anywhere, so there's no room to give (a card already
  // scrolling as one on a phone on its side at 200% text: Feedback's tooltip demo, 284 px tall on a 390 px screen).
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el)
    if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 1 || !shown(el) || moving(el)) continue
    let rows = [...el.children]
    while (rows.length === 1) rows = [...rows[0].children]
    const heights = rows.filter((r) => !['absolute', 'fixed'].includes(getComputedStyle(r).position)).map((r) => r.getBoundingClientRect().height).filter((h) => h >= 8)
    if (heights.length < 2) continue
    const k = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1
    const row = Math.min(...heights)
    if (2 * row > innerHeight) continue
    const shows = (el.clientHeight * k) / row
    if (shows < 1.5) problems.push(`squeezed: the list "${name(el)}" shows ${shows.toFixed(1)} of a row at a time (its shortest row is ${Math.round(row)} px) — give it room for 2 rows, or let the card around it scroll as one`)
  }

  const boxes = things.map(visibleBox)
  const hitAll = document.createElement('style')
  hitAll.textContent = '* { pointer-events: auto !important; }'
  document.head.appendChild(hitAll)
  try {
    for (const el of texts) {
      const faint = faintText(el)
      if (faint) problems.push(`faint: "${name(el)}" is hard to read — ${faint}`)
    }
    for (const el of texts) {
      const light = lightWords(el)
      if (light) problems.push(`contrast: "${name(el)}" ${light}`)
    }
    const items = [...texts.map((el) => [el, true]), ...[...document.querySelectorAll('img, svg, canvas, video, .kit-avatar, .kit-badge, [role="img"]')].map((el) => [el, false])]
    for (const [el, isText] of items) {
      const edge = tooClose(el, isText)
      if (edge) problems.push(`edge: "${name(el)}" ${edge}`)
    }
    const crossed = [] // pairs already said as "X × Y" (the covered-piece check below doesn't say them twice)
    // A toast or tooltip floats in the top layer on purpose, over whatever is under it (at 200% text the toasts covered
    // the card's words — Muzzy 2026-10-25: on top by design, 0.35.3). Only things in the SAME layer can collide: two
    // toasts over each other still count.
    const inTopLayer = (el) => !!el.closest(':popover-open')
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i], b = things[j]
        if (a.contains(b) || b.contains(a)) continue
        if (inTopLayer(a) !== inTopLayer(b)) continue
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
        if (seenA && seenB && !scrollsOutFromUnder(a, b)) { problems.push(`overlap: "${name(a)}" × "${name(b)}"`); crossed.push([a, b]) }
      }
    }
    // Covered bars and pictures (0.33.1): a solid piece (a chip, badge, button or panel — its own background, not
    // see-through) that slid part-way onto a bar, meter or picture. Those hold no words, so the check above never saw
    // them (the coins chip sat on the end of the Health bar on an upright Cozy phone). On-purpose layering is left alone:
    //   - laid WHOLLY over it (a dialog over the HUD) or sitting wholly ON it (a chip on a backdrop picture): only a
    //     piece crossing the bar's or picture's edge — part of it showing, part hidden — is a collision
    //   - in the bar's own card (the nearest drawn box around it, inside its screen slot): a badge on its portrait's
    //     corner, a label on its own bar
    //   - floating in the top layer (a toast, a tooltip, a modal dialog), or moving right now (a "+4" floating away)
    //   - anything under an open screen (inert) or skipped (see the header)
    const covered = [...document.querySelectorAll('[role="progressbar"], [role="meter"], progress, meter, img, svg, canvas, video, [role="img"], .kit-avatar')]
      .filter((el) => !el.parentElement?.closest('svg') && shown(el))
    const solid = (el) => {
      if (el === document.body || el === document.documentElement) return false
      const s = getComputedStyle(el)
      return rgba(s.backgroundColor)[3] >= 0.5 || s.backgroundImage !== 'none'
    }
    const floats = (el) => !!el.closest(':popover-open, dialog:modal') || moving(el)
    const covers = [...document.querySelectorAll('body *')].filter((el) => solid(el) && drawsBox(el) && shown(el) && !floats(el))
    const ownCard = (el) => {
      for (let p = el.parentElement; p && p !== document.body && !p.matches('[data-slot], .kit-layer, .kit-screen'); p = p.parentElement) if (drawsBox(p)) return p
      return null
    }
    const inside = (small, big) => small.left >= big.left - 0.5 && small.right <= big.right + 0.5 && small.top >= big.top - 0.5 && small.bottom <= big.bottom + 0.5
    // Text too (0.33.2): a solid piece over part of another card's words (the coins chip on "Score 120") — the
    // text-over-text check above stops at the chip's background ("something covers it there"), so it never said.
    // The words are measured by the words themselves (their element may be much wider); the piece must be ON TOP of
    // them there. Kept: a label on its own chip and text inside the piece (the piece holds it), a badge in the text's
    // own card, a dialog wholly over the words or words wholly on a backdrop panel. (A piece wholly inside a run of words
    // still counts for text: a "×2" sitting on the middle of a title hides letters.)
    const targets = [...covered.map((el) => [el, false]), ...texts.filter((el) => !covered.includes(el)).map((el) => [el, true])]
    for (const [target, isText] of targets) {
      const seen = visibleBox(target)
      const words = isText ? wordsBox(wordsIn(target, false)) : seen
      const tBox = words && seen && {
        left: Math.max(words.left, seen.left), top: Math.max(words.top, seen.top),
        right: Math.min(words.right, seen.right), bottom: Math.min(words.bottom, seen.bottom),
      }
      if (!tBox || tBox.right <= tBox.left || tBox.bottom <= tBox.top) continue
      const card = ownCard(target)
      const found = []
      for (const piece of covers) {
        if (piece.contains(target) || target.contains(piece) || card?.contains(piece)) continue
        if (found.some((f) => f.contains(piece))) continue // one line per piece: not again for the coin inside the chip
        if (isText && crossed.some(([a, b]) => (part(a, piece) && b === target) || (part(b, piece) && a === target))) continue // said already as "X × Y"
        const pBox = visibleBox(piece)
        const at = crossing(tBox, pBox)
        if (!at || inside(tBox, pBox) || (!isText && inside(pBox, tBox))) continue
        let seenT = false, seenP = false
        for (const el of document.elementsFromPoint(at.x, at.y)) {
          if (part(el, piece)) seenP = true
          else if (part(el, target)) {
            if (isText && !seenP && solid(target)) break // the words' own chip lies over the piece here: it's the piece that's covered
            seenT = true
          }
          else if (el.contains(piece) && el.contains(target)) continue // a box around both: under them
          else if (paints(el)) break // something else covers them there
          if (seenT && seenP) break
        }
        if (!seenT || !seenP || scrollsOutFromUnder(piece, target)) continue
        found.push(piece)
        problems.push(`overlap: "${name(piece)}" covers part of "${name(target)}"`)
      }
    }
  } finally {
    hitAll.remove()
  }

  // ---- an avatar's ring (0.35.8, F152) ----
  // Words or a badge closer than ~2 px to an avatar's VISIBLE edge — its ring included: Results' 1st place wears an accent
  // outline 5 px out (10 px at 200% text) that isn't part of its box, so every box check saw the 8 px gap and never the
  // ring crossing "1ST", the name and its ★. Both shapes are measured as drawn: a box rounded by its border-radius (a
  // round avatar is a circle — a badge by its box's corner can be clear of it, or not, whatever the boxes say), the
  // avatar's grown by its outline. Something laid ON the avatar's body (a seat's badge on its portrait's corner) is
  // there on purpose and left alone.
  // (style lengths are before any transform: a chip pinned to the table at 0.25 draws its 16 px corners at 4 px — `k`)
  const shrunk = (el) => (el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1)
  const rounded = (box, el, grow = 0) => { // a box with round corners: its inner box + the corner radius (≤ half a side)
    const r = Math.min((parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0) * shrunk(el), (box.right - box.left) / 2, (box.bottom - box.top) / 2)
    const R = r > 0 ? r + grow : 0 // (an outline follows the rounding; around square corners it stays square)
    return { left: box.left - grow + R, right: box.right + grow - R, top: box.top - grow + R, bottom: box.bottom + grow - R, R }
  }
  const apart = (a, b) => { // px between two rounded shapes, below 0 when they cross
    const dx = Math.max(a.left - b.right, b.left - a.right), dy = Math.max(a.top - b.bottom, b.top - a.bottom)
    return (dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy)) - a.R - b.R
  }
  for (const av of [...document.querySelectorAll('.kit-avatar')].filter((el) => shown(el) && !moving(el))) {
    const s = getComputedStyle(av)
    const reach = s.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset)) * shrunk(av)
    const b = av.getBoundingClientRect()
    const body = rounded(b, av), ring = rounded(b, av, reach)
    // What a scroll area (or any box hiding overflow) around the avatar cuts off isn't drawn (0.37.1, F161: Results'
    // last row under the list's edge — "Continue" below the list "touched" the hidden part's ring). Words outside that
    // box are measured to the part it shows, as a plain box; words inside it to the whole ring, as before.
    let clipper = av.parentElement
    while (clipper && clipper !== document.documentElement && getComputedStyle(clipper).overflowY === 'visible' && getComputedStyle(clipper).overflowX === 'visible') clipper = clipper.parentElement
    if (clipper === document.documentElement) clipper = null
    const seen = clipper && visibleBox(av)
    if (clipper && !seen) continue // all of it scrolled out of sight
    const seenRing = seen && { left: Math.max(seen.left - reach, b.left - reach), right: Math.min(seen.right + reach, b.right + reach), R: 0,
      top: seen.top > b.top + 0.5 ? seen.top : seen.top - reach, bottom: seen.bottom < b.bottom - 0.5 ? seen.bottom : seen.bottom + reach }
    const near = [
      ...texts.filter((el) => !el.closest('.kit-badge')).map((el) => [el, wordsBox(wordsIn(el, false)), null]),
      ...[...document.querySelectorAll('.kit-badge')].filter((el) => shown(el)).map((el) => [el, el.getBoundingClientRect(), el]),
    ]
    for (const [el, box, shape] of near) {
      if (!box || av.contains(el) || el.contains(av) || moving(el)) continue
      const piece = shape ? rounded(box, shape) : { ...box, R: 0 } // (words: the box of their letters)
      if (apart(piece, body) <= 0) continue // ON the avatar: on purpose
      // …or on a sticky row it scrolls out from under (0.38.0, F162: the Room at 200% text, its buttons' row at the
      // card's foot and Muzzy's row going by underneath — the same as an overlap with a sticky row)
      if (scrollsOutFromUnder(el, av)) continue
      const cut = seenRing && (seen.top > b.top + 0.5 || seen.bottom < b.bottom - 0.5 || seen.left > b.left + 0.5 || seen.right < b.right - 0.5)
      const room = cut && !clipper.contains(el) ? apart(piece, seenRing) : apart(piece, ring)
      // (a chip shrunk onto the table is a small copy of one that has room: its 1.5 px shrinks with it — the gallery's
      // pinned chips at 200% text: "Bot" 1 px from its 10 px portrait)
      if (room < 1.5 * Math.min(1, shrunk(av))) problems.push(`ring: "${name(el)}" touches the ring around "${name(av)}" — ${Math.max(0, Math.round(room))} px of room`)
    }
  }

  // Cards that grew after they appeared — noted as it happens by the kit's useFixedSize (fixedSize.ts, dev builds)
  // (emptied once read, so growth seen on the first screen isn't blamed again on the next one)
  for (const g of window.__uiGrowth ?? []) problems.push(`grows: "${g.name}" grew from ${g.from} to ${g.to} px after it appeared`)
  window.__uiGrowth = []

  const ring = checkFocus && document.querySelector(':focus-visible')
  if (ring && !ring.closest('#devkit-root')) problems.push(`focus: a focus ring shows without keyboard use — "${name(ring)}"`)
  return [...new Set(problems)]
}

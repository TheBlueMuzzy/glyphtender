// SELECT MODE — the picker for games drawn with the page (DOM / SVG): which tagged thing is under the pointer?
// A picker's whole job: a point → an object id + the element to outline. A 3D game would add a raycast picker
// with the same shape (framework F57) — the Select tab doesn't care which one found it.
//
// Geometry, not the browser's hit-testing: many game overlays (score pops, word borders, vines) are
// pointer-events: none, so a click goes straight through them. Instead: every VISIBLE tagged element whose box
// holds the point, and the SMALLEST box wins (a glyphling sitting on the board → the glyphling).
import { tagsOf, type SelectObject } from './selectMap'

export type Found = { id: string; el: Element }

const DEVKIT = '.devkit, .devkit-select-layer' // the Dev Kit's own boxes are never picked

/** Is it really showing? Not hidden, not see-through (an invisible leftover score pop never counts), has a size. */
export function isShowing(el: Element): boolean {
  const box = el.getBoundingClientRect()
  if (box.width <= 0 && box.height <= 0) return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  // Older browsers: walk up looking for display none / opacity 0
  for (let at: Element | null = el; at; at = at.parentElement) {
    const style = getComputedStyle(at)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  }
  return true
}

/** Every tagged thing on the page right now (showing or not), with the object id it stands for. */
export function allTagged(objects: SelectObject[], root: ParentNode = document): Found[] {
  const known = new Set(objects.map((o) => o.id))
  const found: Found[] = []
  for (const el of root.querySelectorAll('[data-knobs]')) {
    if (el.closest(DEVKIT)) continue
    for (const id of tagsOf(el.getAttribute('data-knobs'))) if (known.has(id)) found.push({ id, el })
  }
  for (const obj of objects) {
    if (!obj.find) continue
    let els: NodeListOf<Element>
    try {
      els = root.querySelectorAll(obj.find)
    } catch {
      continue // a broken selector in the file: the Select tab shows the object as never on screen
    }
    for (const el of els) if (!el.closest(DEVKIT)) found.push({ id: obj.id, el })
  }
  return found
}

/** The ids showing on screen right now. */
export function idsOnScreen(objects: SelectObject[], root: ParentNode = document): Set<string> {
  return new Set(allTagged(objects, root).filter((f) => isShowing(f.el)).map((f) => f.id))
}

const area = (r: DOMRect) => r.width * r.height

/** The thing under the point: the smallest showing tagged box that holds it, or null. */
export function objectAt(x: number, y: number, objects: SelectObject[], root: ParentNode = document): Found | null {
  let best: Found | null = null
  let bestArea = Infinity
  for (const f of allTagged(objects, root)) {
    const r = f.el.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue
    if (area(r) >= bestArea || !isShowing(f.el)) continue
    best = f
    bestArea = area(r)
  }
  return best
}

/** Every showing element of one object (the picked one's twins get a dashed outline: "affects all 8"). */
export function elementsOf(id: string, objects: SelectObject[], root: ParentNode = document): Element[] {
  return allTagged(objects, root).filter((f) => f.id === id && isShowing(f.el)).map((f) => f.el)
}

// SELECT MODE — the pink outlines over the game, and the click catcher.
//   While select mode is on: hovering draws a thin outline + the object's name; a click/tap picks it (thick outline,
//   its twins dashed — "affects all 8 glyphlings"). The game never sees those clicks: they're caught on the way down
//   (capture phase) and stopped. The Dev Kit's own panel is never caught.
//   The outlines live in their own top-layer box (a popover with pointer-events: none) so they never move the game's
//   layout and float above it. A requestAnimationFrame loop moves them with the things (they glide, hop, scroll) —
//   straight on the elements' style, never React state per frame.
//   While the Dev Kit is open it also notes what's on screen (a 300 ms look + a watch for things that pop in and out
//   faster than that), for the Select tab's "Recently on screen" list. Closing the Dev Kit turns select mode off.
import { useEffect, useRef } from 'react'
import { elementsOf, idsOnScreen, objectAt } from './domPicker'
import { tagsOf } from './selectMap'
import { getSelect, setSelect, useSelect } from './selectStore'

const SCAN_MS = 300
// Every kind of press a game might listen to — all stopped while select mode is on (pointerup does the picking)
const SWALLOW = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchend'] as const
const onDevKit = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('.devkit')

export function SelectLayer({ panelOpen }: { panelOpen: boolean }) {
  const s = useSelect()
  const layer = useRef<HTMLDivElement>(null)
  const hoverEl = useRef<Element | null>(null)
  const drawing = panelOpen && s.on

  // Closing the Dev Kit ends select mode (the pick stays)
  useEffect(() => {
    if (!panelOpen && getSelect().on) setSelect({ on: false, hover: null })
  }, [panelOpen])

  // The outline box sits in the top layer only while it's drawing
  useEffect(() => {
    const el = layer.current
    if (!el?.showPopover) return
    if (drawing && !el.matches(':popover-open')) el.showPopover()
    if (!drawing && el.matches(':popover-open')) el.hidePopover()
  }, [drawing])

  // Hover + pick, caught before the game sees anything
  useEffect(() => {
    if (!drawing) return
    const onMove = (e: PointerEvent) => {
      if (onDevKit(e.target)) {
        hoverEl.current = null
        if (getSelect().hover) setSelect({ hover: null })
        return
      }
      const found = objectAt(e.clientX, e.clientY, getSelect().objects)
      hoverEl.current = found?.el ?? null
      if ((found?.id ?? null) !== getSelect().hover) setSelect({ hover: found?.id ?? null })
    }
    const swallow = (e: Event) => {
      if (onDevKit(e.target)) return
      e.stopImmediatePropagation()
      if (e.cancelable) e.preventDefault()
      if (e.type !== 'pointerup') return
      const { clientX, clientY } = e as PointerEvent
      const found = objectAt(clientX, clientY, getSelect().objects)
      if (found) setSelect({ picked: found.id, pickedEl: found.el })
    }
    window.addEventListener('pointermove', onMove, true)
    for (const type of SWALLOW) window.addEventListener(type, swallow, { capture: true, passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      for (const type of SWALLOW) window.removeEventListener(type, swallow, { capture: true })
      hoverEl.current = null
    }
  }, [drawing])

  // Move the outlines with the things, every frame
  useEffect(() => {
    if (!drawing) return
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const box = layer.current
      if (!box) return
      const now = getSelect()
      const label = (id: string | null) => now.objects.find((o) => o.id === id)?.label ?? ''
      const picked = now.picked ? elementsOf(now.picked, now.objects) : []
      const main = now.pickedEl && now.pickedEl.isConnected && picked.includes(now.pickedEl) ? now.pickedEl : picked[0]
      const hover = hoverEl.current?.isConnected ? hoverEl.current : null
      const boxes: { el: Element; kind: 'hover' | 'picked' | 'twin'; text?: string }[] = [
        ...picked.filter((el) => el !== main).map((el) => ({ el, kind: 'twin' as const })),
        ...(main ? [{ el: main, kind: 'picked' as const, text: label(now.picked) }] : []),
        ...(hover && hover !== main ? [{ el: hover, kind: 'hover' as const, text: label(now.hover) }] : []),
      ]
      // Reuse the outline divs; add or remove only when the count changes
      while (box.children.length < boxes.length) box.appendChild(document.createElement('div'))
      while (box.children.length > boxes.length) box.lastChild!.remove()
      boxes.forEach(({ el, kind, text }, i) => {
        const div = box.children[i] as HTMLDivElement
        const r = el.getBoundingClientRect()
        div.className = `devkit-select-box is-${kind}${r.top < 24 ? ' label-below' : ''}` // no room above: name goes under
        div.style.transform = `translate(${r.left}px, ${r.top}px)`
        div.style.width = `${r.width}px`
        div.style.height = `${r.height}px`
        div.dataset.label = text ?? ''
      })
    }
    draw()
    return () => {
      cancelAnimationFrame(frame)
      layer.current?.replaceChildren()
    }
  }, [drawing])

  // "Recently on screen": what's showing now, and when each thing was last seen
  useEffect(() => {
    if (!panelOpen) return
    const markSeen = (ids: Iterable<string>) => {
      const now = getSelect()
      const seen = { ...now.seen }
      let changed = false
      for (const id of ids) {
        if (now.onScreen.includes(id)) continue // showing: the list says "on screen"
        seen[id] = Date.now()
        changed = true
      }
      if (changed) setSelect({ seen })
    }
    const scan = () => {
      const now = getSelect()
      const showing = [...idsOnScreen(now.objects)]
      const gone = now.onScreen.filter((id) => !showing.includes(id))
      const same = gone.length === 0 && showing.length === now.onScreen.length
      if (same) return
      const seen = { ...now.seen }
      for (const id of [...gone, ...showing]) seen[id] = Date.now()
      setSelect({ onScreen: showing, seen })
    }
    // Things that come and go between two looks (a score pop): caught as they're added to the page
    const watcher = new MutationObserver((records) => {
      const ids = new Set<string>()
      const objects = getSelect().objects
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element) || node.closest('.devkit')) continue
          for (const el of [node, ...node.querySelectorAll('[data-knobs]')]) for (const id of tagsOf(el.getAttribute('data-knobs'))) ids.add(id)
          for (const obj of objects) {
            if (!obj.find) continue
            try {
              if (node.matches(obj.find) || node.querySelector(obj.find)) ids.add(obj.id)
            } catch {
              // a broken selector in the file — the Select tab lists it as a problem
            }
          }
        }
      }
      const known = new Set(objects.map((o) => o.id))
      markSeen([...ids].filter((id) => known.has(id)))
    })
    watcher.observe(document.body, { childList: true, subtree: true })
    scan()
    const timer = window.setInterval(scan, SCAN_MS)
    return () => {
      window.clearInterval(timer)
      watcher.disconnect()
    }
  }, [panelOpen])

  return (
    <div
      ref={layer}
      {...{ popover: 'manual' }}
      className="devkit-select-layer"
      aria-hidden="true"
      hidden={!drawing}
      style={{ opacity: s.outline }}
    />
  )
}

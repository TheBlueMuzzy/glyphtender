// TAP-TAP AND DRAG — one pointer handler for the whole game screen (board + tray), finger and mouse alike.
// A press that moves more than dragStartDistance becomes a drag: the piece is CARRIED under the pointer
// (dragLift px ABOVE a finger, so the finger doesn't hide it) and dropping it = tapping where it's dropped.
// While dragging, the legal hex under the carried piece lights up ("drop here", dropTarget.ts); an illegal one doesn't.
// A tap or drag on something that can't be touched makes it shake "no" (store.refuseTap → nope.ts).
// CARRY STYLES (F63, ui-kit drag/carry.ts, content/tuning/drag.json): each drag type has a style that says how the
// carried piece looks (solid / ghost, lifted), what its home shows meanwhile (carryState.ts → the tray and the board),
// how a legal drop lands and how a wrong one goes back. The drag types:
//   draft (a glyphling out of the tray) · seed (a seed aimed at the board) · reorder (a seed to another tray place —
//   a seed drag turns into one while it's over another place, and is one all the time while choosing what to refresh)
//   · move (a glyphling on the board).
// A legal drop plays its landing FIRST and the store changes when it has landed (so nothing shows twice); a glyphling
// move whose style flies the real piece (C) is the move glide itself (useGlide) — one motion, never two.
// What was pressed is read from data attributes:
//   data-glyph (board glyphling id) · data-hand (tray seed: its id) + data-tray-pos (its place in the tray)
//   data-draft (a glyphling waiting to be placed) · data-hex (a board hex, "q,r")
import { useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { hexKey, type Hex } from '../engine/hex'
import { playSound } from '../audio'
import { liveTuning } from '../devkit/tuning/liveTuning'
import { useGameStore } from '../store/gameStore'
import { NEW_GLYPHLING, playReferee, targetsOf, type Piece } from '../store/referee'
import { dropKind, letterIn } from '../store/turnPlan'
import { carryStyle, createCarrier, originWhileCarried, type Carrier, type CarryStyle, type Point } from '../ui/kit'
import dragFile from '../../content/tuning/drag.json'
import { glyphlingArt, seedArt } from './art'
import { endCarry, setCarried, setOriginLook, type Carried } from './carryState'
import { showDropTarget } from './dropTarget'
import { arrivedOn } from './useGlide'
import type { LayoutTuning } from './useTuning'

export type DragType = keyof typeof dragFile.styles
const dragTuning = liveTuning('drag', dragFile) // (a Dev Kit edit applies from the next drag)

interface Press {
  glyph?: number
  /** A tray seed's id. */
  hand?: string
  trayPos?: number
  draft?: boolean
  hex?: Hex
  /** Which finger (or mouse) is pressing — a second finger is ignored until this one lifts. */
  pointerId: number
  x: number
  y: number
  touch: boolean
  dragging: boolean
  /** The piece said "no" when a drag started (it shook): the rest of this press does nothing. */
  refused?: boolean
  /** While dragging: the drag type and its carry style, what is carried, its home (centre, drag-layer px) and size. */
  type?: DragType
  style?: CarryStyle
  carried?: Carried['piece']
  home?: Point
  size?: number
}

const numberAttr = (el: Element, name: string) => {
  const found = el.closest(`[${name}]`)
  return found ? Number(found.getAttribute(name)) : undefined
}
const textAttr = (el: Element, name: string) => el.closest(`[${name}]`)?.getAttribute(name) ?? undefined
const hexAttr = (el: Element | null): Hex | undefined => {
  const key = el?.closest('[data-hex]')?.getAttribute('data-hex')
  if (!key) return undefined
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}

export interface DragLayer {
  layer: RefObject<SVGSVGElement | null>
  image: RefObject<SVGImageElement | null>
}

/** Pointer handlers to spread on the game screen. `carry` = the drag layer's carried piece; `size` = how big it is
 *  drawn (px) when its home's art can't be measured. */
export function usePieceInput(drag: DragLayer & { carry: RefObject<SVGImageElement | null> }, layout: LayoutTuning, size: number) {
  const press = useRef<Press | null>(null)
  const landing = useRef(false) // a drop's landing / return is playing: nothing new can be picked up until it's done
  const carrier = useRef<{ el: SVGImageElement; carry: Carrier } | null>(null)
  const store = useGameStore.getState

  // The carrier of the drag layer's carried <image> (made once; again if the element was replaced)
  const carrierNow = () => {
    const el = drag.carry.current
    if (!el) return null
    if (carrier.current?.el !== el) carrier.current = { el, carry: createCarrier(el, () => dragTuning.current) }
    return carrier.current.carry
  }
  useEffect(() => () => { carrier.current?.carry.cancel(); setCarried(null) }, []) // (the game screen closed mid-drag)

  // A point on the screen → the drag layer's pixels; the centre of an element there
  const inLayer = (x: number, y: number): Point => {
    const box = drag.layer.current?.getBoundingClientRect()
    return { x: x - (box?.left ?? 0), y: y - (box?.top ?? 0) }
  }
  const centreOf = (el: Element | null | undefined): Point | null => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return inLayer(r.left + r.width / 2, r.top + r.height / 2)
  }
  // Where the carried piece is: under the pointer, lifted above a finger
  const pointerAt = (e: PointerEvent, p: Press) => inLayer(e.clientX, e.clientY - (p.touch ? layout.dragLift : 0))
  // What's under the carried piece (lifted above a finger), not under the finger itself
  const underPiece = (e: PointerEvent, p: Press) => document.elementFromPoint(e.clientX, e.clientY - (p.touch ? layout.dragLift : 0))

  // Carry it in the drag type's style: the carried piece's look, and its home drawn the way the style says
  const carryAs = (p: Press, type: DragType, at: Point) => {
    const style = carryStyle(dragTuning.current.styles[type])
    p.type = type
    p.style = style
    carrierNow()?.start(style, at, p.size ?? size)
    if (p.carried) setCarried({ piece: p.carried, origin: originWhileCarried(style), ghostOpacity: dragTuning.current.ghostOpacity })
  }

  const startDrag = (p: Press, e: PointerEvent) => {
    const { game } = store()
    const img = drag.carry.current
    if (!game || !img) return
    // May it be lifted at all? The drag referee (the same answer as the shake, the glow and the drop) — a quiet moment
    // (a seed landing, the device being passed on…) lifts nothing, and shakes nothing either
    const liftable = (piece: Piece) => playReferee(store()).mayPickUp(game.current, piece, targetsOf(game, piece)).ok
    let art: string | null = null
    let type: DragType = 'move'
    let home: Element | null = null
    if (p.glyph !== undefined) {
      const refused = store().refuseTap({ glyph: p.glyph })
      store().grabGlyphling(p.glyph) // (a refused one still says why in the prompt)
      if (refused) return void (p.refused = true)
      if (liftable({ kind: 'glyphling', id: p.glyph })) art = glyphlingArt(game.current)
      home = document.querySelector(`[data-glyph="${p.glyph}"]`)
      p.carried = { kind: 'glyphling', id: p.glyph }
    } else if (p.hand !== undefined) {
      // Before the move (or not my turn) a seed can't be dragged at all, not even to reorder the tray (B008)
      if (store().refuseTap({ hand: p.hand })) {
        store().tapSeed(p.hand) // (says "move a glyphling first")
        return void (p.refused = true)
      }
      store().grabSeed(p.hand)
      if (liftable({ kind: 'seed', id: p.hand })) art = seedArt(letterIn(game.hands[game.current], p.hand) ?? '', game.current)
      type = game.phase === 'refresh' ? 'reorder' : 'seed' // (while choosing what to refresh, a seed can only be reordered)
      home = document.querySelector(`[data-hand="${p.hand}"] image`)
      p.carried = { kind: 'seed', id: p.hand }
    } else if (p.draft) {
      // Not this device's turn to place (online: another player's draft glyphling) → it shakes, never lifts
      if (store().refuseTap({ draft: true })) return void (p.refused = true)
      if (liftable(NEW_GLYPHLING)) art = glyphlingArt(game.current)
      type = 'draft'
      home = document.querySelector('[data-draft="next"] image')
      p.carried = { kind: 'draft' }
    }
    if (!art) return
    if (p.glyph !== undefined || p.draft) playSound('glyph.lift') // (a seed's lift is seed.pick — grabSeed)
    // Its home, and its size there: the carried piece is the piece itself, lifted a little (drag.json liftScale)
    const homeBox = home?.getBoundingClientRect()
    p.home = centreOf(home) ?? pointerAt(e, p)
    p.size = homeBox && homeBox.width > 0 ? homeBox.width : size
    img.setAttribute('href', art)
    img.setAttribute('width', String(p.size))
    img.setAttribute('height', String(p.size))
    p.dragging = true
    carryAs(p, type, pointerAt(e, p))
  }

  const onPointerDown = (e: PointerEvent) => {
    if (store().flying) return // nothing to touch while a seed is in the air
    if (landing.current) return // (a dropped piece is still landing — a fraction of a second)
    if (!e.isPrimary) return // only the first finger plays; a second finger (or a palm) is ignored
    if (e.button !== 0) return // only the main mouse button (a finger or pen tip is 0 too); right/middle clicks do nothing
    const t = e.target as Element
    press.current = {
      glyph: numberAttr(t, 'data-glyph'),
      hand: textAttr(t, 'data-hand'),
      trayPos: numberAttr(t, 'data-tray-pos'),
      draft: !!t.closest('[data-draft]'),
      hex: hexAttr(t),
      pointerId: e.pointerId,
      x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', dragging: false,
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    const p = press.current
    if (!p || p.refused || e.pointerId !== p.pointerId || (p.glyph === undefined && p.hand === undefined && !p.draft)) return
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > layout.dragStartDistance) startDrag(p, e)
    if (!p.dragging) return
    const at = pointerAt(e, p)
    const under = underPiece(e, p)
    // In play, a seed over ANOTHER tray place is being reordered; back over the board it's aimed again
    if (p.hand !== undefined && store().game?.phase === 'play') {
      const pos = under ? numberAttr(under, 'data-tray-pos') : undefined
      const type: DragType = pos !== undefined && pos !== p.trayPos ? 'reorder' : 'seed'
      if (type !== p.type) carryAs(p, type, at)
    }
    carrierNow()?.move(at)
    const hex = hexAttr(under)
    const s = store()
    showDropTarget(hex, s.game ? dropKind({ ...s, game: s.game }, hex) : null)
  }

  // Let go of a dragged piece. A legal drop lands (the style's landing) and THEN changes the game; a wrong one goes
  // back home (the style's return) and then does what a tap there does (it may let go of the held piece, as before).
  const drop = async (e: PointerEvent, p: Press) => {
    showDropTarget(undefined, null)
    const s = store()
    const game = s.game
    const carry = carrierNow()
    const dropped = underPiece(e, p)
    const trayPos = dropped ? numberAttr(dropped, 'data-tray-pos') : undefined
    const hex = trayPos === undefined ? hexAttr(dropped) : undefined
    const from = p.trayPos
    let target: Point | null = null // where a legal drop lands (null = it goes back)
    let commit = () => {} // what a legal drop does, once it has landed
    let after = () => {} // what a wrong drop does, once it is back
    if (game && p.hand !== undefined && from !== undefined && trayPos !== undefined) {
      // Tray reorder — the referee: a seed may be reordered only after the move (B008), or while choosing what to refresh
      const ok = trayPos !== from && playReferee(s).judge(game.current, { kind: 'seed', id: p.hand }, { kind: 'tray', pos: trayPos }).ok
      if (ok) target = centreOf(document.querySelector(`[data-tray-pos="${trayPos}"] polygon`))
      commit = () => store().moveTraySeed(from, trayPos)
    } else if (game && hex) {
      // A board hex — the referee's answer, the same as the glow's
      if (dropKind({ ...s, game }, hex) !== null) target = centreOf(document.querySelector(`.game-garden [data-hex="${hexKey(hex)}"]`))
      commit = () => store().tapHex(hex)
      after = commit
    }
    if (!carry || !p.style || !p.home) { // (nothing carried on screen: just do it)
      ;(target ? commit : after)()
      return endCarry()
    }
    // A glyphling whose style flies the real piece home → target: that IS the move glide (useGlide) — just plan the move
    if (target && p.type === 'move' && p.style.land === 'fly') {
      carry.cancel()
      commit()
      return endCarry()
    }
    if (target && p.style.land === 'fly') setOriginLook('empty') // (the real piece leaves its home and flies)
    landing.current = true
    let ended: Awaited<ReturnType<Carrier['drop']>>
    try {
      ended = await carry.drop(target, p.home)
    } finally {
      landing.current = false // (never leave input locked, whatever happened to the animation)
    }
    // Left the game, or the turn moved on meanwhile → drop it. Any other update (an online sync…) is fine: the store's
    // own action checks again whether the move is allowed
    const now = store().game
    if (!now || now.current !== game?.current || now.phase !== game?.phase) return setCarried(null)
    if (ended === 'landed') {
      if (p.glyph !== undefined && hex) arrivedOn(p.glyph, hex) // (it's already there: no glide)
      commit()
    } else {
      after()
    }
    endCarry()
  }

  const onPointerUp = (e: PointerEvent) => {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    press.current = null
    if (p.refused) return // it already shook when the drag started
    if (p.dragging) return void drop(e, p)
    // A tap: a piece that can't be touched shakes "no", then the tap goes on as usual (a note may say why)
    if (p.glyph !== undefined) {
      store().refuseTap({ glyph: p.glyph })
      store().tapGlyphling(p.glyph)
    } else if (p.hand !== undefined) {
      store().refuseTap({ hand: p.hand })
      store().tapSeed(p.hand)
    } else if (p.draft) {
      store().refuseTap({ draft: true })
    } else if (p.hex) {
      store().refuseTap({ hex: p.hex })
      store().tapHex(p.hex)
    }
  }

  const onPointerCancel = (e: PointerEvent) => {
    if (press.current?.pointerId !== e.pointerId) return
    press.current = null
    carrierNow()?.cancel()
    setCarried(null)
    showDropTarget(undefined, null)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}

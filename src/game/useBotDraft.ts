// AN AI'S DRAFT, PLAYED LIKE A PERSON'S (F50 "AI looks human" — Muzzy: "if a human would drag, they should too… at
// least the same animation speeds"; 2026-10-10: "if the player's actions look a specific way, so too should the AI's").
// A person drafts by dragging a glyphling out of the tray in the draft's CARRY STYLE (content/tuning/drag.json
// styles.draft; usePieceInput): its home shows what the style says (A: empty), the piece is carried lifted, and a drop
// lands the style's way. When an AI on this device — or another player online — drafts (store.botDraft), the SAME
// carrier does the SAME: it lifts the glyphling off the SAME tray place ([data-draft="next"] — SeedTray shows the
// AI's waiting glyphlings while it drafts), travels to its hex at a glyphling's speed (glide.ts: moveBase +
// movePerHex × hexes — the one way a glyphling travels in this game), drops it there, and then it's placed
// (store.landBotDraft), exactly like a drop. No second look, no second set of timings.
// The browser animates it (ui-kit carrier, Web Animations) — no React state per frame.
// Reduce motion → the store places it at once (it never sets botDraft).
import { useEffect, useRef } from 'react'
import { hexKey } from '../engine/hex'
import { useGameStore } from '../store/gameStore'
import { carryStyle, createCarrier, originWhileCarried, type Carrier } from '../ui/kit'
import { glyphlingArt } from './art'
import { setCarried } from './carryState'
import { glideSecondsFor, stepsOnScreen } from './glide'
import { dragTuning } from './dragTuning'
import type { DragLayer } from './usePieceInput'
import { useAnimTuning } from './useTuning'

/** `size` = how big the piece is drawn if its tray place can't be measured (px); `hexWidth` = a board hex's width on screen. */
export function useBotDraft(drag: DragLayer, size: number, hexWidth: number) {
  const botDraft = useGameStore((s) => s.botDraft)
  const timing = useAnimTuning()
  const carrier = useRef<{ el: SVGImageElement; carry: Carrier } | null>(null)

  useEffect(() => {
    if (!botDraft) return
    const land = () => useGameStore.getState().landBotDraft()
    const game = useGameStore.getState().game
    const img = drag.image.current, layer = drag.layer.current
    const tray = document.querySelector('[data-draft="next"] image') ?? document.querySelector('[data-draft="next"]')
    const hex = document.querySelector(`.game-garden [data-hex="${hexKey(botDraft)}"]`) // (the board's own hex comes first)
    if (!game || !img || !layer || !tray || !hex) return land() // nothing on screen to move: just place it
    if (carrier.current?.el !== img) carrier.current = { el: img, carry: createCarrier(img, () => dragTuning.current) }
    const carry = carrier.current.carry
    // Where things are, in the drag layer's pixels; the piece is its tray place's size, like a person's drag
    const box = layer.getBoundingClientRect()
    const centreOf = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top }
    }
    const home = centreOf(tray), target = centreOf(hex)
    const width = tray.getBoundingClientRect().width
    const style = carryStyle(dragTuning.current.styles.draft)
    img.setAttribute('href', glyphlingArt(game.current))
    img.setAttribute('width', String(width > 0 ? width : size))
    img.setAttribute('height', String(width > 0 ? width : size))
    // Picked up (its tray place shows what the draft style says), carried over, dropped on its hex — then placed
    let cancelled = false
    setCarried({ piece: { kind: 'draft' }, origin: originWhileCarried(style), ghostOpacity: dragTuning.current.ghostOpacity })
    carry.start(style, home, width > 0 ? width : size)
    const seconds = glideSecondsFor(stepsOnScreen(Math.hypot(target.x - home.x, target.y - home.y), hexWidth), timing)
    void (async () => {
      await carry.travel(target, seconds)
      if (cancelled) return
      await carry.drop(target, home)
      if (cancelled) return
      setCarried(null)
      land()
    })()
    return () => { // (placed, or the game was left / jumped meanwhile)
      cancelled = true
      carry.cancel()
      setCarried(null)
    }
    // Only a new draft starts a travel (sizes and timing are read when it starts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botDraft])
}

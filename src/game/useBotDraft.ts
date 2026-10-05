// AN AI'S DRAFT, PLAYED LIKE A PERSON'S (F50 "AI looks human" — Muzzy: "if a human would drag, they should too… at
// least the same animation speeds"). A person drafts by dragging a glyphling out of the tray: it floats in the drag
// layer (usePieceInput) and is placed where it's dropped. When an AI on this device drafts (store.botDraft), the SAME
// floating piece leaves the SAME tray place ([data-draft="next"] — SeedTray shows the AI's waiting glyphlings while it
// drafts) and travels to its hex; then it's placed (store.landBotDraft), exactly like a drop.
// Its path and speed are the glyphling glide's (glide.ts: a straight line, moveBase + movePerHex × hexes, the moveSettle
// bounce) — the one way a glyphling travels in this game; no second animation, no second set of timings.
// The browser animates it (Web Animations on the drag layer's image) — no React state per frame.
// Reduce motion → the store places it at once (it never sets botDraft).
import { useEffect } from 'react'
import { hexKey } from '../engine/hex'
import { useGameStore } from '../store/gameStore'
import { glyphlingArt } from './art'
import { glideFrames, glideSecondsFor, stepsOnScreen } from './glide'
import type { DragLayer } from './usePieceInput'
import { useAnimTuning } from './useTuning'

/** `size` = how big the floating piece is drawn (px, the same as a person's drag); `hexWidth` = a board hex's width on screen. */
export function useBotDraft(drag: DragLayer, size: number, hexWidth: number) {
  const botDraft = useGameStore((s) => s.botDraft)
  const timing = useAnimTuning()

  useEffect(() => {
    if (!botDraft) return
    const land = () => useGameStore.getState().landBotDraft()
    const game = useGameStore.getState().game
    const img = drag.image.current, layer = drag.layer.current
    const tray = document.querySelector('[data-draft="next"]') // the AI's next glyphling, waiting in the tray
    const hex = document.querySelector(`.game-garden [data-hex="${hexKey(botDraft)}"]`) // (the board's own hex comes first)
    if (!game || !img || !layer || !tray || !hex) return land() // nothing on screen to move: just place it
    const box = layer.getBoundingClientRect()
    const a = centre(tray), b = centre(hex)
    // Drawn on its hex, started back at the tray and slid home — the glide's own frames and timing
    img.setAttribute('href', glyphlingArt(game.current))
    img.setAttribute('width', String(size))
    img.setAttribute('height', String(size))
    img.setAttribute('x', String(b.x - box.left - size / 2))
    img.setAttribute('y', String(b.y - box.top - size / 2))
    img.setAttribute('visibility', 'visible')
    const start = { x: a.x - b.x, y: a.y - b.y }
    const frames = glideFrames(start, timing.moveSettle * (hexWidth / 2)).map((f) => ({
      offset: f.offset, transform: `translate(${f.x}px, ${f.y}px)`, easing: 'ease-in-out',
    }))
    const seconds = glideSecondsFor(stepsOnScreen(Math.hypot(start.x, start.y), hexWidth), timing)
    const travel = img.animate(frames, { duration: seconds * 1000 })
    const hide = () => img.setAttribute('visibility', 'hidden')
    travel.onfinish = () => {
      hide()
      land()
    }
    return () => { // (placed, or the game was left / jumped meanwhile)
      travel.onfinish = null
      travel.cancel()
      hide()
    }
    // Only a new draft starts a travel (sizes and timing are read when it starts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botDraft])
}

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

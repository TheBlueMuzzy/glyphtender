// THE DRAFT TRAVEL FRAME CHECK (F50, shared with F43) — an AI's (or, online, another player's) draft placement must
// TRAVEL out of the tray to its hex like a person's drag (store.botDraft → src/game/useBotDraft.ts), never pop in.
// Used by e2e/ai-play.mjs (an AI on this device) and e2e/online-ai.mjs (another seat's placement online).
//   await page.evaluate(recordAiDraft) — before the placement; then wait for window.__f50.done
//   checkTravel({ check }, await page.evaluate(() => window.__f50))

/** In the page: records the AI's next draft every frame — where the tray's waiting glyphling and the target hex are, where
 *  the floating piece is, and whether the glyphling is on the board yet — into window.__f50. */
export function recordAiDraft() {
  const store = window.__glyphtender.store
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  const rec = { frames: [], done: false }
  window.__f50 = rec
  const stop = store.subscribe((s) => {
    if (!s.botDraft || rec.from) return
    stop()
    const key = `${s.botDraft.q},${s.botDraft.r}`
    rec.from = centre(document.querySelector('[data-draft="next"]'))
    rec.to = centre(document.querySelector(`.game-garden [data-hex="${key}"]`))
    rec.hexWidth = document.querySelector(`.game-garden [data-hex="${key}"]`).getBoundingClientRect().width
    rec.placedBefore = s.game.glyphlings.length
    const step = () => {
      const now = store.getState()
      const img = document.querySelector('.game-drag-layer [data-bot-draft]') // (the AI's travelling glyphling — not the preview or the carried piece)
      rec.frames.push({ shown: img.getAttribute('visibility') === 'visible', ...centre(img), placed: now.game.glyphlings.length, travelling: now.botDraft !== null })
      if (now.botDraft) return requestAnimationFrame(step)
      rec.landedAt = now.game.glyphlings.find((g) => `${g.hex.q},${g.hex.r}` === key) ? key : null
      rec.done = true
    }
    requestAnimationFrame(step)
  })
}

/** The AI's draft travelled: shown from the tray slot to its hex over several frames, placed only once it arrived. */
export function checkTravel(h, t) {
  const moving = t.frames.filter((f) => f.travelling && f.shown)
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= t.hexWidth * 0.75
  const spots = new Set(moving.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`))
  h.check(`the AI's draft travels over several frames (${moving.length} frames, ${spots.size} spots)`, moving.length >= 5 && spots.size >= 4)
  h.check("it leaves from the tray's waiting glyphling", moving.length > 0 && near(moving[0], t.from))
  h.check('it arrives on its hex', moving.length > 0 && near(moving[moving.length - 1], t.to))
  h.check('it is not on the board until it arrives (no pop)', t.frames.filter((f) => f.travelling).every((f) => f.placed === t.placedBefore))
  h.check('then it is placed on that hex, and the floating piece is gone', t.landedAt !== null && !t.frames[t.frames.length - 1].shown)
}

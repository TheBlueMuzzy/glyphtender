// EXPLORE MODE (F79, design/tutorial.md §6) — the ? button beside ☰ (TurnBar.tsx) turns it on (store/explore.ts).
// Mounted on the game screen in every game. While it's on:
//   · the prompt's place says "Explore — tap anything. / Tap ? to go back." (PromptLine.tsx) and the ? stays lit
//   · a game on this device pauses — the AIs wait (localBot.ts); online the room plays on
//   · EVERY tap on the game explains instead of acting: this layer catches the press before the game sees it (a
//     window listener in the capture phase — so no drag starts, no button presses, ☰ doesn't open), works out what is
//     under the finger (even under the dim, and on a disabled button) and shows a kit Callout: the thing lit, the rest
//     dimmed (tuning/tutorial.json exploreDim), the words from explore.ts explain() → en.json tutorial.explore
//   · tapping empty space or the callout closes it; Explore stays on. Only ? (or Esc) leaves.
//   · a small callout at the ? reminds "Tap ? to go back to the game." on entering, and again after exploreRemind
//     seconds without a tap
//   · Explore ends by itself when the game needs you (explore.ts exploreEnds: the reveal, the handoff, any kit screen,
//     online: the idle warning, a bot playing for you, the connection, back to the lobby). A callout whose thing moves,
//     changes or disappears (online: another player's turn plays out) closes.
import { useEffect, useRef, useState } from 'react'
import text from '../../content/text/en.json'
import tutorialFile from '../../content/tuning/tutorial.json'
import { useLiveTuning } from '../devkit/tuning/liveTuning'
import type { Hex } from '../engine/hex'
import { playerName } from '../game/prompt'
import { setExploring, useExplore } from '../store/explore'
import { useGameStore, type GameStore } from '../store/gameStore'
import { viewerOf } from '../store/viewer'
import { Callout, fill, useScreens, type CalloutPlacement } from '../ui/kit'
import { useOnline } from '../ui/online/session'
import { explain, exploreEnds, type Explained, type ExplorePart, type Tapped } from './explore'

const words = text.tutorial.explore

/** The words for a key like "part.menu", filled in. */
function wordsFor({ key, values }: Explained): string {
  const line = key.split('.').reduce<unknown>((at, k) => (at as Record<string, unknown> | undefined)?.[k], words)
  return typeof line === 'string' ? fill(line, values) : ''
}

const hexOf = (key: string | null | undefined): Hex | null => {
  if (!key) return null
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}
const cellOf = (key: string | null) => (key ? document.querySelector(`.game-garden > polygon[data-hex="${key}"]`) : null)
const optionHexes = (kind: string) =>
  [...document.querySelectorAll(`.game-garden [data-option="${kind}"] polygon[data-hex]`)].flatMap((el) => hexOf(el.getAttribute('data-hex')) ?? [])

const BUTTONS: Record<string, ExplorePart> = { plant: 'plant', 'keep-all': 'keepAll', refresh: 'refresh', undo: 'undo', shuffle: 'shuffle', retry: 'retry' }

/** What a tap on this element is, and what the callout points at — or null (empty space: nothing to explain). */
function tappedAt(el: Element): { tapped: Tapped; target: Element } | null {
  const part = el.closest('[data-part]')
  if (part) return { tapped: { kind: 'part', part: part.getAttribute('data-part') as ExplorePart }, target: part }
  const button = el.closest('button[data-action]')
  if (button) {
    const action = button.getAttribute('data-action') ?? ''
    const which = action === 'plant' && button.hasAttribute('data-end-turn') ? 'endTurn' : BUTTONS[action]
    return which ? { tapped: { kind: 'part', part: which }, target: button } : null
  }
  // Board pieces: the callout points at their hex (a glyphling pulses — its hex holds still)
  const glyph = el.closest('[data-glyph]')
  if (glyph) {
    const cell = cellOf(glyph.getAttribute('data-hex'))
    return { tapped: { kind: 'glyphling', id: Number(glyph.getAttribute('data-glyph')) }, target: cell ?? glyph }
  }
  const ghost = el.closest('[data-moved-from]')
  if (ghost) return { tapped: { kind: 'part', part: 'ghost' }, target: cellOf(ghost.getAttribute('data-hex')) ?? ghost }
  const hand = el.closest('[data-hand]')
  if (hand) return { tapped: { kind: 'traySeed', id: hand.getAttribute('data-hand') ?? '' }, target: hand }
  const draft = el.closest('[data-draft]')
  if (draft) return { tapped: { kind: 'part', part: 'draft' }, target: draft }
  const onBoard = el.closest('.game-garden [data-hex]')
  const hex = hexOf(onBoard?.getAttribute('data-hex'))
  if (hex) return { tapped: { kind: 'hex', hex }, target: cellOf(onBoard!.getAttribute('data-hex')) ?? onBoard! }
  if (el.closest('.game-prompt')) {
    const row = document.querySelector('.game-prompt-row:not(.game-prompt-sizer)')
    if (row) return { tapped: { kind: 'part', part: 'prompt' }, target: row }
  }
  const bar = el.closest('.game-turn-bar')
  if (bar) return { tapped: { kind: 'part', part: 'turnBar' }, target: bar }
  return null
}

/** What a press at this point is for Explore: the callout's bubble, the ? (leave), a thing in the game, empty space
 *  (the dim, or nothing explainable), or null — not on the game at all (a toast, a box over it): left alone. */
type Hit = { kind: 'bubble' } | { kind: 'exit' } | { kind: 'empty' } | { kind: 'thing'; el: Element }
function hitAt(x: number, y: number): Hit | null {
  const stack = document.elementsFromPoint(x, y)
  if (stack[0]?.closest('.kit-callout')) return { kind: 'bubble' }
  const under = stack.find((el) => !el.closest('.kit-callout-layer')) // (through the dim: what's under the finger)
  if (!under || !under.closest('.game')) return stack[0]?.closest('.kit-callout-layer') ? { kind: 'empty' } : null
  return hitOn(under)
}
function hitOn(el: Element): Hit | null {
  if (el.closest('.kit-callout')) return { kind: 'bubble' }
  if (!el.closest('.game')) return null
  if (el.closest('[data-explore-button]')) return { kind: 'exit' }
  return { kind: 'thing', el }
}

/** The facts that close Explore by itself (explore.ts exploreEnds), from the stores — closed when the game needs you. */
function useExploreEnds(on: boolean) {
  const inGame = useGameStore((s) => s.game !== null)
  const phase = useGameStore((s) => s.game?.phase ?? null)
  const handoff = useGameStore((s) => s.handoff !== null)
  const online = useGameStore((s) => s.online !== null)
  const room = useOnline((s) => s.room)
  const screens = useScreens().length
  const reason = exploreEnds({
    inGame, phase, handoff, screens,
    online: online && room ? { status: room.status, idleWarning: room.idleWarning !== null, botPlaysForMe: room.botPlaysForMe, roomPhase: room.room?.phase ?? null } : null,
  })
  useEffect(() => { if (on && reason) setExploring(false) }, [on, reason])
}

export function ExploreLayer() {
  const on = useExplore((s) => s.on)
  useExploreEnds(on)
  useEffect(() => () => setExploring(false), []) // (the game screen closed: Explore is over)
  return on ? <Exploring /> : null
}

interface Shown {
  n: number
  tapped: Tapped
  target: Element
  /** The Plant button's Magic when it was tapped (data-magic). */
  magic: number | null
  /** What the words were, and what the target looked like, when tapped: if either changes, the callout closes. */
  words: string
  look: string
}

/** What the target looks like now (where it is, its label) — a change means it moved or became something else. */
const lookOf = (el: Element) => {
  const r = el.getBoundingClientRect()
  return [r.left, r.top, r.width, r.height].map(Math.round).join() + `|${el.getAttribute('data-action') ?? ''}|${el.textContent ?? ''}`
}

/** The explanation for a tapped thing right now (the board's glowing options are read off the screen). */
function explainNow(tapped: Tapped, magic: number | null, s: GameStore): Explained | null {
  if (!s.game) return null
  return explain(tapped, s.game, viewerOf(s), playerName, {
    planned: s.cast?.target ?? null, moveOptions: optionHexes('move'), plantOptions: optionHexes('cast'), magic,
  })
}

function Exploring() {
  const tuning = useLiveTuning('tutorial', tutorialFile)
  const [shown, setShown] = useState<Shown | null>(null)
  const [remind, setRemind] = useState(true) // (entering Explore: the reminder at the ?)
  const [taps, setTaps] = useState(0)
  const count = useRef(0)

  // The reminder comes back after exploreRemind seconds without a tap (it takes the explanation's place)
  useEffect(() => {
    const timer = setTimeout(() => { setShown(null); setRemind(true) }, tuning.current.exploreRemind * 1000)
    return () => clearTimeout(timer)
  }, [taps, tuning])

  // Every press on the game is caught here first (capture phase, on the window) — the game never sees it
  useEffect(() => {
    let down: number | null = null // the press that taps (the first finger)
    const caught = new Set<number>() // every press on the game — a 2nd finger too, so it can't start a drag (review)
    const tapped = (hit: Hit) => {
      setTaps((n) => n + 1)
      setRemind(false)
      if (hit.kind !== 'thing') return setShown(null)
      const found = tappedAt(hit.el)
      const s = useGameStore.getState()
      const magicAttr = found?.target.getAttribute('data-magic')
      const magic = magicAttr ? Number(magicAttr) : null
      const said = found && explainNow(found.tapped, magic, s)
      if (!found || !said) return setShown(null)
      count.current += 1
      setShown({ n: count.current, tapped: found.tapped, target: found.target, magic, words: JSON.stringify(said), look: lookOf(found.target) })
    }
    const onDown = (e: PointerEvent) => {
      if (!hitAt(e.clientX, e.clientY)) return
      e.stopPropagation()
      caught.add(e.pointerId)
      if (e.isPrimary) down = e.pointerId
    }
    const onMove = (e: PointerEvent) => { if (caught.has(e.pointerId)) e.stopPropagation() }
    const onUp = (e: PointerEvent) => {
      if (!caught.delete(e.pointerId)) return
      e.stopPropagation()
      if (e.pointerId !== down) return
      down = null
      const hit = hitAt(e.clientX, e.clientY)
      if (hit && hit.kind !== 'exit') tapped(hit) // (the ? leaves on its click, below)
    }
    const onCancel = (e: PointerEvent) => { if (caught.delete(e.pointerId)) { if (e.pointerId === down) down = null; e.stopPropagation() } }
    // A click never reaches the game either. The ? (or Enter / Space on it) leaves; a key's click on another button explains it.
    const onClick = (e: MouseEvent) => {
      const keyboard = e.detail === 0
      const hit = keyboard ? hitOn(e.target as Element) : hitAt(e.clientX, e.clientY)
      if (!hit) return
      e.stopPropagation()
      e.preventDefault()
      if (hit.kind === 'exit') setExploring(false)
      else if (keyboard) tapped(hit)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      setExploring(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  // The thing it points at moved, changed or disappeared (online, another player's turn plays out): it closes
  useEffect(() => {
    if (!shown) return
    return useGameStore.subscribe((s) => {
      const now = explainNow(shown.tapped, shown.magic, s)
      if (!now || JSON.stringify(now) !== shown.words) setShown(null)
    })
  }, [shown])
  useEffect(() => {
    if (!shown) return
    let frame = 0
    const watch = () => {
      if (!shown.target.isConnected || lookOf(shown.target) !== shown.look) return setShown(null)
      frame = requestAnimationFrame(watch)
    }
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [shown])

  if (shown) {
    return (
      <Callout key={shown.n} target={shown.target} text={wordsFor(JSON.parse(shown.words) as Explained)} placement={placementOf(shown.target)}
        dim dimAmount={tuning.current.exploreDim} label={text.game.buttons.explore} onDismiss={() => setShown(null)} />
    )
  }
  if (remind && !barUnderButton()) {
    return <Callout key="remind" target="[data-explore-button]" text={words.remind} placement="bottom" label={text.game.buttons.explore} onDismiss={() => setRemind(false)} />
  }
  return null
}

/** Is the Explore bar (in the prompt's place) right under the ? — beside the board on a short screen, a phone on its
 *  side? There the reminder would cover the bar, whose own small line already says "Tap ? to go back." right under
 *  the ?, so the reminder stays away (the ? sits too near the top edge for a callout beside it). */
function barUnderButton(): boolean {
  const button = document.querySelector('[data-explore-button]')?.getBoundingClientRect()
  const prompt = document.querySelector('.game-prompt-row:not(.game-prompt-sizer)')?.getBoundingClientRect()
  if (!button || !prompt) return false
  const under = prompt.left < button.right && prompt.right > button.left
  return under && prompt.top - button.bottom < REMIND_ROOM
}
const REMIND_ROOM = 96 // px: about a 1-line callout + its pointer and edge room

/** Where a callout goes first: on the board, toward the nearer of the top bar and the tray (above a thing in the board's
 *  top half, below one in its bottom half — it covers as few rows as it can); the top bar's parts: below; the rest
 *  (the tray, the buttons, the prompt): above, in the prompt's place. */
function placementOf(target: Element): CalloutPlacement {
  const board = target.closest('.game-garden')
  if (board) {
    const middle = (r: DOMRect) => (r.top + r.bottom) / 2
    return middle(target.getBoundingClientRect()) < middle(board.getBoundingClientRect()) ? 'top' : 'bottom'
  }
  if (target.closest('.game-bar')) return 'bottom'
  return 'top'
}

// EMOTES — the parts a game's table talk is built from (framework F107; the emotes module, src/emotes, drives them —
// these parts know nothing about phrases, limits or mutes, they only draw).
//
// <SpeechBubble target="#seat-2" text="Well played!" sizeTo={allPhrases} showMs={2500} onDone={hide} />
//   A Callout with no button that fades by itself — same intention (words pointing at a thing) → the same shape, the
//   same placement maths and the same look in every style. It points at the seat, flips to stay inside the window (or
//   the game picture) and, with `avoid` (a CSS selector: the HUD), clear of it — and always clear of the other bubbles
//   showing. FIXED SIZE from the start: wide and
//   tall enough for the longest of `sizeTo` (all the phrases in the current language), so "Wow!" and a long line never
//   resize it. It never catches taps and is hidden from screen readers (LiveAnnouncer says it once instead).
//   Give a new emote from the same seat a new React key: it replaces the old one in place (no stacking, no queue).
//   Pops in with the style's entrance at motion-fast; fades out at motion-fast. Reduce motion: no pop, it just
//   appears, then fades.
// <EmotePicker anchor="#my-seat" phrases={[{ id, label }]} onPick={send} onClose={close} readyIn={ms} />
//   Opened from the player's OWN seat: a small panel of the phrases (44px+ buttons; two columns on a phone, one row on
//   a wide screen), anchored like a Callout. Escape or a tap outside closes it. While `readyIn` > 0 (the spam limit)
//   the buttons are dimmed with a filling ring until one is back — nothing is queued, nothing pops up.
// <MuteMenu anchor="#seat-2" name="Ada" muted={false} onToggle={…} onClose={close} />
//   Opened from an OPPONENT's seat: one button, "Mute emotes" / "Unmute emotes". The muted player isn't told.
// <MutedMark /> — a small crossed speech bubble for a muted seat's chip (read out "Emotes muted": never colour alone).
// <LiveAnnouncer text="Ada: Well played!" stamp={n} /> — says it politely, at most one line a second, the rest skipped.
// announce("…") (0.32.0) — the same, from anywhere, no limit. Both go through the page's ONE lasting live region.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, Text } from '../controls'
import { type CalloutPlacement, type CalloutTarget } from './callout'
import { toMilliseconds } from './motion'
import { useCalloutPlace, useShownPopover, type CalloutPlaceInput } from './teach'

export const emoteWords = {
  picker: 'Emotes',
  mute: 'Mute emotes',
  unmute: 'Unmute emotes',
  muted: 'Emotes muted',
}

// The style's quick motion time, in ms (the bubble's fade)
const fastMs = () => (typeof document === 'undefined' ? 0 : toMilliseconds(getComputedStyle(document.documentElement).getPropertyValue('--motion-fast'), 120))

// ─── The speech bubble ──────────────────────────────────────────────

export type SpeechBubbleProps = {
  target: CalloutTarget
  text: string
  /** Every phrase it may ever show (in the current language): it is sized once to the longest. */
  sizeTo?: readonly string[]
  /** How long it shows before fading (content/emotes.json bubble — the emotes module's bubbleMs()). */
  showMs: number
  placement?: CalloutPlacement
  /** A CSS selector of what it must stay clear of (the HUD). One that holds the target itself doesn't count. */
  avoid?: string
  /** Faded out: take it off the page. */
  onDone?: () => void
}

export function SpeechBubble({ target, text, sizeTo = [], showMs, placement = 'top', avoid, onDone }: SpeechBubbleProps) {
  const layer = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  // Bubbles also stay off each other (two seats side by side would otherwise stack their words)
  const clearOf = avoid ? `${avoid}, .kit-speech` : '.kit-speech'
  const now = useRef<CalloutPlaceInput>({ target, placement, avoid: clearOf })
  const done = useRef(onDone)
  useLayoutEffect(() => { now.current = { target, placement, avoid: clearOf }; done.current = onDone })
  useShownPopover(layer)
  useCalloutPlace(layer, bubble, now)

  // Shows for showMs, then fades (motion-fast), then it's done. A new emote = a new key = a fresh timer.
  useEffect(() => {
    let fading = 0
    const showing = window.setTimeout(() => {
      layer.current?.setAttribute('data-leaving', '')
      fading = window.setTimeout(() => done.current?.(), fastMs())
    }, showMs)
    return () => { clearTimeout(showing); clearTimeout(fading) }
  }, [showMs])

  // The sizers: every phrase in one grid cell, unseen — the cell (so the bubble) is the size of the biggest
  const sizers = [...new Set([...sizeTo, text])]
  const content = (
    <div ref={layer} {...{ popover: 'manual' }} className="kit-scope kit-callout-layer kit-speech-layer" aria-hidden="true">
      <div className="kit-callout-frame" />
      <div ref={bubble} className="kit-callout kit-speech">
        <div className="kit-callout-body kit-speech-body">
          {sizers.map((words) => <span key={`size-${words}`} className="kit-speech-sizer"><Text kind="label">{words}</Text></span>)}
          <span className="kit-speech-text"><Text kind="label">{text}</Text></span>
        </div>
        <span className="kit-callout-tip" />
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(content, document.body)
}

// ─── A panel pointing at a seat (the picker and the mute menu) ───────

type PointedPanelProps = {
  anchor: CalloutTarget; label: string; onClose: () => void
  placement?: CalloutPlacement; avoid?: string; className?: string; children: ReactNode
}

function PointedPanel({ anchor, label, onClose, placement = 'top', avoid, className = '', children }: PointedPanelProps) {
  const layer = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const now = useRef<CalloutPlaceInput>({ target: anchor, placement, avoid })
  const close = useRef(onClose)
  useLayoutEffect(() => { now.current = { target: anchor, placement, avoid }; close.current = onClose })
  useShownPopover(layer)
  useCalloutPlace(layer, bubble, now)

  // Escape or a tap outside closes it (a tap on the seat it came from too: that's the seat's own toggle); the focus
  // goes into it on open and back where it was on close
  // The focus goes back in a LAYOUT effect's cleanup: that runs before React takes the panel out of the page. A plain
  // effect's cleanup runs after, when the focus has already dropped to <body> — so it never came back to the seat
  // (F109 review: Escape on a seat's Mute menu lost the focus).
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const panel = bubble.current
    return () => { if (before?.isConnected && panel?.contains(document.activeElement)) before.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    const panel = bubble.current
    panel?.querySelector<HTMLElement>('button:not([aria-disabled="true"]), button')?.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close.current() } }
    const tap = (event: PointerEvent) => {
      const inside = panel?.contains(event.target as Node)
      const anchorEl = typeof now.current.target === 'string' ? document.querySelector(now.current.target) : now.current.target instanceof Element ? now.current.target : null
      if (!inside && !anchorEl?.contains(event.target as Node)) close.current()
    }
    document.addEventListener('keydown', key, true)
    document.addEventListener('pointerdown', tap, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', tap, true)
    }
  }, [])

  const content = (
    <div ref={layer} {...{ popover: 'manual' }} className="kit-scope kit-callout-layer kit-pointed-layer">
      <div className="kit-callout-frame" aria-hidden />
      <div ref={bubble} className={`kit-callout kit-pointed ${className}`} role="dialog" aria-label={label}>
        <div className="kit-callout-body">{children}</div>
        <span className="kit-callout-tip" aria-hidden />
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(content, document.body)
}

// ─── The picker ─────────────────────────────────────────────────────

export type EmotePickerProps = {
  /** The player's own seat (its chip / portrait). */
  anchor: CalloutTarget
  /** The phrases in picker order, with their words in the current language. */
  phrases: readonly { id: string; label: string }[]
  onPick: (id: string) => void
  onClose: () => void
  /** ms until the next send is allowed (the spam limit): the buttons dim with a filling ring until then. */
  readyIn?: number
  placement?: CalloutPlacement
  avoid?: string
  words?: Partial<typeof emoteWords>
}

export function EmotePicker({ anchor, phrases, onPick, onClose, readyIn = 0, placement = 'top', avoid, words }: EmotePickerProps) {
  const w = { ...emoteWords, ...words }
  const cooling = readyIn > 0
  return (
    <PointedPanel anchor={anchor} label={w.picker} onClose={onClose} placement={placement} avoid={avoid} className="kit-emote-picker">
      {/* (a new key each time a cooldown starts, so the ring starts filling from empty) */}
      <div className="kit-emote-grid" data-cooling={cooling || undefined} key={cooling ? `cool-${Math.round(readyIn / 100)}` : 'ready'}
        style={{ '--kit-emote-count': phrases.length, '--kit-emote-wait': `${Math.round(readyIn)}ms` } as CSSProperties}>
        {phrases.map((phrase) => (
          <span key={phrase.id} className="kit-emote-slot">
            <Button variant="secondary" compact className="kit-emote-button" data-emote={phrase.id}
              aria-disabled={cooling || undefined} onClick={() => { if (!cooling) onPick(phrase.id) }}>
              {phrase.label}
            </Button>
            {cooling && <span className="kit-emote-ring" aria-hidden />}
          </span>
        ))}
      </div>
    </PointedPanel>
  )
}

// ─── The mute menu ──────────────────────────────────────────────────

export type MuteMenuProps = {
  /** The opponent's seat. */
  anchor: CalloutTarget
  /** Their name (read out with the menu). */
  name: string
  muted: boolean
  onToggle: (muted: boolean) => void
  onClose: () => void
  placement?: CalloutPlacement
  avoid?: string
  words?: Partial<typeof emoteWords>
}

export function MuteMenu({ anchor, name, muted, onToggle, onClose, placement = 'top', avoid, words }: MuteMenuProps) {
  const w = { ...emoteWords, ...words }
  return (
    <PointedPanel anchor={anchor} label={name} onClose={onClose} placement={placement} avoid={avoid} className="kit-mute-menu">
      <Button variant="secondary" compact data-mute={muted ? 'on' : 'off'} onClick={() => { onToggle(!muted); onClose() }}>
        {muted ? w.unmute : w.mute}
      </Button>
    </PointedPanel>
  )
}

// ─── The muted mark ─────────────────────────────────────────────────

/** A crossed speech bubble, in the text colour, for a muted seat's chip (PlayerChip `badge`). */
export function MutedMark({ label = emoteWords.muted }: { label?: string }) {
  return (
    <span className="kit-muted-mark" role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 5h16v10H10l-4 4v-4H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

// ─── The announcer ──────────────────────────────────────────────────

// ONE LASTING LIVE REGION PER PAGE (0.32.0, F116). Screen readers only read a live region's CHANGES — one created
// together with its text is often skipped (the sprint 29 review: a remounted bubble's line went unsaid). So the kit
// keeps a single region per document: made the first time anything announces (or a LiveAnnouncer / TalkingBubble
// mounts), added straight to <body> (outside any screen, so a screen's slide or a remount never takes it away), and
// never removed; each line only changes its text. Its very first line waits a moment (FIRST_LINE_MS) so the region is
// already on the page before its text arrives. The same line twice is still said twice: the text then toggles a
// trailing no-break space (a change a screen reader hears as the same words). If something removes it (a game that
// clears <body>), the next line makes a new one.
// Why this and not a provider: nothing for a game to wrap or forget, and two parts (or two installed modules) can't
// end up with two regions talking over each other.
type Live = { el: HTMLElement; ready: boolean; at: number; pending: string | null }
const regions = new WeakMap<Document, Live>()
const FIRST_LINE_MS = 100
const SAME_AGAIN = ' '

/** The page's one live region (made now if there isn't one yet). */
export function liveRegion(doc: Document = document): HTMLElement {
  const known = regions.get(doc)
  if (known?.el.isConnected) return known.el
  const el = doc.createElement('div')
  el.className = 'kit-sr-only kit-live'
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
  doc.body.appendChild(el)
  const live: Live = { el, ready: false, at: Date.now(), pending: null }
  regions.set(doc, live)
  setTimeout(() => { live.ready = true; if (live.pending !== null) say(live, live.pending) }, FIRST_LINE_MS)
  return el
}

function say(live: Live, text: string) {
  live.pending = null
  live.el.textContent = live.el.textContent === text ? text + SAME_AGAIN : text
}

/** Says `text` once, politely, through the page's one live region (the same line again is said again). */
export function announce(text: string, doc?: Document) {
  if (typeof document === 'undefined' || !text) return
  const page = doc ?? document
  liveRegion(page)
  const live = regions.get(page)!
  if (!live.ready && Date.now() - live.at >= FIRST_LINE_MS) live.ready = true // (a timer that never ran: fake clocks)
  if (live.ready) say(live, text)
  else live.pending = text // the newest line waits for the region's first moment
}

/** Each new `stamp` says `text` once through the page's live region — but at most one line every `minGapMs`; lines
 *  in between are skipped (a burst of emotes must not bury the game's own announcements). Draws nothing itself
 *  (0.32.0: it used to be its own region, made together with its text). */
export function LiveAnnouncer({ text, stamp, minGapMs = 1000 }: { text: string; stamp: number | string; minGapMs?: number }) {
  const last = useRef(-Infinity)
  useEffect(() => { liveRegion() }, []) // on the page before the first line
  useEffect(() => {
    if (!text) return
    const at = Date.now()
    if (at - last.current < minGapMs) return
    last.current = at
    announce(text)
  }, [stamp, text, minGapMs])
  return null
}

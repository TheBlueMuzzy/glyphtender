// IN GAME — Pause, the HUD frame, and the HUD pieces that go in it.
// HUD pieces never catch taps (the game underneath gets them); only their buttons do.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Panel, Row, Screen, Stack } from '../layout'
import { Avatar, Badge, Button, ProgressBar, Text, controlSound } from '../controls'
import { screens } from '../screens'
import { askConfirm, Modal } from './dialogs'
import { useFixedSize } from '../fixedSize'
import { useCountUp } from './motion'
import { fill } from './words'
import { shown } from '../shown'

// PAUSE — a dialog over the game. Resume closes it; Quit asks first (turn off with confirmQuit={false}).
// note: one quiet caption line under the title, above the buttons (e.g. this game's settings: "Small garden · 2-letter words off").
// items (0.8.0): the game's own rows, after How to play and before Quit (e.g. "Submit a word"); disabled rows stay visible.
// No ‹ in its header (0.10.0): Resume is the way back. Its title uses the menu header like every other card.
export const pauseWords = { title: 'Paused', resume: 'Resume', settings: 'Settings', howToPlay: 'How to play', quit: 'Quit', quitTitle: 'Quit this game?', quitMessage: 'Your progress in this round will be lost.' }
type PauseProps = {
  onResume?: () => void; onSettings?: () => void; onHowToPlay?: () => void; onQuit?: () => void
  confirmQuit?: boolean; note?: ReactNode; words?: Partial<typeof pauseWords>
  items?: { label: ReactNode; onClick: () => void; disabled?: boolean }[]
}
export function Pause({ onResume = () => screens.pop(), onSettings, onHowToPlay, onQuit, confirmQuit = true, note, words, items = [] }: PauseProps) {
  const w = { ...pauseWords, ...words }
  const quit = () => confirmQuit && onQuit
    ? askConfirm({ title: w.quitTitle, message: w.quitMessage, danger: true, onConfirm: onQuit, words: { yes: w.quit } })
    : onQuit?.()
  return (
    <Modal title={w.title} className="kit-pause">
      {shown(note) && <Text kind="caption">{note}</Text>}
      <Stack gap="s" className="kit-menu">
        <Button sound="back" onClick={onResume}>{w.resume}</Button>
        {onSettings && <Button variant="secondary" onClick={onSettings}>{w.settings}</Button>}
        {onHowToPlay && <Button variant="secondary" onClick={onHowToPlay}>{w.howToPlay}</Button>}
        {items.map((item, i) => <Button key={i} variant="secondary" disabled={item.disabled} onClick={item.onClick}>{item.label}</Button>)}
        {onQuit && <Button variant="danger" onClick={quit}>{w.quit}</Button>}
      </Stack>
    </Modal>
  )
}

// HUD FRAME — the usual places: vitals top-left, pause + money top-right, timer/score/turn
// top-centre, actions along the bottom, banners in the middle. Pass only what your game shows.
// oneRow (0.17.0): the status stays in the corners' row on a phone too (one top row: vitals · status · pause), instead
// of dropping to a row of its own — for a game that needs every pixel of height (Goops: the tank starts right under
// it). The status gets the room between the corners; pair it with HudText `fit` so long words shrink to that room.
// dock (0.17.0): a solid panel docked to the HUD column's bottom edge, edge to edge, for the meters a game wants
// right under its play area (Goops: machine bars + integrity under the tank). Its height is --kit-hud-dock-size (the
// game sets it, like --kit-hud-w, so it can keep its play area clear of it; default 6rem); it grows only if its
// contents need more. dockSide="right": a column in the bottom-right corner instead, --kit-hud-dock-size wide, as
// tall as its contents (a phone on its side has no height to spare). The dock shows meters only: it lets taps
// through to the game, like the HUD's slots. dockTight (0.25.0, Goops): the dock panel's sides get the small gap
// instead of the medium one, for a row that needs the width on a narrow phone (still clear of the edge).
export const hudWords = { label: 'Game HUD', pause: 'Pause' }
type HudProps = {
  vitals?: ReactNode; status?: ReactNode; currency?: ReactNode; onPause?: () => void
  actions?: ReactNode; banner?: ReactNode; bottomLeft?: ReactNode; bottomRight?: ReactNode
  oneRow?: boolean; dock?: ReactNode; dockSide?: 'bottom' | 'right'; dockTight?: boolean
  words?: Partial<typeof hudWords>
}
export function Hud({ vitals, status, currency, onPause, actions, banner, bottomLeft, bottomRight, oneRow, dock, dockSide = 'bottom', dockTight, words }: HudProps) {
  const w = { ...hudWords, ...words }
  // Each slot's contents sit in kit-hud-slot, which lets taps through to the game (blocks.css)
  const slot = (content: ReactNode, one?: boolean) => (shown(content) ? <div className="kit-hud-slot" data-one-row={one || undefined}>{content}</div> : null)
  const pause = onPause && <Button variant="secondary" icon aria-label={w.pause} onClick={onPause}>❚❚</Button>
  const screen = (
    <Screen label={w.label} topLeft={slot(vitals)} top={slot(status, oneRow)}
      topRight={slot((shown(currency) || pause) && <Row gap="s">{currency}{pause}</Row>)}
      bottomLeft={slot(bottomLeft)} bottom={slot(actions)} bottomRight={slot(bottomRight)}>
      {slot(banner)}
    </Screen>
  )
  if (!dock) return screen
  return (
    <>
      {screen}
      <div className="kit-hud-dock kit-scope" data-side={dockSide} data-tight={dockTight || undefined}><Panel gap="s">{dock}</Panel></div>
    </>
  )
}

// A small readable plate behind a HUD piece, so it shows up over any game art.
type ChipProps = { children: ReactNode; active?: boolean; role?: string; 'aria-label'?: string; 'data-width'?: string
  'data-thickness'?: string; 'data-alert'?: string; 'data-label-at'?: string; 'data-wrap'?: boolean; style?: CSSProperties }
function Chip({ children, active, ...rest }: ChipProps) {
  return <Row gap="s" className="kit-hud-chip" data-state={active ? 'active' : undefined} {...rest}>{children}</Row>
}

// PIPS — a row of little segments, some filled (hearts, lives, page dots, "3 of 5").
export function Pips({ count, filled, label }: { count: number; filled: number; label: string }) {
  return (
    <Row gap="xs" className="kit-pips" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={count} aria-valuenow={filled}>
      {Array.from({ length: count }, (_, i) => <span key={i} className="kit-pip" data-state={i < filled ? 'on' : undefined} />)}
    </Row>
  )
}

// BAR — health, XP, energy… value out of max. pips: draw it as segments (hearts, lives) instead.
// width: how long the bar is — 's' short, 'm' medium, 'l' long. Without it the bar fills the room it's given.
// showLabel: print the label beside the bar (two bars with no icons look the same — Goops pressure + tank, 0.11.1).
// 0.17.0 (Goops' bottom panel):
//   width can also be a share of the row it sits in (0.24 = 24%); the bar never gets narrower than its label above.
//   atMost (0.25.0, Goops): with a share, the bars in a row share its room evenly, each AT MOST its share — so three
//     named bars fit a narrow phone instead of each taking exactly its share.
//   labelAt: where the label prints — 'beside' (= showLabel), 'above' (big, centred over the bar) or 'inside'
//     (centred on the bar itself, readable over the fill and the empty part alike).
//   thickness: s (default, as before) · m · l — a thick bar reads at a glance.
//   plain: no plate — for bars sitting on a panel already (a plate on a panel is a box in a box).
//   alert: call attention to it — 'pulse' (running low: a ring in the bar's colour, a glow breathing out of it, the
//     same pulse as a teaching callout's) · 'flash' (broken: the pulse, and the fill blinks). Pass variant="danger"
//     with it to turn the bar red. Reduce motion: the ring just stays lit and the fill stays on.
type BarProps = {
  label: string; value: number; max?: number; variant?: 'primary' | 'accent' | 'danger'; pips?: boolean; icon?: ReactNode
  width?: 's' | 'm' | 'l' | number; showLabel?: boolean; labelAt?: 'beside' | 'above' | 'inside'
  thickness?: 's' | 'm' | 'l'; plain?: boolean; alert?: 'pulse' | 'flash'; atMost?: boolean
}
export function Bar({ label, value, max = 100, variant = 'primary', pips, icon, width, showLabel, labelAt = showLabel ? 'beside' : undefined,
  thickness, plain, alert, atMost }: BarProps) {
  const share = typeof width === 'number' ? width : undefined
  const meter = pips ? <Pips count={max} filled={value} label={label} /> : <ProgressBar label={label} value={value / max} variant={variant} />
  // the label inside: the bar and its words share one grid cell, the words on top
  const bar = labelAt === 'inside' && !pips
    ? <div className="kit-bar-inside">{meter}<span className="kit-bar-label-inside" aria-hidden="true">{label}</span></div>
    : meter
  const attrs = {
    'data-width': share !== undefined ? (atMost ? 'at-most' : 'share') : width as string | undefined, 'data-thickness': thickness, 'data-alert': alert,
    'data-label-at': labelAt, style: share !== undefined ? { '--kit-bar-share': share } as CSSProperties : undefined,
  }
  const parts = (
    <>
      {shown(icon) && <span className="kit-hud-icon" data-symbol={typeof icon === 'string' || undefined} aria-hidden="true">{icon}</span>}
      {labelAt === 'beside' && <span className="kit-bar-label" aria-hidden="true">{label}</span>}
      {labelAt === 'above' && <span className="kit-bar-label-above" aria-hidden="true">{label}</span>}
      {bar}
    </>
  )
  return plain ? <div className="kit-bar" {...attrs}>{parts}</div> : <Chip {...attrs}>{parts}</Chip>
}

// "+5" that floats up and fades whenever a number changes (red "−3" when it drops).
// Uses the style's motion; with reduce motion on, the number just changes.
function useFloatUps(value: number) {
  const last = useRef(value)
  const nextId = useRef(0)
  const [floats, setFloats] = useState<{ id: number; delta: number }[]>([])
  useEffect(() => {
    const delta = value - last.current
    last.current = value
    if (delta) setFloats((list) => [...list, { id: nextId.current++, delta }])
  }, [value])
  return floats.map((f) => (
    <span key={f.id} className="kit-float-up" data-variant={f.delta < 0 ? 'danger' : undefined} aria-hidden="true"
      onAnimationEnd={() => setFloats((list) => list.filter((other) => other.id !== f.id))}>
      {f.delta > 0 ? `+${f.delta}` : `−${-f.delta}`}
    </span>
  ))
}

// COUNTER — an icon and a number (coins, gems, dice left), with the +N float-up.
export function Counter({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <Chip role="group" aria-label={label}>
      {shown(icon) && <span className="kit-hud-icon" data-symbol={typeof icon === 'string' || undefined} aria-hidden="true">{icon}</span>}
      <span className="kit-float-anchor"><Text kind="label">{value}</Text>{useFloatUps(value)}</span>
    </Chip>
  )
}

// SCORE & COMBO — the score (with float-up), and a "×3" that pops each time the combo grows.
export const scoreWords = { score: 'Score', combo: '×{n}' }
// compact (0.17.0): just the number (the word "Score" is still read out) — for a one-row HUD on a narrow phone, where
// the caption's width is the status line's room.
export function Score({ value, combo = 0, compact, words }: { value: number; combo?: number; compact?: boolean; words?: Partial<typeof scoreWords> }) {
  const w = { ...scoreWords, ...words }
  return (
    <Chip role="group" aria-label={w.score}>
      {!compact && <Text kind="caption">{w.score}</Text>}
      <span className="kit-float-anchor"><Text kind="heading">{value}</Text>{useFloatUps(value)}</span>
      {combo > 1 && <span key={combo} className="kit-combo"><Badge variant="primary">{fill(w.combo, { n: combo })}</Badge></span>}
    </Chip>
  )
}

// TIMER RING — seconds left, drawn as a ring that empties. Turns red at warnAt seconds.
type TimerProps = { seconds: number; total: number; label?: string; warnAt?: number }
export function TimerRing({ seconds, total, label = 'Time left', warnAt = 5 }: TimerProps) {
  const left = Math.max(0, seconds)
  const full = total ? left / total : 0 // how much of the ring is still coloured, 0 to 1
  return (
    <span className="kit-timer" role="timer" aria-label={label} data-variant={left <= warnAt ? 'danger' : undefined}
      style={{ '--kit-fill': full } as CSSProperties}>
      <Text kind="label">{Math.ceil(left)}</Text>
    </span>
  )
}

// HUD TEXT — plain words straight on the game: "Hold to Roll", "Locked 1!", "Round 1".
// No plate, outline or shadow block (only buttons look like buttons): the style's on-game colour
// with a soft shade behind it so it reads over any art. Read out politely when it changes, and it
// pops in again whenever the text changes.  size: s | m (default) | l.  tone: accent = highlighted.
// pop: when the text changes, a quick grow-and-settle instead of the soft entrance — to call attention
// to a change ("Round 2"). Off with reduce motion, like every animation.
// live (0.14.1): a reading that changes all the time ("72%", a score tag): it comes in once, then its numbers just
// change — no entrance on every change (a pressure % re-entering 10 times a second looked faded and flickered — Goops
// F26), and it isn't read out on every change either.
// fit (0.17.0): one line that shrinks to the room it's given (a big status between a HUD's corners on a narrow phone),
// never below the style's body text size (the accessibility floor); with room to spare it stays at its size. Its line
// keeps its full height either way (0.17.1), so whatever holds it never changes size when the words change.
// numbers (0.17.0): in the style's number font — a readout ("10% PRESS") rather than words.
type HudTextProps = { children: string; detail?: string; size?: 's' | 'm' | 'l'; tone?: 'normal' | 'accent'; pop?: boolean; live?: boolean
  fit?: boolean; numbers?: boolean }
export function HudText({ children, detail, size = 'm', tone = 'normal', pop, live, fit, numbers }: HudTextProps) {
  const kind = size === 's' ? 'label' : size === 'm' ? 'heading' : 'title'
  const box = useRef<HTMLDivElement>(null)
  useFitText(box, fit ? children : null)
  return (
    <div ref={box} className="kit-hud-text" data-size={size} data-tone={tone === 'accent' ? tone : undefined} data-pop={pop || undefined}
      data-fit={fit || undefined} data-numbers={numbers || undefined} aria-live={live ? 'off' : 'polite'}>
      <Stack key={live ? 'live' : children} gap="xs">
        <Text kind={kind}>{children}</Text>
        {detail && <Text kind="label">{detail}</Text>}
      </Stack>
    </div>
  )
}

// HudText fit: measure the line at its own size; too wide for its box → data-fitted + --kit-fit-size = the size that
// fits (blocks.css keeps it at or above the body text size). Again whenever the box's width or the words change, and
// once the fonts have loaded (a fallback font measures differently).
function useFitText(box: RefObject<HTMLDivElement | null>, text: string | null) {
  useLayoutEffect(() => {
    const el = box.current
    if (!el || text === null) return
    let lastRoom = -1, open = true
    const fitNow = (force = false) => {
      const line = el.querySelector<HTMLElement>('.kit-text')
      const room = el.clientWidth
      if (!line || !open || (room === lastRoom && !force)) return
      lastRoom = room
      el.removeAttribute('data-fitted')
      el.removeAttribute('data-fit-wrap')
      el.style.removeProperty('--kit-fit-size')
      el.style.removeProperty('--kit-fit-line')
      const natural = line.scrollWidth
      if (room > 0 && natural > room) {
        const { fontSize, lineHeight } = getComputedStyle(line)
        const size = parseFloat(fontSize)
        el.style.setProperty('--kit-fit-size', `${Math.floor((size * room) / natural * 10) / 10}px`)
        // the line keeps its own height, so the box around it never changes size as the words change (0.17.1)
        el.style.setProperty('--kit-fit-line', lineHeight === 'normal' ? `${size * 1.2}px` : lineHeight)
        el.setAttribute('data-fitted', '')
        // Still too wide at the body text size (its floor — big text, a wide font): the words take two lines instead
        // of running over the corners beside them (0.35.2, F145)
        if (line.scrollWidth > room + 0.5) el.setAttribute('data-fit-wrap', '')
      }
    }
    fitNow(true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fitNow())
    observer?.observe(el)
    // …and when its words change on the page without React (a browser's translate button, the fake language: 0.37.0,
    // F156 — the fit stayed measured on the English word). The fit itself only sets attributes, so it never loops.
    const rewritten = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => fitNow(true))
    rewritten?.observe(el, { characterData: true, childList: true, subtree: true })
    document.fonts?.ready.then(() => fitNow(true))
    return () => { open = false; observer?.disconnect(); rewritten?.disconnect() }
  }, [box, text])
}

// TURN BANNER — "Sam's turn" / "Level 2!" in the middle. It pops in again whenever the text changes.
// variant="plain": big HudText instead of a panel (for instructions that must not look like a button).
export function TurnBanner({ text, detail, variant = 'panel' }: { text: string; detail?: string; variant?: 'panel' | 'plain' }) {
  if (variant === 'plain') return <HudText size="l" detail={detail}>{text}</HudText>
  return (
    <Panel key={text} depth={2} gap="xs" className="kit-banner" role="status">
      <Text kind="title">{text}</Text>
      {detail && <Text kind="caption">{detail}</Text>}
    </Panel>
  )
}

// PLAYER SEATS — everyone at the table; whoever's turn it is gets the highlight.
// 0.29.0 (F109, the tappable seat row) — all optional; without them it draws exactly as before:
//   onSeatTap(seat): each seat becomes a real button (Tab reaches it, the focus ring shows, Enter / Space press it).
//     Its screen-reader name is the seat's `tapLabel` ("Ada — send an emote"), else its name — the game (or the
//     emotes module's <EmoteSeats>) passes the words, so they translate with the game's text.
//   seat.badge: a small mark on the portrait's corner (the emotes module's MutedMark). It sits ON the portrait, so the
//     chip is the same size with or without it — nothing shifts when a seat is muted.
//   seat.seatProps: extra attributes for the seat's button (or chip): data-emote-seat tags, aria-expanded…
//   seat.color: the portrait's colour (like PlayerChip's).   showNames={false}: portraits only (the names are read out).
export type Seat = {
  id: string; name: string; avatar?: string; color?: string; score?: ReactNode
  badge?: ReactNode; tapLabel?: string; seatProps?: Record<string, string | boolean | undefined>
}
type PlayerSeatsProps = { players: Seat[]; activeId?: string; onSeatTap?: (seat: Seat) => void; showNames?: boolean }
export function PlayerSeats({ players, activeId, onSeatTap, showNames = true }: PlayerSeatsProps) {
  return (
    <Row gap="s" className={onSeatTap ? 'kit-seats' : undefined}>
      {players.map((p) => {
        const active = p.id === activeId
        const avatar = <Avatar name={p.name} src={p.avatar} color={p.color} active={active} />
        const chip = (
          <Chip active={active} {...(onSeatTap ? {} : p.seatProps)}>
            {onSeatTap || p.badge !== undefined
              ? <span className="kit-seat-avatar">{avatar}{p.badge !== undefined && <span className="kit-seat-badge">{p.badge}</span>}</span>
              : avatar}
            {showNames && (
              <Stack gap="xs">
                <Text kind="label" translate="no">{p.name}</Text>
                {p.score !== undefined && <Text kind="caption">{p.score}</Text>}
              </Stack>
            )}
          </Chip>
        )
        if (!onSeatTap) return <Fragment key={p.id}>{chip}</Fragment>
        return (
          <button key={p.id} type="button" className="kit-seat-button kit-target" aria-label={p.tapLabel ?? p.name}
            {...p.seatProps} onClick={() => { controlSound('tap'); onSeatTap(p) }}>
            {chip}
          </button>
        )
      })}
    </Row>
  )
}

// PLAYER CHIP — one player's little card, to sit beside their row or seat in the game (the game
// places it). Avatar (or an icon, or nothing), name, score with its icon, a detail line, a badge.
//   active: highlighted (whose turn it is, or you).   dim: faded (e.g. while something passes over it).
//   size: 'm' (default), 's' for tight spots, 'xs' for the tightest (rows close together, e.g. a phone on its
//         side): ONE line — name, badge and detail side by side — with a smaller avatar.
//   showName={false}: the name is only read out.
//   avatar: a picture; avatar={false} hides it — with icon, that makes a goal/target chip.
// The score counts up when it rises (and floats up "+N" — floatUps={false} when the game already flies the points
// in itself); with reduce motion on it just changes.
//   scoreDigits (0.21.0): room for a score this many digits long from the start (default 2, i.e. up to 99) — give the
//         biggest score the game can reach, so 99 → 100 never widens the chip.
// Like every HUD piece it never catches taps: the game underneath gets them.
// It keeps its size once it's on screen (0.21.0, useFixedSize): a score going from 9 to 10 mustn't shove its neighbours.
export const playerChipWords = { score: '{n} points' }
export type PlayerChipProps = {
  name: string; showName?: boolean; color?: string; avatar?: string | false; icon?: ReactNode
  score?: number; scoreDigits?: number; scoreIcon?: ReactNode; detail?: ReactNode; badge?: ReactNode
  active?: boolean; dim?: boolean; size?: 'xs' | 's' | 'm'; floatUps?: boolean; words?: Partial<typeof playerChipWords>
}
export function PlayerChip({
  name, showName = true, color, avatar, icon, score, scoreDigits = 2, scoreIcon = '★', detail, badge,
  active, dim, size = 'm', floatUps = true, words,
}: PlayerChipProps) {
  const w = { ...playerChipWords, ...words }
  const shownScore = useCountUp(score ?? 0)
  const floats = useFloatUps(score ?? 0)
  const oneLine = size === 'xs' // the detail sits beside the name and badge instead of on a line below
  const hasNameLine = showName || shown(badge) || (oneLine && shown(detail))
  const fixed = useFixedSize()
  return (
    // (a plain kit-row div, not <Row>: React 18 hands a ref only to real elements)
    <div ref={fixed} className="kit-row kit-hud-chip kit-player-chip kit-nowrap" data-gap={size === 'm' ? 's' : 'xs'} role="group" aria-label={name}
      data-state={active ? 'active' : undefined} data-dim={dim || undefined} data-size={size}>
      {shown(icon) && <span className="kit-player-chip-icon" aria-hidden="true">{icon}</span>}
      {!icon && avatar !== false && <Avatar name={name} src={avatar || undefined} color={color} active={active} />}
      {(showName || shown(detail) || shown(badge)) && (
        <Stack gap="xs" className="kit-player-chip-text">
          {hasNameLine && (
            <Row gap="xs" className="kit-nowrap">
              {showName && <Text kind="label" translate="no">{name}</Text>}
              {shown(badge) && <Badge>{badge}</Badge>}
              {oneLine && shown(detail) && <Text kind="caption">{detail}</Text>}
            </Row>
          )}
          {!oneLine && shown(detail) && <Text kind="caption">{detail}</Text>}
        </Stack>
      )}
      {score !== undefined && (
        <span className="kit-player-chip-score" role="img" aria-label={fill(w.score, { n: score })}>
          <span className="kit-player-chip-star" aria-hidden="true">{scoreIcon}</span>
          <span className="kit-float-anchor" aria-hidden="true" style={{ '--kit-digits': Math.max(scoreDigits, String(score).length) } as CSSProperties}>
            <Text kind={size === 'm' ? 'heading' : 'label'}>{shownScore}</Text>{floatUps && floats}
          </span>
        </span>
      )}
    </div>
  )
}

// RANK — "2nd" (of 8). format turns a place into words; the default is English.
const englishSuffix: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
const ordinalRule = new Intl.PluralRules('en', { type: 'ordinal' })
export const ordinal = (place: number) => place + englishSuffix[ordinalRule.select(place)]
type RankProps = { place: number; of?: number; format?: (place: number) => string; label?: string }
export function Rank({ place, of, format = ordinal, label = 'Place' }: RankProps) {
  return (
    <Chip role="group" aria-label={label}>
      <span className="kit-place"><Text kind="heading">{format(place)}</Text></span>
      {of !== undefined && <Text kind="caption">/ {of}</Text>}
    </Chip>
  )
}

// CONNECTION DOT — online status. Says it in words too when something's wrong.
// Its words may take two lines (between words) when its HUD corner gives way — big text on an upright phone (0.35.2).
// A word too long for the room beside the dot breaks there as the last resort (0.37.0, F156: a translated "connection"
// ran out of the chip) — data-ui-split-ok tells the page check that's on purpose.
export const connectionWords = { good: 'Connected', weak: 'Weak connection', lost: 'Offline' }
export function ConnectionDot({ status, words }: { status: 'good' | 'weak' | 'lost'; words?: Partial<typeof connectionWords> }) {
  const w = { ...connectionWords, ...words }
  return (
    <Chip role="status" aria-label={w[status]} data-wrap data-ui-split-ok>
      <span className="kit-dot" data-status={status} />
      {status !== 'good' && <Text kind="caption">{w[status]}</Text>}
    </Chip>
  )
}

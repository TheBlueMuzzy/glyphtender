// FLOW — the screens between the playing: Loading, Countdown, RoundIntro, Results,
// Victory, GameOver, PostGame. They show what the game tells them; the game decides what's next.
import { isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Panel, Row, Screen, Stack, type PanelFrame } from '../layout'
import { Avatar, Badge, Button, ListRow, ProgressBar, ScrollArea, Text, type ButtonArt } from '../controls'
import { Spinner } from './dialogs'
import { useTitleFit } from './MenuHeader'
import { ordinal, TurnBanner } from './hud'
import { reduceMotion } from './motion'
import { fill } from './words'

// LOADING — a bar when you know how far along it is (progress 0 to 1), a spinner when you don't.
export const loadingWords = { title: 'Loading…' }
export function Loading({ progress, tip, words }: { progress?: number; tip?: string; words?: Partial<typeof loadingWords> }) {
  const w = { ...loadingWords, ...words }
  const titleBox = useRef<HTMLSpanElement>(null)
  useTitleFit(titleBox, true, false, w.title) // a word wider than its line drops a step, like every title (0.37.0, F156)
  return (
    <Screen label={w.title}>
      <Panel depth={2} gap="m" className="kit-menu kit-centred">
        <span ref={titleBox} className="kit-fit-title"><Text kind="title">{w.title}</Text></span>
        {progress === undefined ? <Row justify="center"><Spinner label={w.title} /></Row> : <ProgressBar label={w.title} value={progress} />}
        {tip && <Text kind="caption">{tip}</Text>}
      </Panel>
    </Screen>
  )
}

// COUNTDOWN — 3, 2, 1, Go! (one a second), then onDone. Each number pops in with the style's motion.
export const countdownWords = { go: 'Go!', label: 'Get ready' }
type CountdownProps = { from?: number; seconds?: number; onDone?: () => void; words?: Partial<typeof countdownWords> }
export function Countdown({ from = 3, seconds = 1, onDone, words }: CountdownProps) {
  const w = { ...countdownWords, ...words }
  const [left, setLeft] = useState(from)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone }) // always call the latest onDone, without restarting the clock
  useEffect(() => {
    const timer = setTimeout(() => (left > 0 ? setLeft(left - 1) : done.current?.()), seconds * 1000)
    return () => clearTimeout(timer)
  }, [left, seconds])
  return (
    <Screen label={w.label}>
      <span key={left} className="kit-countdown" role="timer" aria-live="assertive">
        <Text kind="display">{left > 0 ? left : w.go}</Text>
      </span>
    </Screen>
  )
}

// ROUND INTRO — "Round 2 of 5" and what this round is about. Plain words, not a card: it's information,
// and anything that isn't a button must not look like one. Its words are on-game words, so the game behind it
// wears the dark shade, not the light veil, in every look (shade, 0.35.10 — Muzzy 2026-10-26).
export const roundIntroWords = { round: 'Round {n}', roundOf: 'Round {n} of {total}' }
type RoundIntroProps = { round: number; total?: number; detail?: string; words?: Partial<typeof roundIntroWords> }
export function RoundIntro({ round, total, detail, words }: RoundIntroProps) {
  const w = { ...roundIntroWords, ...words }
  const text = fill(total ? w.roundOf : w.round, { n: round, total: total ?? '' })
  return <Screen label={text} shade><TurnBanner variant="plain" text={text} detail={detail} /></Screen>
}

// RESULTS — everyone's score, best first. Equal scores share a place (1st, 1st, 3rd).
// lowestWins: for golf-style games where the smallest score is best.
// For the end of a game on ONE screen: title ("You win!" / "Tie!"), message, and its buttons
// (onRematch, onQuit, or your own in actions). Rows arrive one after another (the style's motion;
// all at once with reduce motion on), and 1st place gets a star badge. color: each player's avatar colour.
// dim: darkens the game behind it (still visible), like a dialog — for results shown over the table.
export type ResultPlayer = { id: string; name: string; score: number; avatar?: string; color?: string }
export function rankPlayers<P extends ResultPlayer>(players: P[], lowestWins = false) {
  const sorted = [...players].sort((a, b) => (lowestWins ? a.score - b.score : b.score - a.score))
  return sorted.map((player) => ({ ...player, place: 1 + sorted.findIndex((other) => other.score === player.score) }))
}
export const resultsWords = { title: 'Results', you: 'You', continue: 'Continue', points: '{n} pts', winner: 'Winner', rematch: 'Rematch', quit: 'Quit' }
type ResultsProps = {
  players: ResultPlayer[]; meId?: string; lowestWins?: boolean
  title?: string; message?: string; onContinue?: () => void; onRematch?: () => void; onQuit?: () => void; actions?: ReactNode
  format?: (place: number) => string; dim?: boolean; words?: Partial<typeof resultsWords>
}
export function Results({ players, meId, lowestWins, title, message, onContinue, onRematch, onQuit, actions, format = ordinal, dim, words }: ResultsProps) {
  const w = { ...resultsWords, ...words }
  const heading = title ?? w.title
  const stagger = reduceMotion() ? 0 : 1 // 1: each row waits a little longer than the one above it; 0: all at once
  const hasButtons = actions || onQuit || onRematch || onContinue
  const titleBox = useRef<HTMLSpanElement>(null)
  useTitleFit(titleBox, true, false, heading) // like the end screens' (0.35.1)
  return (
    <Screen label={heading} dialog={dim} grow="down">
      <Panel depth={2} gap="m" className="kit-modal kit-results">
        <span ref={titleBox} className="kit-end-title"><Text kind="title">{heading}</Text></span>
        {message && <Text>{message}</Text>}
        <ScrollArea label={heading} max="l">
          {rankPlayers(players, lowestWins).map((p, i) => (
            <div key={p.id} className="kit-result-row" style={{ '--kit-i': stagger * i } as CSSProperties}>
              <ListRow label={
                <Row gap="s" className="kit-nowrap">
                  <span className="kit-place"><Text kind="heading">{format(p.place)}</Text></span>
                  <Avatar name={p.name} src={p.avatar} color={p.color} active={p.place === 1} />
                  <Row gap="xs" className="kit-result-name">
                    <Text kind="label" translate="no">{p.name}</Text>
                    {p.place === 1 && <Badge variant="primary"><span role="img" aria-label={w.winner}>★</span></Badge>}
                    {p.id === meId && <Badge variant="primary">{w.you}</Badge>}
                  </Row>
                </Row>
              }><span className="kit-number"><Text kind="label">{fill(w.points, { n: p.score })}</Text></span></ListRow>
            </div>
          ))}
        </ScrollArea>
        {hasButtons && (
          <Row gap="s" justify="end">
            {actions}
            {onQuit && <Button variant="secondary" onClick={onQuit}>{w.quit}</Button>}
            {onRematch && <Button onClick={onRematch}>{w.rematch}</Button>}
            {onContinue && <Button onClick={onContinue}>{w.continue}</Button>}
          </Row>
        )}
      </Panel>
    </Screen>
  )
}

// VICTORY and GAME OVER — the big "you won / you lost", a few stats, and what to do next.
// The game's own art (0.11.0): frame = its frame picture around the report (Panel frame), backdrop = a picture behind
// the screen (Screen backdrop), art = its button pictures per button (Button art), e.g. art={{ retry: { up, down } }}.
// Phone on its side / short window (0.11.0): title, message and stats on the left, the buttons on the right.
// onSwipeUp (0.12.0): a swipe up anywhere on the report does it too (Goops: "swipe up to end the day" = back to the
// console); words.swipe = the quiet line at the bottom that says so (plain words, not a button).
// Victory onQuit (0.12.0): a second, quieter way out beside Continue (words.quit, art.quit) — like GameOver's.
// reveal (0.31.0, Goops' payslip): ms per row — the stats rows arrive one after another with the Results rows' entrance
// (the same motion; each row `reveal` ms after the one above); all at once with reduce motion. Waiting rows hold their
// space, so the card is its final size from the start. onRevealed: once, when the last row is in (at once with reduce
// motion, no rows or no reveal). It follows the CSS animation, so the Dev Kit's full pause holds it too.
// STAT LIST (0.31.0) — the same rows as a block, for a Modal or your own card: <StatList stats reveal onRevealed />.
// A row's tone: "danger" (a loss, a deduction, a debt) or "success" (net pay, a rank up) — like Card's tone, the style's
// danger / success colour: a small ▼ / ▲ tag in that colour before the value (a Badge, like Results' winner star), so
// the shape says it too, never colour alone (read out as words.danger / words.success). The value itself keeps the
// panel's text colour: some styles' danger isn't readable as text on their panel (Pixel's is 2:1).
// Long lists (0.31.0, Goops' payslip: 692 px of rows in a 605 px frame): Victory / GameOver hold their stats in a
// ScrollArea, so the title, message and buttons stay put and in sight and only the rows scroll (edge fade, no bar);
// a list that fits looks and sizes as before. With reveal the scroll follows the newest row (StatList, in any
// ScrollArea) until the player scrolls it themselves.
// New rows replay it (0.32.0, Goops' payslip Modal swapping its stats): when the rows change BY CONTENT (labels, values,
// tones — not a new array or new objects with the same words) the reveal starts again from the top and onRevealed fires
// once more for the new rows; the same rows re-rendered never replay. No `key` needed to restart it.
export type Stat = { label: string; value: ReactNode; tone?: 'danger' | 'success' }
export const statListWords = { danger: 'Loss', success: 'Gain' }
type RevealProps = { reveal?: number; onRevealed?: () => void }
type StatListProps = RevealProps & { stats: Stat[]; words?: Partial<typeof statListWords> }
const toneMark = { danger: '▼', success: '▲' }
// The words a value shows (a number, text, or an element's text inside) — what "the same rows" compares.
// An element's plain props count too (review fix: <Money cents={500} /> has no text inside, so a new amount under the
// same label never replayed and onRevealed never came); functions and objects (a new onClick / style each render) don't.
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<Record<string, unknown>>(node)) {
    const { children, ...props } = node.props
    const plain = Object.keys(props).sort().filter((k) => ['string', 'number', 'bigint', 'boolean'].includes(typeof props[k]))
    const marks = plain.map((k) => `${k}=${String(props[k])}`).join(',')
    return (marks ? `<${marks}>` : '') + textOf(children as ReactNode)
  }
  return ''
}
const rowsText = (stats: Stat[]) => JSON.stringify(stats.map((s) => [s.label, textOf(s.value), s.tone ?? '']))
export function StatList({ stats, reveal, onRevealed, words }: StatListProps) {
  const w = { ...statListWords, ...words }
  const revealing = reveal !== undefined && stats.length > 0 && !reduceMotion()
  // Which reveal this is: a new one each time the rows' words change (React's "adjust state while rendering" pattern)
  const text = rowsText(stats)
  const [seen, setSeen] = useState({ text, round: 0 })
  const round = seen.text === text ? seen.round : seen.round + 1
  if (seen.text !== text) setSeen({ text, round })
  const done = useRef(onRevealed)
  useEffect(() => { done.current = onRevealed }) // always call the latest onRevealed
  const firedRound = useRef(-1) // once per reveal, whether the last row's entrance ends or there's nothing to wait for
  const lastRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const finish = () => { if (firedRound.current !== round) { firedRound.current = round; done.current?.() } }
    const el = lastRow.current
    if (!revealing || !el) { finish(); return }
    // Nothing left to play on it (its entrance already over, or the style has none): it's in now
    if (typeof el.getAnimations === 'function' && el.getAnimations().length === 0) { finish(); return }
    // (the row's own entrance, not a part inside it; a cancelled entrance — e.g. hidden — has nothing more to show)
    const onEnd = (e: AnimationEvent) => { if (e.target === el) finish() }
    el.addEventListener('animationend', onEnd)
    el.addEventListener('animationcancel', onEnd)
    return () => { el.removeEventListener('animationend', onEnd); el.removeEventListener('animationcancel', onEnd) }
  }, [revealing, round])
  // In a ScrollArea (Victory / GameOver's own, or yours round a StatList) the scroll follows the reveal: as each row
  // starts its entrance it's scrolled into view (smoothly; at once with reduce motion), clear of the "more below" fade.
  // A player who scrolls it themselves (wheel, touch, a press, the keys) takes over: it stops following.
  useEffect(() => {
    const stack = lastRow.current?.parentElement // the rows' own list (.kit-stats)
    const box = stack?.closest<HTMLElement>('.kit-scroll')
    if (!revealing || !stack || !box) return
    if (round > 0 && box.scrollTop > 0) box.scrollTo({ top: 0 }) // a replay starts from the top, like the first reveal
    let theirs = false
    const takeOver = () => { theirs = true }
    const follow = (e: AnimationEvent) => {
      const row = e.target as HTMLElement
      if (theirs || row.parentElement !== stack) return // only a row's own entrance (not a part inside it)
      // where the row's bottom is in the box's contents (offsets ignore the entrance's own movement)
      const stackTop = stack.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
      const bottom = stackTop + row.offsetTop - stack.offsetTop + row.offsetHeight
      const room = parseFloat(getComputedStyle(row).scrollMarginBlockEnd) || 0 // the fade's height (blocks.css)
      const top = bottom + room - box.clientHeight
      if (top > box.scrollTop + 1) box.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' })
    }
    const intents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    for (const name of intents) box.addEventListener(name, takeOver, { passive: true })
    box.addEventListener('animationstart', follow)
    return () => {
      for (const name of intents) box.removeEventListener(name, takeOver)
      box.removeEventListener('animationstart', follow)
    }
  }, [revealing, round])
  if (stats.length === 0) return null
  const last = stats.length - 1
  const waits = (i: number) => (revealing ? i : undefined) // row i waits i steps (no reveal: no variables at all)
  const step = revealing ? `${reveal}ms` : undefined
  return (
    <Stack key={round} gap="xs" className="kit-stats">{/* a new reveal = fresh rows, so their entrances play again */}
      {stats.map((s, i) => (
        <div key={s.label} ref={i === last ? lastRow : undefined} className="kit-stat-row" data-reveal={revealing || undefined} data-tone={s.tone}
          style={{ '--kit-i': waits(i), '--kit-step': step } as CSSProperties}>
          <ListRow label={s.label}>
            {s.tone
              ? <Row gap="xs" className="kit-nowrap"><Badge variant={s.tone}><span className="kit-tone-mark" role="img" aria-label={w[s.tone]}>{toneMark[s.tone]}</span></Badge><Text kind="label">{s.value}</Text></Row>
              : <Text kind="label">{s.value}</Text>}
          </ListRow>
        </div>
      ))}
    </Stack>
  )
}
type EndArt = { frame?: PanelFrame; backdrop?: string; onSwipeUp?: () => void }
type EndScreenProps = EndArt & RevealProps & { title: string; message?: string; stats?: Stat[]; swipeHint?: string; children: ReactNode }
function EndScreen({ title, message, stats = [], reveal, onRevealed, children, frame, backdrop, onSwipeUp, swipeHint }: EndScreenProps) {
  const titleBox = useRef<HTMLSpanElement>(null)
  useTitleFit(titleBox, true, false, title) // a word wider than its line drops a step, never splits (0.35.1, F145)
  return (
    <Screen label={title} backdrop={backdrop} swipe={onSwipeUp ? { up: onSwipeUp } : undefined}>
      <Panel depth={2} gap="m" className="kit-modal kit-centred kit-end" frame={frame}>
        <Stack gap="m" className="kit-end-info">
          <span ref={titleBox} className="kit-end-title"><Text kind="display">{title}</Text></span>
          {message && <Text>{message}</Text>}
          {stats.length > 0
            ? <ScrollArea label={title}><StatList stats={stats} reveal={reveal} onRevealed={onRevealed} /></ScrollArea>
            : <StatList stats={stats} onRevealed={onRevealed} />}
        </Stack>
        <Stack gap="s" className="kit-end-actions">
          {children}
          {onSwipeUp && swipeHint && <span className="kit-end-swipe"><Text kind="caption">{swipeHint}</Text></span>}
        </Stack>
      </Panel>
    </Screen>
  )
}
export const victoryWords = { title: 'Victory!', continue: 'Continue', quit: 'Quit', swipe: '⇧ Swipe up to go back' }
type VictoryProps = EndArt & RevealProps & {
  message?: string; stats?: Stat[]; onContinue: () => void; onQuit?: () => void; words?: Partial<typeof victoryWords>
  art?: { continue?: ButtonArt; quit?: ButtonArt }
}
export function Victory({ message, stats, onContinue, onQuit, words, art, ...look }: VictoryProps) {
  const w = { ...victoryWords, ...words }
  return (
    <EndScreen title={w.title} message={message} stats={stats} swipeHint={w.swipe} {...look}>
      <Button onClick={onContinue} art={art?.continue}>{w.continue}</Button>
      {onQuit && <Button variant="secondary" onClick={onQuit} art={art?.quit}>{w.quit}</Button>}
    </EndScreen>
  )
}
export const gameOverWords = { title: 'Game over', retry: 'Try again', quit: 'Quit', swipe: '⇧ Swipe up to go back' }
type GameOverProps = EndArt & RevealProps & {
  message?: string; stats?: Stat[]; onRetry?: () => void; onQuit?: () => void; words?: Partial<typeof gameOverWords>
  art?: { retry?: ButtonArt; quit?: ButtonArt }
}
export function GameOver({ message, stats, onRetry, onQuit, words, art, ...look }: GameOverProps) {
  const w = { ...gameOverWords, ...words }
  return (
    <EndScreen title={w.title} message={message} stats={stats} swipeHint={w.swipe} {...look}>
      {onRetry && <Button onClick={onRetry} art={art?.retry}>{w.retry}</Button>}
      {onQuit && <Button variant="secondary" onClick={onQuit} art={art?.quit}>{w.quit}</Button>}
    </EndScreen>
  )
}

// POST GAME — rematch / back to lobby / quit. children: anything to show above (a summary, votes).
export const postGameWords = { title: 'Play again?', rematch: 'Rematch', lobby: 'Back to lobby', quit: 'Quit' }
type PostGameProps = { onRematch?: () => void; onLobby?: () => void; onQuit?: () => void; children?: ReactNode; words?: Partial<typeof postGameWords> }
export function PostGame({ onRematch, onLobby, onQuit, children, words }: PostGameProps) {
  const w = { ...postGameWords, ...words }
  return (
    <Screen label={w.title}>
      <Panel depth={2} gap="m" className="kit-menu">
        <Text kind="title">{w.title}</Text>
        {children}
        {onRematch && <Button onClick={onRematch}>{w.rematch}</Button>}
        {onLobby && <Button variant="secondary" onClick={onLobby}>{w.lobby}</Button>}
        {onQuit && <Button variant="ghost" onClick={onQuit}>{w.quit}</Button>}
      </Panel>
    </Screen>
  )
}

// FLOW — the screens between the playing: Loading, Countdown, RoundIntro, Results,
// Victory, GameOver, PostGame. They show what the game tells them; the game decides what's next.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Panel, Row, Screen, Stack, type PanelFrame } from '../layout'
import { Avatar, Badge, Button, ListRow, ProgressBar, ScrollArea, Text, type ButtonArt } from '../controls'
import { Spinner } from './dialogs'
import { ordinal, TurnBanner } from './hud'
import { reduceMotion } from './motion'
import { fill } from './words'

// LOADING — a bar when you know how far along it is (progress 0 to 1), a spinner when you don't.
export const loadingWords = { title: 'Loading…' }
export function Loading({ progress, tip, words }: { progress?: number; tip?: string; words?: Partial<typeof loadingWords> }) {
  const w = { ...loadingWords, ...words }
  return (
    <Screen label={w.title}>
      <Panel depth={2} gap="m" className="kit-menu kit-centred">
        <Text kind="title">{w.title}</Text>
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
// and anything that isn't a button must not look like one.
export const roundIntroWords = { round: 'Round {n}', roundOf: 'Round {n} of {total}' }
type RoundIntroProps = { round: number; total?: number; detail?: string; words?: Partial<typeof roundIntroWords> }
export function RoundIntro({ round, total, detail, words }: RoundIntroProps) {
  const w = { ...roundIntroWords, ...words }
  const text = fill(total ? w.roundOf : w.round, { n: round, total: total ?? '' })
  return <Screen label={text}><TurnBanner variant="plain" text={text} detail={detail} /></Screen>
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
  return (
    <Screen label={heading} dialog={dim} grow="down">
      <Panel depth={2} gap="m" className="kit-modal kit-results">
        <span className="kit-end-title"><Text kind="title">{heading}</Text></span>
        {message && <Text>{message}</Text>}
        <ScrollArea label={heading} max="l">
          {rankPlayers(players, lowestWins).map((p, i) => (
            <div key={p.id} className="kit-result-row" style={{ '--kit-i': stagger * i } as CSSProperties}>
              <ListRow label={
                <Row gap="s" className="kit-nowrap">
                  <span className="kit-place"><Text kind="heading">{format(p.place)}</Text></span>
                  <Avatar name={p.name} src={p.avatar} color={p.color} active={p.place === 1} />
                  <Row gap="xs" className="kit-result-name">
                    <Text kind="label">{p.name}</Text>
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
type Stat = { label: string; value: ReactNode }
type EndArt = { frame?: PanelFrame; backdrop?: string; onSwipeUp?: () => void }
type EndScreenProps = EndArt & { title: string; message?: string; stats?: Stat[]; swipeHint?: string; children: ReactNode }
function EndScreen({ title, message, stats = [], children, frame, backdrop, onSwipeUp, swipeHint }: EndScreenProps) {
  return (
    <Screen label={title} backdrop={backdrop} swipe={onSwipeUp ? { up: onSwipeUp } : undefined}>
      <Panel depth={2} gap="m" className="kit-modal kit-centred kit-end" frame={frame}>
        <Stack gap="m" className="kit-end-info">
          <span className="kit-end-title"><Text kind="display">{title}</Text></span>
          {message && <Text>{message}</Text>}
          {stats.length > 0 && <Stack gap="xs">{stats.map((s) => <ListRow key={s.label} label={s.label}><Text kind="label">{s.value}</Text></ListRow>)}</Stack>}
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
type VictoryProps = EndArt & {
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
type GameOverProps = EndArt & {
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

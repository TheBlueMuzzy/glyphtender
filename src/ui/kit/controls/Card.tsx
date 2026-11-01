// CARD — a tile with a title (mode select, level, reward). With onClick it can be picked;
// `selected` marks the chosen one.
// tone="success" (0.27.0): the card is "good / owned / done" — an upgrade with a level, a finished goal. Its edge turns
// the style's success colour (the same inset ring `selected` uses, so the card never grows) and its shadow becomes
// the style's depth-success (Neon: its glow in green). Which cards get it is the game's call.
// locked (0.27.0): not open yet — greyed (quiet text that still reads 4.5:1, a dashed edge, a flat shadow, pictures in
// grey), the same size as when it opens, never a button (onClick is ignored: it can't be tapped or tabbed to), and
// read out as "<title> Locked" (lockedLabel — pass the game's own word from content/text). Showing locked things or
// hiding them is the game's call; its own line ("Opens at rank 6") goes in the children.
// It keeps its size once it's on screen (0.21.0, useFixedSize): give it room for everything it can hold from the start.
import type { ReactNode } from 'react'
import { useFixedSize } from '../fixedSize'

type CardProps = {
  title: ReactNode; children?: ReactNode; selected?: boolean; tone?: 'success'
  locked?: boolean; lockedLabel?: string; onClick?: () => void
}

export function Card({ title, children, selected, tone, locked, lockedLabel = 'Locked', onClick }: CardProps) {
  const fixed = useFixedSize()
  const inside = <>
    <span className="kit-card-title">{title}{locked && <span className="kit-sr-only"> {lockedLabel}</span>}</span>
    {children}
  </>
  const state = selected ? 'selected' : undefined
  if (locked) return <article ref={fixed} className="kit-card" data-depth={1} data-locked="" aria-disabled="true">{inside}</article>
  return onClick
    ? <button ref={fixed} type="button" className="kit-card kit-target" data-depth={1} data-state={state} data-tone={tone} aria-pressed={selected} onClick={onClick}>{inside}</button>
    : <article ref={fixed} className="kit-card" data-depth={1} data-state={state} data-tone={tone}>{inside}</article>
}

// SHOWING THE FIRST-TIME TIPS (F77, design/tutorial.md §3) — the plain rules the tips layer (helpLayer.tsx) follows
// once `dueTip` (tips.ts) has said which tip is due: where its callout points, its words, whether it pauses, and the
// per-turn / per-game limits. Pure, so it's tested without a screen (tipsPlay.test.ts).
//   · at most `tipsPerTurn` tips per turn (counted by the game's turnCount)
//   · a PAUSE tip dims the game and holds it until "Got it" — at most `maxPauses` per game; past that, or online
//     (an online game never stops for one player), it shows like a normal tip: no dim, no hold, it fades by itself
import text from '../../content/text/en.json'
import { hexKey } from '../engine/hex'
import type { GameState } from '../engine/types'
import { colourOf } from '../game/art'
import { PAUSE_TIPS, type DueTip, type TipId } from './tips'

const words = text.tutorial.tips

/** The CSS selector of what a tip points at. */
export function tipSelector(target: DueTip['target']): string {
  if ('glyphling' in target) return `[data-glyph="${target.glyphling}"]`
  if ('hex' in target) return `[data-seed="${hexKey(target.hex)}"]`
  if (target.part === 'plant') return '[data-action="plant"]'
  if (target.part === 'refresh') return '[data-action="refresh"]'
  if (target.part === 'reveal') return '.game-reveal'
  return '.game-tray'
}

/** A tip's words (en.json → tutorial.tips.<id>), its {placeholders} filled: {player} = the seat's colour name
 *  (values.seat), {n} = values.n, {bonus} = the rules' tangle bonus. */
export function tipWords(due: DueTip, game: GameState): string {
  const seat = due.values?.seat
  const values: Record<string, string> = {
    bonus: String(game.config.rules.tangleBonus),
    ...(typeof seat === 'number' ? { player: text.game.players[colourOf(seat)] } : {}),
    ...(due.values?.n !== undefined ? { n: String(due.values.n) } : {}),
  }
  return words[due.id].replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all)
}

/** One game's tip counts: tips shown per turn (turnCount → how many), and pauses shown. */
export interface TipBudget {
  perTurn: Map<number, number>
  pauses: number
}
export const newTipBudget = (): TipBudget => ({ perTurn: new Map(), pauses: 0 })

/** May another tip show on this turn? */
export const tipRoomThisTurn = (budget: TipBudget, turnCount: number, tipsPerTurn: number) =>
  (budget.perTurn.get(turnCount) ?? 0) < tipsPerTurn

/** How a due tip shows: 'pause' (dim + Got it, the game holds) or 'plain' (fades by itself). */
export function tipMode(id: TipId, o: { online: boolean; budget: TipBudget; maxPauses: number }): 'pause' | 'plain' {
  return PAUSE_TIPS.includes(id) && !o.online && o.budget.pauses < o.maxPauses ? 'pause' : 'plain'
}

/** A tip went up: count it. */
export function countTip(budget: TipBudget, turnCount: number, mode: 'pause' | 'plain') {
  budget.perTurn.set(turnCount, (budget.perTurn.get(turnCount) ?? 0) + 1)
  if (mode === 'pause') budget.pauses += 1
}

/** DEV ONLY: the e2e checks (navigator.webdriver) play without tips or nudges, so their screenshots and steps stay as
 *  they were; `?tips=on` in the address turns them on for a check (e2e/tutorial-tips.mjs). */
export const helpWanted = () => !(import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.webdriver
  && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tips') === 'on'))

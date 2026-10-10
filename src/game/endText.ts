// THE END SCREEN'S SENTENCES — awards, the Story chart's turn list and the scorecard's rows, filled in from content/text/en.json → game.gameOver.
// Pure (names come in as a function), so it's tested without a screen.
import text from '../../content/text/en.json'
import { logOf } from '../engine/log'
import type { GameState } from '../engine/types'
import { fill, noOrphan } from '../ui/kit/blocks/words'
import { LENGTHS, type Award, type Scorecard } from './stats'

const w = text.game.gameOver
const card = w.card
type Name = (seat: number) => string

/** "Lockdown" + "Blue's glyphling: 9 moves → 2" — the award's title and its proof. */
export function awardText(award: Award, name: Name): { title: string; reason: string } {
  const words = w.awards[award.id] as { title: string; reason: string; reasonCut?: string; reasonOne?: string; refreshed?: string }
  const values = Object.fromEntries(Object.entries(award.values).map(([k, v]) => [k, typeof v === 'boolean' ? String(v) : v]))
  if (typeof award.values.other === 'number') values.other = name(award.values.other)
  let reason = words.reason
  if (award.id === 'weedToss' && award.values.kind === 'cut' && words.reasonCut) reason = words.reasonCut
  if (award.id === 'weedToss' && award.values.refreshed === true && words.refreshed) reason += words.refreshed
  if (award.id === 'pincer' && award.values.turns === 1 && words.reasonOne) reason = words.reasonOne // (a one-turn hunt)
  return { title: words.title, reason: noOrphan(fill(reason, values)) } // (never one word alone on the last line)
}

// ─── The Story chart's turn list (F61) ───
// Muzzy, 2026-10-10: "instead of Round 17 - nothing happened, it would say Round 17 - Blue: NEST +6 Yellow: F Refresh 3".
// One row per player, in the game's TURN ORDER (the order they played that round; the rows never swap places as the
// line moves). Each row: the words with their Magic ("NEST · TEN +9"), then what else happened ("Refresh 3", "tangled").

/** A glyphling tangled on that turn: whose it is, and who tangled it (the chart's knot: ringed in `by`'s colour). */
export type PlayKnot = { owner: number; by: number }
/** One player's row: `words` may be cut short (…), `magic` ("+9") and `rest` ("Refresh 3") never are. */
export type PlayRow = { seat: number; words: string; magic: string; rest: string; knots: PlayKnot[]; quiet: boolean }

/** Cut a word longer than `max` letters: GARDENING → GARDENI… */
const cut = (word: string, max: number) => (word.length > max ? `${word.slice(0, Math.max(1, max - 1))}…` : word)

/** Words, joined, kept to about `room` letters: words that don't fit become one "…". */
function wordsIn(words: string[], maxWord: number, room: number): string {
  const join = w.chart.playWordJoin
  let out = ''
  for (const [i, word] of words.map((x) => cut(x, maxWord)).entries()) {
    const next = i ? `${out}${join}${word}` : word
    if (i && next.length > room) return `${out}${join}…`
    out = next
  }
  return out
}

/** What each player did on round `round` (1…), in turn order. `room` = about how many letters a row has space for. */
export function roundPlays(game: GameState, round: number, maxWord: number, room: number): PlayRow[] {
  const turns = logOf(game).turns
  const inRound = turns.filter((t) => t.round === round)
  const order = game.turnOrder ?? game.magic.map((_, seat) => seat)
  const ownerOf = (id: number) => game.glyphlings.find((g) => g.id === id)?.seat ?? -1
  const last = turns.at(-1)
  const join = w.separator
  return order.map((seat) => {
    const turn = inRound.find((t) => t.seat === seat)
    if (!turn) {
      // No turn: the game ended before their turn came round (the last round, after the ender) — otherwise play
      // skipped them because every glyphling of theirs was tangled (tangle.ts endTurn)
      const ended = !!last && round === last.round && order.indexOf(seat) > order.indexOf(last.seat)
      return { seat, words: '', magic: '', rest: ended ? w.chart.playEnded : w.chart.playSkipped, knots: [], quiet: true }
    }
    const rest: string[] = []
    const scored = turn.words.length > 0
    // (a cast with no words then a refresh reads "F · Refresh 3", as Muzzy wrote it — the refresh says it made nothing)
    const plain = turn.letter === null ? w.chart.playMoved : scored ? '' : turn.refresh ? turn.letter : fill(w.chart.playNoWords, { letter: turn.letter })
    if (turn.refresh) rest.push(turn.refreshed ? fill(w.chart.playRefresh, { n: turn.refreshed }) : w.chart.playKeepAll)
    const knots = turn.newlyTangled.map((id) => ({ owner: ownerOf(id), by: turn.seat }))
    if (knots.length) rest.push(w.chart.playTangled)
    const magic = scored ? fill(w.chart.playMagic, { n: turn.magic }) : ''
    const room0 = room - magic.length - rest.join(join).length - (rest.length ? join.length : 0)
    const words = !scored ? plain : wordsIn(turn.words.map((x) => x.word), maxWord, Math.max(maxWord, room0))
    return { seat, words, magic, rest: rest.join(join), knots, quiet: false }
  })
}

/** The Tangles column: each player's end-of-game tangle bonus ("+6" / "no bonus"), in turn order. */
export function tangleBonusPlays(game: GameState): PlayRow[] {
  const order = game.turnOrder ?? game.magic.map((_, seat) => seat)
  return order.map((seat) => {
    const n = game.tangleMagic[seat] ?? 0
    return { seat, words: '', magic: n > 0 ? fill(w.chart.playTangleBonus, { n }) : '', rest: n > 0 ? '' : w.chart.playNoTangleBonus, knots: [], quiet: n === 0 }
  })
}

/** A row as one line of words (screen readers, tests): "NEST · TEN +9 · Refresh 3". */
export const playText = (row: PlayRow) => [[row.words, row.magic].filter(Boolean).join(' '), row.rest].filter(Boolean).join(w.separator)

/** The whole round for screen readers: "Round 4: Yellow NEST +6 · Blue F · no words · Refresh 3". */
export const playsText = (label: string, rows: PlayRow[], name: Name) =>
  fill(w.chart.plays, { round: label, list: rows.map((r) => fill(w.chart.playsPart, { player: name(r.seat), play: playText(r) })).join(w.chart.playsJoin) })

// ─── The scorecard's rows ───

export type ScoreRow = { label: string; values: number[]; shown?: (string | number)[]; tint: boolean }
export type ScoreGroup = { name: string; rows: ScoreRow[] }

/** The scorecard's rows for these players (columns in `seats` order). Pure, so it's tested. */
export function scorecardRows(game: GameState, cards: Scorecard[], seats: number[]): ScoreGroup[] {
  const col = (value: (c: Scorecard) => number) => seats.map((seat) => value(cards[seat]))
  const lengths = LENGTHS.map((n, i) => ({
    label: i === LENGTHS.length - 1 ? fill(card.lettersPlus, { n }) : fill(card.letters, { n }),
    values: col((c) => c.byLength[i]),
    tint: true,
  })).filter((_, i) => LENGTHS[i] >= game.config.rules.minWordLength)
  return [
    { name: card.groups.magic, rows: [
      { label: card.total, values: col((c) => c.total), tint: true },
      { label: card.wordMagic, values: col((c) => c.wordMagic), tint: true },
      { label: card.tangleMagic, values: col((c) => c.tangleMagic), tint: true },
      { label: card.soloMagic, values: col((c) => c.soloMagic), tint: true },
    ] },
    { name: card.groups.words, rows: [
      ...lengths,
      { label: card.longestWord, values: col((c) => c.longestWord.length), tint: true },
      { label: card.bestTurn, values: col((c) => c.bestTurn?.magic ?? 0), shown: col((c) => c.bestTurn?.magic ?? 0).map((n) => (n ? `+${n}` : card.none)), tint: true },
    ] },
    { name: card.groups.play, rows: [
      { label: card.multiWord, values: col((c) => c.multiWordTurns), tint: true },
      { label: card.refreshed, values: col((c) => c.seedsRefreshed), tint: false },
      { label: card.completeTangles, values: col((c) => c.completeTangles ?? 0), shown: seats.map((seat) => cards[seat].completeTangles ?? card.none), tint: true },
    ] },
  ]
}

/** Which cells to tint: the biggest number in the row, if it's above 0 and not everyone's. */
export function bestCells(row: ScoreRow): boolean[] {
  const top = Math.max(...row.values)
  const all = row.values.every((v) => v === top)
  return row.values.map((v) => row.tint && top > 0 && !all && v === top)
}

// BEHAVIOUR METERS — what ONE seat did in a finished game, as numbers (src/ai, F38). Pure: no React, no store.
// The Personality Check averages them over many games and tests them against content/ai/feel-targets.json
// ("the Strategist tangles a rival in ≥ 60% of games"). They read the same log facts as the end-screen awards and reuse
// the award detectors (src/game/stats.ts), so "what the AI does" and "what players get awarded for" are measured
// the same way. Every meter works for a human seat too.
import { DIRECTIONS, addHex, hexKey, type Hex } from '../engine/hex'
import { logOf } from '../engine/log'
import type { GameState, LogTurn } from '../engine/types'
import { earnedAwards, hijacks, scorecards } from '../game/stats'

export type MeterId = keyof typeof meterNames

/** Every meter, with its plain-English name (per seat, per game). */
export const meterNames = {
  tanglesCaused: 'Rival glyphlings it tangled',
  rivalTangledThisGame: 'Tangled a rival this game (0/1)',
  nearRivalShare: 'Share of its turns ending within 2 hexes of a rival glyphling',
  rivalMovesCut: 'Rival moves it cut per turn (average)',
  avgWordLength: 'Average word length (letters)',
  wordMagicShare: 'Share of its Magic from words (not tangle bonus)',
  multiWordShare: 'Share of its scoring casts that made 2+ words',
  steals: 'Steals (Hijacks: a rival word grown into one it owns most of)',
  setups: 'Setups (casts that made no Magic, next to its own seeds)',
  secondHalfRatio: 'Magic in the 2nd half ÷ the 1st half',
  timesTangled: 'Times its own glyphlings got tangled',
  gotTangled: 'Its own glyphling got tangled this game (0/1)',
  roomToMove: 'Room to move: its glyphlings’ average moves at the start of its turns',
  refreshes: 'Refreshes',
  endedGame: 'Its turn ended the game (0/1)',
  calledIt: 'Called it: ended the game by tangling its OWN glyphling — the self-tangle gamble (0/1)',
  calledItRight: 'Called it AND won (0/1)',
  won: 'Won (0/1; a shared win counts)',
  awards: 'Awards earned',
} as const

export type Meters = Record<MeterId, number>

const hexDistance = (a: Hex, b: Hex) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2
const average = (list: number[]) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0)
const flag = (yes: boolean) => (yes ? 1 : 0)

/** Where every glyphling stands after each turn, replayed from the log (index = the turn's place in the log). */
function positionsAfterEachTurn(game: GameState, turns: LogTurn[]): Map<number, Hex>[] {
  // Before the first turn: where the log first moves each glyphling from (else where it stands now — it never moved)
  const where = new Map(game.glyphlings.map((g) => [g.id, turns.find((t) => t.glyphlingId === g.id)?.from ?? g.hex]))
  return turns.map((t) => {
    where.set(t.glyphlingId, t.to)
    return new Map(where)
  })
}

/** All the meters for one seat, from a finished game's log. A game without a log gives zeros. */
export function meters(game: GameState, seat: number): Meters {
  const log = logOf(game)
  const turns = log.turns
  const mine = turns.map((turn, index) => ({ turn, index })).filter((x) => x.turn.seat === seat)
  const ownerOf = new Map(game.glyphlings.map((g) => [g.id, g.seat]))
  const isRival = (id: number) => ownerOf.get(id) !== seat
  const positions = positionsAfterEachTurn(game, turns)

  // Tangles: rival glyphlings that became tangled on its turns; its own that became tangled on anyone's
  const tanglesCaused = mine.reduce((n, { turn }) => n + turn.newlyTangled.filter(isRival).length, 0)
  const timesTangled = turns.reduce((n, t) => n + t.newlyTangled.filter((id) => !isRival(id)).length, 0)
  const everTangled = game.tangled.some((id) => !isRival(id)) || turns.some((t) => t.tangledAfter.some((id) => !isRival(id)))

  // Near a rival: the glyphling it moved ends the turn within 2 hexes of a rival glyphling
  const near = mine.map(({ turn, index }) =>
    flag(game.glyphlings.some((g) => g.seat !== seat && hexDistance(positions[index].get(g.id)!, turn.to) <= 2)))

  // Rival moves cut: the moves its whole turn (move + cast) took from rival glyphlings (log mobility)
  const cuts = mine.flatMap(({ turn }) => {
    const m = turn.mobility
    if (!m) return [] // (an old log without the facts)
    return [game.glyphlings.filter((g) => g.seat !== seat).reduce((n, g) => n + Math.max(0, (m.before[g.id] ?? 0) - (m.afterCast[g.id] ?? 0)), 0)]
  })

  // Room to move: its glyphlings' average moves at the start of its turns
  const room = mine.flatMap(({ turn }) => {
    const m = turn.mobility
    return m ? [average(game.glyphlings.filter((g) => g.seat === seat).map((g) => m.before[g.id] ?? 0))] : []
  })

  // Words
  const words = mine.flatMap(({ turn }) => turn.words)
  const scoring = mine.filter(({ turn }) => turn.words.length > 0)
  const card = scorecards(game)[seat]
  const total = card?.total ?? 0

  // Setups (kept simple): a cast that made no Magic, landing next to one of its own seeds already on the board.
  // Seeds never move or go away, so "already there" = in the final garden and cast on an earlier turn.
  const castAt = new Map(turns.flatMap((t, i) => (t.target ? [[hexKey(t.target), i] as const] : [])))
  const setups = mine.filter(({ turn, index }) => {
    if (turn.letter === null || !turn.target || turn.magic > 0) return false
    return DIRECTIONS.some((d) => {
      const key = hexKey(addHex(turn.target!, d))
      return game.seeds[key]?.seat === seat && (castAt.get(key) ?? Infinity) < index
    })
  }).length

  // Halves: the game's turns split in two by turn number
  const half = (turns.at(-1)?.turnNo ?? 0) / 2
  const firstHalf = mine.filter(({ turn }) => turn.turnNo <= half).reduce((n, { turn }) => n + turn.magic, 0)
  const secondHalf = mine.filter(({ turn }) => turn.turnNo > half).reduce((n, { turn }) => n + turn.magic, 0)

  const endedIt = log.end?.endedBy === seat
  // The gamble players can see: it ended the game by tangling one of its own glyphlings (intent can't be read).
  const calledIt = endedIt && !!log.end?.selfTangle
  const won = game.phase === 'over' && game.winners.includes(seat)

  return {
    tanglesCaused,
    rivalTangledThisGame: flag(tanglesCaused > 0),
    nearRivalShare: average(near),
    rivalMovesCut: average(cuts),
    avgWordLength: average(words.map((w) => w.letters.length)),
    wordMagicShare: total > 0 ? (card.wordMagic) / total : 0,
    multiWordShare: average(scoring.map(({ turn }) => flag(turn.words.length >= 2))),
    steals: hijacks(game).filter((h) => h.holder === seat).length,
    setups,
    // (no Magic in the 1st half: the 2nd half's Magic itself, so a slow start still reads as "grew later")
    secondHalfRatio: secondHalf / Math.max(firstHalf, 1),
    timesTangled,
    gotTangled: flag(everTangled),
    roomToMove: average(room),
    refreshes: mine.filter(({ turn }) => turn.refresh).length,
    endedGame: flag(endedIt),
    calledIt: flag(calledIt),
    calledItRight: flag(calledIt && won),
    won: flag(won),
    awards: earnedAwards(game).filter((a) => a.holder === seat).length,
  }
}

/** Meters for every seat. */
export const allMeters = (game: GameState): Meters[] => game.magic.map((_, seat) => meters(game, seat))

// THE END SCREEN'S NUMBERS — worked out from the finished game's log (src/engine/log.ts). Pure: no React, no store.
//   standings(game)        who came where (ties share a place)
//   scorecards(game)       one per player: Magic from words / solo words / tangles, words by length, best turn…
//   earnedAwards(game, t)  the Highlights: skill awards earned this game, measured from the log's facts (never Magic)
//   awardPoint(…)          where an award's star sits on the Story chart
//   storyChart(game, …)    Magic over the rounds, one line per player, plus a Tangles step and moment markers
// The words for all of it live in content/text/en.json → game.end; the knobs in content/tuning/endscreen.json.
import { hexKey } from '../engine/hex'
import { reachArea } from '../engine/insight'
import { logIsComplete, logOf } from '../engine/log'
import type { GameState, LogTurn, LogWord } from '../engine/types'
import endscreenFile from '../../content/tuning/endscreen.json'
import textFile from '../../content/text/en.json'

const endWords = textFile.game.gameOver

export type EndTuning = typeof endscreenFile

// ─── Standings ───────────────────────────────────────────────

export interface Standing {
  seat: number
  magic: number
  /** 1 = first. Equal Magic shares a place ("=2nd"); the next place skips (1, =2, =2, 4). */
  place: number
  /** Someone else has the same place. */
  tied: boolean
}

/** Best first; equal Magic keeps seat order. */
export function standings(game: GameState): Standing[] {
  const magic = game.magic
  return magic
    .map((m, seat) => ({
      seat,
      magic: m,
      place: 1 + magic.filter((other) => other > m).length,
      tied: magic.filter((other) => other === m).length > 1,
    }))
    .sort((a, b) => a.place - b.place || a.seat - b.seat)
}

// ─── Scorecards ──────────────────────────────────────────────

/** Word-length buckets on the scorecard: 2, 3, 4, 5, 6+ letters. */
export const LENGTHS = [2, 3, 4, 5, 6] as const

export interface Scorecard {
  seat: number
  total: number
  /** Magic from words (everything but the tangle bonus). */
  wordMagic: number
  /** …of which from solo words: words made only of this player's own seeds. */
  soloMagic: number
  tangleMagic: number
  /** How many words of 2, 3, 4, 5, 6+ letters (the same order as LENGTHS). */
  byLength: number[]
  wordsMade: number
  longestWord: string
  bestWord: { word: string; magic: number } | null
  bestTurn: { magic: number; words: string[]; turnNo: number } | null
  /** Turns that grew 2 or more words at once. */
  multiWordTurns: number
  /** Seeds set aside on refreshes, all game. */
  seedsRefreshed: number
  /** Rivals' glyphlings this player COMPLETELY tangled: only this player's seeds next to it when it got tangled
   *  (the board edge ignored; log.ts completeTangler). null = unknown: a log written before they were recorded. */
  completeTangles: number | null
  /** Letters from other players' seeds in this player's words. */
  lettersBorrowed: number
  /** This player's seeds in other players' words. */
  lettersGiven: number
}

const bucketOf = (length: number) => Math.min(length, 6) - 2 // 2 → 0 … 6+ → 4 (1-letter words don't exist)
const isSolo = (w: LogWord, seat: number) => w.owners.every((o) => o === seat)

/** Who tangled each glyphling still tangled at the end: the seat whose turn last tangled it (glyphling id → seat). */
export function tanglers(turns: LogTurn[]): Map<number, number> {
  const by = new Map<number, number>()
  for (const t of turns) for (const id of t.newlyTangled) by.set(id, t.seat)
  return by
}

export function scorecards(game: GameState): Scorecard[] {
  const log = logOf(game)
  // (an old log can't say: unknown for everyone, rather than a wrong 0)
  const knowsComplete = logIsComplete(game) && log.turns.every((t) => t.completeTangles)
  return game.magic.map((total, seat) => {
    const mine = log.turns.filter((t) => t.seat === seat)
    const words = mine.flatMap((t) => t.words)
    const byLength = LENGTHS.map(() => 0)
    for (const w of words) byLength[bucketOf(w.word.length)] += 1
    const best = mine.reduce<LogTurn | null>((top, t) => (t.magic > (top?.magic ?? 0) ? t : top), null)
    const bestWord = words.reduce<LogWord | null>((top, w) => (w.magic > (top?.magic ?? 0) ? w : top), null)
    const othersWords = log.turns.filter((t) => t.seat !== seat).flatMap((t) => t.words)
    return {
      seat,
      total,
      wordMagic: total - (game.tangleMagic[seat] ?? 0), // (not summed from the log: an old save's log can be partial)
      soloMagic: words.filter((w) => isSolo(w, seat)).reduce((sum, w) => sum + w.magic, 0),
      tangleMagic: game.tangleMagic[seat] ?? 0,
      byLength,
      wordsMade: words.length,
      longestWord: words.reduce((top, w) => (w.word.length > top.length ? w.word : top), ''),
      bestWord: bestWord && { word: bestWord.word, magic: bestWord.magic },
      bestTurn: best && { magic: best.magic, words: best.words.map((w) => w.word), turnNo: best.turnNo },
      multiWordTurns: mine.filter((t) => t.words.length >= 2).length,
      seedsRefreshed: mine.reduce((sum, t) => sum + t.refreshed, 0),
      completeTangles: knowsComplete
        ? log.turns.reduce((sum, t) => sum + (t.completeTangles ?? []).filter((c) => c.by === seat).length, 0)
        : null,
      lettersBorrowed: words.reduce((sum, w) => sum + w.owners.filter((o) => o !== seat).length, 0),
      lettersGiven: othersWords.reduce((sum, w) => sum + w.owners.filter((o) => o === seat).length, 0),
    }
  })
}

// ─── Awards ──────────────────────────────────────────────────
// The Highlights (GDD §4 Awards; Muzzy, 2026-10-02): "achievements should incentivize specific and correct/clever
// plays" — and "this game is secretly more about positioning and blocking your opponent than it is spelling". Intent
// can't be read, so each award measures a turn's EFFECT (the log's facts, engine/insight.ts) and is earned only when
// the effect is big (endscreen.json thresholds); its caption shows the proof ("Blue: 9 moves → 2"). Never luck, never
// bad play — a rival's mistake becomes the other player's award. Only awards actually earned show, each at most once
// per player per game (its biggest moment); Biggest comeback once per game. Awards never add Magic.

export type AwardId = keyof EndTuning['awardOrder']

export interface Award {
  id: AwardId
  /** The player it's for. */
  holder: number
  /** Players to show beside it (the holder first). */
  seats: number[]
  /** The turn it points at (turnNo): where the Story chart's star goes, on the holder's line. */
  moment: number
  /** Fill-ins for its words in en.json: n (a number), word, other (a seat)… */
  values: Record<string, string | number | boolean>
  /** How big the effect was (the bigger one wins between moments of the same award). */
  effect: number
}

const keyOf = (h: { q: number; r: number }) => `${h.q},${h.r}`
const ownerOfGlyphling = (game: GameState, id: number) => game.glyphlings.find((g) => g.id === id)?.seat ?? Math.floor(id / 2)

/**
 * Walled gardens, rebuilt from the log: after each turn, every glyphling's garden (engine/insight.ts reachArea) on
 * that turn's board — the final seeds minus those cast later (a seed never moves or goes away) — with the glyphlings
 * where the log's moves put them. A glyphling is walled in when no rival glyphling stands in its garden; WHOEVER
 * built the wall (Muzzy, 2026-10-03: "you walled me in and I STILL crushed you"). Per glyphling: the first turn its
 * walled garden is `maxSize` hexes or fewer, and that cell.
 */
export function walledCells(game: GameState, maxSize: number): { glyphling: number; seat: number; from: number; hexes: Set<string> }[] {
  const turns = logOf(game).turns
  const castOn = turns.map((t) => (t.target ? hexKey(t.target) : null))
  const seeds = { ...game.seeds }
  for (const key of castOn) if (key) delete seeds[key] // the board before the first turn
  const where = new Map(game.glyphlings.map((g) => [g.id, turns.find((t) => t.glyphlingId === g.id)?.from ?? g.hex]))
  const found = new Map<number, { glyphling: number; seat: number; from: number; hexes: Set<string> }>()
  turns.forEach((turn, j) => {
    const cast = castOn[j]
    if (cast && game.seeds[cast]) seeds[cast] = game.seeds[cast]
    where.set(turn.glyphlingId, turn.to)
    const board = { ...game, seeds }
    for (const g of game.glyphlings) {
      if (found.has(g.id)) continue
      const garden = reachArea(board, where.get(g.id)!)
      if (garden.size > maxSize) continue
      const rivalIn = game.glyphlings.some((o) => o.seat !== g.seat && garden.has(hexKey(where.get(o.id)!)))
      if (!rivalIn) found.set(g.id, { glyphling: g.id, seat: g.seat, from: j, hexes: garden })
    }
  })
  return [...found.values()]
}

export interface PincerHunt {
  /** Who did the squeezing. */
  holder: number
  /** The rival glyphling squeezed, and its owner. */
  glyphling: number
  seat: number
  /** Its moves at the start of the hunt's first turn, and after the hunt's last cast. */
  from: number
  to: number
  /** How many of the holder's turns the hunt lasted. */
  turns: number
  /** (from − to) / from: the share of its room taken (0 when it had none). */
  share: number
  /** Where the hunt's last turn is in the log (the Story chart's star goes there). */
  lastIndex: number
}

/**
 * Pincer hunts (D68), from the log's per-turn `mobility`: a hunt is a run of one player's own turns, in order, where
 * EVERY turn cut the same rival glyphling's moves (its moves at the start of that turn → after that turn's cast; by
 * the move, the cast or both). A turn of theirs that doesn't cut it ends the run. What its owner did between those
 * turns counts honestly: `to` is simply where it ended up. Every hunt is returned, however small (stats decides).
 */
export function pincerHunts(game: GameState): PincerHunt[] {
  const turns = logOf(game).turns
  const hunts: PincerHunt[] = []
  for (const holder of new Set(turns.map((x) => x.seat))) {
    for (const g of game.glyphlings.filter((x) => x.seat !== holder)) {
      let run: PincerHunt | null = null
      turns.forEach((turn, i) => {
        if (turn.seat !== holder) return
        const before = turn.mobility?.before[g.id]
        const after = turn.mobility?.afterCast[g.id]
        const cut = before !== undefined && after !== undefined && after < before
        if (!cut) {
          run = null // the run is over (it's already in the list)
          return
        }
        if (!run) {
          run = { holder, glyphling: g.id, seat: g.seat, from: before, to: after, turns: 0, share: 0, lastIndex: i }
          hunts.push(run)
        }
        run.to = after
        run.turns += 1
        run.lastIndex = i
        run.share = run.from > 0 ? (run.from - run.to) / run.from : 0
      })
    }
  }
  return hunts
}

export interface Hijack {
  holder: number
  /** The rival who grew the shorter word first. */
  other: number
  from: string
  word: string
  magic: number
  /** Where the hijacking turn is in the log. */
  turnIndex: number
}

/** Every hijack this game, in log order (the Hijack award's detector; the AI's steals meter counts them all): a word a
 *  rival grew earlier (≥ minFrom letters), made into a longer one where the holder owns most of the seeds. */
export function hijacks(game: GameState, minFrom: number = endscreenFile.hijackMinFrom): Hijack[] {
  const turns = logOf(game).turns
  const found: Hijack[] = []
  turns.forEach((turn, i) => {
    const seat = turn.seat
    for (const w of turn.words) {
      const hexes = w.hexes
      if (!hexes || w.owners.filter((o) => o === seat).length * 2 <= w.owners.length) continue
      const mine = new Set(hexes)
      const theirs = turns.slice(0, i).filter((x) => x.seat !== seat).flatMap((x) => x.words.map((v) => ({ x, v })))
        .find(({ v }) => v.hexes && v.letters.length >= minFrom && v.hexes.length < hexes.length && v.hexes.every((h) => mine.has(h)))
      if (theirs) found.push({ holder: seat, other: theirs.x.seat, from: theirs.v.word, word: w.word, magic: w.magic, turnIndex: i })
    }
  })
  return found
}

/** Every award earned this game, best moment per player per award, in the carousel's order (awardOrder, then size). */
export function earnedAwards(game: GameState, tuning: EndTuning = endscreenFile): Award[] {
  const log = logOf(game)
  const turns = log.turns
  if (!turns.length) return []
  const t = tuning
  const found: Award[] = []
  const add = (id: AwardId, holder: number, turn: LogTurn, effect: number, values: Award['values'], seats: number[] = []) =>
    found.push({ id, holder, seats: [...new Set([holder, ...seats])], moment: turn.turnNo, values: { round: turn.round, ...values }, effect })
  const rivalsOf = (seat: number) => game.glyphlings.filter((g) => g.seat !== seat)
  const totalsBefore = (i: number) => (i > 0 ? turns[i - 1].totalsAfter : game.magic.map(() => 0))
  const everTangled = (id: number) => game.tangled.includes(id) || turns.some((x) => x.tangledAfter.includes(id))

  turns.forEach((turn) => {
    const seat = turn.seat
    const m = turn.mobility
    // ── Positioning & blocking ──
    if (m) {
      for (const g of rivalsOf(seat)) {
        const [from, to] = [m.before[g.id], m.afterCast[g.id]]
        if (from === undefined || to === undefined) continue
        // Lockdown: this turn took a rival glyphling from many moves to almost none
        if (from - to >= t.lockdownMinDrop && to <= t.lockdownMaxAfter) {
          add('lockdown', seat, turn, from - to, { other: g.seat, from, to }, [g.seat])
        }
      }
      // Close call: one of the mover's glyphlings had 1 move left (the danger cue) at the start of their turn, had
      // plenty after it — and was never tangled all game
      for (const g of game.glyphlings.filter((x) => x.seat === seat)) {
        const now = m.afterCast[g.id] ?? 0
        if (m.before[g.id] === 1 && now >= t.closeCallMinAfter && !everTangled(g.id)) add('closeCall', seat, turn, now, { n: now })
      }
    }
    // Weed toss: a cast that scored (next to) nothing but took a rival's scoring spot, or cut a rival's moves
    if (turn.letter !== null && turn.target && turn.magic <= t.weedMaxMagic && m && turn.blocked !== undefined) {
      const refreshed = turn.refresh && turn.refreshed > 0
      const bonus = refreshed ? 0.5 : 0
      const block = turn.blocked && turn.blocked.magic >= t.weedMinBlocked ? turn.blocked : null
      const cut = rivalsOf(seat).map((g) => ({ seat: g.seat, from: m.afterMove[g.id] ?? 0, to: m.afterCast[g.id] ?? 0 }))
        .filter((c) => c.from - c.to >= t.weedMinCut).sort((a, b) => b.from - b.to - (a.from - a.to))[0]
      if (block) add('weedToss', seat, turn, block.magic + bonus, { kind: 'block', other: block.seat, n: block.magic, word: block.word, refreshed }, [block.seat])
      // (the cut kind: thrown to block AND to clear the hand — Muzzy: "to block someone so you can also intentionally refresh")
      else if (cut && refreshed) add('weedToss', seat, turn, cut.from - cut.to + bonus, { kind: 'cut', other: cut.seat, from: cut.from, to: cut.to, refreshed }, [cut.seat])
    }
    // Through the hedge: a scoring cast that flew over the caster's own seeds
    const over = turn.castOver ?? 0
    if (over >= t.hedgeMinOver && turn.magic > 0) add('throughHedge', seat, turn, over * 100 + turn.magic, { over, n: turn.magic })
    // Complete tangle: a rival glyphling tangled with only the holder's pieces round it (log.ts completeTangler)
    for (const c of turn.completeTangles ?? []) {
      if (c.by === null) continue
      const owner = ownerOfGlyphling(game, c.glyphling)
      add('completeTangle', c.by, turn, 1, { other: owner }, [owner])
    }
    // ── Spelling ──
    // Power Play: one seed made many words — only words of powerPlayMinLetters+ count (Muzzy 2026-10-07: two-letter
    // words made "lots of words" too easy)
    const powerWords = turn.words.filter((w) => w.letters.length >= t.powerPlayMinLetters)
    if (powerWords.length >= t.powerPlayMin) add('powerPlay', seat, turn, powerWords.length * 100 + turn.magic, { n: powerWords.length, words: powerWords.map((w) => w.word).join(endWords.and) })
    const longMin = game.config.boardName === 'small' ? t.longWordMinSmall : t.longWordMinLarge
    for (const w of turn.words) {
      if (w.letters.length >= longMin) add('longWord', seat, turn, w.letters.length * 100 + w.magic, { n: w.letters.length, word: w.word })
      // Bridge / Super Bridge (Muzzy 2026-10-07): the seed is a BRIDGE LETTER — any letter but the word's first or last
      // (chAt) — so it joined letters already on both sides. The word's length sets the level: Bridge from
      // bridgeMinLength letters (4), Super Bridge from superBridgeMinLength (5+). Rewards planning ahead / seeing the gap.
      const bridgeLetter = w.at !== undefined && w.at > 0 && w.at < w.letters.length - 1
      const len = w.letters.length
      const level = !bridgeLetter ? null : len >= t.superBridgeMinLength ? 'superBridge' : len >= t.bridgeMinLength ? 'bridge' : null
      if (level && w.at !== undefined) {
        add(level, seat, turn, w.letters.length * 100 + w.magic, { word: w.word, letter: w.letters[w.at], left: w.letters.slice(0, w.at).join(''), right: w.letters.slice(w.at + 1).join('') })
      }
    }
  })
  // Hijack: a word a rival grew earlier, made into a longer one where the holder owns most of the seeds
  for (const h of hijacks(game, t.hijackMinFrom)) {
    add('hijack', h.holder, turns[h.turnIndex], h.magic, { other: h.other, from: h.from, word: h.word, n: h.magic }, [h.other])
  }

  // Pincer (D68): the biggest SHARE of one rival glyphling's room taken over a hunt — a run of your turns that each cut
  // it (Muzzy, 2026-10-04: "this proves aggressive play"). Only the share counts, so an early squeeze (lots of room)
  // no longer beats a late one. Best hunt wins: the bigger share, then the bigger starting room, then the later turn.
  for (const hunt of pincerHunts(game)) {
    if (hunt.from < t.pincerMinFrom || hunt.share < t.pincerMinShare) continue
    const last = turns[hunt.lastIndex]
    const values = { other: hunt.seat, from: hunt.from, to: hunt.to, turns: hunt.turns, pct: Math.round(hunt.share * 100) }
    add('pincer', hunt.holder, last, hunt.share * 1e9 + hunt.from * 1000 + last.turnNo, values, [hunt.seat])
  }

  // Walled garden: a glyphling walled into a small garden no rival glyphling can reach (whoever built the wall) —
  // then the Magic its owner made in there, from the turn the garden was walledMaxSize hexes or fewer (Muzzy: "it got
  // smaller and smaller, so it should have triggered when I got to 10 and tracked from there"): every turn of theirs
  // that moved from and to hexes inside it
  for (const cell of walledCells(game, t.walledMaxSize)) {
    let made = 0
    for (let j = cell.from; j < turns.length; j++) {
      const later = turns[j]
      if (later.seat !== cell.seat || !cell.hexes.has(keyOf(later.to)) || (j > cell.from && !cell.hexes.has(keyOf(later.from)))) continue
      made += later.magic
    }
    if (made >= t.walledMinMagic) add('walledGarden', cell.seat, turns[cell.from], made, { n: made })
  }

  // ── Momentum & ending ──
  // Biggest comeback: the one turn that took the lead (alone) from furthest behind — once per game, no minimum
  // (Muzzy, 2026-10-03: look at every comeback and award the biggest)
  let comeback: { turn: LogTurn; behind: number } | null = null
  turns.forEach((turn, i) => {
    const was = totalsBefore(i)
    const best = (totals: number[]) => Math.max(...totals.filter((_, s) => s !== turn.seat))
    const behind = best(was) - was[turn.seat]
    if (behind > 0 && turn.totalsAfter[turn.seat] > best(turn.totalsAfter) && behind > (comeback?.behind ?? 0)) comeback = { turn, behind }
  })
  const back = comeback as { turn: LogTurn; behind: number } | null
  if (back) add('comeback', back.turn.seat, back.turn, back.behind, { n: back.behind, gain: back.turn.magic })
  // The ending: who ended it, and were they ahead or behind at that moment (before the tangle bonus)?
  const end = log.end
  const last = end ? turns.find((x) => x.turnNo === end.endedOnTurn) : undefined
  if (end && last && last.totalsAfter.length > 1) {
    const ender = end.endedBy
    const margin = last.totalsAfter[ender] - Math.max(...last.totalsAfter.filter((_, s) => s !== ender))
    // Called it: ended the game while secretly in the lead — and it held (they won)
    if (margin >= Math.max(1, t.calledItMinLead) && game.winners.includes(ender)) add('calledIt', ender, last, margin, { n: margin })
    // Trickster's Victory: a rival ended the game while behind — the winner gets the credit
    if (-margin >= Math.max(1, t.tricksterMinBehind) && !game.winners.includes(ender)) {
      for (const winner of game.winners) add('trickster', winner, last, -margin, { other: ender, n: -margin }, [ender])
    }
  }

  // Best moment per player per award; then the carousel's order
  const order = tuning.awardOrder as Record<AwardId, number>
  const best = new Map<string, Award>()
  for (const a of found) {
    if (!((order[a.id] ?? 0) > 0)) continue
    const k = `${a.id}:${a.holder}`
    const old = best.get(k)
    if (!old || a.effect > old.effect) best.set(k, a)
  }
  // An award's higher level replaces its lower one for the same player (a Super Bridge, not a Bridge as well)
  for (const [higher, lower] of AWARD_LEVELS) {
    for (const a of best.values()) if (a.id === higher) best.delete(`${lower}:${a.holder}`)
  }
  return [...best.values()].sort((a, b) => order[a.id] - order[b.id] || b.effect - a.effect || a.moment - b.moment)
}

/** Awards with levels: [higher, lower] — a player who earns the higher one doesn't also get the lower one. */
const AWARD_LEVELS: [AwardId, AwardId][] = [['superBridge', 'bridge']]

/** The Story chart's spot for an award: on the holder's line, at the round of its turn. */
export function awardPoint(game: GameState, chart: StoryChart, award: Award): ChartMarker | null {
  if (chart.rounds === 0) return null
  const turn = logOf(game).turns.find((x) => x.turnNo === award.moment)
  if (!turn) return null
  return { kind: 'award', seat: award.holder, x: Math.min(turn.round, chart.rounds), turnNo: turn.turnNo, award: award.id }
}

// ─── The Story chart ─────────────────────────────────────────

/** The last turn of each round, in order. */
export function roundEnds(turns: LogTurn[]): LogTurn[] {
  return turns.filter((t, i) => turns[i + 1]?.round !== t.round)
}

export interface ChartMarker {
  kind: 'tangle' | 'award' | 'lead'
  /** The line it sits on. */
  seat: number
  /** x = round number (0 = the start); rounds + 1 = the Tangles step. */
  x: number
  /** The turn to tell about when it's tapped (null = the tangle bonus at the end). */
  turnNo: number | null
  /** tangle: who tangled it (its outline colour). */
  by?: number
  /** tangle: which glyphling. award (the Highlights star, awardPoint): which award. */
  glyphling?: number
  award?: AwardId
}

export interface StoryChart {
  rounds: number
  /** One line per seat: Magic at the start (0), after each round, then after the tangle bonus. */
  series: { seat: number; points: number[] }[]
  markers: ChartMarker[]
  /** Online: where a bot played for a person (F62) — a darker band behind their line from x `from` to x `to` (x as in
   *  the points: a round's play runs from round − 1 to round). One band per unbroken run of their bot-played turns. */
  bands: BotBand[]
  /** The biggest number on the chart (for the scale). */
  max: number
}

/** A stretch of one player's line a bot played for them (online: idle, out of time, left…). */
export interface BotBand { seat: number; from: number; to: number }

/**
 * The bot bands (F62): each player's turns a bot played FOR them (`botTurns` = log turnNos, from the server), joined
 * into runs — a run lasts while their own turns keep being the bot's (a round they had no turn, all tangled, doesn't
 * break it) — and placed on the chart: from the round the bot took over (its start, x = round − 1) to the round the
 * person took back (x = the last bot round). None in pass-and-play (botTurns is always empty there).
 */
export function botBands(turns: LogTurn[], botTurns: number[]): BotBand[] {
  if (!botTurns.length) return []
  const byBot = new Set(botTurns)
  const bands: BotBand[] = []
  const open = new Map<number, BotBand>() // (each seat's run still going)
  for (const t of turns) {
    const run = open.get(t.seat)
    if (!byBot.has(t.turnNo)) { open.delete(t.seat); continue }
    if (run) run.to = t.round
    else {
      const band = { seat: t.seat, from: t.round - 1, to: t.round }
      bands.push(band)
      open.set(t.seat, band)
    }
  }
  return bands
}

/** The chart: the lines, plus marks for tangles and lead changes (the current award's star is drawn on top: awardPoint),
 *  plus (online) the bands where a bot played for someone — `botTurns`, the server's list (F62). */
export function storyChart(game: GameState, maxMarkers: number, botTurns: number[] = []): StoryChart {
  // A log that doesn't cover every turn (an old save) can't tell the story: just the start and the end, no marks
  if (!logIsComplete(game)) {
    return { rounds: 0, series: game.magic.map((final, seat) => ({ seat, points: [0, final] })), markers: [], bands: [], max: Math.max(1, ...game.magic) }
  }
  const turns = logOf(game).turns
  const ends = roundEnds(turns)
  const rounds = ends.length
  const series = game.magic.map((final, seat) => ({ seat, points: [0, ...ends.map((t) => t.totalsAfter[seat]), final] }))
  // Tangles: on the tangled glyphling's owner's line, in the round it got tangled, outlined in the tangler's colour
  const tangledBy = tanglers(turns)
  const tangleMarks: ChartMarker[] = game.tangled.flatMap((id) => {
    const turn = [...turns].reverse().find((t) => t.newlyTangled.includes(id))
    const owner = game.glyphlings.find((g) => g.id === id)?.seat
    if (!turn || owner === undefined) return []
    return [{ kind: 'tangle' as const, seat: owner, x: turn.round, turnNo: turn.turnNo, by: tangledBy.get(id), glyphling: id }]
  })
  // Lead changes: where a new player leads alone at a round's end
  const leadMarks: ChartMarker[] = []
  let leader: number | null = null
  ends.forEach((t) => {
    const top = Math.max(...t.totalsAfter)
    const at = t.totalsAfter.flatMap((m, seat) => (m === top ? [seat] : []))
    if (at.length !== 1 || at[0] === leader) return
    if (leader !== null) leadMarks.push({ kind: 'lead', seat: at[0], x: t.round, turnNo: t.turnNo })
    leader = at[0]
  })
  // No two markers on the same spot; tangles first, then lead changes
  const markers: ChartMarker[] = []
  for (const m of [...tangleMarks, ...leadMarks]) {
    if (markers.length >= maxMarkers) break
    if (markers.some((o) => o.seat === m.seat && o.x === m.x)) continue
    markers.push(m)
  }
  const max = Math.max(1, ...series.flatMap((s) => s.points))
  return { rounds, series, markers, bands: botBands(turns, botTurns), max }
}

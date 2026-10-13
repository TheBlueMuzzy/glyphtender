// PLAYING + CHECKING THE RAILS (F76): plays the scripted opening through the real rules door and lists every rails
// step that doesn't happen the way design/tutorial.md §2 promises. Used by the proof test (rails.test.ts) and the
// layout finder (scripts/tutorial/find-rails.mjs) — one list of promises, so the finder can't find a layout the test
// would refuse.
import { DIRECTIONS, LEYLINES, addHex, hexKey, ray, sameHex, type Hex } from '../engine/hex'
import { getBoard } from '../engine/boards'
import { withoutSeed } from '../engine/insight'
import { glyphtenderRules, movesLeft, type GameEvent } from '../engine/rules'
import type { Action, GameState, WordList } from '../engine/types'
import { rails, railsAction, railsGlyphling, railsHex, railsSetup, railsStep, type Rails, type RailsStep } from './rails'

/** One scripted step as it was played: the game before, the action, the game after, and its events. */
export interface PlayedStep {
  step: RailsStep
  before: GameState
  action: Action
  after: GameState
  events: GameEvent[]
}

/** Plays the whole rails script (draft ×4, your turn 1 + refresh, Sprout's turn 1 + keep all, your turn 2) through
 *  glyphtenderRules(words). Throws (the rules' own reason) if a scripted action is illegal. */
export function playRails(words: WordList, layout: Rails = rails, fast = false): PlayedStep[] {
  const door = glyphtenderRules(words)
  let game = door.setup(railsSetup(layout))
  const played: PlayedStep[] = []
  for (let action = railsAction(game, layout); action; action = railsAction(game, layout)) {
    const step = railsStep(game, layout)
    const applied = door.apply(game, game.current, action, { fast })
    played.push({ step, before: game, action, after: applied.state, events: applied.events })
    game = applied.state
  }
  return played
}

const lineBetween = (from: Hex, to: Hex): { dir: Hex; between: Hex[] } | null => {
  for (const dir of DIRECTIONS) {
    const between: Hex[] = []
    for (let h = addHex(from, dir), i = 0; i < 20; h = addHex(h, dir), i++) {
      if (sameHex(h, to)) return { dir, between }
      between.push(h)
    }
  }
  return null
}

/** Every rails promise that doesn't hold, in plain English ([] = the layout works). */
export function railsProblems(words: WordList, layout: Rails = rails, fast = false): string[] {
  const problems: string[] = []
  let played: PlayedStep[]
  try {
    played = playRails(words, layout, fast)
  } catch (e) {
    return [`A scripted step is illegal: ${(e as Error).message}`]
  }
  const stepOf = (name: RailsStep) => played.find((p) => p.step === name)
  const names = played.map((p) => p.step).join(' ')
  if (names !== 'draft draft draft draft turn1 refresh1 aiTurn1 aiRefresh turn2') return [`The script played ${names}`]
  const board = getBoard(layout.boardName)
  const hex = (label: string) => railsHex(label, layout)
  const you = layout.you
  const ai = layout.ai.seat
  const blueAt = (game: GameState, label: string) => game.glyphlings.find((g) => g.seat === ai && sameHex(g.hex, hex(label)))

  // Turn 1 — the move: one of its lines stops short at Blue's glyphling (≥1 glowing hex before it).
  const t1 = stepOf('turn1')!
  const mover = railsGlyphling(you, layout.turn1.glyphling)
  const start = t1.before.glyphlings.find((g) => g.id === mover)!.hex
  if (!blueAt(t1.before, layout.turn1.blockedAt)) problems.push('turn1.blockedAt is not a Blue glyphling')
  const taken = new Set([...t1.before.glyphlings.map((g) => hexKey(g.hex)), ...Object.keys(t1.before.seeds)])
  const stopsShort = DIRECTIONS.some((dir) => {
    const line = ray(board, start, dir)
    const firstTaken = line.findIndex((h) => taken.has(hexKey(h)))
    return firstTaken >= 1 && sameHex(line[firstTaken], hex(layout.turn1.blockedAt))
  })
  if (!stopsShort) problems.push('None of the mover’s lines stops short (≥1 hex) at turn1.blockedAt')
  // The plant flies over your other glyphling.
  const other = t1.before.glyphlings.find((g) => g.seat === you && g.id !== mover)!
  if (!sameHex(other.hex, hex(layout.turn1.overOwn))) problems.push('turn1.overOwn is not your other glyphling')
  const flight = lineBetween(hex(layout.turn1.to), hex(layout.turn1.plant))
  if (!flight || !flight.between.some((h) => sameHex(h, other.hex))) problems.push('The turn-1 plant doesn’t fly over your other glyphling')
  // The seed takes moves away from Blue's glyphling on `blocks`.
  const blocked = blueAt(t1.after, layout.turn1.blocks)
  if (!blocked) problems.push('turn1.blocks is not a Blue glyphling')
  else if (movesLeft(t1.after, blocked.id) >= movesLeft(withoutSeed(t1.after, hex(layout.turn1.plant)), blocked.id)) {
    problems.push('The turn-1 seed doesn’t block any of turn1.blocks’ moves')
  }
  if (t1.after.lastTurn?.words.length || t1.after.phase !== 'refresh') problems.push('Your turn 1 made a word (it should go to the refresh)')
  // The refresh: J and V go; an A grows in.
  const r1 = stepOf('refresh1')!
  const drawn = r1.after.hands[you].slice(r1.before.hands[you].length - layout.turn1.refresh.length).map((p) => p.letter)
  if (!drawn.includes(layout.turn2.seed)) problems.push(`The refresh doesn’t draw an ${layout.turn2.seed} (drew ${drawn.join('')})`)

  // Sprout's turn 1: a T two hexes from your C, one empty hex between, C → gap → T in reading order.
  const a1 = stepOf('aiTurn1')!
  const c = hex(layout.turn1.plant)
  const t = hex(layout.aiTurn1.plant)
  const gap = hex(layout.turn2.plant)
  const inLine = LEYLINES.some((dir) => sameHex(addHex(c, dir), gap) && sameHex(addHex(gap, dir), t))
  if (!inLine) problems.push('C, the gap (turn2.plant) and T are not C → gap → T along one leyline in reading order')
  if (a1.after.lastTurn?.words.length || a1.after.phase !== 'refresh') problems.push('Sprout’s turn 1 made a word')
  const ar = stepOf('aiRefresh')!
  if (ar.action.type !== 'refresh' || ar.action.setAside.length !== 0) problems.push('Sprout doesn’t keep all')

  // Your turn 2: exactly one word, worth the promised Magic, then a draw.
  const t2 = stepOf('turn2')!
  const made = t2.after.lastTurn?.words ?? []
  if (made.length !== 1 || made[0].word !== layout.turn2.word) problems.push(`Turn 2 made ${made.map((w) => w.word).join(' + ') || 'no word'}, not just ${layout.turn2.word}`)
  if (t2.after.magic[you] - t2.before.magic[you] !== layout.turn2.magic) problems.push(`Turn 2 is worth ${t2.after.magic[you] - t2.before.magic[you]} Magic, not ${layout.turn2.magic}`)
  if (t2.after.lastTurn?.drew !== 1) problems.push('You don’t draw 1 after turn 2')
  // Every draw on the rails comes from stack.next, in order (J and V, back in the bag at random places, never cut in).
  const drawsOf = (p: PlayedStep, seat: number, kept: number) => p.after.hands[seat].slice(kept).map((s) => s.letter)
  const allDraws = [
    ...drawn,
    ...drawsOf(ar, ai, ar.before.hands[ai].length),
    ...drawsOf(t2, you, t2.before.hands[you].length - 1),
  ]
  if (allDraws.join('') !== layout.stack.next.join('')) problems.push(`The rails draw ${allDraws.join('')}, not stack.next ${layout.stack.next.join('')}`)

  // No danger cue anywhere on the rails: every glyphling keeps ≥2 moves after every step once the draft is done.
  for (const p of played) {
    if (p.after.phase === 'draft') continue
    for (const g of p.after.glyphlings) {
      if (movesLeft(p.after, g.id) < 2) problems.push(`Glyphling ${g.id} is down to ${movesLeft(p.after, g.id)} move(s) after ${p.step}`)
    }
  }
  return problems
}

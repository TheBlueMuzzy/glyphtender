// Sprout — the hidden tutorial AI (F75, design/tutorial.md §5). Its habits are PREFERENCES, never rules (Muzzy,
// 2026-10-13: "we could end in a soft lock"): walled in, it still plays a legal turn; hidden from every player list.
import { describe, expect, it } from 'vitest'
import { getBoard } from '../engine/boards'
import { aiBot } from '../engine/bot'
import { hexKey, neighbours, type Hex } from '../engine/hex'
import { legalActions, viewFor } from '../engine/rules'
import { position } from '../engine/testkit'
import type { GameState } from '../engine/types'
import { botProfile } from '../../party/aiSeats'
import tutorialTuning from '../../content/tuning/tutorial.json'
import { personalityIds, skillIds } from '../ui/newGame'
import { selfTangleGoal } from './goals/selfTangle'
import { mobility } from './look'
import { actionKey } from './plug'
import { personalities, skills } from './seatBrain'
import { playSproutGames, sproutSummary } from './sproutSim'
import { contextFor, officialWords } from './testkit'

const words = officialWords()
const sprout = personalities.find((p) => p.id === 'Sprout')!
const seedling = skills.find((s) => s.id === 'Seedling')!
const board = getBoard('small')
const label = (h: Hex) => board.label(h)

/** Sprout (seat 1, glyphlings 2 and 3) on its own turn `ownTurn`; every blocker is a RIVAL seed (seeds fly past
 *  their owner's own pieces, so only rival ones stop a cast). */
function sproutPosition(glyphlings: Record<number, Hex>, blockers: Hex[], ownTurn: number, hand = ['E']): GameState {
  const seeds: Record<string, string> = {}
  for (const h of blockers) if (!Object.values(glyphlings).some((g) => hexKey(g) === hexKey(h))) seeds[label(h)] = 'Z'
  const state = position({
    glyphlings: Object.fromEntries(Object.entries(glyphlings).map(([id, h]) => [id, label(h)])),
    seeds: [seeds, {}],
    hands: [['A'], hand],
    current: 1,
  })
  return { ...state, turnCount: (ownTurn - 1) * 2 + 1 }
}

/** A hex well inside the board, and one of its neighbours (both with all 6 neighbours on the board). */
function innerPair(): { y: Hex; x: Hex } {
  const inner = board.cells.filter((h) => neighbours(board, h).length === 6)
  for (const y of inner) {
    const x = neighbours(board, y).find((n) => neighbours(board, n).length === 6)
    if (x) return { y, x }
  }
  throw new Error('no inner pair on the small board')
}
const far = (from: Hex[], minDistance = 3) => board.cells.filter((h) => neighbours(board, h).length === 6 && from.every((f) => Math.abs(f.q - h.q) + Math.abs(f.r - h.r) + Math.abs(f.q + f.r - h.q - h.r) >= minDistance * 2))

describe('Sprout always plays a legal turn', () => {
  it('walled in so that its ONLY legal turn tangles its second glyphling (ends the game): it still plays it', () => {
    // Glyphling 3 on X; its only way out is Y, a dead end; from Y the only cast is back onto X → tangled.
    const { x, y } = innerPair()
    const blockers = [...neighbours(board, y).filter((n) => hexKey(n) !== hexKey(x)), ...neighbours(board, x).filter((n) => hexKey(n) !== hexKey(y))]
    const pen = far([x, y], 4)[0] // glyphling 2: already tangled, in its own walled pen
    const rivalSpots = far([x, y, pen], 3).filter((h) => hexKey(h) !== hexKey(pen) && !neighbours(board, pen).some((n) => hexKey(n) === hexKey(h)))
    const state = sproutPosition({ 0: rivalSpots[0], 1: rivalSpots[rivalSpots.length - 1], 2: pen, 3: x }, [...blockers, ...neighbours(board, pen)], 8)
    expect(mobility(state)[2]).toBe(0)
    const legal = legalActions(state, 1)
    expect(legal.length).toBe(1) // the walled garden: one turn, and it tangles glyphling 3
    const play = aiBot(sprout, seedling, words)
    const picked = play(viewFor(state, 1), 1, 7).action
    expect(legal.map(actionKey)).toContain(actionKey(picked))
  })

  it('one glyphling with no move at all: it moves the other, by the normal rules (no stall)', () => {
    const pen = far([], 0)[0]
    const free = far([pen], 4)
    const state = sproutPosition({ 0: free[1], 1: free[free.length - 2], 2: pen, 3: free[Math.floor(free.length / 2)] }, neighbours(board, pen), 3)
    expect(mobility(state)[2]).toBe(0)
    const legal = legalActions(state, 1)
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.every((a) => a.type === 'turn' && a.glyphling === 3)).toBe(true)
    const picked = aiBot(sprout, seedling, words)(viewFor(state, 1), 1, 11).action
    expect(legal.map(actionKey)).toContain(actionKey(picked))
  })
})

describe('SELFTANGLE (Sprout\'s two habits, as scores)', () => {
  const goal = selfTangleGoal(words)
  // Glyphling 3 next to a pocket Y (all Y's other neighbours are rival seeds); glyphling 2 roomy.
  const { x, y } = innerPair()
  const blockers = neighbours(board, y).filter((n) => hexKey(n) !== hexKey(x))
  const roomy = far([x, y], 4)
  const at = (ownTurn: number) => sproutPosition({ 0: roomy[0], 1: roomy[roomy.length - 1], 2: roomy[Math.floor(roomy.length / 2)], 3: x }, blockers, ownTurn)
  const score = (state: GameState) => {
    const ctx = contextFor(state, sprout, seedling)
    return legalActions(state, 1).map((a) => ({ a, v: goal.score(a, ctx).value, tangles: a.type === 'turn' && mobility({ ...state, ...applyBoard(state, a) })[3] === 0 }))
  }
  it(`from its turn selfTangleBy (${tutorialTuning.selfTangleBy}) it likes walking into the pocket most`, () => {
    const scored = score(at(tutorialTuning.selfTangleBy))
    const tangling = scored.filter((s) => s.tangles)
    expect(tangling.length).toBeGreaterThan(0)
    const best = Math.max(...scored.map((s) => s.v))
    expect(tangling.some((s) => s.v === best)).toBe(true)
    expect(best).toBeGreaterThanOrEqual(50) // a tangle, next to rival seeds
  })
  it('before selfTangleBy and after maxTurns it has no opinion', () => {
    for (const turn of [tutorialTuning.selfTangleBy - 1, tutorialTuning.maxTurns + 1]) {
      expect(new Set(score(at(turn)).map((s) => s.v))).toEqual(new Set([0]))
    }
  })
  it('once one is tangled, it dislikes ending the game with the other', () => {
    // Glyphling 2 already tangled in a pen; glyphling 3 next to the pocket — walking in would end the game.
    const pen = far([x, y], 4)[0]
    const rivals = far([x, y, pen], 3).filter((h) => !neighbours(board, pen).some((n) => hexKey(n) === hexKey(h)) && hexKey(h) !== hexKey(pen))
    const state = sproutPosition({ 0: rivals[0], 1: rivals[rivals.length - 1], 2: pen, 3: x }, [...blockers, ...neighbours(board, pen)], 8)
    const scored = score(state)
    const ending = scored.filter((s) => s.tangles)
    expect(ending.length).toBeGreaterThan(0)
    for (const s of ending) expect(s.v).toBeLessThan(Math.min(...scored.filter((o) => !o.tangles).map((o) => o.v)))
  })
})

/** The board after a turn (move + cast), enough for mobility(). */
function applyBoard(state: GameState, a: ReturnType<typeof legalActions>[number]): Partial<GameState> {
  if (a.type !== 'turn') return {}
  const glyphlings = state.glyphlings.map((g) => (g.id === a.glyphling ? { ...g, hex: a.to } : g))
  const seeds = a.target ? { ...state.seeds, [hexKey(a.target)]: { id: 'x', letter: 'E', seat: 1 } } : state.seeds
  return { glyphlings, seeds }
}

describe('Sprout is hidden from players', () => {
  it('New Game, Surprise me and the online lobby never offer Sprout or Seedling', () => {
    expect(personalityIds()).not.toContain('Sprout')
    expect(skillIds()).not.toContain('Seedling')
    expect(personalityIds()).toEqual(['Scholar', 'Survivor', 'Strategist'])
    expect(() => botProfile('Sprout/Seedling')).toThrow()
    expect(() => botProfile('Sprout/Apprentice')).toThrow()
  })
  it('…but the AI can still play it (the tutorial asks for it by id)', () => {
    expect(sprout.goals).toContain('SELFTANGLE')
    expect(seedling.extras?.zipf).toBe(4)
  })
})

describe('Sprout\'s games (a few — npm run sim:sprout plays 300)', () => {
  // Whole games with the real AI: their own timeout (the GitHub runner is ~2.5× slower than a PC).
  it('every game ends, and the numbers are in range', { timeout: 180_000 }, () => {
    const games = playSproutGames(words, { games: 4, firstSeed: 9100 })
    const s = sproutSummary(games)
    expect(s.games).toBe(4)
    for (const g of games) {
      expect(g.turns).toBeGreaterThan(4)
      expect(g.ownTurns).toBeGreaterThan(0)
    }
    expect(s.sproutWonPct + s.rivalWonPct).toBeGreaterThanOrEqual(100)
  })
})

// THE RAILS PROOF (F76): the scripted opening in content/tutorial/rails.json, played through the real rules door with
// the real word list, does exactly what design/tutorial.md §2 promises. Every hex and letter comes from rails.json.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, addHex, hexKey, ray, sameHex } from '../engine/hex'
import { getBoard } from '../engine/boards'
import { withoutSeed } from '../engine/insight'
import { glyphtenderRules, legalActions, movesLeft, seedMagicOfTurn } from '../engine/rules'
import { parseWordList } from '../engine/words'
import type { GameState } from '../engine/types'
import { rails, railsAction, railsDraftHex, railsGlyphling, railsHex, railsSetup, railsStep } from './rails'
import { playRails, railsProblems, type PlayedStep } from './railsCheck'

const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const played = playRails(words)
const step = (name: PlayedStep['step']) => played.find((p) => p.step === name)!
const hex = railsHex
const letters = (game: GameState, seat: number) => game.hands[seat].map((p) => p.letter)
const you = rails.you
const ai = rails.ai.seat
const railsSetupHandSize = () => played[0].before.config.rules.handSize

describe('the rails (tutorial game opening)', () => {
  it('plays draft ×4, your turn 1 + refresh, Sprout’s turn 1 + keep all, your turn 2 — then free play', () => {
    expect(played.map((p) => p.step)).toEqual(['draft', 'draft', 'draft', 'draft', 'turn1', 'refresh1', 'aiTurn1', 'aiRefresh', 'turn2'])
    const last = played[played.length - 1].after
    expect(railsStep(last)).toBe('free')
    expect(railsAction(last)).toBeNull()
  })

  it('every promise holds (the finder’s check)', () => expect(railsProblems(words)).toEqual([]))

  it('draft: snake 1-2-2-1, you first, each hex legal when it is placed', () => {
    const drafts = played.filter((p) => p.step === 'draft')
    expect(drafts.map((p) => p.before.current)).toEqual([you, ai, ai, you])
    for (const p of drafts) {
      expect(legalActions(p.before, p.before.current)).toContainEqual(p.action)
    }
    expect(drafts.map((p) => p.action.type === 'draft' && getBoard(rails.boardName).label(p.action.hex)))
      .toEqual([rails.draft.you[0], rails.draft.ai[0], rails.draft.ai[1], rails.draft.you[1]])
  })

  it('the deal: your hand is the stacked one (C, J, V, no A); Sprout holds a T', () => {
    const dealt = step('turn1').before
    expect(letters(dealt, you)).toEqual(rails.stack.hands[you])
    expect(letters(dealt, you)).toEqual(expect.arrayContaining(['C', ...rails.turn1.refresh]))
    expect(letters(dealt, you)).not.toContain(rails.turn2.seed)
    expect(letters(dealt, ai)).toContain(rails.aiTurn1.seed)
  })

  it('turn 1 move: one of the glyphling’s lines glows, then stops short at Blue’s glyphling', () => {
    const { before } = step('turn1')
    const mover = before.glyphlings.find((g) => g.id === railsGlyphling(you, rails.turn1.glyphling))!
    const blocker = before.glyphlings.find((g) => sameHex(g.hex, hex(rails.turn1.blockedAt)))!
    expect(blocker.seat).toBe(ai)
    const line = DIRECTIONS.map((d) => ray(getBoard(rails.boardName), mover.hex, d)).find((r) => r.some((h) => sameHex(h, blocker.hex)))!
    const stop = line.findIndex((h) => sameHex(h, blocker.hex))
    expect(stop).toBeGreaterThanOrEqual(1) // at least one hex glows before the stop
    const glowing = line.slice(0, stop)
    for (const h of glowing) expect(before.glyphlings.some((g) => sameHex(g.hex, h)) || before.seeds[hexKey(h)]).toBeFalsy()
  })

  it('turn 1 plant: from the landing hex, over your other glyphling; it blocks Blue; no word, so a refresh', () => {
    const { before, after } = step('turn1')
    const other = before.glyphlings.find((g) => g.seat === you && g.id !== railsGlyphling(you, rails.turn1.glyphling))!
    expect(sameHex(other.hex, hex(rails.turn1.overOwn))).toBe(true)
    const to = hex(rails.turn1.to)
    const plant = hex(rails.turn1.plant)
    const dir = DIRECTIONS.find((d) => ray(getBoard(rails.boardName), to, d).some((h) => sameHex(h, plant)))!
    const between: typeof to[] = []
    for (let h = addHex(to, dir); !sameHex(h, plant); h = addHex(h, dir)) between.push(h)
    expect(between.some((h) => sameHex(h, other.hex))).toBe(true)
    expect(after.seeds[hexKey(plant)]).toMatchObject({ letter: rails.turn1.seed, seat: you })
    const blocked = after.glyphlings.find((g) => sameHex(g.hex, hex(rails.turn1.blocks)))!
    expect(blocked.seat).toBe(ai)
    expect(movesLeft(after, blocked.id)).toBeLessThan(movesLeft(withoutSeed(after, plant), blocked.id))
    expect(after.lastTurn?.words).toEqual([])
    expect(after.phase).toBe('refresh')
  })

  it('refresh: J and V go back; the new seeds include the A', () => {
    const { before, after, action } = step('refresh1')
    expect(action.type === 'refresh' && action.setAside.map((id) => before.hands[you].find((p) => p.id === id)!.letter)).toEqual(rails.turn1.refresh)
    const kept = before.hands[you].length - rails.turn1.refresh.length
    const drawn = after.hands[you].slice(kept).map((p) => p.letter)
    expect(drawn).toEqual(rails.stack.next.slice(0, drawn.length))
    expect(drawn).toContain(rails.turn2.seed)
    expect(letters(after, you)).not.toEqual(expect.arrayContaining(rails.turn1.refresh))
  })

  it('Sprout’s turn 1: a T two hexes from your C, one gap between, C → gap → T; no word; it keeps all', () => {
    const { after } = step('aiTurn1')
    const c = hex(rails.turn1.plant)
    const gap = hex(rails.turn2.plant)
    const t = hex(rails.aiTurn1.plant)
    expect(after.seeds[hexKey(t)]).toMatchObject({ letter: rails.aiTurn1.seed, seat: ai })
    expect(after.seeds[hexKey(gap)]).toBeUndefined()
    expect(sameHex(addHex(gap, { q: gap.q - c.q, r: gap.r - c.r }), t)).toBe(true) // C, gap, T in one straight line
    expect(after.lastTurn?.words).toEqual([])
    const keep = step('aiRefresh')
    expect(keep.action).toEqual({ type: 'refresh', setAside: [] })
    expect(keep.after.hands[ai].slice(0, keep.before.hands[ai].length)).toEqual(keep.before.hands[ai]) // kept every seed…
    expect(keep.after.hands[ai]).toHaveLength(railsSetupHandSize()) // …and refilled the one it planted
  })

  it('turn 2: the A in the gap spells CAT — C +2, A +2, T +1 = 5 — then you draw 1', () => {
    const { before, after } = step('turn2')
    expect(after.lastTurn?.words.map((w) => w.word)).toEqual([rails.turn2.word])
    const cat = after.lastTurn!.words[0]
    expect(cat.hexes.map((h) => getBoard(rails.boardName).label(h))).toEqual([rails.turn1.plant, rails.turn2.plant, rails.aiTurn1.plant])
    expect(seedMagicOfTurn(after, after.lastTurn!.words, you)).toEqual([[2, 2, 1]])
    expect(after.magic[you] - before.magic[you]).toBe(rails.turn2.magic)
    expect(after.lastTurn?.drew).toBe(1)
    expect(after.hands[you]).toHaveLength(before.hands[you].length)
    // the stacked bag ran out exactly here: refresh (3) + Sprout's refill (1) + this draw (1)
    expect(after.hands[you][after.hands[you].length - 1].letter).toBe(rails.stack.next[rails.stack.next.length - 1])
  })

  it('no glyphling is tangled or down to 1 move anywhere on the rails (no danger cue)', () => {
    for (const p of played.filter((x) => x.after.phase !== 'draft')) {
      for (const g of p.after.glyphlings) expect(movesLeft(p.after, g.id), `glyphling ${g.id} after ${p.step}`).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('the rails helpers', () => {
  it('railsHex reads designer labels, and refuses a hex that isn’t on the board', () => {
    expect(getBoard(rails.boardName).label(railsHex(rails.turn2.plant))).toBe(rails.turn2.plant)
    expect(() => railsHex('C99-1')).toThrow()
  })

  it('railsDraftHex names each draft step’s hex, then null', () => {
    const door = glyphtenderRules(words)
    const game = door.setup(railsSetup())
    expect(railsDraftHex(game)).toEqual(railsHex(rails.draft.you[0]))
    expect(railsDraftHex(step('turn1').before)).toBeNull()
  })

  it('railsAction names real seed ids from the current hand', () => {
    const t1 = step('turn1')
    const action = railsAction(t1.before)
    expect(action?.type).toBe('turn')
    if (action?.type === 'turn') expect(t1.before.hands[you].find((p) => p.id === action.seed)?.letter).toBe(rails.turn1.seed)
  })

  it('off the rails (a different move), the step is free play', () => {
    const t1 = step('turn1')
    expect(railsStep({ ...t1.after, turnCount: 3, phase: 'play' })).toBe('free')
  })
})

// Glyphtender's Dev Kit adapter: a snapshot round-trips through the store, and turns show up as events.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hexAt, lettersOf, position, wordsOf } from '../engine/testkit'
import { legalDraftHexes } from '../engine/engine'
import { useGameStore } from '../store/gameStore'
import { screens } from '../ui/kit'
import { TRAY_GAP } from '../store/turnPlan'
import { describeGlyphtender, glyphtenderAdapter, savedTrayOrder, type GlyphtenderMoment } from './glyphtenderAdapter'

const store = () => useGameStore.getState()

/** Yellow to play: glyphling 0 at C6-7 can move up to C6-6. */
const yellowToPlay = (hand = ['B', 'C', 'D']) => position({
  glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
  hands: [hand, ['E']],
  bag: ['V', 'W', 'X'],
})

beforeEach(() => {
  store().leaveGame()
  store().setWords(wordsOf('AT', 'TA'))
})

describe('glyphtenderAdapter', () => {
  it('names the game and its version (from version.json)', () => {
    expect(glyphtenderAdapter.name).toBe('Glyphtender')
    expect(glyphtenderAdapter.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })

  it('a snapshot is plain JSON, and restoring it brings the game back — without the planned move', () => {
    store().loadState(yellowToPlay())
    store().grabGlyphling(0)
    store().tapHex(hexAt('C6-6')) // a planned move (the tray reorders only after it: B008)
    store().moveTraySeed(0, 2)
    const saved = JSON.parse(JSON.stringify(glyphtenderAdapter.getState())) as GlyphtenderMoment
    const [b, c, d] = saved.game!.hands[0].map((s) => s.id)
    expect(saved.trayOrder[0]).toEqual([c, d, b]) // the tray holds seed ids

    // Then load something else
    expect(store().move).not.toBeNull()
    store().startGame({ players: 3, seed: 99 })

    glyphtenderAdapter.setState(saved)
    expect(store().game).toEqual(saved.game)
    expect(store().trayOrder).toEqual(saved.trayOrder)
    expect(store().move).toBeNull()
    expect(store().flying).toBe(false)
  })

  it('B018: a snapshot taken with an empty tray place (a cast seed, nothing drawn) keeps its tray order, gap and all', () => {
    // Yellow casts C (no word, an empty bag: nothing drawn) — its place stays empty: B _ D
    store().loadState(position({ glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' }, hands: [['B', 'C', 'D'], ['E']], bag: [] }))
    store().grabGlyphling(0)
    store().tapHex(hexAt('C6-6'))
    store().moveTraySeed(2, 0) // D B C (after the move: B008)
    store().moveTraySeed(2, 1) // D C B — the player's own order
    store().tapSeed(store().game!.hands[0][1].id) // C
    store().tapHex(hexAt('C6-4'))
    store().startCast()
    store().finishCast()
    const [b, d] = store().game!.hands[0].map((s) => s.id)
    expect(store().trayOrder[0]).toEqual([d, TRAY_GAP, b])
    const saved = JSON.parse(JSON.stringify(glyphtenderAdapter.getState())) as GlyphtenderMoment

    store().startGame({ players: 2, seed: 99 })
    glyphtenderAdapter.setState(saved)
    expect(store().trayOrder[0]).toEqual([d, TRAY_GAP, b]) // before F33 it fell back to hand order: B D
  })

  it('an older snapshot (tray as hand positions, -1 = an empty place) restores its tray order as ids', () => {
    const game = position({ glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' }, hands: [['B', 'C', 'D'], ['E']], bag: [] })
    const [b, c, d] = game.hands[0].map((s) => s.id)
    glyphtenderAdapter.setState({ game, trayOrder: [[2, -1, 0, 1], [0]] })
    expect(store().trayOrder).toEqual([[d, TRAY_GAP, b, c], [game.hands[1][0].id]])
    // a tray that doesn't fit the hands (a seed missing, or twice) falls back to hand order
    glyphtenderAdapter.setState({ game, trayOrder: [[2, 0], [0]] })
    expect(store().trayOrder[0]).toEqual([b, c, d])
    expect(savedTrayOrder([[d, d, b], [0]], game.hands)).toBeNull()
  })

  it('B006: a snapshot carries the end table stats and the table options', () => {
    store().startGame({ players: 2, seed: 7, minWordLength: 3, hideSeeds: false })
    const stats = [{ bestTurn: 9, longestWord: 'GARDEN', wordsMade: 4 }, { bestTurn: 3, longestWord: 'AT', wordsMade: 1 }]
    useGameStore.setState({ stats })
    const options = store().options
    const saved = JSON.parse(JSON.stringify(glyphtenderAdapter.getState())) as GlyphtenderMoment

    store().startGame({ players: 2, seed: 99 }) // play on with other options and fresh stats
    glyphtenderAdapter.setState(saved)
    expect(store().stats).toEqual(stats)
    expect(store().options).toEqual(options)
  })

  it('B006: an older snapshot without stats or options still restores', () => {
    const old = { game: yellowToPlay(), trayOrder: [] }
    glyphtenderAdapter.setState(old)
    expect(store().game).toEqual(old.game)
    expect(store().stats).toHaveLength(2)
  })

  it('F51: a snapshot says who sat where — a person or an AI, and which personality + skill — and restores it', () => {
    store().startGame({ players: 3, seed: 7, bots: [1, 2], ai: { 1: { personality: 'Scholar', skill: 'Archmage' } } })
    const saved = JSON.parse(JSON.stringify(glyphtenderAdapter.getState())) as GlyphtenderMoment
    expect(saved.seats?.map((seat) => [seat.kind, seat.ai?.personality, seat.ai?.skill])).toEqual([
      ['human', undefined, undefined], ['bot', 'Scholar', 'Archmage'], ['bot', 'Survivor', 'FirstClass'],
    ])

    store().startGame({ players: 3, seed: 99 }) // everyone a person now
    glyphtenderAdapter.setState(saved)
    expect(store().seats.map((seat) => [seat.kind, seat.where, seat.ai?.personality])).toEqual([
      ['human', 'local', undefined], ['bot', 'local', 'Scholar'], ['bot', 'local', 'Survivor'],
    ])
  })

  it('F51: Muzzy\'s first game vs the AI (saved before snapshots had seats) still restores', async () => {
    const { default: old } = await import('../../content/snapshots/first-game-with-ai.json')
    const moment = ((old as { state?: unknown }).state ?? old) as GlyphtenderMoment
    expect(moment.seats).toBeUndefined()
    glyphtenderAdapter.setState(moment)
    expect(store().game?.phase).toBe(moment.game?.phase)
    expect(store().seats).toHaveLength(moment.game!.config.players)
  })

  it('F24: a snapshot saved with the old "Qu" seed loads it as a plain "Q" (hand, bag, board, last turn)', () => {
    const game = position({
      glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
      hands: [['Qu', 'A'], ['E']],
      bag: ['Qu', 'W'],
      seeds: [{ 'C6-2': 'Qu' }],
    })
    const lastTurn = { seat: 1, glyphlingId: 2, from: hexAt('C11-2'), to: hexAt('C11-1'), letter: 'Qu', target: hexAt('C6-2'), words: [], magic: 0, drew: 0 }
    glyphtenderAdapter.setState({ game: { ...game, lastTurn }, trayOrder: [] })
    const loaded = store().game!
    expect(lettersOf(loaded.hands[0])).toEqual(['Q', 'A'])
    expect(lettersOf(loaded.bag)).toEqual(['Q', 'W'])
    expect(Object.values(loaded.seeds).map((s) => s.letter)).toEqual(['Q'])
    expect(loaded.lastTurn?.letter).toBe('Q')
  })

  it('restoring the main menu leaves the game; junk is refused with a plain reason', () => {
    store().loadState(yellowToPlay())
    glyphtenderAdapter.setState({ game: null, trayOrder: [] })
    expect(store().game).toBeNull()
    expect(() => glyphtenderAdapter.setState({ hello: 1 })).toThrow(/isn't a Glyphtender snapshot/)
  })

  it('sends a line for a new game, each draft placement, and each turn', () => {
    const lines: string[] = []
    const stop = glyphtenderAdapter.onEvent!((text) => lines.push(text))
    store().startGame({ players: 2, seed: 7 })
    expect(lines.at(-1)).toMatch(/^game started: 2 players · .* seed 7/)

    store().loadState(yellowToPlay([])) // no seeds in hand
    store().grabGlyphling(0)
    store().tapHex(hexAt('C6-6'))
    store().startCast() // a move only (nothing cast) commits at once
    expect(lines.some((l) => /^Yellow moved glyphling 0 C6-7 → C6-6, move only/.test(l))).toBe(true)

    stop()
    const count = lines.length
    store().leaveGame()
    expect(lines).toHaveLength(count) // stopped listening
  })

  it('the lines come from the rules’ events: a placement, a cast and its words (Magic from the board), a refresh, the phase', () => {
    const lines: string[] = []
    const stop = glyphtenderAdapter.onEvent!((text) => lines.push(text))
    store().startGame({ players: 2, seed: 7 })
    store().tapHex(legalDraftHexes(store().game!)[0])
    expect(lines.at(-1)).toMatch(/^draft: Yellow placed a glyphling at C\d+-\d+$/)

    // A Yellow T at C6-3: A cast onto C6-4 grows a word; its Magic in the line is the engine's own (lastTurn)
    store().loadState(position({
      glyphlings: { 0: 'C6-7', 1: 'C1-4', 2: 'C11-1', 3: 'C11-4' },
      seeds: [{ 'C6-3': 'T' }],
      hands: [['A', 'B'], ['E']],
      bag: ['V', 'W', 'X'],
    }))
    lines.length = 0
    store().grabGlyphling(0)
    store().tapHex(hexAt('C6-6'))
    store().tapSeed(store().game!.hands[0][0].id)
    store().tapHex(hexAt('C6-4'))
    store().startCast()
    store().finishCast()
    expect(lines[0]).toBe(`Yellow moved glyphling 0 C6-7 → C6-6, cast A at C6-4 → TA (${store().game!.lastTurn!.magic} Magic)`)

    // A cast that grows nothing → refresh; Keep all → the phase moves on
    store().loadState(yellowToPlay())
    lines.length = 0
    store().grabGlyphling(0)
    store().tapHex(hexAt('C6-6'))
    store().tapSeed(store().game!.hands[0][0].id)
    store().tapHex(hexAt('C6-4'))
    store().startCast()
    store().finishCast()
    expect(lines).toEqual(['Yellow moved glyphling 0 C6-7 → C6-6, cast B at C6-4', 'phase: play → refresh'])
    store().refresh(true)
    expect(lines.slice(2)).toEqual(['Yellow refreshed their seeds', 'phase: refresh → play'])
    stop()
  })

  it('describes a moment in one line', () => {
    expect(describeGlyphtender({ game: null, trayOrder: [] })).toBe('main menu')
    expect(describeGlyphtender({ game: yellowToPlay(), trayOrder: [] })).toMatch(/^turn 0 · play · Yellow to move/)
  })

  it('restoring closes any open menu — the end table (or Pause) of the moment you left would be stuck on top', () => {
    vi.stubGlobal('history', { state: null, pushState: () => {}, go: () => {} }) // the menus keep browser history
    store().loadState(yellowToPlay())
    screens.push('pause')
    screens.push('gameOver')
    glyphtenderAdapter.setState({ game: null, trayOrder: [] })
    expect(screens.current).toEqual([])
    screens.push('gameOver')
    glyphtenderAdapter.setState({ game: yellowToPlay(), trayOrder: [] })
    expect(screens.current).toEqual([])
    vi.unstubAllGlobals()
  })

  it('can restore offline, never in an online game', () => {
    expect(glyphtenderAdapter.canRestore()).toBe(true)
    useGameStore.setState({ online: { mySeat: 0, gameId: 1, version: 0, post: () => {}, landed: () => {}, resume: () => {} } })
    expect(glyphtenderAdapter.canRestore()).toBe(false)
    useGameStore.setState({ online: null })
  })
})

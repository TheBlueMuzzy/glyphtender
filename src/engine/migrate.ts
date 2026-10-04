// OLDER SAVED GAMES → TODAY'S SHAPE. Every saved game comes in through the store's loadState (Dev Kit snapshots,
// e2e fixtures, Dev Kit previews), which runs it through migrateGame — the one place an old save is brought up to date.
// Pure: it returns a new game and never changes the one it was given.
import { HIDDEN, HIDDEN_SEED } from './rules'
import { seedIdGiver } from './setup'
import type { GameState, PlantedSeed, SeedPiece } from './types'

/** Games saved before 2026-10-01 hold the old "Qu" seed; it's a plain "Q" now (F24). */
const plainQ = (letter: string) => (letter === 'Qu' ? 'Q' : letter)

/** A seed as it may be saved: a plain letter (saved before 2026-10-04, F33) or a piece with its id. */
type SavedSeed = string | SeedPiece
type SavedPlanted = PlantedSeed | { letter: string; seat: number }

/**
 * Games saved before 2026-10-04 (F33) name seeds by letter only: "E", not { id: "seed-31", letter: "E" }.
 * Each one gets the id of an unused box seed with that letter (setup.ts seedIdGiver) — planted seeds first, then
 * each hand, then the bag — so the same save always gets the same ids. A '?' (a seed that save's seat couldn't see)
 * stays hidden. Ids a save already has are kept, and never handed out twice.
 */
function withSeedIds(game: GameState): Pick<GameState, 'seeds' | 'hands' | 'bag'> {
  const savedSeeds = game.seeds as Record<string, SavedPlanted>
  const savedHands = game.hands as SavedSeed[][]
  const savedBag = game.bag as SavedSeed[]
  const giveId = seedIdGiver(idsAlreadyIn(savedSeeds, savedHands, savedBag))
  const piece = (seed: SavedSeed): SeedPiece => {
    if (typeof seed !== 'string') return { ...seed, letter: plainQ(seed.letter) }
    return seed === HIDDEN ? HIDDEN_SEED : giveId(plainQ(seed))
  }
  const seeds = Object.fromEntries(
    Object.entries(savedSeeds).map(([key, seed]) => [key, { ...('id' in seed ? seed : giveId(plainQ(seed.letter))), letter: plainQ(seed.letter), seat: seed.seat }]),
  )
  return { seeds, hands: savedHands.map((hand) => hand.map(piece)), bag: savedBag.map(piece) }
}

/** The real seed ids a save already holds (a half-and-half save shouldn't happen, but must not get an id twice). */
function idsAlreadyIn(seeds: Record<string, SavedPlanted>, hands: SavedSeed[][], bag: SavedSeed[]): string[] {
  const all: (SavedSeed | SavedPlanted)[] = [...Object.values(seeds), ...hands.flat(), ...bag]
  return all.flatMap((seed) => (typeof seed !== 'string' && 'id' in seed && seed.id !== HIDDEN ? [seed.id] : []))
}

export function migrateGame(game: GameState): GameState {
  const lastTurn = game.lastTurn && { ...game.lastTurn, letter: game.lastTurn.letter && plainQ(game.lastTurn.letter) }
  const log = game.log && {
    ...game.log,
    turns: game.log.turns.map((t) => ({
      ...t,
      letter: t.letter && plainQ(t.letter),
      words: t.words.map((w) => ({ ...w, letters: w.letters.map(plainQ) })),
    })),
  }
  return { ...game, ...withSeedIds(game), lastTurn, log }
}

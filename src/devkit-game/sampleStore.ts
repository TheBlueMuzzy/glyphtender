// SAMPLE GAMES INTO THE STORE — for the Dev Kit's screen previews and moments (previews.tsx, momentPlays.ts).
// Runs inside the Screens sandbox frame, so it may fill the stores freely (never the real game's).
import type { WordList } from '../engine/types'
import { wordListUrl } from '../game/art'
import { useGameStore, type GameOptions } from '../store/gameStore'
import { finishedGame, tiedGame, type SampleGame } from './sampleGames'

/** The real word list (the same file the game loads; the store keeps it, so the game screen won't load it again). */
export async function words(): Promise<WordList> {
  await useGameStore.getState().loadWords(wordListUrl())
  const list = useGameStore.getState().words
  if (!list) throw new Error("the word list didn't load")
  return list
}

/** Puts a sample game in the store, with the table options a new game would have (`hideSeeds`: pass-and-play's
 *  "pass the device" box between turns — the moments turn it off, so a turn's end isn't covered). The options stay
 *  the SAME object when nothing in them changed, so what watches them (the garden's harp, sound.ts) doesn't restart. */
export function loadGame({ game, stats }: SampleGame, { hideSeeds = true }: { hideSeeds?: boolean } = {}) {
  useGameStore.getState().loadState(game, stats)
  const options: GameOptions = {
    players: game.config.players, boardName: game.config.boardName, minWordLength: game.config.rules.minWordLength, hideSeeds, wordIndicators: true,
  }
  const now = useGameStore.getState().options
  const same = now && (Object.keys(options) as (keyof GameOptions)[]).every((key) => now[key] === options[key])
  if (!same) useGameStore.setState({ options })
}

export const playersOf = (variant: string | undefined) => Number(variant?.[0] ?? 2)

/** A finished game for an end-of-game variant: 2p / 3p / 4p, or a 2-player tie. */
export async function endGame(variant: string | undefined): Promise<SampleGame> {
  const list = await words()
  if (variant !== 'tie') return finishedGame(playersOf(variant), list)
  const tie = tiedGame(list)
  if (!tie) throw new Error('no tied game in the first 200 seeds — raise tiedGame tries')
  return tie
}

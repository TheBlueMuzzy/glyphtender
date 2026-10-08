// Starting and leaving a game from the menus. The new-game screen (NewGameScreen.tsx) picks the table
// options and who plays each seat (a person, or the AI: a personality — or "Surprise me" — and a skill, F42);
// the last choices are remembered on this device (localStorage — never required: if the browser
// won't store them, the defaults are used). At the end, New game comes back here (online: the lobby).
import personalitiesFile from '../../content/ai/personalities.json'
import skillsFile from '../../content/ai/skills.json'
import rulesJson from '../../content/tuning/rules.json'
import { boardNames, defaultBoardFor } from '../engine/boards'
import { pickTurnOrder } from '../engine/setup'
import { useGameStore } from '../store/gameStore'
import type { AiPick } from '../store/seats'
import { screens } from './kit'
import { leaveOnline, onlineBackToLobby } from './online/session'

/** What the new-game screen asks. */
export interface NewGameChoices {
  players: number
  /** A board name from content/data/boards.json ("small", "large"). */
  boardName: string
  /** On = 2-letter words make Magic (min word length 2); off = words need 3 letters or more. */
  twoLetterWords: boolean
  /** Pass-and-play: hide each player's seeds between turns. */
  hideSeeds: boolean
  /** On = made words get a white border, Cast shows "+N" and the Magic pops. Off = players spot words themselves. */
  wordIndicators: boolean
  /** Who plays each seat, in turn order — always 4 (a seat past the player count keeps its choice for next time). */
  seats: SeatChoice[]
}

/** One seat on the new-game screen: a person, or the AI (F42). */
export interface SeatChoice {
  ai: boolean
  /** A personality id (content/ai/personalities.json) or SURPRISE (picked at random when the game starts). */
  personality: string
  /** A skill id (content/ai/skills.json). */
  skill: string
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const SAVE_KEY = 'glyphtender:new-game'
const MIN_PLAYERS = 2
const MAX_PLAYERS = 4

/** "Surprise me": a random personality, picked when the game starts. */
export const SURPRISE = 'surprise'
const DEFAULT_SKILL = 'FirstClass'
/** The personalities' and skills' ids, in the files' order. */
export const personalityIds = () => personalitiesFile.personalities.map((p) => p.id)
export const skillIds = () => skillsFile.skills.map((s) => s.id)

/** Every board in content/data/boards.json, e.g. ["small", "large"] (the server's options check uses it too). */
export { boardNames }

/** Every seat a person; a seat switched to AI starts as "Surprise me" at First Class. */
const defaultSeats = (): SeatChoice[] => Array.from({ length: MAX_PLAYERS }, () => ({ ai: false, personality: SURPRISE, skill: DEFAULT_SKILL }))

/** First time: 2 players on their default board, 2-letter words as rules.json says, seeds NOT hidden (players opt in),
 *  word indicators on, every seat a person. */
export const defaultChoices = (): NewGameChoices => ({
  players: MIN_PLAYERS, boardName: defaultBoardFor(MIN_PLAYERS), twoLetterWords: rulesJson.twoLetterWordsAtStart === 1, // standard play: off (Muzzy 2026-10-07) hideSeeds: false, wordIndicators: true,
  seats: defaultSeats(),
})

/** A new player count also picks that count's default board (boards.json → defaultForPlayers). */
export const withPlayers = (choices: NewGameChoices, players: number): NewGameChoices =>
  ({ ...choices, players, boardName: defaultBoardFor(players) })

/** One seat's choice changed. */
export const withSeat = (choices: NewGameChoices, index: number, part: Partial<SeatChoice>): NewGameChoices =>
  ({ ...choices, seats: choices.seats.map((seat, i) => (i === index ? { ...seat, ...part } : seat)) })

/** Does at least one person play? (A table of only AIs has nobody to play it here.) */
export const hasPerson = (choices: NewGameChoices) => choices.seats.slice(0, choices.players).some((seat) => !seat.ai)

/** The browser's storage, or null where there is none (tests, private windows that refuse it). */
function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** A saved seat, or the default one where anything is missing or odd (a personality that was renamed, say). */
function seatFrom(saved: unknown): SeatChoice {
  const fallback = defaultSeats()[0]
  if (!saved || typeof saved !== 'object') return fallback
  const seat = saved as Partial<SeatChoice>
  const personality = String(seat.personality)
  return {
    ai: typeof seat.ai === 'boolean' ? seat.ai : fallback.ai,
    personality: personality === SURPRISE || personalityIds().includes(personality) ? personality : fallback.personality,
    skill: skillIds().includes(String(seat.skill)) ? String(seat.skill) : fallback.skill,
  }
}

/** The last choices made on this device, or the defaults (anything missing or odd falls back too). */
export function loadChoices(storage: Storage | null = browserStorage()): NewGameChoices {
  const fallback = defaultChoices()
  try {
    const saved = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null') as Partial<NewGameChoices> | null
    if (!saved) return fallback
    const players = Number.isInteger(saved.players) && saved.players! >= MIN_PLAYERS && saved.players! <= MAX_PLAYERS ? saved.players! : fallback.players
    const boardName = boardNames().includes(String(saved.boardName)) ? String(saved.boardName) : defaultBoardFor(players)
    return {
      players, boardName,
      twoLetterWords: typeof saved.twoLetterWords === 'boolean' ? saved.twoLetterWords : fallback.twoLetterWords,
      hideSeeds: typeof saved.hideSeeds === 'boolean' ? saved.hideSeeds : fallback.hideSeeds,
      wordIndicators: typeof saved.wordIndicators === 'boolean' ? saved.wordIndicators : fallback.wordIndicators,
      // the first seat is always you (New Game has no row for it) — an older save with an AI there comes back as a person
      seats: fallback.seats.map((seat, i) => (Array.isArray(saved.seats) ? seatFrom(saved.seats[i]) : seat)).map((seat, i) => (i === 0 ? { ...seat, ai: false } : seat)),
    }
  } catch {
    return fallback
  }
}

export function saveChoices(choices: NewGameChoices, storage: Storage | null = browserStorage()) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(choices))
  } catch {
    // Storage full or refused: the game still starts, it just won't remember
  }
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)
/** DEV ONLY: the e2e checks (a browser driven by Playwright — navigator.webdriver) always play Yellow, Blue, Purple,
 *  Pink, so their scripted games play the same every run. Muzzy's own play and release builds shuffle it (rules.json). */
const e2ePlainOrder = import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.webdriver

/** The AI seats of a new game: which seats, and who each one is ("Surprise me" is picked now, at random). */
export function aiSeatsOf(choices: NewGameChoices, random = Math.random): { bots: number[]; ai: Record<number, AiPick> } {
  const bots: number[] = []
  const ai: Record<number, AiPick> = {}
  const ids = personalityIds()
  choices.seats.slice(0, choices.players).forEach((seat, i) => {
    if (!seat.ai) return
    bots.push(i)
    ai[i] = { personality: seat.personality === SURPRISE ? ids[Math.floor(random() * ids.length)] : seat.personality, skill: seat.skill }
  })
  return { bots, ai }
}

/** Main menu → Play: open the new-game screen. */
export const openNewGame = () => screens.push('newGame')

/** Start: remember the choices, close the menus and deal a fresh game (its AI seats play by themselves). */
export function startNewGame(choices: NewGameChoices) {
  saveChoices(choices)
  closeAllScreens()
  useGameStore.getState().startGame({
    players: choices.players, boardName: choices.boardName, seed: randomSeed(), turnOrder: e2ePlainOrder ? undefined : pickTurnOrder(choices.players, randomSeed()),
    minWordLength: choices.twoLetterWords ? 2 : 3, hideSeeds: choices.hideSeeds, wordIndicators: choices.wordIndicators,
    ...aiSeatsOf(choices),
  })
}

/** End table → New game (the only way on — GDD §4: fewer, clearer options): the new-game screen, with this
 *  device's last choices. Online: the host takes everyone back to the lobby to start again; others wait for it. */
export function newGameFromEnd() {
  if (useGameStore.getState().online) return onlineBackToLobby()
  leaveToMenu()
  openNewGame()
}

/** Back to the main menu (online: leaving the room — the seat is played for you so the others can finish). */
export function leaveToMenu() {
  closeAllScreens()
  if (useGameStore.getState().online) leaveOnline()
  useGameStore.getState().leaveGame()
}

/** Close every open menu (the Dev Kit's restore uses this too). */
export function closeAllScreens() {
  for (let i = screens.current.length; i > 0; i--) screens.pop()
}

// A BOT ON THIS DEVICE (F36) — plumbing for tests and the Dev Kit only: no menu offers it yet, and it isn't the AI
// (the beta AI comes later). A seat started as a bot (startGame's `bots`) is { kind: 'bot', where: 'local' }.
// When it's that seat's turn and the screen isn't in a quiet moment (a seed flying, a score or a refresh playing
// out), the bot picks from its OWN seat's view only (rules.viewFor — never the other seeds or the bag) and plays it
// through the store (botPlays: the same rules door and the same follow-ups as a person's taps).
// It never gets a handoff screen: there's nobody to hide the seeds from (seats.ts needsHandoff).
import roomsJson from '../../content/rooms.json'
import { greedyBot } from '../engine/bot'
import { flowOf, viewFor } from '../engine/rules'
import { seatToAct } from '../table/flow'
import { useGameStore } from './gameStore'
import { isBusy } from './myTurn'
import { isLocalBot } from './seats'

const store = () => useGameStore.getState()

/** The bots' own random position (their picks are repeatable: the same game, the same moves), for the game it
 *  belongs to (a new game starts it again, like the server's: the game's seed ^ 0x5eed). */
let botRng = 0
let botGame: object | null = null

/** If a bot on this device is to act now, it plays its one action and says true; otherwise false. */
export function playLocalBot(): boolean {
  const s = store()
  const game = s.game
  if (!game || s.online || !s.words || isBusy(s)) return false
  const seat = seatToAct(flowOf(game))
  if (seat === null || !isLocalBot(s.seats[seat])) return false
  if (botGame !== game.config) { // (a new game makes a new config; every change keeps it)
    botGame = game.config
    botRng = game.config.seed ^ 0x5eed
  }
  const picked = greedyBot(s.words)(viewFor(game, seat), seat, botRng)
  botRng = picked.rng
  s.botPlays(picked.action)
  return true
}

/** Lets the bots on this device play by themselves, a short beat after each change (the same think time as the
 *  server's bots, content/rooms.json botTurnDelayMs) so a person can watch. Gives back "stop". */
export function driveLocalBots(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const check = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      if (playLocalBot()) check()
    }, roomsJson.botTurnDelayMs)
  }
  const stop = useGameStore.subscribe(check)
  check()
  return () => {
    stop()
    if (timer) clearTimeout(timer)
  }
}

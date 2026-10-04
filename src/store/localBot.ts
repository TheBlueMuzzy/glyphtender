// THE AI ON THIS DEVICE (F42) — plays the bot seats of a game on this device (New Game's AI seats; tests; the Dev
// Kit). A bot seat is { kind: 'bot', where: 'local', ai: { personality, skill } } (startGame's `bots` + `ai`).
// When it's an AI seat's turn and the screen is in a quiet moment (no seed flying, no score or refresh playing out),
// the AI starts thinking — in the background (src/ai/thinker.ts: a Web Worker), from its OWN seat's view only
// (rules.viewFor — never the other seeds or the bag). It then takes a person-like moment (src/ai/kit/pace.ts:
// thinkDelay for that kind of action at Settings → AI speed, content/ai/pace.json; the time it really spent thinking
// counts toward it) and plays through the store (botPlays: the same rules door and follow-ups as a person's taps,
// and a turn glides and throws like a person's).
// Its picks are repeatable: each seat has its own random position from the game's seed (botSeed), moved on only by
// the actions it really plays. A new game, leaving the game or the game moving on drops any thinking in progress.
// It never gets a handoff screen: there's nobody to hide the seeds from (seats.ts needsHandoff).
// playLocalBot (below) is the old instant greedy bot — tests only.
import paceFile from '../../content/ai/pace.json'
import { thinkDelay, waitLeft, type Pace } from '../ai/kit/pace'
import { botSeed } from '../ai/kit/brain'
import type { Decision } from '../ai/kit/types'
import { makeGameThinker, type AiThinker } from '../ai/thinker'
import { greedyBot } from '../engine/bot'
import { flowOf, viewFor } from '../engine/rules'
import type { Action, GameState } from '../engine/types'
import { seatToAct } from '../table/flow'
import { useGameSettings, type AiSpeed } from '../ui/gameSettings'
import { useGameStore } from './gameStore'
import { isBusy } from './myTurn'
import { defaultAi, isLocalBot } from './seats'

const store = () => useGameStore.getState()

/** content/ai/pace.json in the kit's Pace shape: think times per kind of action — draft, moveCast (a turn), refresh. */
const pace: Pace = { think: paceFile.thinkSeconds, speeds: paceFile.speeds, timeBudgetMs: paceFile.timeBudgetMs }

/** The kind of action (pace.json thinkSeconds) for the step the game is at. */
const paceKind = (game: GameState) => (game.phase === 'draft' ? 'draft' : game.phase === 'refresh' ? 'refresh' : 'moveCast')

// ─── Hooks for the Dev Kit's AI tab ───

const decisionListeners = new Set<(seat: number, decision: Decision<Action>) => void>()

/** Hear every decision an AI on this device plays (its note, readings, goal rolls…). Gives back "stop listening". */
export function onAiDecision(listener: (seat: number, decision: Decision<Action>) => void): () => void {
  decisionListeners.add(listener)
  return () => { decisionListeners.delete(listener) }
}

let speedOverride: AiSpeed | null = null
/** Play the AIs at this speed instead of Settings → AI speed (the Dev Kit's watch); null = back to the setting. */
export function setAiSpeedOverride(speed: AiSpeed | null) {
  speedOverride = speed
}
const aiSpeed = () => speedOverride ?? useGameSettings.getState().aiSpeed

// ─── The driver ───

/** One AI decision on its way, for this game state and seat (dropped = forget its answer). */
interface Job {
  game: GameState
  seat: number
  dropped: boolean
}

/** Lets the AIs on this device play by themselves whenever it's their turn (GameScreen runs it while a game is on
 *  screen). Gives back "stop" (thinking in progress is dropped, the worker is closed). */
export function driveLocalBots(): () => void {
  let thinker: AiThinker | null = null
  let forGame: object | null = null // the game's config (a new game makes a new one; every change keeps it)
  let rngs: number[] = []
  let paceRng = 1
  let job: Job | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const dropJob = () => {
    if (job) job.dropped = true
    job = null
    if (timer) clearTimeout(timer)
    timer = null
  }
  const closeThinker = () => {
    dropJob()
    thinker?.stop()
    thinker = null
    forGame = null
  }

  const check = () => {
    const s = store()
    const game = s.game
    if (!game || s.online) return closeThinker() // no game here (left, or online: the server plays its bots)
    if (game.config !== forGame) { // a new game: fresh random positions, a fresh thinker
      closeThinker()
      forGame = game.config
      rngs = s.seats.map((_, seat) => botSeed(game.config.seed, seat))
      paceRng = game.config.seed ^ 0xface
    }
    if (job) {
      if (job.game === game) return // still thinking / waiting its moment
      dropJob() // the game moved on without it (an undo in the Dev Kit, a jump)
    }
    if (!s.words || isBusy(s)) return // its turn starts in a quiet moment
    if (s.move) return // (its turn is already playing out: the glide before the throw)
    const seat = seatToAct(flowOf(game))
    if (seat === null || !isLocalBot(s.seats[seat])) return
    thinker ??= makeGameThinker(s.words)
    const ai = s.seats[seat].ai ?? defaultAi()
    const mine: Job = { game, seat, dropped: false }
    job = mine
    const started = performance.now()
    const delay = thinkDelay(pace, paceKind(game), aiSpeed(), paceRng)
    paceRng = delay.rng
    thinker
      .think({ view: viewFor(game, seat), seat, rng: rngs[seat], personalityId: ai.personality, skillId: ai.skill, custom: ai.custom })
      .then((answer) => {
        if (mine.dropped) return
        timer = setTimeout(() => {
          timer = null
          job = null
          if (mine.dropped || store().game !== mine.game) return check()
          rngs[seat] = answer.rng
          for (const listener of decisionListeners) listener(seat, answer.decision)
          store().botPlays(answer.action, true)
        }, waitLeft(delay.ms, performance.now() - started))
      })
      .catch((error) => {
        if (mine.dropped) return
        console.warn('The AI could not decide', error)
        job = null
      })
  }

  const unsubscribe = useGameStore.subscribe(check)
  check()
  return () => {
    unsubscribe()
    closeThinker()
  }
}

// ─── Tests only: the instant greedy bot ───

/** The greedy bots' random position, for the game it belongs to (the game's seed ^ 0x5eed). */
let botRng = 0
let botGame: object | null = null

/** Tests: if a bot on this device is to act now, the greedy bot plays its one action at once and says true. */
export function playLocalBot(): boolean {
  const s = store()
  const game = s.game
  if (!game || s.online || !s.words || isBusy(s)) return false
  const seat = seatToAct(flowOf(game))
  if (seat === null || !isLocalBot(s.seats[seat])) return false
  if (botGame !== game.config) {
    botGame = game.config
    botRng = game.config.seed ^ 0x5eed
  }
  const picked = greedyBot(s.words)(viewFor(game, seat), seat, botRng)
  botRng = picked.rng
  s.botPlays(picked.action)
  return true
}

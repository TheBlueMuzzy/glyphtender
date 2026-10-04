// WATCH AIs PLAY (the Dev Kit AI tab's ▶ Watch) — starts a local game where every seat is an AI, on the real board,
// and plays it at a watchable pace. For each decision it tells the tab: who decided, the decision's note, and what
// that AI believes about everyone's Magic (src/ai/evidence.ts beliefsOf: estimate + confidence per rival).
// Each AI sees only its own seat's view (rules.viewFor) and plays through the store's botPlays — the same rules door
// and follow-ups as a person's taps — so the board animates as in a real game.
//
// ⚠ Until F42 lands (play vs AI): this drives the bot seats itself. F42 makes the game screen drive local bot seats
// (store/localBot.ts driveLocalBots) and adds startGame({ bots, ai }) + onAiDecision + setAiSpeedOverride. When that is
// in, startWatch should start the game with `ai` per seat and listen with onAiDecision instead of driving (or both
// would play the same turn) — everything that would change is inside this one function.
import paceFile from '../../content/ai/pace.json'
import { beliefsOf } from '../ai/evidence'
import type { Personality, Skill } from '../ai/kit/types'
import type { AiWatchEvent, AiWatchSeat } from '../devkit/ai/aiTypes'
import { defaultBoardFor } from '../engine/boards'
import { aiBot } from '../engine/bot'
import { flowOf, viewFor } from '../engine/rules'
import { SEAT_COLOURS, type GameState } from '../engine/types'
import { wordListUrl } from '../game/art'
import { useGameStore } from '../store/gameStore'
import { isBusy } from '../store/myTurn'
import { seatToAct } from '../table/flow'
import { closeAllScreens } from '../ui/newGame'

const BUSY_RETRY_MS = 150 // a seed flying / a score playing out: look again this soon

/** The pause before a decision, in ms: the middle of content/ai/pace.json's think time for this phase (Normal speed). */
function thinkMs(game: GameState): number {
  const t = paceFile.thinkSeconds
  const range = game.phase === 'draft' ? t.draft : game.phase === 'refresh' ? t.refresh : t.moveCast
  return ((range.min + range.max) / 2) * 1000
}

const colourOf = (seat: number) => SEAT_COLOURS[seat] ?? `seat ${seat + 1}`

/** Start an all-AI game (seat i = seats[i]) and report every decision. Returns "stop" (the game stays on the board). */
export function startWatch(seats: AiWatchSeat[], onEvent: (e: AiWatchEvent) => void): () => void {
  const store = () => useGameStore.getState()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const later = (fn: () => void, ms: number) => {
    if (!stopped) timer = setTimeout(fn, ms)
  }

  async function begin() {
    await store().loadWords(wordListUrl())
    const words = store().words
    if (stopped) return
    if (!words) {
      onEvent({ seat: 0, who: '—', note: "couldn't load the word list", end: 'no game (word list missing)' })
      return
    }
    const players = seats.length
    closeAllScreens()
    store().startGame({ players, seed: Math.floor(Math.random() * 2 ** 31), boardName: defaultBoardFor(players), bots: seats.map((_, i) => i) })
    const config = store().game?.config // a different config later = someone started another game: stop watching
    const rngs = seats.map((_, i) => (config!.seed ^ 0x5eed) + i * 7919)
    let decision: { note: string } | null = null
    const bots = seats.map((s) => aiBot(s.personality as unknown as Personality, s.skill as unknown as Skill, words, (d) => { decision = d }))

    const step = () => {
      const s = store()
      const game = s.game
      if (stopped || !game || game.config !== config) return
      if (game.phase === 'over') {
        const winners = game.winners.map((w) => `${seats[w].personality.id} (${colourOf(w)})`).join(' + ')
        onEvent({ seat: game.winners[0] ?? 0, who: seats[game.winners[0] ?? 0].personality.id, note: `won — Magic ${game.magic.join(' · ')}`, end: `${winners} won` })
        return
      }
      const seat = seatToAct(flowOf(game))
      if (seat === null || isBusy(s)) return later(step, BUSY_RETRY_MS)
      const view = viewFor(game, seat)
      decision = null
      const picked = bots[seat](view, seat, rngs[seat])
      rngs[seat] = picked.rng
      const believed = beliefsOf(view, seat, words, Number(seats[seat].skill.beliefNoise ?? 0.5))
      onEvent({
        seat,
        who: seats[seat].personality.id,
        note: (decision as { note: string } | null)?.note ?? `${picked.action.type}`,
        mine: believed.mine,
        beliefs: believed.rivals.map((b) => ({ seat: b.seat, estimate: b.estimate, confidence: b.confidence })),
      })
      s.botPlays(picked.action)
      later(step, thinkMs(store().game ?? game))
    }
    later(step, thinkMs(store().game!))
  }

  begin().catch((e: Error) => onEvent({ seat: 0, who: '—', note: `stopped: ${e.message}`, end: 'stopped with an error' }))
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

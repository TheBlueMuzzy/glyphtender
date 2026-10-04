// WATCH AIs PLAY (the Dev Kit AI tab's ▶ Watch) — starts a local game where every seat is an AI, on the real board,
// and lets the game's own AI driver play it (store/localBot.ts driveLocalBots, run by GameScreen — the same thinking,
// pace and animations as New Game's AI seats). Each seat plays the tab's settings, UNSAVED edits included (AiPick
// `custom`). For each decision it tells the tab: who decided, the decision's note, and what that AI believes about
// everyone's Magic (src/ai/evidence.ts beliefsOf: estimate + confidence per rival). It watches at Normal speed.
import { beliefsOf } from '../ai/evidence'
import type { Personality, Skill } from '../ai/kit/types'
import type { AiWatchEvent, AiWatchSeat } from '../devkit/ai/aiTypes'
import { defaultBoardFor } from '../engine/boards'
import { viewFor } from '../engine/rules'
import { SEAT_COLOURS } from '../engine/types'
import { wordListUrl } from '../game/art'
import { useGameStore } from '../store/gameStore'
import { onAiDecision, setAiSpeedOverride } from '../store/localBot'
import { closeAllScreens } from '../ui/newGame'

const colourOf = (seat: number) => SEAT_COLOURS[seat] ?? `seat ${seat + 1}`

/** Start an all-AI game (seat i = seats[i]) and report every decision. Returns "stop" (the game stays on the board). */
export function startWatch(seats: AiWatchSeat[], onEvent: (e: AiWatchEvent) => void): () => void {
  const store = () => useGameStore.getState()
  let stopped = false
  let stopListening: (() => void) | null = null
  let unsubscribe: (() => void) | null = null

  async function begin() {
    await store().loadWords(wordListUrl())
    const words = store().words
    if (stopped) return
    if (!words) {
      onEvent({ seat: 0, who: '—', note: "couldn't load the word list", end: 'no game (word list missing)' })
      return
    }
    const players = seats.length
    const ai = Object.fromEntries(
      seats.map((s, i) => [i, { personality: s.personality.id, skill: s.skill.id, custom: { personality: s.personality as unknown as Personality, skill: s.skill as unknown as Skill } }]),
    )
    closeAllScreens()
    setAiSpeedOverride('normal')
    store().startGame({ players, seed: Math.floor(Math.random() * 2 ** 31), boardName: defaultBoardFor(players), bots: seats.map((_, i) => i), ai })
    const config = store().game?.config // a different config later = someone started another game: stop watching

    stopListening = onAiDecision((seat, decision) => {
      const game = store().game
      if (stopped || !game || game.config !== config) return
      const believed = beliefsOf(viewFor(game, seat), seat, words, Number(seats[seat].skill.beliefNoise ?? 0.5))
      onEvent({
        seat,
        who: seats[seat].personality.id,
        note: decision.note,
        mine: believed.mine,
        beliefs: believed.rivals.map((b) => ({ seat: b.seat, estimate: b.estimate, confidence: b.confidence })),
      })
    })
    // The end: report the winners once.
    unsubscribe = useGameStore.subscribe((s) => {
      const game = s.game
      if (stopped || !game || game.config !== config || game.phase !== 'over') return
      const winners = game.winners.map((w) => `${seats[w].personality.id} (${colourOf(w)})`).join(' + ')
      onEvent({ seat: game.winners[0] ?? 0, who: seats[game.winners[0] ?? 0].personality.id, note: `won — Magic ${game.magic.join(' · ')}`, end: `${winners} won` })
      stop()
    })
  }

  function stop() {
    stopped = true
    stopListening?.()
    unsubscribe?.()
    setAiSpeedOverride(null)
  }

  begin().catch((e: Error) => onEvent({ seat: 0, who: '—', note: `stopped: ${e.message}`, end: 'stopped with an error' }))
  return stop
}

// THE HELP LAYER (F77 tips + F78 nudges, design/tutorial.md §3–4) — in every game while Settings → Tips is on: in the
// tutorial game once its rails are over, and in every later game. ONE callout at a time, and none while the rails'
// own callout is up, while exploring (the ? mode — useExplore), while a menu screen is open, or with Tips off.
//   TIPS: at a quiet moment (nothing playing out — myTurn.ts isBusy) the tip `dueTip` (tips.ts) names shows ONCE ever
//   (the kit's tips memory), at most tipsPerTurn a turn. It fades after tipSeconds, on a tap, or when you do what it
//   says (your plan or the turn changes). The 3 PAUSE tips dim the game with "Got it" and HOLD it (the rails' hold:
//   input and the bots on this device wait) — ≤ maxPauses a game; online they show as normal tips (an online game
//   never stops for one player). A pause that comes due while exploring waits until Explore is left.
//   IDLE NUDGES (useNudge): on your turn, after idleGlow s of nothing the right thing breathes (the whose-turn pulse's
//   swell and timing — same intention, same motion), after idleText s a callout says what you can do; ≤ idleRepeat a
//   kind a game. Later games: only the words, at laterIdleText s. Any tap or key starts the clock again.
//   WRONG-ACTION NUDGES: a refused tap (the "no" shake), a refused drop, or a tap on a Plant button that can't be used
//   → a callout at once (≤ wrongRepeat a kind a game, then only the shake). On the rails TutorialLayer does it.
// Timings: content/tuning/tutorial.json · words: en.json → tutorial.tips / tutorial.nudges.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import tutorialFile from '../../content/tuning/tutorial.json'
import text from '../../content/text/en.json'
import { useLiveTuning } from '../devkit/tuning/liveTuning'
import type { GameState } from '../engine/types'
import { juiceFor } from '../game/feel'
import { useAnimTuning } from '../game/useTuning'
import { useExplore } from '../store/explore'
import { useGameStore } from '../store/gameStore'
import { isBusy, isMyTurn } from '../store/myTurn'
import { railsHold, setRails } from '../store/railsLimit'
import { viewerOf } from '../store/viewer'
import { useWrongDrop } from '../store/wrongDrop'
import { Callout, reduceMotion, useNudge, useScreens, useTips, type CalloutPlacement } from '../ui/kit'
import { idleGlowTargets, idleKind, idleTarget, idleWords, takeWrong, wrongFromDrop, wrongFromNope, wrongFromPlantTap, wrongWords, type Wrong } from './nudges'
import { useTutorial } from './progress'
import { useRailsDirector } from './railsDirector'
import { dueTip, type DueTip } from './tips'
import { calloutPlacement } from './tipsPlace'
import { countTip, newTipBudget, tipMode, tipRoomThisTurn, tipSelector, tipWords } from './tipsPlay'

type Shown = { words: string; target: string; placement: CalloutPlacement; key: number }
type TipShown = Shown & { due: DueTip; mode: 'pause' | 'plain'; at: { turnCount: number; phase: string; plan: string } }

/** One game's counts. A new deal — or the same deal started again (its turn count goes back: Replay tutorial) —
 *  starts them afresh. */
type Counts = { budget: ReturnType<typeof newTipBudget>; idle: Map<string, number>; wrong: Map<string, number> }
const freshCounts = (): Counts => ({ budget: newTipBudget(), idle: new Map(), wrong: new Map() })
let counts = { key: '', turnCount: 0, now: freshCounts() }
function countsFor(game: GameState | null): Counts {
  const key = game ? `${game.config.seed}|${game.config.players}|${game.config.boardName}` : ''
  const turnCount = game?.turnCount ?? 0
  if (key !== counts.key || turnCount < counts.turnCount) counts = { key, turnCount, now: freshCounts() }
  else counts.turnCount = turnCount
  return counts.now
}
const planOf = (s: { move: unknown; cast: unknown }) => JSON.stringify([s.move, s.cast])
let shownKeys = 0

export function HelpLayer() {
  const tuning = useLiveTuning('tutorial', tutorialFile).current
  const tips = useTips()
  const exploring = useExplore((s) => s.on)
  const tutorialGame = useTutorial((s) => s.active)
  const onRails = useRailsDirector((s) => s.step !== null) && tutorialGame
  const screenOpen = useScreens().length > 0
  const game = useGameStore((s) => s.game)
  const { move, cast, words } = useGameStore(useShallow((s) => ({ move: s.move, cast: s.cast, words: s.words })))
  const online = useGameStore((s) => s.online !== null)
  const busy = useGameStore(isBusy)
  const mine = useGameStore(isMyTurn)
  const you = useGameStore(viewerOf)
  /** May anything show? (Tips on, not on the rails, not exploring, no menu screen over the game.) */
  const on = tips.tipsOn && !onRails && !exploring && !screenOpen && !!game

  // ─── One game's counts (tips per turn, pauses, nudges per kind) ───
  const perGame = countsFor(game)

  // ─── TIPS ───
  const [tip, setTip] = useState<TipShown | null>(null)
  const quiet = on && !busy && !railsHold()
  useEffect(() => {
    if (!quiet || tip || !game) return
    if (!tipRoomThisTurn(perGame.budget, game.turnCount, tuning.tipsPerTurn)) return
    const due = dueTip({ game, you, words, move, seen: (id) => !tips.shouldShow(id) })
    if (!due) return
    const timer = setTimeout(() => {
      const target = tipSelector(due.target)
      if (!document.querySelector(target)) return // (not on screen: it waits for a later moment)
      const mode = tipMode(due.id, { online, budget: perGame.budget, maxPauses: tuning.maxPauses })
      countTip(perGame.budget, game.turnCount, mode)
      tips.markSeen(due.id)
      setTip({ due, mode, words: tipWords(due, game), target, placement: calloutPlacement(target), key: ++shownKeys,
        at: { turnCount: game.turnCount, phase: game.phase, plan: planOf({ move, cast }) } })
    }, tuning.tipDelay * 1000)
    return () => clearTimeout(timer)
  }, [quiet, tip, game, you, words, move, cast, online, perGame, tips, tuning])

  // A plain tip fades after tipSeconds, and goes when you do what it says (your plan, the turn or the phase changes).
  // While it can't show (Tips off, exploring, a menu) it's hidden — a pause waits for "Got it" (it only hides meanwhile).
  useEffect(() => {
    if (!tip || tip.mode !== 'plain') return
    const timer = setTimeout(() => setTip(null), tuning.tipSeconds * 1000)
    const stop = useGameStore.subscribe((s) => {
      const moved = !s.game || s.game.turnCount !== tip.at.turnCount || s.game.phase !== tip.at.phase || (isMyTurn(s) && planOf(s) !== tip.at.plan)
      if (moved) setTip(null)
    })
    return () => { clearTimeout(timer); stop() }
  }, [tip, tuning.tipSeconds])
  // A pause holds the game while it shows (not while exploring — Explore pauses a local game itself)
  const holding = !!tip && tip.mode === 'pause' && on && tips.tipsOn
  useEffect(() => {
    if (!holding) return
    setRails(null, true)
    return () => setRails(null, false)
  }, [holding])

  // ─── WRONG-ACTION NUDGES ───
  const [wrong, setWrong] = useState<(Shown & { plan: string }) | null>(null)
  const canNudge = on && mine && !busy && !tip && !railsHold()
  const showWrong = useCallback((found: Wrong | null) => {
    const s = useGameStore.getState()
    if (!found || !s.game || !takeWrong(perGame.wrong, found.kind, tuning.wrongRepeat)) return
    setWrong({ words: wrongWords(found, s.game), target: found.target, placement: calloutPlacement(found.target), key: ++shownKeys, plan: planOf(s) })
  }, [perGame, tuning.wrongRepeat])
  const nope = useGameStore((s) => s.nope)
  const drop = useWrongDrop((s) => s.last)
  const allowed = useRef(canNudge)
  useLayoutEffect(() => { allowed.current = canNudge })
  useEffect(() => {
    const s = useGameStore.getState()
    if (nope && allowed.current && s.game) showWrong(wrongFromNope(nope, s.game, s.move))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nope?.count])
  useEffect(() => {
    if (drop && allowed.current) showWrong(wrongFromDrop(drop.kind, drop.piece))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop?.count])
  // It goes on the next tap or key, after tipSeconds, or when your plan changes or the turn moves on
  useEffect(() => {
    if (!wrong) return
    const timer = setTimeout(() => setWrong(null), tuning.tipSeconds * 1000)
    const stop = useGameStore.subscribe((s) => { if (!isMyTurn(s) || planOf(s) !== wrong.plan) setWrong(null) })
    return () => { clearTimeout(timer); stop() }
  }, [wrong, tuning.tipSeconds])

  // ─── IDLE NUDGES ───
  const kind = game && mine ? idleKind(game, move, cast) : null
  const later = !tutorialGame
  const { stage, poke } = useNudge({
    kind, running: on && mine && !busy && !tip && !wrong && !railsHold(),
    glowAt: later ? null : tuning.idleGlow, textAt: later ? tuning.laterIdleText : tuning.idleText,
    repeat: tuning.idleRepeat, counts: perGame.idle,
  })
  // The glow: the right thing breathes like the whose-turn pulse (useTurnPulse — feel.json turnPulse, anim.json turnPulseTime)
  const anim = useAnimTuning()
  useEffect(() => {
    if (stage === 'none' || later || !kind || reduceMotion()) return // (it keeps breathing while the words show)
    const swell = 1 + juiceFor('turnPulse').grow
    const els = idleGlowTargets(kind).flatMap((sel) => [...document.querySelectorAll<HTMLElement | SVGElement>(sel)])
    const playing = els.map((el) => {
      const before = { box: el.style.transformBox, origin: el.style.transformOrigin }
      el.style.transformBox = 'fill-box'
      el.style.transformOrigin = 'center'
      const a = el.animate([{ transform: 'scale(1)' }, { transform: `scale(${swell})` }, { transform: 'scale(1)' }],
        { duration: anim.turnPulseTime * 1000, iterations: Infinity, easing: 'ease-in-out' })
      return () => { a.cancel(); el.style.transformBox = before.box; el.style.transformOrigin = before.origin }
    })
    return () => playing.forEach((stop) => stop())
  }, [stage, later, kind, anim.turnPulseTime])
  const idle: Shown | null = useMemo(() => {
    if (stage !== 'text' || !kind || !game) return null
    const target = idleTarget(kind, game)
    return { words: idleWords(kind), target, placement: calloutPlacement(target), key: ++shownKeys }
    // (once per showing — the game changing under it doesn't move it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, kind])

  // Any tap or key: the idle clock starts again, a wrong-action callout goes; a tap on a Plant button that can't be
  // used right now is a wrong action of its own (a disabled button gets no click, but the press still reaches here)
  useEffect(() => {
    const onPress = (e: Event) => {
      poke()
      setWrong(null)
      const button = (e.target as Element | null)?.closest?.('[data-action="plant"]')
      const s = useGameStore.getState()
      if (button?.matches(':disabled') && allowed.current && s.game) showWrong(wrongFromPlantTap(s.game, s.move, s.cast))
    }
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('keydown', onPress, true)
    return () => {
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('keydown', onPress, true)
    }
  }, [poke, showWrong])

  // ─── The one callout ───
  const shown = on ? tip ?? wrong ?? idle : null
  useEffect(() => {
    if (!shown) return
    useTutorial.setState({ calloutUp: true }) // (it takes the prompt's place, like the rails')
    return () => useTutorial.setState({ calloutUp: false })
  }, [shown])
  if (!shown) return null
  if (shown === tip && tip.mode === 'pause') {
    return <Callout key={tip.key} target={tip.target} text={tip.words} placement={tip.placement} label="Tip"
      action={text.tutorial.rails.gotIt} onDismiss={() => setTip(null)} dim dimAmount={tuning.railsDim} />
  }
  const dismiss = shown === tip ? () => setTip(null) : shown === wrong ? () => setWrong(null) : poke
  return <Callout key={shown.key} target={shown.target} text={shown.words} placement={shown.placement} label="Tip" onDismiss={dismiss} />
}

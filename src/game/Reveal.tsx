// THE MAGIC REVEAL — plays when the garden tangles (the steps are in src/store/revealPlan.ts):
// after the last runeblossom has grown, the tangled glyphlings pulse, each player's word Magic counts up, lowest
// first, then the "+3" tangle bonuses pop on the board hex by hex and fly into their owners' totals, which pop as
// each lands (RevealMarks.tsx — the same motion as a cast's score), then the winner(s): "Grand Glyphtender!".
// Then the end table opens. Skip (in the button row) jumps to the end at any moment;
// with reduce motion on it starts at the end. Timings: content/tuning/anim.json (reveal…).
// This panel takes the tray's place: one kit PlayerChip per player — "Magic ?" until their turn to count,
// then the number counts up (the chip does that itself; no float-up — the "+3"s fly in instead; no "Tangles +N" line —
// the flying "+3"s say it, Muzzy). Every card is a FIXED size from the start (a hidden sizer copy, game.css). The chips sit in one
// tidy centred column, all as wide as the widest (game.css .game-reveal) — calm, not spread to the corners (Muzzy at
// 768×343: "this layout looks weird"). After the reveal the same chips stay with the finished garden (See board).
// Kit parts only: PlayerChip.
// SOUND — the ceremony (content/audio.json): reveal.tangles as it opens · reveal.count as each total counts up, one note
// higher each time (the ladder: a rising run) · reveal.bonus as each "+3" lands · reveal.winner (the fanfare) as the
// Grand Glyphtender is named — also when Skip or reduce motion jumps straight to the end. While it plays, the "reveal"
// mix dips the music and ambience. The MUSIC builds like a ceremony (sound.ts ceremonyMusic): each count-up raises its
// intensity a step (the bells fade in), it holds through the fanfare (which ducks it), then settles once the end table
// opens. Pause over the reveal stacks its "paused" mix on top, so closing Pause brings the reveal's mix back.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { getAudio, playSound, useAudioSnapshot } from '../audio'
import text from '../../content/text/en.json'
import { useGameStore } from '../store/gameStore'
import { revealSteps, revealView, stepSeconds } from '../store/revealPlan'
import { landingSeconds } from '../store/wordMarks'
import { turnOf } from '../store/happened'
import { PlayerChip, reduceMotion, screens } from '../ui/kit'
import { colourOf, glyphlingArt } from './art'
import { juiceFor, juiceSound } from './feel'
import { ceremonyMusic } from './sound'
import { frozen } from './freeze'
import { playerName } from './prompt'
import { useAnimTuning, useGardenTuning, useLayoutTuning } from './useTuning'

const w = text.game.reveal

/** One chip per line (a chip never shrinks, so two in a row on a phone ran into each other — B016).
 *  Sizes: big (a roomy screen, e.g. a desktop) and a phone held upright (lots of room under the board) = the full-size
 *  chip, and on a roomy screen the whole group is drawn bigger (layout.json revealBigZoom, but never wider than its
 *  column) to match the big board; compact (the side column, e.g. a phone on its side) = small, or with 3–4 players
 *  the one-line chip (else they run into the end bar). */
export function RevealPanel({ compact, big }: { compact: boolean; big: boolean }) {
  const game = useGameStore((s) => s.game)!
  const revealAt = useGameStore((s) => s.revealAt)
  const setRevealAt = useGameStore((s) => s.setRevealAt)
  const timing = useAnimTuning()
  const colours = useGardenTuning()
  const layout = useLayoutTuning()
  const steps = useMemo(() => revealSteps(game), [game])
  const end = steps.length

  // Start once the last cast's score sequence has faded (the store's `scoring`) — or, if it scored nothing, once its
  // runeblossom has grown (reduce motion: then straight to the end)
  const pops = useGameStore((s) => s.options?.wordIndicators ?? true)
  const scoring = useGameStore((s) => s.scoring !== null)
  useEffect(() => {
    if (revealAt !== null || scoring) return
    const quick = reduceMotion()
    const turn = turnOf(useGameStore.getState().happened?.events) // what just happened (the rules' events)
    const scored = pops && (turn?.words.length ?? 0) > 0 // (its sequence outlasts the sprout)
    const timer = setTimeout(() => setRevealAt(quick ? end : 0), quick || scored ? 0 : landingSeconds(game, turn, false, timing) * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealAt, end, scoring])

  // Each step waits its time, then the next one plays (?freeze, dev only: it waits for the screenshot script instead)
  useEffect(() => {
    if (revealAt === null || revealAt >= end || frozen) return
    const timer = setTimeout(() => setRevealAt(revealAt + 1), stepSeconds(steps[revealAt], timing) * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealAt, end])

  // Finished (or skipped): open the end table — once; closing it leaves the finished board to look at
  useEffect(() => {
    if (revealAt === end && !screens.current.includes('gameOver')) screens.push('gameOver')
  }, [revealAt, end])

  // The ceremony's sounds, each as its step starts
  const heardAt = useRef<number | null | undefined>(undefined) // the step that last sounded (undefined: just shown)
  useEffect(() => {
    const before = heardAt.current
    heardAt.current = revealAt
    if (revealAt === null || revealAt === before || (before === undefined && revealAt === end)) return // (already over when shown: quiet)
    const step = steps[revealAt]
    if (step?.kind === 'tangles') playSound('reveal.tangles')
    if (step?.kind === 'count') {
      const counted = steps.slice(0, revealAt).filter((s) => s.kind === 'count').length
      playSound('reveal.count', { step: counted })
      ceremonyMusic({ count: counted + 1, of: steps.filter((s) => s.kind === 'count').length }, timing)
    }
    if (revealAt === end) ceremonyMusic('settle', timing)
    if (step?.kind === 'winner' || (revealAt === end && before !== end - 1)) playSound('reveal.winner') // (Skip / reduce motion: straight here)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealAt])
  useAudioSnapshot(getAudio(), revealAt !== null && revealAt < end ? 'reveal' : null)

  const view = revealView(steps, revealAt, game)
  const counting = view.current?.kind === 'count' ? view.current.seat : null

  // A "+3" just landed (the bonus step before this one): its owner's total pops, like a cast's running total
  const panel = useRef<HTMLDivElement>(null)
  const landed = revealAt !== null && revealAt > 0 ? steps[revealAt - 1] : undefined
  useEffect(() => {
    if (landed?.kind !== 'bonus') return
    juiceSound('totalPop', 'reveal.bonus')
    if (reduceMotion()) return
    const el = panel.current?.querySelector(`[data-reveal-seat="${landed.seat}"] .kit-player-chip-score`)
    const swell = 1 + juiceFor('totalPop').grow
    const a = el?.animate([{ transform: 'scale(1)' }, { transform: `scale(${swell})`, offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: timing.scorePopTime * 1000, easing: 'ease-out' })
    return () => a?.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealAt])

  // On a roomy screen: as much bigger as revealBigZoom asks, but only as wide as the column has room for
  useLayoutEffect(() => {
    const el = panel.current
    const column = el?.parentElement
    if (!el || !column) return
    const fit = () => {
      el.style.zoom = '1'
      const room = column.clientWidth / Math.max(1, el.scrollWidth)
      el.style.zoom = big ? String(Math.max(1, Math.min(layout.revealBigZoom, room))) : ''
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(column)
    return () => watch.disconnect()
  }, [big, layout.revealBigZoom, revealAt])

  // (3–4 players: a size down, so four padded cards don't squeeze the board — upright phones too)
  const many = game.magic.length > 2
  const size: 'm' | 's' | 'xs' = !compact ? (many && !big ? 's' : 'm') : many ? 'xs' : 's'
  return (
    <div ref={panel} className="game-reveal" data-size={size} role="group" aria-label={w.label}>
      {game.magic.map((_, seat) => {
        const score = view.scores[seat]
        const winner = view.announced && game.winners.includes(seat)
        const chip = { size, name: playerName(seat), avatar: glyphlingArt(seat), color: colours[colourOf(seat)], scoreIcon: '✦', floatUps: false, words: { score: w.magic } }
        // A fixed card (Muzzy: "static so that it can fit all of the UI elements that could be put into it"): a hidden
        // copy at its biggest — the winner's star, "Magic ?" and the widest score — holds the space from the start, so
        // nothing in the sequence makes a card grow; the column makes every card as wide as the widest
        const widest = Number(String(Math.max(...game.magic, 0)).replace(/\d/g, '8'))
        return (
          <div key={seat} data-reveal-seat={seat}>
            <div className="game-reveal-sizer" aria-hidden="true">
              <PlayerChip {...chip} score={widest} detail={size === 'xs' ? undefined : w.secret} badge={w.winnerBadge} />
            </div>
            <PlayerChip {...chip} score={score ?? undefined} detail={score === null ? w.secret : undefined}
              badge={winner ? w.winnerBadge : undefined} active={counting === seat || winner} />
          </div>
        )
      })}
    </div>
  )
}

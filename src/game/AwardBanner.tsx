// THE AWARD BANNER (v0.18 Awards during the game — GDD §4 Highlights → During the game; sketch S1, Muzzy's design).
// When a finished turn sets or takes an award's game record (store.awardNews, awardNews.ts), a small banner slides in
// over the top of the board — ONE glyphling slot, the award, who, the proof — and play carries on underneath.
// A record TAKEN: the old holder's glyphling sits in the slot, shrinks away, and the new holder's grows a little past
// full size and settles in the same spot. One piece of news at a time, never while a score is still counting up (the
// store's `scoring`); the end screen's award sound (same moment, same sound). The panel is its full size from the
// start (the slot has room for the overshoot), so nothing inside it moves the layout. Presentation only, so it runs
// on the looks clock (the Dev Kit's full pause stops it). Timings: content/tuning/endscreen.json live* (Dev Kit →
// Award banner). Reduce motion: no slide, no swap — the new holder is simply there.
// Kit parts: Panel, Row, Avatar, Text.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { playSound } from '../audio'
import text from '../../content/text/en.json'
import { looksClock } from '../devkit/gameClock'
import { useGameStore } from '../store/gameStore'
import type { AwardNews } from '../store/awardNews'
import { Avatar, Panel, Row, Text, fill } from '../ui/kit'
import { reduceMotion } from '../ui/kit/blocks/motion'
import { colourOf, glyphlingArt } from './art'
import { awardText } from './endText'
import { playerName } from './prompt'
import { useEndTuning, useGardenTuning } from './useTuning'

const w = text.game.awardBanner
const SLIDE = 0.3 // tuning-ok: the slide in and out (seconds), fixed in sketch S1 — the knobs are the hold and the swap

export function AwardBanner() {
  const next = useGameStore((s) => s.awardNews[0] ?? null)
  const scoring = useGameStore((s) => s.scoring !== null)
  // (pass-and-play: not behind the "pass the device" box — the next player sees it once they have the device)
  const handoff = useGameStore((s) => s.handoff !== null)
  const shownAwardNews = useGameStore((s) => s.shownAwardNews)
  const t = useEndTuning()
  const colours = useGardenTuning()
  const [showing, setShowing] = useState<AwardNews | null>(null)

  // The oldest news shows once the score has finished counting up (and liveAfterScore has gone by)
  useEffect(() => {
    if (!next || showing || scoring || handoff) return
    return looksClock.after(t.liveAfterScore * 1000, () => setShowing(next))
  }, [next, showing, scoring, handoff, t.liveAfterScore])
  // The news on show is always the oldest in the queue: when it isn't any more, the queue was emptied (a new or loaded
  // game) — that banner goes at once
  if (showing && next !== showing) setShowing(null)

  const taken = !!showing?.previous && showing.previous.holder !== showing.record.holder
  const still = reduceMotion()
  const swap = taken && !still ? t.liveSwapDelay + t.liveSwapSeconds : 0
  const slide = still ? 0 : SLIDE
  const total = slide + swap + t.liveHoldSeconds + slide

  // Shown: its sound and its motion (Web Animations, like the throw), then it goes after its time — and the next piece
  // of news (if any) follows
  const banner = useRef<HTMLDivElement>(null)
  const oldOne = useRef<HTMLSpanElement>(null)
  const newOne = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!showing) return
    playSound('end.award')
    const ms = (s: number) => s * 1000
    const away = { opacity: 0, translate: '0 -120%' }
    const shrink = t.liveSwapSeconds * 0.4 // (the old holder shrinks for 40% of the swap, the new one grows for the rest — sketch S1)
    const moves = still ? [] : [
      banner.current?.animate([away, { opacity: 1, translate: '0 0' }], { duration: ms(slide), easing: 'ease-out', fill: 'backwards' }),
      banner.current?.animate([{ opacity: 1, translate: '0 0' }, away], { duration: ms(slide), delay: ms(total - slide), easing: 'ease-in', fill: 'forwards' }),
      oldOne.current?.animate([{ scale: 1 }, { scale: 0 }], { duration: ms(shrink), delay: ms(slide + t.liveSwapDelay), easing: 'ease-in', fill: 'forwards' }),
      taken ? newOne.current?.animate([{ scale: 0 }, { scale: t.liveOvershoot, offset: 0.7 }, { scale: 1 }],
        { duration: ms(t.liveSwapSeconds - shrink), delay: ms(slide + t.liveSwapDelay + shrink), fill: 'backwards' }) : undefined,
    ]
    const stop = looksClock.after(ms(total), () => {
      setShowing(null)
      shownAwardNews(showing)
    })
    return () => {
      stop()
      moves.forEach((m) => m?.cancel())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing])

  if (!showing) return null
  const { record, previous } = showing
  const name = (seat: number) => playerName(seat)
  const { title, reason } = awardText(record, name)
  const who = taken ? fill(w.taken, { name: name(record.holder), other: name(previous!.holder) })
    : previous ? fill(w.ownBest, { name: name(record.holder) }) : fill(w.set, { name: name(record.holder) })
  const avatar = (seat: number, part: 'old' | 'new') => (
    <span ref={part === 'old' ? oldOne : newOne} className="game-award-banner-slot-avatar" data-part={part}>
      <Avatar name={name(seat)} src={glyphlingArt(seat)} color={colours[colourOf(seat)]} />
    </span>
  )
  return (
    <div ref={banner} className="game-award-banner" data-knobs="awardBanner" data-award={record.id} data-holder={record.holder}
      data-taken={taken || undefined} role="status" aria-label={fill(w.label, { award: title })}>
      <Panel depth={2} gap="s">
        <Row gap="s" className="kit-nowrap">
          <span className="game-award-banner-slot">
            {taken && !still && avatar(previous!.holder, 'old')}
            {avatar(record.holder, 'new')}
          </span>
          <span className="game-award-banner-text">
            <Text kind="label">{title}</Text>
            <Text kind="caption">{who}</Text>
            <Text kind="caption">{reason}</Text>
          </span>
        </Row>
      </Panel>
    </div>
  )
}

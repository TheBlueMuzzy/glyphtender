// THE HIGHLIGHTS CAROUSEL — the skill awards earned this game (stats.ts earnedAwards), ONE at a time: the holder's
// glyphling (and the rival's, small, when it's about them), the title, and the proof ("Blue's glyphling: 9 moves → 2").
// It moves on by itself every endscreen.json carouselSeconds; a tap, ◀ ▶ or a swipe moves it and holds it
// carouselPauseSeconds (UI kit Carousel). Results page only — the Story page shows an award in its moment slot when
// the scrub line is on it (GameOver.tsx; AwardRow is shared).
// The "Highlights" title sits centred on a dark strip across the whole window. Nothing earned → nothing here. Kit parts: Carousel, Stack, Row, Text.
// Sound: end.award each time an award card shows (the first one, and every move of the carousel).
import { useEffect } from 'react'
import text from '../../content/text/en.json'
import { playSound } from '../audio'
import { Badge, Carousel, Row, Stack, Text } from '../ui/kit'
import { glyphlingArt } from './art'
import { awardText } from './endText'
import type { Award } from './stats'

const w = text.game.gameOver

type Props = {
  awards: Award[]
  index: number
  onIndex: (index: number) => void
  name: (seat: number) => string
  autoSeconds: number
  pauseSeconds: number
  /** A wide screen (desktop, phone on its side): the award a size bigger, so it holds its own under the podium. */
  big?: boolean
  /** v0.18: the awards ("id:holder") that held their game record at the end — they carry a record mark. */
  records?: Set<string>
}

export function EndHighlights({ awards, index, onIndex, name, autoSeconds, pauseSeconds, big = false, records }: Props) {
  const any = awards.length > 0
  useEffect(() => {
    if (any) playSound('end.award')
  }, [index, any])
  if (!any) return null
  return (
    <Stack gap="xs" className="game-end-highlights">
      <div className="game-end-highlights-strip"><Text kind="heading">{w.highlights}</Text></div>
      <Carousel label={w.highlights} index={index} onIndexChange={onIndex} autoSeconds={autoSeconds} pauseSeconds={pauseSeconds}>
        {awards.map((a) => <AwardRow key={`${a.id}:${a.holder}`} award={a} name={name} big={big} record={records?.has(`${a.id}:${a.holder}`)} />)}
      </Carousel>
    </Stack>
  )
}

/** One award: the holder's glyphling (and the rival's, small, when it's about them), the title over the proof.
 *  `record` (v0.18): it held the game's record for this award at the end — a small "Record" badge pinned on the
 *  holder's glyphling. */
export function AwardRow({ award, name, big = false, record = false }: { award: Award; name: (seat: number) => string; big?: boolean; record?: boolean }) {
  const { title, reason } = awardText(award, name)
  return (
    <Row gap="s" className="kit-nowrap game-end-award" data-knobs="award" data-award={award.id} data-holder={award.holder} data-record={record || undefined}>
      <span className="game-end-award-art">
        {award.seats.slice(0, 2).map((seat, i) => (
          <img key={seat} className="game-end-art" data-size={i === 0 ? (big ? 'm' : 's') : 'xs'} src={glyphlingArt(seat)} alt={name(seat)} />
        ))}
        {/* pinned on the holder's glyphling like the podium's ribbons — it takes no room, so no card changes size */}
        {record && <span className="game-end-award-record"><Badge variant="primary">{w.record}</Badge></span>}
      </span>
      <span className="game-end-award-text">
        <Text kind={big ? 'heading' : 'label'}>{title}</Text>
        <Text kind={big ? 'body' : 'caption'}>{reason}</Text>
      </span>
    </Row>
  )
}

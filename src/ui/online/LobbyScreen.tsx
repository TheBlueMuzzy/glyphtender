// THE LOBBY — who's in the room (name, their glyphling colour, ready), the room code big with Copy, and for
// the host the table options (garden, 2-letter words, turn timer, word indicators) + Start. Everyone else: I'm ready.
// Leave goes through useRoom.leave(). Kit Lobby with a room code; the option rows are kit ListRows.
// AI seats (F43): the host adds one from a card under the players (the next seat's glyphling, the personality's name
// and bio — the same AI Type · bio · Skill rows as New Game's AI seats, AiPickerRows.tsx) and can Remove
// it again. An AI seat shows 🤖 + its skill under its name; the server plays it (party/turnClock.ts).
import { useState } from 'react'
import text from '../../../content/text/en.json'
import roomsJson from '../../../content/rooms.json'
import { aiOf, profileOf } from '../../../party/aiSeats'
import type { OnlineOptions } from '../../../party/protocol'
import { boardNames } from '../../engine/boards'
import { colourOf, glyphlingArt } from '../../game/art'
import { useGardenTuning } from '../../game/useTuning'
import { defaultAi, type AiPick } from '../../store/seats'
import { Avatar, Button, Card, ListRow, Lobby, Row, Selector, Stack, Toggle, fill } from '../kit'
import { AiPickerRows } from '../AiPickerRows'
import { personalityIds } from '../newGame'
import { loadOnlineOptions, saveOnlineOptions } from './onlineOptions'
import { leaveOnline, useOnline } from './session'

const w = text.online
const boardLabel = (name: string) => (name === 'auto' ? w.options.auto : (text.newGame.boards as Record<string, string>)[name] ?? name)
const timerLabel = (seconds: number) => (seconds === 0 ? w.options.timerOff : fill(w.options.timerSeconds, { n: seconds }))
const aiWords = (id: string) => (text.ai.personality as Record<string, { name: string; bio: string }>)[id] ?? { name: id, bio: '' }
const skillName = (id: string) => (text.ai.skill as Record<string, string>)[id] ?? id

export function LobbyScreen() {
  const room = useOnline((s) => s.room)
  const colours = useGardenTuning()
  const [options, setOptions] = useState<OnlineOptions>(loadOnlineOptions)
  if (!room?.room) return null

  const seats = room.room.seats
  const players = seats.map((seat, i) => ({
    id: seat.id, name: seat.name, ready: seat.ready, color: colours[colourOf(i)], avatar: glyphlingArt(i),
    ...(seat.kind === 'bot' && { detail: fill(w.lobby.aiDetail, { skill: skillName(aiOf(seat.profile).skill) }), bot: true }),
  }))
  const start = () => {
    saveOnlineOptions(options)
    room.start(options)
  }
  const roomForAi = room.room.phase === 'lobby' && seats.length < room.room.maxSeats
  return (
    <Lobby words={w.lobby} roomCode={room.room.code} players={players} meId={room.mySeat?.id} hostId={seats.find((s) => s.isHost)?.id}
      minPlayers={room.room.minSeats} onReady={room.setReady} onStart={start} onLeave={leaveOnline} onRemove={room.kick}
      onCreate={() => {}} onJoin={() => {}}>
      {room.isHost && roomForAi && <AddAi seat={seats.length} onAdd={(ai) => room.addBot(profileOf(ai))} />}
      {room.isHost && <TableOptions options={options} onChange={setOptions} />}
    </Lobby>
  )
}

/** The host's "add an AI" card: who it is (personality, with its bio) and how well it plays (skill). */
function AddAi({ seat, onAdd }: { seat: number; onAdd: (ai: AiPick) => void }) {
  const colours = useGardenTuning()
  const [ai, setAi] = useState<AiPick>(defaultAi)
  const shown = aiWords(ai.personality)
  return (
    <Card title={<Row gap="s"><Avatar name={shown.name} src={glyphlingArt(seat)} color={colours[colourOf(seat)]} /><span>{w.lobby.addAiTitle}</span></Row>}>
      <Stack gap="s">
        {/* the same rows as New Game's AI seats (Muzzy 2026-10-08) — no "Surprise me" online (the name would give it away) */}
        <AiPickerRows personalities={personalityIds()} personality={ai.personality} skill={ai.skill} onChange={(part) => setAi({ ...ai, ...part })} />
        <Button variant="secondary" onClick={() => onAdd(ai)}>{w.lobby.addAi}</Button>
      </Stack>
    </Card>
  )
}

/** The host's choices, as rows under the players. */
function TableOptions({ options, onChange }: { options: OnlineOptions; onChange: (options: OnlineOptions) => void }) {
  const boards = ['auto', ...boardNames()]
  const timers = roomsJson.turnTimerChoices
  return (
    <>
      <ListRow label={w.options.board} detail={w.options.boardDetail}>
        <Selector label={w.options.board} options={boards.map(boardLabel)} value={boardLabel(options.boardName)}
          onChange={(label) => onChange({ ...options, boardName: boards.find((b) => boardLabel(b) === label) ?? options.boardName })} />
      </ListRow>
      <ListRow label={w.options.twoLetterWords} detail={w.options.twoLetterDetail}>
        <Toggle label={w.options.twoLetterWords} on={options.minWordLength <= 2} onChange={(on) => onChange({ ...options, minWordLength: on ? 2 : 3 })} />
      </ListRow>
      <ListRow label={w.options.timer} detail={w.options.timerDetail}>
        <Selector label={w.options.timer} options={timers.map(timerLabel)} value={timerLabel(options.turnSeconds)}
          onChange={(label) => onChange({ ...options, turnSeconds: timers.find((t) => timerLabel(t) === label) ?? options.turnSeconds })} />
      </ListRow>
      <ListRow label={w.options.wordIndicators} detail={w.options.wordIndicatorsDetail}>
        <Toggle label={w.options.wordIndicators} on={options.wordIndicators} onChange={(on) => onChange({ ...options, wordIndicators: on })} />
      </ListRow>
    </>
  )
}

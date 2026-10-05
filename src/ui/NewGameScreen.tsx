// NEW GAME — the table options before a game on this device: players 2–4, who plays each seat (a person, or the
// AI — F42; the first seat is always you, so it has no row — Muzzy: "I'm always going to be a player"), garden size (defaults to the size boards.json names for that many players), 2-letter words on/off,
// hide seeds between turns on/off, word indicators on/off → Start.
// An AI seat opens a card under its row: the seat's glyphling as its portrait, the personality's name and bio
// (en.json ai.personality — or "Surprise me": a random one picked at Start), ◀ personality ▶, and its skill.
// The card never changes size as you flip through personalities: an invisible copy of every bio, piled in one spot,
// holds it as tall as the longest (newGame.css).
// Built like the kit's Settings screen: Panel, a title row with Back, rows (ListRow + Stepper / Selector /
// Toggle) that scroll on short screens, and the Start button. Words: content/text/en.json → newGame, ai.
import { useState } from 'react'
import text from '../../content/text/en.json'
import { colourOf, glyphlingArt } from '../game/art'
import { useGardenTuning } from '../game/useTuning'
import { Avatar, Button, Card, ListRow, Panel, Row, Screen, ScrollArea, Selector, Stack, Stepper, Text, Toggle, screens } from './kit'
import {
  SURPRISE, boardNames, hasPerson, loadChoices, personalityIds, skillIds, startNewGame, withPlayers, withSeat, type NewGameChoices, type SeatChoice,
} from './newGame'
import './newGame.css'

const w = text.newGame
const boardLabel = (name: string) => (w.boards as Record<string, string>)[name] ?? name

// Personalities and skills as players read them (en.json → ai), "Surprise me" first
const aiWords = text.ai.personality as Record<string, { name: string; bio: string }>
const personalityOptions = [SURPRISE, ...personalityIds()]
const personalityWords = (id: string) => (id === SURPRISE ? w.surprise : aiWords[id] ?? { name: id, bio: '' })
const skillName = (id: string) => (text.ai.skill as Record<string, string>)[id] ?? id

export function NewGameScreen() {
  const [choices, setChoices] = useState<NewGameChoices>(loadChoices)
  const change = (part: Partial<NewGameChoices>) => setChoices({ ...choices, ...part })
  const boards = boardNames()
  const seats = choices.seats.slice(0, choices.players)

  return (
    <Screen label={w.title}>
      <Panel depth={2} gap="m" className="kit-modal">
        <Row gap="s" justify="between">
          <Text kind="title">{w.title}</Text>
          <Button variant="secondary" onClick={() => screens.pop()}>{w.back}</Button>
        </Row>
        <ScrollArea label={w.title}>
          <ListRow label={w.players}>
            <Stepper label={w.players} value={choices.players} min={2} max={4} onChange={(count) => setChoices(withPlayers(choices, count))} />
          </ListRow>
          {seats.slice(1).map((seat, i) => (
            <SeatRows key={i + 1} index={i + 1} seat={seat} onChange={(part) => setChoices(withSeat(choices, i + 1, part))} />
          ))}
          <ListRow label={w.board} detail={w.boardDetail}>
            <Selector label={w.board} options={boards.map(boardLabel)} value={boardLabel(choices.boardName)}
              onChange={(label) => change({ boardName: boards.find((b) => boardLabel(b) === label) ?? choices.boardName })} />
          </ListRow>
          <ListRow label={w.twoLetterWords} detail={w.twoLetterDetail}>
            <Toggle label={w.twoLetterWords} on={choices.twoLetterWords} onChange={(on) => change({ twoLetterWords: on })} />
          </ListRow>
          <ListRow label={w.hideSeeds} detail={w.hideSeedsDetail}>
            <Toggle label={w.hideSeeds} on={choices.hideSeeds} onChange={(on) => change({ hideSeeds: on })} />
          </ListRow>
          <ListRow label={w.wordIndicators} detail={w.wordIndicatorsDetail}>
            <Toggle label={w.wordIndicators} on={choices.wordIndicators} onChange={(on) => change({ wordIndicators: on })} />
          </ListRow>
        </ScrollArea>
        {hasPerson(choices)
          ? <Button onClick={() => startNewGame(choices)}>{w.start}</Button>
          : <Button disabled>{w.needPerson}</Button>}
      </Panel>
    </Screen>
  )
}

/** One seat after yours: "Player 2" + Person / AI — and, for the AI, the personality card. */
function SeatRows({ index, seat, onChange }: { index: number; seat: SeatChoice; onChange: (part: Partial<SeatChoice>) => void }) {
  const colours = useGardenTuning()
  const name = w.playerN.replace('{n}', String(index + 1))
  const kinds = [w.person, w.ai]
  const shown = personalityWords(seat.personality)
  return (
    <>
      <ListRow label={name}>
        <Selector label={name} options={kinds} value={seat.ai ? w.ai : w.person} onChange={(kind) => onChange({ ai: kind === w.ai })} />
      </ListRow>
      {seat.ai && (
        <Card title={<Row gap="s"><Avatar name={name} src={glyphlingArt(index)} color={colours[colourOf(index)]} /><span>{shown.name}</span></Row>}>
          <span className="new-game-bio" data-seat={index}>
            {personalityOptions.map((id) => <span key={id} className="new-game-bio-sizer" aria-hidden="true"><Text kind="caption">{personalityWords(id).bio}</Text></span>)}
            <span><Text kind="caption">{shown.bio}</Text></span>
          </span>
          <Stack gap="s">
            <Row gap="s" justify="center">
              <Selector label={`${name}: ${w.personality}`} options={personalityOptions.map((id) => personalityWords(id).name)} value={shown.name}
                onChange={(label) => onChange({ personality: personalityOptions.find((id) => personalityWords(id).name === label) ?? seat.personality })} />
            </Row>
            <Row gap="s" justify="between">
              <Text kind="label">{w.skill}</Text>
              <Selector label={`${name}: ${w.skill}`} options={skillIds().map(skillName)} value={skillName(seat.skill)}
                onChange={(label) => onChange({ skill: skillIds().find((id) => skillName(id) === label) ?? seat.skill })} />
            </Row>
          </Stack>
        </Card>
      )}
    </>
  )
}

// NEW GAME — the table options before a game on this device: players 2–4, who plays each seat (a person, or the
// AI — F42; the first seat is always you, so it has no row — Muzzy: "I'm always going to be a player"), garden size (defaults to the size boards.json names for that many players), 2-letter words on/off,
// hide seeds between turns on/off, word indicators on/off → Start.
// An AI seat opens a card under its row (Muzzy 2026-10-05): AI Type ◀ personality ▶ · its bio · Skill ◀ skill ▶ — the
// two selectors right-aligned, the same width (newGame.css). "Surprise me" = a random personality picked at Start.
// The card never changes size as you flip through personalities: an invisible copy of every bio, piled in one spot,
// holds it as tall as the longest. The panel is pinned to the top (newGame.css), so opening a card pushes the rows
// below DOWN and the Person / AI button you tapped stays under your finger.
// Built like the kit's Settings screen: Panel, a title row with Back, rows (ListRow + Stepper / Selector /
// Toggle) that scroll on short screens, and the Start button. Words: content/text/en.json → newGame, ai.
import { useState } from 'react'
import text from '../../content/text/en.json'
import { Button, ListRow, Panel, Row, Screen, ScrollArea, Selector, Stepper, Text, Toggle, screens } from './kit'
import {
  SURPRISE, boardNames, hasPerson, loadChoices, personalityIds, skillIds, startNewGame, withPlayers, withSeat, type NewGameChoices, type SeatChoice,
} from './newGame'
import './newGame.css'

const w = text.newGame
const boardLabel = (name: string) => (w.boards as Record<string, string>)[name] ?? name

// Personalities and skills as players read them (en.json → ai), "Surprise me" first
const aiWords = text.ai.personality as Record<string, { name: string; type?: string; bio: string }>
const personalityOptions = [SURPRISE, ...personalityIds()]
const personalityWords = (id: string) => (id === SURPRISE ? w.surprise : aiWords[id] ?? { name: id, bio: '' })
// What the AI Type selector shows: the personality's type ("Strategist"), else its name ("Surprise me")
const typeName = (id: string): string => { const words: { name: string; type?: string } = personalityWords(id); return words.type || words.name }
const skillName = (id: string) => (text.ai.skill as Record<string, string>)[id] ?? id

export function NewGameScreen() {
  const [choices, setChoices] = useState<NewGameChoices>(loadChoices)
  const change = (part: Partial<NewGameChoices>) => setChoices({ ...choices, ...part })
  const boards = boardNames()
  const seats = choices.seats.slice(0, choices.players)

  return (
    <Screen label={w.title}>
      <Panel depth={2} gap="m" className="kit-modal new-game-panel">
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
  const name = w.playerN.replace('{n}', String(index + 1))
  const kinds = [w.person, w.ai]
  const shown = personalityWords(seat.personality)
  return (
    <>
      <ListRow label={name}>
        <Selector label={name} options={kinds} value={seat.ai ? w.ai : w.person} onChange={(kind) => onChange({ ai: kind === w.ai })} />
      </ListRow>
      {seat.ai && (
        <div className="new-game-ai" data-seat={index}>
            <Text kind="label">{w.aiType}</Text>
            <Selector label={`${name}: ${w.personality}`} options={personalityOptions.map(typeName)} value={typeName(seat.personality)}
              onChange={(label) => onChange({ personality: personalityOptions.find((id) => typeName(id) === label) ?? seat.personality })} />
            <span className="new-game-bio">
              {personalityOptions.map((id) => <span key={id} className="new-game-bio-sizer" aria-hidden="true"><Text kind="caption">{personalityWords(id).bio}</Text></span>)}
              <span><Text kind="caption">{shown.bio}</Text></span>
            </span>
            <Text kind="label">{w.skill}</Text>
            <Selector label={`${name}: ${w.skill}`} options={skillIds().map(skillName)} value={skillName(seat.skill)}
              onChange={(label) => onChange({ skill: skillIds().find((id) => skillName(id) === label) ?? seat.skill })} />
        </div>
      )}
    </>
  )
}

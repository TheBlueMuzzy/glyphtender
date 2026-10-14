// NEW GAME — the table options before a game on this device: players 2–4, who plays each seat (a person, or the
// AI — F42; the first seat is always you, so it has no row — Muzzy: "I'm always going to be a player"), garden size (defaults to the size boards.json names for that many players), 2-letter words on/off,
// hide seeds between turns on/off, word indicators on/off → Start.
// An AI seat opens a card under its row (Muzzy 2026-10-05): AI Type ◀ personality ▶ · its bio · Skill ◀ skill ▶ — the
// two selectors right-aligned, the same width (newGame.css). "Surprise me" = a random personality picked at Start.
// The card never changes size as you flip through personalities: an invisible copy of every bio, piled in one spot,
// holds it as tall as the longest. The kit's menu frame (UI kit 0.10.0, sprint 28): the one menu width, ‹ back + the
// title + Start in the header (Muzzy: "Start button … should be up next to Main Menu"; "< = back"), the rows in the
// card's own scroller (no scroll bar). The card opens centred, then its top stays put (Screen grow="down"), so opening
// an AI seat pushes the rows below DOWN and the Person / AI button you tapped stays under your finger; at the max
// height the rows scroll inside. Words: content/text/en.json → newGame, ai.
import { useState } from 'react'
import text from '../../content/text/en.json'
import { Button, ListRow, MenuHeader, Panel, Screen, ScrollArea, Selector, Stepper, Text, Toggle, screens } from './kit'
import {
  SURPRISE, boardNames, hasPerson, loadChoices, personalityIds, startNewGame, withPlayers, withSeat, type NewGameChoices, type SeatChoice,
} from './newGame'
import './newGame.css'
import { AiPickerRows } from './AiPickerRows'

const w = text.newGame
const boardLabel = (name: string) => (w.boards as Record<string, string>)[name] ?? name

// The AI seat's personalities, "Surprise me" first (the rows themselves: AiPickerRows.tsx)
const personalityOptions = [SURPRISE, ...personalityIds()]

export function NewGameScreen() {
  const [choices, setChoices] = useState<NewGameChoices>(loadChoices)
  const change = (part: Partial<NewGameChoices>) => setChoices({ ...choices, ...part })
  const boards = boardNames()
  const seats = choices.seats.slice(0, choices.players)

  return (
    <Screen label={w.title} grow="down">
      <Panel depth={2} gap="m" className="kit-modal new-game-panel">
        <MenuHeader title={w.title} onBack={() => screens.pop()} backLabel={w.back}
          action={<Button compact disabled={!hasPerson(choices)} onClick={() => startNewGame(choices)}>{w.start}</Button>} />
        {!hasPerson(choices) && <Text kind="caption">{w.needPerson}</Text>}
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
          <ListRow label={w.britishWords} detail={w.britishDetail}>
            <Toggle label={w.britishWords} on={choices.britishWords} onChange={(on) => change({ britishWords: on })} />
          </ListRow>
          <ListRow label={w.vulgarWords} detail={w.vulgarDetail}>
            <Toggle label={w.vulgarWords} on={choices.vulgarWords} onChange={(on) => change({ vulgarWords: on })} />
          </ListRow>
          <ListRow label={w.hideSeeds} detail={w.hideSeedsDetail}>
            <Toggle label={w.hideSeeds} on={choices.hideSeeds} onChange={(on) => change({ hideSeeds: on })} />
          </ListRow>
          <ListRow label={w.wordIndicators} detail={w.wordIndicatorsDetail}>
            <Toggle label={w.wordIndicators} on={choices.wordIndicators} onChange={(on) => change({ wordIndicators: on })} />
          </ListRow>
        </ScrollArea>
      </Panel>
    </Screen>
  )
}

/** One seat after yours: "Player 2" + Person / AI — and, for the AI, the personality card. */
function SeatRows({ index, seat, onChange }: { index: number; seat: SeatChoice; onChange: (part: Partial<SeatChoice>) => void }) {
  const name = w.playerN.replace('{n}', String(index + 1))
  const kinds = [w.person, w.ai]
  return (
    <>
      <ListRow label={name}>
        <Selector label={name} options={kinds} value={seat.ai ? w.ai : w.person} onChange={(kind) => onChange({ ai: kind === w.ai })} />
      </ListRow>
      {seat.ai && (
        <AiPickerRows personalities={personalityOptions} personality={seat.personality} skill={seat.skill} onChange={onChange}
          name={name} attrs={{ 'data-seat': index }} />
      )}
    </>
  )
}

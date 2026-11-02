// DAILY BOARD PANEL (F98) — the ready-made screen for the checked leaderboard, built from UI kit parts (Modal,
// ScrollArea, ListRow, Badge, TextInput, Button, Text, toast, askConfirm). The day's top scores under 3-letter names
// (arcade style), "your 3 letters" + Send when a finished Daily game is waiting, the try rule, the privacy line and
// "Remove my score". Only in games with the UI kit (src/saves/ui/), like the Save code screen.
//
// Register it as a screen, and open it from the menu / the end of a Daily game:
//   const board = { url: boardAddress(import.meta.env.VITE_SAVES_BOARD), game: 'glyphtender' }
//   <ScreenStack screens={{ ...screens, dailyBoard: () => <BoardPanel board={board} /> }}>
//
// Fixed size from the start (the breathing-room rule): every line is always there and the board always has
// `board.show` rows ("—" until filled), so the card never grows while the scores arrive or a game is checked.
import { useCallback, useEffect, useState } from 'react'
import { askConfirm, Badge, Button, ListRow, Modal, Row, ScrollArea, Stack, Text, TextInput, screens, toast } from '../../ui/kit'
import { BOARD_WORDS, lastBoardName, loadBoard, removeMyScore, sendScore, waitingForBoard, type BoardDay, type BoardOptions } from '../board'
import { savesConfig } from '../config'
import { utcDay } from '../replay'
import { BOARD_PANEL_WORDS } from './panelWords'

export interface BoardPanelProps {
  /** { url: boardAddress(import.meta.env.VITE_SAVES_BOARD), game: '<the game's name>' } */
  board: BoardOptions
  words?: Partial<typeof BOARD_PANEL_WORDS>
}

/** How often the screen looks again while a game of yours is being checked (ms). */
const CHECKING_POLL_MS = 1500

export function BoardPanel({ board, words: wordsIn }: BoardPanelProps) {
  const words = { ...BOARD_PANEL_WORDS, ...wordsIn }
  const settings = savesConfig().board
  const [day, setDay] = useState<BoardDay | null>(null)
  /** A sentence from the last answer (offline, refused…) — shown instead of the usual status line until the next one. */
  const [note, setNote] = useState<string | null>(null)
  const [name, setName] = useState(() => lastBoardName(board))
  const [waiting, setWaiting] = useState(() => waitingForBoard(board))
  const [busy, setBusy] = useState(false)

  /** The board as the server just sent it (or why it couldn't). */
  const show = useCallback((answer: Awaited<ReturnType<typeof loadBoard>>) => {
    if (!answer.ok) { setNote(answer.message); return }
    setDay(answer)
    setNote(null)
  }, [])
  // The status line: what the board says about this device right now
  const status = note ?? (
    !day ? words.loading
      : day.checking > 0 ? words.checking
        : day.mine ? words.yourScore(day.mine.score, day.mine.rank)
          : waiting ? words.readyToSend
            : day.refused > 0 ? BOARD_WORDS.refused
              : words.noScore)
  const refresh = useCallback(async () => show(await loadBoard(board, waitingForBoard(board)?.day)), [board, show])

  useEffect(() => {
    let live = true
    loadBoard(board, waitingForBoard(board)?.day).then((answer) => { if (live) show(answer) })
    return () => { live = false }
  }, [board, show])

  // While the server is still checking a game of yours, look again every moment until its score is in
  const checking = (day?.checking ?? 0) > 0
  useEffect(() => {
    if (!checking) return
    const timer = setInterval(() => void refresh(), CHECKING_POLL_MS)
    return () => clearInterval(timer)
  }, [checking, refresh])

  async function send() {
    setBusy(true)
    const sent = await sendScore(name, board)
    setBusy(false)
    setWaiting(waitingForBoard(board))
    if (!sent.ok) {
      toast(sent.message, { variant: 'danger', seconds: 6 })
      setNote(sent.message)
      return
    }
    await refresh()
  }

  function remove() {
    askConfirm({
      title: words.removeTitle, message: words.removeMessage, danger: true, words: { yes: words.removeYes },
      onConfirm: async () => {
        const result = await removeMyScore(board, day?.day)
        toast(result.message, { variant: result.ok ? 'neutral' : 'danger', seconds: 6 })
        await refresh()
      },
    })
  }

  // Always `settings.show` rows: the scores so far, then "—"
  const lines = Array.from({ length: settings.show }, (_, i) => day?.top[i] ?? null)
  const shownDay = day?.day ?? waiting?.day ?? utcDay()

  return (
    <Modal title={words.title} onBack={() => screens.pop()} backLabel={words.close}>
      <ScrollArea label={words.title}>
        <Stack gap="m">
          {/* the day and the game's try rule, then the name + Send, and right under them what happened (sent, checking,
              your score, refused) — so the answer to a press is next to the button pressed */}
          <Text kind="caption">{`${words.day(shownDay)} · ${BOARD_WORDS.triesLine(day?.tries.allowed ?? settings.dailyTries)}`}</Text>
          <TextInput
            label={words.yourName} value={name} maxLength={3} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onChange={(e) => setName(e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, ''))} disabled={!waiting} data-board-name=""
          />
          <Row gap="s">
            <Button variant="primary" onClick={send} disabled={!waiting || name.length !== 3} loading={busy}>{words.send}</Button>
          </Row>
          <Text kind="body">{status}</Text>
          <Stack gap="xs">
            {lines.map((line, i) => (
              <ListRow key={i} label={line ? `${line.rank}. ${line.name}` : `${i + 1}. ${words.empty}`}>
                <Row gap="s">
                  {line?.you && <Badge variant="primary">{words.you}</Badge>}
                  <Text kind="label">{line ? line.score : words.empty}</Text>
                </Row>
              </ListRow>
            ))}
          </Stack>
          <Row gap="s">
            <Button variant="danger" onClick={remove} disabled={!day?.mine && !checking}>{words.remove}</Button>
          </Row>
          <Text kind="caption">{BOARD_WORDS.privacy(settings.keepDays)}</Text>
        </Stack>
      </ScrollArea>
    </Modal>
  )
}

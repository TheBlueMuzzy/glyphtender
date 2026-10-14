// SUBMIT A WORD (F69) — opened from Pause; works on the planned seed (placed, not cast) — none yet → it says so. Lists the stretches of letters
// through that seed that aren't words yet (store/submitChoices.ts), longest first; a tap sends one (ui/online/wordOutbox.ts)
// and says "Word submitted" — always the same, new or not (Muzzy 2026-10-11). Words: en.json → game.submitWord.
import { useState } from 'react'
import { Button, Modal, ScrollArea, Stack, Text, fill, screens, toast } from './kit'
import { useGameStore } from '../store/gameStore'
import { plannedStretches, submitChoices, type SubmitChoices } from '../store/submitChoices'
import { sendWord } from './online/wordOutbox'
import { everyWordIn } from '../engine/words'
import text from '../../content/text/en.json'
import submit from '../../content/words/submit.json'

/** What to offer right now (read once when the screen opens — the game holds still under Pause). */
function choicesNow(): SubmitChoices | { kind: 'noSeed' } {
  const { game, move, cast, wordFile } = useGameStore.getState()
  const stretches = plannedStretches(game, move, cast)
  if (!stretches) return { kind: 'noSeed' }
  // Against EVERY word, British + vulgar too, whatever this game's switches: the server drops those anyway (F71)
  return wordFile ? submitChoices(stretches, everyWordIn(wordFile)) : { kind: 'none' }
}

export function SubmitWordScreen() {
  const w = text.game.submitWord
  const [choices] = useState(choicesNow)
  const [sending, setSending] = useState<string | null>(null) // the word on its way (its button spins)
  const tooShort = fill(w.tooShort, { n: submit.minLetters })

  const send = async (word: string) => {
    setSending(word)
    const result = await sendWord(word)
    setSending(null)
    if (result === 'too-short') return void toast(tooShort, { variant: 'danger' })
    screens.pop() // back to Pause
    toast(w.sent)
  }

  return (
    <Modal title={w.title} onBack={() => screens.pop()} backLabel={w.back}>
      {choices.kind === 'list' && (
        <>
          <Text kind="caption">{w.pick}</Text>
          {/* the list scrolls inside the card on a short screen, so the header's ‹ always stays in sight */}
          <ScrollArea label={w.title}>
            <Stack gap="s">
              {choices.words.map((word) => (
                <Button key={word} variant="secondary" loading={sending === word} disabled={sending !== null} onClick={() => send(word)}>{word}</Button>
              ))}
            </Stack>
          </ScrollArea>
        </>
      )}
      {choices.kind === 'tooShort' && <Text>{tooShort}</Text>}
      {choices.kind === 'none' && <Text>{w.none}</Text>}
      {choices.kind === 'noSeed' && <Text>{w.placeSeed}</Text>}
    </Modal>
  )
}

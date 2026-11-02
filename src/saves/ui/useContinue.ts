// CONTINUE ON THE MAIN MENU — the UI kit's MainMenu shows its Continue button only when there's a run to continue,
// with where the player was and when inside it ("Turn 7 · 5 min ago").
//
//   const resume = useContinue(run, (match) => startMatch(match))
//   <MainMenu title="Glyphtender" {...resume} onPlay={newGame} onSettings={…} />
//
// resume = { onContinue, continueDetail } when a run is waiting, {} when not (MainMenu then has no Continue).
// A run that can't be continued (a newer build's, or damaged) still shows Continue: pressing it tells the player why in
// a toast and wipes it, and Continue goes away — better than a game that silently vanished.
// Words: RUN_WORDS (run.ts) — pass `words` to change them.
import { useEffect, useRef, useState } from 'react'
import { toast } from '../../ui/kit'
import { continueLine, RUN_WORDS, type Run } from '../run'

export function useContinue<T>(run: Run<T>, onResume: (data: T) => void, words: Partial<typeof RUN_WORDS> = {}):
  { onContinue?: () => void; continueDetail?: string } {
  // Read when the menu opens, and again whenever the run is saved, wiped or ended — so a menu that stays mounted while
  // the game is played never shows an old line or a Continue for a finished game (review F93). (Worked out here, not
  // while drawing: a draw must not read the clock.)
  const [line, setLine] = useState(() => lineFor(run, words))
  const wordsNow = useRef(words)
  useEffect(() => { wordsNow.current = words })
  useEffect(() => {
    setLine(lineFor(run, wordsNow.current))
    return run.subscribe(() => setLine(lineFor(run, wordsNow.current)))
  }, [run])
  if (line === null) return {}
  return {
    continueDetail: line || undefined,
    onContinue: () => {
      const back = run.resume()
      if (back.ok) { onResume(back.data); return }
      // 'none' = it was already gone (ended elsewhere): nothing to blame, Continue just goes
      if (back.reason !== 'none') toast(words.cantContinue ?? back.message, { variant: 'danger', seconds: 6 })
      setLine(lineFor(run, words))
    },
  }
}

/** The line under Continue, '' when there's nothing to say, null when there's no run. */
function lineFor<T>(run: Run<T>, words: Partial<typeof RUN_WORDS>): string | null {
  const pending = run.pending()
  return pending ? continueLine(pending, Date.now(), words) : null
}

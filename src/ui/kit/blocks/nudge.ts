// NUDGE TIMER — "you've been still a while: here's what you can do" (Glyphtender F78, the tutorial's idle nudges).
// The game says WHAT the player should be doing right now (`kind`, e.g. 'move' or 'plant') and when the clock may
// run (`running`: false while it's someone else's turn, a piece is flying, a callout is up…). After `glowAt` seconds
// of nothing the stage becomes 'glow' (the game makes the right thing pulse); after `textAt`, 'text' (the game shows a
// Callout with the words). Any activity — `poke()`, or a new `kind` — starts the clock again. Each kind shows at most
// `repeat` times (counted when it reaches its LAST stage), then that kind stays quiet; `resetCounts()` (a new game)
// clears them. glowAt null = no glow stage (straight to text at textAt).
//   const { stage, poke } = useNudge({ kind: 'move', running: myTurn && !busy, glowAt: 10, textAt: 20, repeat: 3 })
// Pure core: nudgeClock (tested without timers); the hook wraps it in one setTimeout at a time.
import { useCallback, useEffect, useState } from 'react'

export type NudgeStage = 'none' | 'glow' | 'text'

export interface NudgeOptions {
  /** What the player should do now ('move', 'plant'…). null = nothing to nudge about. */
  kind: string | null
  /** May the clock run now? */
  running: boolean
  /** Seconds of nothing before the glow (null = no glow stage). */
  glowAt: number | null
  /** Seconds of nothing before the words. */
  textAt: number
  /** How many times each kind may reach its words (then it stays quiet). */
  repeat: number
  /** Shared show counts (e.g. one per game); the hook keeps its own when left out. */
  counts?: Map<string, number>
}

/** The stage `idle` seconds into a quiet spell, and how many seconds until the next stage (null = none). */
export function nudgeClock(idle: number, o: Pick<NudgeOptions, 'glowAt' | 'textAt'>): { stage: NudgeStage; next: number | null } {
  if (idle >= o.textAt) return { stage: 'text', next: null }
  if (o.glowAt !== null && idle >= o.glowAt) return { stage: 'glow', next: o.textAt - idle }
  return { stage: 'none', next: (o.glowAt ?? o.textAt) - idle }
}

/** Has this kind used up its showings? */
export const nudgeUsedUp = (counts: Map<string, number>, kind: string, repeat: number) => (counts.get(kind) ?? 0) >= repeat

export function useNudge({ kind, running, glowAt, textAt, repeat, counts: shared }: NudgeOptions) {
  const [own] = useState(() => new Map<string, number>())
  const counts = shared ?? own
  const [spell, setSpell] = useState(0) // a new quiet spell (poke)
  const poke = useCallback(() => setSpell((n) => n + 1), [])
  // The stage belongs to one quiet spell: a new kind, a pause or a poke makes a new spell, which starts at 'none'
  const spellKey = `${kind}|${running}|${spell}`
  const [reached, setReached] = useState<{ key: string; stage: NudgeStage }>({ key: '', stage: 'none' })

  useEffect(() => {
    if (!kind || !running || nudgeUsedUp(counts, kind, repeat)) return
    const started = performance.now()
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      const now = nudgeClock((performance.now() - started) / 1000, { glowAt, textAt })
      setReached({ key: spellKey, stage: now.stage })
      if (now.stage === 'text') counts.set(kind, (counts.get(kind) ?? 0) + 1)
      if (now.next !== null) timer = setTimeout(tick, Math.max(0, now.next * 1000))
    }
    timer = setTimeout(tick, (glowAt ?? textAt) * 1000)
    return () => { if (timer) clearTimeout(timer) }
  }, [kind, running, glowAt, textAt, repeat, counts, spellKey])

  const resetCounts = useCallback(() => counts.clear(), [counts])
  const stage: NudgeStage = reached.key === spellKey ? reached.stage : 'none'
  return { stage, poke, resetCounts }
}

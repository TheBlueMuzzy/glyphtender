// LEVEL METER (0.12.0) — a level (rank) with the XP bar towards the next one: "OPERATOR RANK 2 · 10,347 / 12,500 XP".
// It knows no rules: the game passes the numbers, and to show XP arriving, the STEPS the bar goes through
// (each { level, from, to, max } — one per level crossed; the game works them out from its own XP table).
// Played in order when `play` is true: the bar fills and the XP counts up (two of the style's normal motion times per
// step — the same pace as every number that counts up, useCountUp); filling a level ends with the level number
// popping (the same grow-and-settle as HudText pop) and onLevelUp(newLevel), then the bar empties and the next step
// starts. Afterwards (and with reduce motion, straight away) it shows level / xp / xpToNext.
// xpToNext 0 = the top level: the bar is full and words.max shows instead of the numbers.
// art = the game's own bar picture, for a meter drawn over its art (ArtStage): { fill: the full bar's picture, revealed
// left to right (never stretched — ratio = its width / height) }; the track is then the art's own, so none is drawn.
// The words size with the box around them (em), so inside an ArtLayer `text` they grow with the art.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motionTime, reduceMotion } from './motion'

export type LevelStep = { level: number; from: number; to: number; max: number }
export const levelMeterWords = { label: 'Level', unit: 'XP', max: 'Max' }

type LevelMeterProps = {
  level: number
  xp: number
  xpToNext: number
  steps?: LevelStep[]
  play?: boolean
  onLevelUp?: (level: number) => void
  onDone?: () => void
  words?: Partial<typeof levelMeterWords>
  format?: (n: number) => string
  art?: { fill: string; ratio: number }
}

type Shown = { level: number; xp: number; max: number }

export function LevelMeter({ level, xp, xpToNext, steps, play = false, onLevelUp, onDone, words, format = (v) => v.toLocaleString(), art }: LevelMeterProps) {
  const w = { ...levelMeterWords, ...words }
  const [shown, setShown] = useState<Shown>(() => (steps?.length ? { level: steps[0].level, xp: steps[0].from, max: steps[0].max } : { level, xp, max: xpToNext }))
  const [pops, setPops] = useState(0) // bumps on each level-up: re-keys the number so its pop plays again
  const live = useRef({ onLevelUp, onDone })
  useEffect(() => { live.current = { onLevelUp, onDone } })
  const played = useRef<LevelStep[] | null>(null)

  // not playing (or nothing to play): just show the numbers
  useEffect(() => {
    if (steps?.length && played.current !== steps) { setShown({ level: steps[0].level, xp: steps[0].from, max: steps[0].max }); return }
    setShown({ level, xp, max: xpToNext })
  }, [level, xp, xpToNext, steps])

  useEffect(() => {
    if (!play || !steps?.length || played.current === steps) return
    played.current = steps
    const end = { level, xp, max: xpToNext }
    if (reduceMotion()) {
      setShown(end)
      if (end.level !== steps[0].level) live.current.onLevelUp?.(end.level)
      live.current.onDone?.()
      return
    }
    const stepTime = motionTime('motion-normal') * 2
    const pause = motionTime('motion-normal') * 1.5 // the level number's pop
    let frame = 0, timer = 0, cancelled = false
    const run = (i: number) => {
      if (cancelled) return
      if (i >= steps.length) { setShown(end); live.current.onDone?.(); return }
      const s = steps[i]
      const began = performance.now()
      frame = requestAnimationFrame(function tick(now) {
        const t = Math.min(1, Math.max(0, (now - began) / stepTime))
        setShown({ level: s.level, xp: Math.round(s.from + (s.to - s.from) * t), max: s.max })
        if (t < 1) { frame = requestAnimationFrame(tick); return }
        const next = steps[i + 1]
        if (next && next.level > s.level) {
          setShown({ level: next.level, xp: next.from, max: next.max })
          setPops((p) => p + 1)
          live.current.onLevelUp?.(next.level)
          timer = window.setTimeout(() => run(i + 1), pause)
        } else run(i + 1)
      })
    }
    run(0)
    return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [play, steps, level, xp, xpToNext])

  const top = shown.max <= 0
  const share = top ? 1 : Math.max(0, Math.min(1, shown.xp / shown.max))
  const value = top ? w.max : `${format(shown.xp)} / ${format(shown.max)} ${w.unit}`
  return (
    <div className="kit-level-meter" data-art={art ? '' : undefined}
      role="progressbar" aria-label={`${w.label} ${shown.level}`} aria-valuemin={0} aria-valuemax={top ? 1 : shown.max}
      aria-valuenow={top ? 1 : shown.xp} aria-valuetext={value}
      style={{ '--kit-meter-share': share, '--kit-meter-art': art ? `url("${encodeURI(art.fill)}")` : undefined, '--kit-meter-art-ratio': art?.ratio } as CSSProperties}>
      <div className="kit-level-meter-words">
        <span className="kit-level-meter-label">{w.label} <span key={pops} className="kit-level-meter-level" data-pop={pops > 0 || undefined}>{shown.level}</span></span>
        <span className="kit-level-meter-value">{value}</span>
      </div>
      <div className="kit-level-meter-bar"><div className="kit-level-meter-fill" /></div>
    </div>
  )
}

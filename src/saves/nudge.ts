// "BACK UP YOUR SAVE" NUDGE — after real progress since the last save code, suggest copying one (never nagging:
// content/saves.json nudge.afterProgress / minDaysBetween / onlyWhenAtRisk).
//
//   const nudge = createBackupNudge('goops')
//   nudge.noteProgress()                  // the game decides what one point is: a finished game, a level, an unlock
//   if (nudge.due(health)) { toast(NUDGE_WORDS.message); nudge.shown() }
//   nudge.backedUp()                      // the save code was copied or downloaded (SaveCodePanel does this itself)
import { savesConfig, type NudgeConfig } from './config'
import type { SaveHealth } from './health'
import { createSave } from './saves'
import type { StorageLike } from './storage'

export const NUDGE_WORDS = {
  message: 'You\'ve made good progress — copy your save code (Settings) to keep it safe.',
}

export interface BackupNudge {
  /** Some progress was made (default 1 point). */
  noteProgress(points?: number): void
  /** The player copied or downloaded their save code. */
  backedUp(): void
  /** Time to suggest a backup? (Pass the storage health so onlyWhenAtRisk can work.) */
  due(health?: SaveHealth | null): boolean
  /** The suggestion was shown (the next one waits minDaysBetween). */
  shown(): void
}

const DAY_MS = 24 * 60 * 60 * 1000

export function createBackupNudge(game: string, { storage, config, now = () => Date.now() }: {
  storage?: StorageLike | null; config?: () => NudgeConfig; now?: () => number
} = {}): BackupNudge {
  const settings = config ?? (() => savesConfig().nudge)
  const save = createSave({
    key: `${game}:backup-nudge`, kind: 'settings', version: 1, storage,
    fresh: { progressSinceBackup: 0, lastNudgeAt: 0, lastBackupAt: 0 },
  })
  return {
    noteProgress(points = 1) {
      const s = save.load()
      save.save({ ...s, progressSinceBackup: s.progressSinceBackup + points })
    },
    backedUp() {
      save.save({ ...save.load(), progressSinceBackup: 0, lastBackupAt: now() })
    },
    due(health) {
      const { afterProgress, minDaysBetween, onlyWhenAtRisk } = settings()
      const s = save.load()
      if (afterProgress <= 0 || s.progressSinceBackup < afterProgress) return false
      if (now() - s.lastNudgeAt < minDaysBetween * DAY_MS) return false
      if (onlyWhenAtRisk && !health?.warnings.some((w) => w.level === 'risk')) return false
      return true
    },
    shown() {
      save.save({ ...save.load(), lastNudgeAt: now() })
    },
  }
}

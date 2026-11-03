// AWARD NEWS (v0.18 Awards during the game, GDD §4 Highlights → During the game): which award records a finished
// turn set or took. The records come from src/game/stats.ts awardRecords — worked out on this device in a local game,
// sent by the server in an online one (TDD D103) — and each change becomes one piece of news for the banner.
import type { Award } from '../game/stats'

/** One record a turn set or took. `previous` = the record it beat (null = the first of its kind this game); the
 *  banner swaps glyphlings only when the previous holder was someone else. */
export interface AwardNews {
  record: Award
  previous: Award | null
}

/** The records that are new or changed between two moments (in `after`'s order). A record that's the same moment as
 *  before — same holder, turn and size — is no news. */
export function recordNews(before: Award[], after: Award[]): AwardNews[] {
  const was = new Map(before.map((a) => [a.id, a]))
  return after.flatMap((record) => {
    const previous = was.get(record.id) ?? null
    const same = previous && previous.holder === record.holder && previous.moment === record.moment && previous.effect === record.effect
    return same ? [] : [{ record, previous }]
  })
}

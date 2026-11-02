// THE HOST'S TABLE OPTIONS for an online game — the same choices as the new-game screen (garden, 2-letter
// words, British spelling, vulgar words — F71) plus the turn timer; "hide seeds" isn't needed (everyone has their own device). The host's last
// choices are remembered on their device (never required: if the browser won't store them, the defaults are used).
import roomsJson from '../../../content/rooms.json'
import rulesJson from '../../../content/tuning/rules.json'
import type { OnlineOptions } from '../../../party/protocol'
import text from '../../../content/text/en.json'
import { boardNames } from '../../engine/boards'
import { createSave, type StorageLike } from '../../saves'
import type { ExtraWords } from '../../engine/types'

const SAVE_KEY = 'glyphtender:online-options'

/** First time: the board picked by how many sit down, 2-letter words as rules.json twoLetterWordsAtStart says (off = standard play), the first timer choice (off), word indicators on. */
export const defaultOnlineOptions = (): OnlineOptions =>
  ({ boardName: 'auto', minWordLength: rulesJson.twoLetterWordsAtStart === 1 ? 2 : 3, turnSeconds: roomsJson.turnTimerChoices[0], wordIndicators: true,
    britishWords: rulesJson.britishWordsAtStart === 1, vulgarWords: rulesJson.vulgarWordsAtStart === 1 })

/** Saves from before 2026-10-08 remembered "2-letter words on" back when on was the default. Those saves get the new
 *  default (off — standard play, Muzzy: "it should default to off") once; a choice saved since then sticks.
 *  Before the saves module the options were kept as plain JSON, with this marker in them since 2026-10-08. */
const TWO_LETTER_SAVES_SINCE = 2

/** The same checks as always, after the saves module has filled in anything missing: a board or a timer that no
 *  longer exists, a word length that isn't 2 or 3… falls back to the default. */
function cleanOptions(saved: OnlineOptions): OnlineOptions {
  const fallback = defaultOnlineOptions()
  return {
    boardName: ['auto', ...boardNames()].includes(String(saved.boardName)) ? String(saved.boardName) : fallback.boardName,
    minWordLength: saved.minWordLength === 2 || saved.minWordLength === 3 ? saved.minWordLength : fallback.minWordLength,
    turnSeconds: roomsJson.turnTimerChoices.includes(Number(saved.turnSeconds)) ? Number(saved.turnSeconds) : fallback.turnSeconds,
    wordIndicators: typeof saved.wordIndicators === 'boolean' ? saved.wordIndicators : fallback.wordIndicators,
    britishWords: typeof saved.britishWords === 'boolean' ? saved.britishWords : fallback.britishWords,
    vulgarWords: typeof saved.vulgarWords === 'boolean' ? saved.vulgarWords : fallback.vulgarWords,
  }
}

/** The online lobby's save. Version 1 = the plain JSON from before 2026-10-08 (no marker) · version 2 = since then.
 *  Made on each use, so a new default in rules.json or rooms.json reaches it straight away.
 *  storage: left out = the browser's (through the saves module) · a test's own · null = none at all. */
export const onlineOptionsSave = (storage?: StorageLike | null) => createSave<OnlineOptions>({
  key: SAVE_KEY, kind: 'settings', version: 2, fresh: defaultOnlineOptions(),
  // what v0.11.2 and earlier kept: the options as plain JSON — with the marker since 2026-10-08 (version 2), without before
  oldSave: (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const { twoLetterSave, ...options } = raw as Record<string, unknown>
    return { version: twoLetterSave === TWO_LETTER_SAVES_SINCE ? 2 : 1, data: options }
  },
  // 1 → 2: the old "2-letter words" choice (the word length) goes, so today's default (off) applies once
  upgrades: { 2: (v1) => { delete v1.minWordLength; return v1 } },
  clean: cleanOptions,
  ...(storage === undefined ? {} : { storage }),
})

/** The host's last options, or the defaults (anything missing or odd falls back too). */
export function loadOnlineOptions(storage?: StorageLike | null): OnlineOptions {
  return onlineOptionsSave(storage).load()
}

/** Pause's plain note when either is on in the game being played, e.g. "British spelling on · Vulgar words on" (null = both off). */
export function wordSwitchesLine(extras: ExtraWords | undefined): string | null {
  const parts = [extras?.british && text.online.wordSwitches.britishOn, extras?.vulgar && text.online.wordSwitches.vulgarOn].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** Storage full or refused: the game still starts, it just won't remember (the save never throws). */
export function saveOnlineOptions(options: OnlineOptions, storage?: StorageLike | null) {
  onlineOptionsSave(storage).save(options)
}

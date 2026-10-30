// THE AI TAB'S PLUG — what a game hands the Dev Kit so its AI tab can edit the game's AI personalities and skills,
// watch AIs play, and run the Personality Check. The Dev Kit never imports the game's AI code: the game passes its
// content files (as data) and a few optional callbacks, from src/devkit-game/tabs.ts:
//
//   import { aiTab } from '../devkit/ai/aiTabEntry'
//   export const gameTabs = [aiTab(myGameAi)]
//
// The shapes below mirror the framework AI module's Personality and Skill (framework ai/ kit/types.ts) — written out
// here so the Dev Kit works without the AI module copied in (and a game's own extra fields are kept as they are).

/** A trait's range, 0–100. */
export interface AiRange {
  min: number
  max: number
}

/** A mood shift: when a reading climbs from `from` to `full`, the trait's range moves by up to `by`. */
export interface AiShift {
  reading: string
  from: number
  full: number
  trait: string
  by: number
}

export interface AiPersonality {
  id: string
  traits: Record<string, AiRange>
  goals: string[]
  nudge: number
  /** 0–1: how single-minded at a big moment (see the game's goal settings). Missing = 0. */
  focus?: number
  /** Goals every move also tries for, goal → weight 0–1 ({ "SCORE": 0.6 }). Missing = none. */
  steady?: Record<string, number>
  shifts: AiShift[]
  chattiness: number
  extras?: Record<string, number>
  [other: string]: unknown
}

/** A skill: plain numbers (candidates, worlds, spread…) + optional extras. Any number field is edited as a number. */
export interface AiSkill {
  id: string
  extras?: Record<string, number>
  [setting: string]: unknown
}

/** A content file as it is on disk: notes (_help, _labels, _sections) + the list. Save writes it back whole. */
export interface AiFile {
  /** Where it lives, e.g. "content/ai/personalities.json". */
  path: string
  /** The file's data: { _help?, _labels?, _sections?, personalities: [...] } (or skills: [...]). */
  data: Record<string, unknown>
  /** Which key holds the list ("personalities" / "skills"). */
  listKey: string
}

/**
 * One of the game's own AI settings files (e.g. content/ai/goals.json — each goal's big-moment bar; content/ai/pace.json
 * — how long the AI seems to think). Every value in it is a row like the Tuning tab's (slider + number box), named,
 * grouped and helped by the file's own "_labels", "_sections", "_help" and "_ranges". Save writes it back whole.
 */
export interface AiSettingsFile {
  /** Where it lives, e.g. "content/ai/goals.json". */
  path: string
  /** The file's data, as imported. */
  data: Record<string, unknown>
}

/** One line from a watched game: who decided, its note, and what it believes about everyone's score. */
export interface AiWatchEvent {
  seat: number
  /** "Bully" — the personality at that seat. */
  who: string
  /** The decision's plain-English note. */
  note: string
  /** What this seat believes about each rival: estimate + confidence (0–1). */
  beliefs?: { seat: number; estimate: number; confidence: number }[]
  /** Its own score as it counts it. */
  mine?: number
  /** Set on the last event: the game ended ("Bully won"). */
  end?: string
}

export interface AiWatchSeat {
  personality: AiPersonality
  skill: AiSkill
}

/** The bots' lines: personality id → moment ("won", or "won_2", "won_3"… for more lines) → the words. */
export type AiBanterLines = Record<string, Record<string, string>>

export interface AiBanter {
  /** Where the lines live, e.g. "content/text/en.json". (It may be the bios' file too — one Save writes both.) */
  path: string
  /** That file's data, AS THE GAME IMPORTED IT (the same object — edits go into it live). */
  data: Record<string, unknown>
  /** Where in the file the lines sit. Default ["banter"]. */
  at?: string[]
  /** The game's moments, in order — the keys of content/ai/banter.json "chance". */
  moments: string[]
  /** Optional: a moment's plain words for its row ("the game ended and it won" — the AI kit's COMMON_MOMENTS). */
  describe?: Record<string, string>
}

/** Where a "Suggest sliders" run is (the AI kit's TuneProgress): "Try 4 / 20", game 3 of 12 — then the fresh check. */
export interface AiTuneProgress {
  phase: 'search' | 'fresh'
  tryNo: number
  tries: number
  game: number
  games: number
}

/** The AI kit's tuner result (framework ai/ kit/tune.ts TuneResult) — the parts the tab shows. */
export interface AiTuneResult {
  personality: string
  /** better = a suggestion that held up on fresh games · noGain = nothing did · alreadyGreen · noTargets ·
   *  tooFewGames = it held up on too few fresh games to trust (shown as "best found", nothing to apply) */
  verdict: 'better' | 'noGain' | 'alreadyGreen' | 'noTargets' | 'tooFewGames'
  message: string
  /** The personality with the suggested slider values (null = nothing to suggest). */
  suggested: AiPersonality | null
  /** Each slider: "traits.caution", "nudge", "focus", "steady.SCORE" — its value now and suggested ("40–60" for a trait). */
  sliders: { path: string; from: string; to: string; changed: boolean }[]
  /** Its feel targets on the fresh games, now → suggested. */
  targets: { label: string; meter: string; wants: string; before: { measured: number; pass: boolean }; after: { measured: number; pass: boolean; borderline?: boolean } }[]
  cantReach: { label: string; why: string }[]
  others: { personality: string; label: string; before: boolean; after: boolean }[]
  tries: number
  games: number
  seconds: number
  settings: { tuneFreshGames: number }
}

/** What a game plugs into the AI tab. Only the two files are required; each callback adds a part of the tab. */
export interface DevKitAi {
  personalities: AiFile
  skills: AiFile
  /** Optional: where each personality's bio text lives (e.g. content/text/en.json → ai.personality.<id>.bio). */
  bios?: {
    path: string
    data: Record<string, unknown>
    at: (id: string) => string[]
    /** Optional: where a personality's name for players lives (e.g. ai.personality.<id>.name) — "Copy to new" fills it. */
    nameAt?: (id: string) => string[]
    /** Optional: the name a new personality gets there (e.g. "the Brute"). Default: its id. */
    nameFor?: (id: string) => string
  }
  /** Optional (0.24.0, framework F22): the bots' banter lines — content/text/en.json "banter" — edited per personality
   *  per moment. LIVE: every edit is written straight into `data` (the same object the game imported and reads its
   *  lines from: botBanter's `lines: () => text.banter`), so the next moment uses it without a reload; Save writes the
   *  file without reloading the game. */
  banter?: AiBanter
  /** Optional: the game's own AI settings files (goal settings, pace…), edited like Tuning rows. */
  settings?: AiSettingsFile[]
  /** Optional: the game's readings (mood-shift "reading" choices), e.g. ["myDanger", "behind"]. */
  readings?: string[]
  /** Optional: plain-English problems with a personality ([] = fine) — e.g. the AI kit's personalityProblems. */
  validate?: (p: AiPersonality) => string[]
  /** Optional: start a local all-AI game on the real board; call onEvent for every decision. Returns "stop". */
  watch?: (seats: AiWatchSeat[], onEvent: (e: AiWatchEvent) => void) => () => void
  /** Optional: play `games` AI-vs-AI games with these personalities + skills and return the report page (HTML).
   *  Play them in a Web Worker so the page never freezes: runCheckInWorker + serveCheck (checkWorker.ts). */
  runCheck?: (options: { games: number; personalities: AiPersonality[]; skills: AiSkill[]; onProgress: (done: number, total: number) => void }) => Promise<string>
  /** Optional (0.26.0, framework F26): "Suggest sliders" — the AI kit's tuner for one personality, with the tab's
   *  personalities + skills as they are (unsaved too). It only suggests: the tab's Apply puts the values in as unsaved
   *  edits. In the check's worker: serveCheck(self, runCheck, tune) + suggestInWorker (checkWorker.ts). `signal` aborts
   *  when the panel closes mid-run (pass the options on whole and suggestInWorker closes the worker). */
  suggest?: (options: { personality: string; personalities: AiPersonality[]; skills: AiSkill[]; onProgress: (p: AiTuneProgress) => void; signal?: AbortSignal }) => Promise<AiTuneResult>
}

// THE REVIEW LIST TAB's shapes — what a game hands it (reviewTabEntry.ts) and what it gets back on Save.
// A review list = things a person looks at one by one and marks Open / Yes / No — e.g. Glyphtender's player-submitted words.
// A game can add its own marks too (Glyphtender: B = British spelling, V = vulgar) — see ExtraMark.

/** Open = not looked at yet · Yes = good · No = keep it out · or one of the game's extra marks' ids. Plain strings, so the game can store them as-is. */
export type ReviewStatus = 'open' | 'yes' | 'no' | (string & {})

/** A mark the game adds beyond Open / Yes / No. Each row gets a small letter button for it; press again = back to Open. */
export type ExtraMark = {
  /** What's saved, e.g. "british" (not open / yes / no) */
  id: string
  /** The button's letter, e.g. "B" */
  letter: string
  /** Its name in the counts line, tooltips and Copy for Claude, e.g. "British" */
  name: string
}

/** One row in the list. */
export type ReviewItem = {
  /** Unique and stable (the word itself is fine) — Save hands it back */
  id: string
  /** What the row shows, e.g. "ZYGOTES" */
  label: string
  /** As it is saved now */
  status: ReviewStatus
  /** Optional quiet second line, e.g. "swear or word · rooster" */
  detail?: string
}

/** One row Muzzy changed: its id and its new status. Save only ever gets the rows that changed. */
export type ReviewChange = { id: string; status: ReviewStatus }

export type ReviewTabOptions = {
  /** The tab's id, unique in the Dev Kit, e.g. "words" */
  id: string
  /** The tab's name, e.g. "Words" */
  label: string
  /** The whole list, as saved now. Called when the Dev Kit opens (and on Retry). Throw (or reject) with a plain reason. */
  load: () => Promise<ReviewItem[]>
  /** Write these changes. Throw (or reject) with a plain reason — the changes are kept so Save can be tried again. */
  save: (changes: ReviewChange[]) => Promise<void>
  /** What one row is called, e.g. "word" → "3 words found" (default "item") */
  what?: string
  /** The game's own marks beyond Open / Yes / No, in the order they sort (after No). Default none. */
  extraMarks?: ExtraMark[]
}

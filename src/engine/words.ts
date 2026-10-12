// The official Glyphtender word list (public/words/words.csv — the original's words.txt, cleaned in F68).
// Each line is "WORD,ZIPF": the word in capitals and how common it is (Zipf score, 0 = rare/unknown).
// F71: a line may end in a tag — "COLOUR,4.49,B" (a British spelling) or "COCK,4.23,V" (a vulgar word). Tagged words
// count only in a game whose switch is on (Settings → British Spelling / Vulgar Words, both off by default — the
// game's config.extraWords). With both off the list is exactly the untagged words.
import type { ExtraWords, WordList } from './types'

/** The tags a line can carry, and the switch each belongs to. */
export const WORD_TAGS = { B: 'british', V: 'vulgar' } as const
type Tag = keyof typeof WORD_TAGS

/** The whole file, read once: the plain words, and the tagged ones by tag. */
export interface WordFile {
  plain: Map<string, number>
  tagged: Record<Tag, Map<string, number>>
}

/** Reads words.csv. Copes with a byte-order mark, Windows line ends, blank lines and a header. An unknown tag = left out. */
export function parseWordFile(text: string): WordFile {
  const file: WordFile = { plain: new Map(), tagged: { B: new Map(), V: new Map() } }
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip a byte-order mark if there is one
  for (const line of clean.split(/\r?\n/)) {
    const [word, zipf, tag] = line.split(',')
    const score = Number.parseFloat(zipf)
    if (!word || Number.isNaN(score)) continue // blank line or a header like "WORD,ZIPF"
    const list = tag === undefined || tag.trim() === '' ? file.plain : file.tagged[tag.trim() as Tag]
    list?.set(word.trim().toUpperCase(), score)
  }
  return file
}

/** Just the switches that are on (true), or undefined when none is — what a game's config keeps. */
export function onlySwitchedOn(extras?: ExtraWords): ExtraWords | undefined {
  const on: ExtraWords = {}
  for (const name of Object.values(WORD_TAGS)) if (extras?.[name] === true) on[name] = true
  return Object.keys(on).length ? on : undefined
}

/** Which switches are on, as a short key ("" = both off). */
const keyOf = (extras?: ExtraWords) => (Object.keys(WORD_TAGS) as Tag[]).filter((tag) => extras?.[WORD_TAGS[tag]]).join('')

const made = new WeakMap<WordFile, Map<string, WordList>>()
/** The word list for a game: the plain words + the tagged words whose switch is on. Both off = the plain words (the
 *  same Map every time). Each mix is made once per file and kept. */
export function wordListFor(file: WordFile, extras?: ExtraWords): WordList {
  const key = keyOf(extras)
  if (key === '') return file.plain
  let lists = made.get(file)
  if (!lists) made.set(file, (lists = new Map()))
  let list = lists.get(key)
  if (!list) {
    const mixed = new Map(file.plain)
    for (const tag of key.split('') as Tag[]) for (const [word, zipf] of file.tagged[tag]) mixed.set(word, zipf)
    lists.set(key, (list = mixed))
  }
  return list
}

/** Every word in the file, tagged or not — "is it already a word in any way?" (Pause → Submit a word, F71). */
export const everyWordIn = (file: WordFile): WordList => wordListFor(file, { british: true, vulgar: true })

/** Reads the list into word → Zipf: the plain words, plus the tagged ones whose switch is on (none by default). */
export function parseWordList(text: string, extras?: ExtraWords): Map<string, number> {
  return wordListFor(parseWordFile(text), extras) as Map<string, number>
}

/** How a seed spells: its letter, in capitals. (Q is a plain Q since 2026-10-01 — QUIT needs a U seed too.) */
export const spell = (letter: string) => letter.toUpperCase()

/** Is this spelling a word in the list? */
export const isWord = (words: WordList, spelled: string) => words.has(spelled)

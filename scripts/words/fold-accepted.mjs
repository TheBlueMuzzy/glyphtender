// FOLD THE ACCEPTED WORDS INTO words.csv (F71, Muzzy 2026-10-12) — a one-off (or a repair): every row of
// content/words/submitted.csv still marked yes / british / vulgar goes into public/words/words.csv (plain / ,B / ,V,
// with a Zipf score from Python's wordfreq — `pip install wordfreq`; a score already in words.csv is kept) and leaves
// submitted.csv, which keeps only open + no. The Dev Kit Words tab's Save does exactly this with Muzzy's marks.
//   node scripts/words/fold-accepted.mjs
import { readFileSync } from 'node:fs'
import { runnerImport } from 'vite'

const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const { wordFiles, writeWordFiles } = await load('/vite-plugins/words/wordsVite.ts')
const { parseSubmitted } = await load('/vite-plugins/words/wordLists.ts')

const files = wordFiles(root)
const before = parseSubmitted(readFileSync(files.submitted, 'utf8'))
const result = writeWordFiles(files, before, [])
const tagged = (tag) => [...result.official.values()].filter((v) => v.endsWith(`,${tag}`)).length
console.log(`folded ${before.length - result.rows.length} rows · words.csv ${result.official.size} (B ${tagged('B')}, V ${tagged('V')}) · submitted.csv ${result.rows.length} rows`)

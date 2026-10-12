// Copies the word lists the online server bundles as text (esbuild reads .txt files as text; it has no loader for .csv):
//   public/words/words.csv          → party/words.gen.txt       (the official list, B / V tags and all — F71)
//   content/words/submitted.csv     → party/submitted.gen.txt   (the words kept out — seeds the submitted list, F69)
// wrangler.json (build.command) runs this before every `wrangler dev` / `wrangler deploy` build. The copies are gitignored.
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const COPIES = [
  ['public/words/words.csv', 'party/words.gen.txt'],
  ['content/words/submitted.csv', 'party/submitted.gen.txt'],
]
for (const [fromPath, toPath] of COPIES) {
  const from = resolve(root, fromPath)
  const to = resolve(root, toPath)
  // Already the same? Leave it — two servers starting at once (check:full runs online e2e side by side) would
  // otherwise copy over a file the other one is reading, and Windows refuses (EBUSY) — B023.
  if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) console.log(`server word list: ${toPath} (up to date)`)
  else {
    copyFileSync(from, to)
    console.log(`server word list: ${toPath}`)
  }
}

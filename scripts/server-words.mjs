// Copies the official word list (public/words/words.csv) to party/words.gen.txt so the online server
// can bundle it as text (esbuild reads .txt files as text; it has no loader for .csv).
// wrangler.json (build.command) runs this before every `wrangler dev` / `wrangler deploy` build. The copy is gitignored.
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'public/words/words.csv')
const to = resolve(root, 'party/words.gen.txt')
// Already the same? Leave it — two servers starting at once (check:full runs online e2e side by side) would
// otherwise copy over a file the other one is reading, and Windows refuses (EBUSY) — B023.
if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) console.log('server word list: party/words.gen.txt (up to date)')
else {
  copyFileSync(from, to)
  console.log('server word list: party/words.gen.txt')
}

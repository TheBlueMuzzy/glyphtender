// node scripts/tutorial/find-rails.mjs [--write] — finds the tutorial game's fixed layout (F76, design/tutorial.md §2).
// Searches the Small board for draft hexes + turns where every rails step really happens: your turn-1 move has a line
// that stops short at Blue's glyphling, the plant flies over your other glyphling and blocks one of Blue's, Sprout
// plants a T two hexes from your C (C → gap → T in reading order), and your turn-2 A in the gap spells CAT for 5.
// No glyphling drops below 2 moves (no danger cue). Most central gap wins (then pieces spread out, off the edges).
// Every pick is checked through the real rules door (src/tutorial/railsCheck.ts — the same check the proof test runs).
//   --write   save the layout into content/tutorial/rails.json (other keys kept)
import { readFileSync, writeFileSync } from 'node:fs'
import { runnerImport } from 'vite'

const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (path) => (await runnerImport(path, { root, configFile: false, logLevel: 'error' })).module
const { getBoard } = await load('/src/engine/boards.ts')
const { DIRECTIONS, LEYLINES, addHex, hexKey, isEdge, ray, sameHex } = await load('/src/engine/hex.ts')
const { legalCasts, legalMoves } = await load('/src/engine/moves.ts')
const { newGame } = await load('/src/engine/setup.ts')
const { parseWordList } = await load('/src/engine/words.ts')
const { railsProblems } = await load('/src/tutorial/railsCheck.ts')

const railsPath = new URL('../../content/tutorial/rails.json', import.meta.url)
const current = JSON.parse(readFileSync(railsPath, 'utf8'))
const words = parseWordList(readFileSync(new URL('../../public/words/words.csv', import.meta.url), 'utf8'))
const board = getBoard(current.boardName)
const label = (h) => board.label(h)
const inner = board.cells.filter((h) => !isEdge(board, h))
const scale = (d, k) => ({ q: d.q * k, r: d.r * k })
const sub = (a, b) => ({ q: a.q - b.q, r: a.r - b.r })
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2
const centre = { q: board.cells.reduce((s, h) => s + h.q, 0) / board.cells.length, r: board.cells.reduce((s, h) => s + h.r, 0) / board.cells.length }
const fromCentre = (h) => dist(h, centre)

// The letters (design/tutorial.md §2): your hand C, J, V + friendly commons (no A — it comes from the refresh);
// Sprout's hand T + commons. Turn 1 plants C and makes no Magic, so the refresh keeps 5 and draws 3 (A + two more);
// Sprout's keep-all refills the T it planted (1); your CAT draws 1. (J and V go back into the bag at random places —
// rails.test checks they don't land in front of those draws.)
const stack = {
  hands: [['C', 'J', 'V', 'E', 'R', 'S', 'N', 'O'], ['T', 'E', 'R', 'S', 'L', 'I', 'O', 'N']],
  next: ['A', 'I', 'L', 'E', 'D'],
}

const base = newGame({ players: 2, seed: 1, boardName: current.boardName, rules: { minWordLength: current.minWordLength } })
/** A play-phase position: glyphlings [M(0), O(1), B1(2), B2(3)] and seeds { hexKey: seat }. */
const at = (glyphs, seeds = {}) => ({
  ...base, phase: 'play', draftIndex: 4,
  glyphlings: glyphs.map((hex, id) => ({ id, seat: id < 2 ? 0 : 1, hex })),
  seeds: Object.fromEntries(Object.entries(seeds).map(([k, seat]) => [k, { id: `s-${k}`, letter: 'X', seat }])),
})
const safe = (state) => state.glyphlings.every((g) => legalMoves(state, g.id).length >= 2)
const apart = (list) => list.every((a, i) => list.every((b, j) => i === j || dist(a, b) >= 2))
const has = (list, h) => list.some((x) => sameHex(x, h))
const clear = (from, to, dir, pieces) => {
  for (let h = addHex(from, dir); !sameHex(h, to); h = addHex(h, dir)) if (has(pieces, h)) return false
  return true
}

const found = []
for (const gap of [...board.cells].sort((a, b) => fromCentre(a) - fromCentre(b))) {
  if (found.length && fromCentre(gap) > fromCentre(found[0].gap) + 0.5) break // only the most central band
  for (const L of LEYLINES) {
    const C = sub(gap, L)
    const T = addHex(gap, L)
    if (!board.has(C) || !board.has(T)) continue
    // Your turn 1: `to` is m hexes before C on direction e, your other glyphling O between them.
    for (const e of DIRECTIONS) {
      for (let m = 2; m < 12; m++) {
        const to = sub(C, scale(e, m))
        if (!board.has(to)) break
        for (let j = 1; j < m; j++) {
          const O = addHex(to, scale(e, j))
          if (!has(inner, O)) continue
          // The mover M starts on a line to `to`.
          for (const f of DIRECTIONS) {
            for (let k = 1; k < 12; k++) {
              const M = sub(to, scale(f, k))
              if (!board.has(M)) break
              if (!has(inner, M) || !apart([M, O])) continue
              // …and one of M's lines stops short at Blue's glyphling Bb (≥1 hex before it).
              for (const d of DIRECTIONS) {
                for (let kb = 2; kb < 12; kb++) {
                  const Bb = addHex(M, scale(d, kb))
                  if (!board.has(Bb)) break
                  if (!has(inner, Bb) || !apart([M, O, Bb])) continue
                  for (const B2 of inner) {
                    const glyphs = [M, O, Bb, B2]
                    if (!apart(glyphs)) continue
                    if ([gap, C, T].some((h) => has(glyphs, h))) continue
                    const s0 = at(glyphs)
                    if (!safe(s0)) continue
                    if (!clear(M, Bb, d, glyphs)) continue
                    if (!legalMoves(s0, 0).some((h) => sameHex(h, to))) continue
                    if (!legalCasts(s0, 0, to).some((h) => sameHex(h, C))) continue
                    const moved = [to, O, Bb, B2]
                    const s1 = at(moved, { [hexKey(C)]: 0 })
                    if (!safe(s1)) continue
                    const before = at(moved)
                    const blocks = [2, 3].find((id) => legalMoves(s1, id).length < legalMoves(before, id).length)
                    if (blocks === undefined) continue
                    // Sprout's turn 1: one of its glyphlings moves and plants T.
                    let ai = null
                    for (const id of [2, 3]) {
                      for (const to2 of legalMoves(s1, id)) {
                        if (sameHex(to2, gap)) continue
                        if (!legalCasts(s1, id, to2).some((h) => sameHex(h, T))) continue
                        const g2 = moved.map((h, i) => (i === id ? to2 : h))
                        const s2 = at(g2, { [hexKey(C)]: 0, [hexKey(T)]: 1 })
                        if (!safe(s2)) continue
                        const score = fromCentre(to2) + dist(moved[id], to2) / 4
                        if (!ai || score < ai.score) ai = { id, to: to2, glyphs: g2, state: s2, score }
                      }
                    }
                    if (!ai) continue
                    // Your turn 2: a glyphling moves to where it can plant A in the gap (best: it couldn't before).
                    let you = null
                    for (const id of [0, 1]) {
                      const couldAlready = legalCasts(ai.state, id, ai.glyphs[id]).some((h) => sameHex(h, gap))
                      for (const to3 of legalMoves(ai.state, id)) {
                        if (!legalCasts(ai.state, id, to3).some((h) => sameHex(h, gap))) continue
                        const g3 = ai.glyphs.map((h, i) => (i === id ? to3 : h))
                        if (!safe(at(g3, { [hexKey(C)]: 0, [hexKey(T)]: 1, [hexKey(gap)]: 0 }))) continue
                        const score = (couldAlready ? 5 : 0) + fromCentre(to3)
                        if (!you || score < you.score) you = { id, to: to3, glyphs: g3, score }
                      }
                    }
                    if (!you) continue
                    const spread = you.glyphs.reduce((s, h) => s + fromCentre(h) + (isEdge(board, h) ? 3 : 0), 0) / 4
                    found.push({
                      gap, C, T, M, O, Bb, B2, to, blocks, ai, you,
                      score: fromCentre(gap) * 10 + spread + (kb === 2 ? 0.5 : 0) + you.score / 4 + ai.score / 4,
                    })
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

const which = (id) => (id % 2 === 0 ? 'first' : 'second')
const layoutOf = (f) => ({
  stack,
  draft: { you: [label(f.M), label(f.O)], ai: [label(f.Bb), label(f.B2)] },
  turn1: {
    glyphling: 'first', to: label(f.to), blockedAt: label(f.Bb), seed: 'C', plant: label(f.C),
    overOwn: label(f.O), blocks: label(f.blocks === 2 ? f.Bb : f.B2), refresh: ['J', 'V'],
  },
  aiTurn1: { glyphling: which(f.ai.id), to: label(f.ai.to), seed: 'T', plant: label(f.T) },
  aiRefresh: [],
  turn2: { glyphling: which(f.you.id), to: label(f.you.to), seed: 'A', plant: label(f.gap), word: 'CAT', magic: 5 },
})

found.sort((a, b) => a.score - b.score || label(a.M).localeCompare(label(b.M)))
console.log(`${found.length} layouts in the most central band; checking the best through the rules door…`)
let pick = null
for (const f of found) {
  const layout = { ...current, ...layoutOf(f) }
  const problems = railsProblems(words, layout, true)
  if (problems.length === 0) { pick = layout; break }
}
if (!pick) {
  console.log('No layout passes every rails check.')
  process.exit(1)
}

// A tiny sketch: Y = your glyphlings, B = Blue's, c = C, t = T, _ = the gap (at the start of turn 2).
const sketch = () => {
  const marks = new Map()
  const h = (l) => board.cells.find((x) => label(x) === l)
  marks.set(hexKey(h(pick.draft.you[0])), 'Y'); marks.set(hexKey(h(pick.draft.you[1])), 'y')
  marks.set(hexKey(h(pick.draft.ai[0])), 'B'); marks.set(hexKey(h(pick.draft.ai[1])), 'b')
  marks.set(hexKey(h(pick.turn1.plant)), 'c'); marks.set(hexKey(h(pick.aiTurn1.plant)), 't'); marks.set(hexKey(h(pick.turn2.plant)), '_')
  const rows = []
  const minR = Math.min(...board.cells.map((c) => 2 * c.r + c.q))
  const maxR = Math.max(...board.cells.map((c) => 2 * c.r + c.q))
  for (let y = minR; y <= maxR; y++) {
    let line = ''
    for (let q = 0; q < board.columns.length; q++) {
      const cell = board.cells.find((c) => c.q === q && 2 * c.r + c.q === y)
      line += cell ? ` ${marks.get(hexKey(cell)) ?? '.'}` : '  '
    }
    rows.push(line)
  }
  return rows.join('\n')
}

console.log(JSON.stringify({ draft: pick.draft, turn1: pick.turn1, aiTurn1: pick.aiTurn1, turn2: pick.turn2 }, null, 1))
console.log('Draft hexes: Y/y = yours (first/second), B/b = Blue\'s · c = your C · t = Sprout\'s T · _ = the gap')
console.log(sketch())

if (process.argv.includes('--write')) {
  // Arrays of plain values stay on one line, so the file reads like the rest of content/.
  const json = JSON.stringify(pick, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inside) => `[${inside.split(/,\s+/).join(', ')}]`)
  writeFileSync(railsPath, `${json}\n`)
  console.log('Saved to content/tutorial/rails.json')
}

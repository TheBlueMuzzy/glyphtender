// Seeded random numbers for the AI (mulberry32 — the same generator as the games' rules), so the same game always
// gets the same bot moves. The position is a plain number: every function takes it in and hands back the next one.

/** One random number in [0, 1), plus the next position. */
export function nextRandom(rng: number): { value: number; rng: number } {
  const next = (rng + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rng: next }
}

/** A whole number from `min` to `max`, both included. */
export function randomBetween(rng: number, min: number, max: number): { value: number; rng: number } {
  const r = nextRandom(rng)
  return { value: min + Math.floor(r.value * (max - min + 1)), rng: r.rng }
}

/** Up to `n` items picked at random (order kept as in `items`). All of them when there are n or fewer. */
export function sample<T>(items: readonly T[], n: number, rng: number): { items: T[]; rng: number } {
  if (items.length <= n) return { items: [...items], rng }
  const picked = new Set<number>()
  let pos = rng
  // Partial Fisher–Yates over the indexes: exactly n distinct picks.
  const idx = items.map((_, i) => i)
  for (let i = 0; i < n; i++) {
    const r = nextRandom(pos)
    pos = r.rng
    const j = i + Math.floor(r.value * (idx.length - i))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
    picked.add(idx[i])
  }
  return { items: items.filter((_, i) => picked.has(i)), rng: pos }
}

/** One of `items`, picked with chances proportional to `weights` (all ≤ 0 → evenly). */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: number): { item: T; index: number; rng: number } {
  const r = nextRandom(rng)
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (total <= 0) {
    const index = Math.floor(r.value * items.length)
    return { item: items[index], index, rng: r.rng }
  }
  let left = r.value * total
  for (let i = 0; i < items.length; i++) {
    left -= Math.max(0, weights[i])
    if (left < 0) return { item: items[i], index: i, rng: r.rng }
  }
  return { item: items[items.length - 1], index: items.length - 1, rng: r.rng }
}

/** A shuffled copy of `items` (Fisher–Yates). The input is not changed. */
export function shuffle<T>(items: readonly T[], rng: number): { items: T[]; rng: number } {
  const out = [...items]
  let pos = rng
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRandom(pos)
    pos = r.rng
    const j = Math.floor(r.value * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return { items: out, rng: pos }
}

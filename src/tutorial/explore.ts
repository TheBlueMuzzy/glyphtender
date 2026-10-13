// EXPLORE MODE'S "WHAT IS THIS?" (F79, design/tutorial.md §6) — the words for whatever was tapped, yours worded
// apart from another player's. Pure: given what was tapped and the game, it says which en.json line to show
// (tutorial.explore.<key>) and the values to fill it with — so every case is tested (explore.test.ts).
import { movesLeft } from '../engine/tangle'
import { hexKey, type Hex } from '../engine/hex'
import type { GameState } from '../engine/types'

/** What a tap in Explore mode landed on (read from the element's data-* attributes, or a named screen part). */
export type Tapped =
  | { kind: 'glyphling'; id: number }
  | { kind: 'hex'; hex: Hex }
  | { kind: 'traySeed'; id: string }
  | { kind: 'part'; part: ExplorePart }

export type ExplorePart = 'plant' | 'undo' | 'shuffle' | 'refresh' | 'keepAll' | 'endTurn' | 'turnBar' | 'menu' | 'explore' | 'ghost' | 'word' | 'prompt'

export interface Explained {
  /** en.json → tutorial.explore.<key> */
  key: string
  values: Record<string, string | number>
}

/** `you` = the seat this screen shows; `name(seat)` = that player's name ("Blue", "Sprout"…); `planned` = a seed you
 *  have aimed but not planted (its hex), if any; `options` = hexes glowing as a move/plant option right now. */
export function explain(tapped: Tapped, game: GameState, you: number, name: (seat: number) => string,
  extra: { planned?: Hex | null; moveOptions?: Hex[]; plantOptions?: Hex[] } = {}): Explained {
  if (tapped.kind === 'part') return { key: `part.${tapped.part}`, values: {} }

  if (tapped.kind === 'traySeed') {
    const seed = game.hands[you]?.find((s) => s.id === tapped.id)
    return { key: 'traySeed', values: { letter: seed?.letter ?? '' } }
  }

  if (tapped.kind === 'glyphling') {
    const g = game.glyphlings.find((x) => x.id === tapped.id)
    if (!g) return { key: 'emptyHex', values: {} }
    const moves = movesLeft(game, g.id)
    const whose = g.seat === you ? 'your' : 'their'
    const state = game.tangled.includes(g.id) ? 'Tangled' : moves === 1 ? 'Danger' : ''
    return { key: `${whose}Glyphling${state}`, values: { moves, player: name(g.seat) } }
  }

  // A hex: a seed on it, an option glowing on it, or empty
  const key = hexKey(tapped.hex)
  const isAt = (list?: Hex[] | null) => !!list?.some((h) => hexKey(h) === key)
  if (extra.planned && hexKey(extra.planned) === key) return { key: 'plannedSeed', values: {} }
  const seed = game.seeds[key]
  if (seed) return { key: seed.seat === you ? 'yourSeed' : 'theirSeed', values: { letter: seed.letter, player: name(seed.seat) } }
  if (isAt(extra.moveOptions)) return { key: 'moveOption', values: {} }
  if (isAt(extra.plantOptions)) return { key: 'plantOption', values: {} }
  return { key: 'emptyHex', values: {} }
}

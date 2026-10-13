// EXPLORE MODE'S "WHAT IS THIS?" (F79, design/tutorial.md §6) — the words for whatever was tapped, yours worded
// apart from another player's. Pure: given what was tapped and the game, it says which en.json line to show
// (tutorial.explore.<key>) and the values to fill it with — so every case is tested (explore.test.ts).
// Also pure: exploreEnds — "should Explore close by itself now?" (the game needs you), from plain facts.
import { movesLeft } from '../engine/tangle'
import { hexKey, type Hex } from '../engine/hex'
import type { GameState } from '../engine/types'

/** What a tap in Explore mode landed on (read from the element's data-* attributes, or a named screen part). */
export type Tapped =
  | { kind: 'glyphling'; id: number }
  | { kind: 'hex'; hex: Hex }
  | { kind: 'traySeed'; id: string }
  | { kind: 'part'; part: ExplorePart }

/** The screen's parts. plant = the Plant button (its Magic preview, if it shows one, in `extra.magic`). */
export type ExplorePart = 'plant' | 'endTurn' | 'retry' | 'undo' | 'shuffle' | 'refresh' | 'keepAll' | 'turnBar' | 'menu'
  | 'ghost' | 'prompt' | 'draft'

export interface Explained {
  /** en.json → tutorial.explore.<key> */
  key: string
  values: Record<string, string | number>
}

export interface ExploreExtra {
  /** A seed you have aimed but not planted (its hex), if any. */
  planned?: Hex | null
  /** Hexes glowing as a move option right now (in the draft: where a glyphling may be placed). */
  moveOptions?: Hex[]
  /** Hexes glowing as a plant option right now. */
  plantOptions?: Hex[]
  /** The Magic the Plant button shows ("Plant +5" → 5), or null when it shows none. */
  magic?: number | null
}

/** `you` = the seat this screen shows; `name(seat)` = that player's name ("Blue", "Sprout"…). */
export function explain(tapped: Tapped, game: GameState, you: number, name: (seat: number) => string, extra: ExploreExtra = {}): Explained {
  if (tapped.kind === 'part') {
    if (tapped.part === 'plant' && typeof extra.magic === 'number') return { key: 'part.plantMagic', values: { n: extra.magic } }
    return { key: `part.${tapped.part}`, values: {} }
  }

  if (tapped.kind === 'traySeed') {
    const seed = game.hands[you]?.find((s) => s.id === tapped.id)
    return { key: game.phase === 'refresh' ? 'traySeedRefresh' : 'traySeed', values: { letter: seed?.letter ?? '' } }
  }

  if (tapped.kind === 'glyphling') {
    const g = game.glyphlings.find((x) => x.id === tapped.id)
    if (!g) return { key: 'emptyHex', values: {} }
    const moves = movesLeft(game, g.id)
    const whose = g.seat === you ? 'your' : 'their'
    // (tangled = no move right now: game.tangled is only brought up to date at the end of a turn)
    const state = moves === 0 || game.tangled.includes(g.id) ? 'Tangled' : moves === 1 ? 'Danger' : ''
    return { key: `${whose}Glyphling${state}`, values: { moves, player: name(g.seat) } }
  }

  // A hex: a seed on it, an option glowing on it, or empty
  const key = hexKey(tapped.hex)
  const isAt = (list?: Hex[] | null) => !!list?.some((h) => hexKey(h) === key)
  if (extra.planned && hexKey(extra.planned) === key) return { key: 'plannedSeed', values: {} }
  const seed = game.seeds[key]
  // A seed counts 1 in anyone's word, + the ownership bonus in its owner's (engine/turn.ts seedMagic)
  const counts = { own: 1 + game.config.rules.ownershipBonus, other: 1 }
  if (seed) return { key: seed.seat === you ? 'yourSeed' : 'theirSeed', values: { letter: seed.letter, player: name(seed.seat), ...counts } }
  if (isAt(extra.moveOptions)) return { key: game.phase === 'draft' ? 'draftOption' : 'moveOption', values: {} }
  if (isAt(extra.plantOptions)) return { key: 'plantOption', values: {} }
  return { key: 'emptyHex', values: {} }
}

/** The facts that decide whether Explore must close by itself (plain values, read from the stores). */
export interface ExploreFacts {
  /** A game is on screen. */
  inGame: boolean
  phase: GameState['phase'] | null
  /** Pass-and-play: the handoff screen is up for the next player. */
  handoff: boolean
  /** How many kit screens are open (Pause, the end table…). None can open from Explore — ☰ only explains. */
  screens: number
  /** Online: the room connection. null = not an online game. */
  online: null | {
    status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'
    /** The idle warning ("Still there?") is up. */
    idleWarning: boolean
    /** A bot is playing my seat. */
    botPlaysForMe: boolean
    /** The room's phase ('lobby' once the host goes back to the lobby / ends the game). */
    roomPhase: string | null
  }
}

/** Why Explore must end now — the game needs you — or null (stay). design/tutorial.md §6 "Explore ends by itself". */
export function exploreEnds(f: ExploreFacts): string | null {
  if (!f.inGame) return 'left'
  if (f.phase === 'over') return 'gameOver' // (the reveal starts)
  if (f.handoff) return 'handoff'
  if (f.screens > 0) return 'screen'
  if (f.online) {
    if (f.online.idleWarning) return 'idleWarning'
    if (f.online.botPlaysForMe) return 'botPlaysForMe'
    if (f.online.status !== 'open') return 'connection'
    if (f.online.roomPhase !== null && f.online.roomPhase !== 'playing') return 'lobby'
  }
  return null
}

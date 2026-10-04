// GLYPHTENDER'S DEV KIT ADAPTER — lets the Dev Kit's Snapshots and Bug capture tabs see the game.
// Registered in src/devkit-game/tabs.ts, which only loads with the Dev Kit (so none of this ships at 1.0).
//   getState:   the engine's GameState + the tray order the screen shows + the end table's stats + the table options
//               (everything else is the planned turn)
//   setState:   jumps the store to that game — the planned move / cast / flying seed are cleared (store.loadState),
//               and any open menu (end table, Pause) is closed. Older snapshots without stats / options still restore
//               (the stats start from nothing, the options stay as they are); an old "Qu" seed loads as a plain "Q" (F24, in store.loadState)
//   canRestore: only offline — in an online game a restore would change play for the others (and this device only holds its own view)
//   onEvent:    a short line each time the game moves on: a draft placement, a turn, a phase change, a tangle, a note
// Reads and writes the store only through its public getState / setState / subscribe / loadState.
import versionFile from '../../version.json'
import type { DevKitGame } from '../devkit/devkitGame'
import { getBoard } from '../engine/boards'
import type { Hex } from '../engine/hex'
import { SEAT_COLOURS, type GameState, type SeedPiece } from '../engine/types'
import { useGameStore, type GameOptions, type GameStore } from '../store/gameStore'
import { TRAY_GAP } from '../store/turnPlan'
import type { PlayerStats } from '../store/stats'
import { closeAllScreens } from '../ui/newGame'

/** What a snapshot holds for Glyphtender. */
export interface GlyphtenderMoment {
  game: GameState | null // null = on the main menu
  /** Each seat's tray, left to right: seed ids, TRAY_GAP for an empty place. (Snapshots before F33: hand indexes, -1 = empty.) */
  trayOrder: (string | number)[][]
  /** The end table's numbers so far (best turn, longest word, words made). Missing in older snapshots. */
  stats?: PlayerStats[]
  /** The table options the game started with (word indicators, hide seeds…). Missing in older snapshots. */
  options?: GameOptions | null
}

const seatName = (seat: number) => {
  const colour = SEAT_COLOURS[seat] ?? `seat ${seat}`
  return colour[0].toUpperCase() + colour.slice(1)
}

// The hex as Muzzy labels it on the board ("C6-3"); plain q,r if the board can't say
function hexName(game: GameState, hex: Hex | null): string {
  if (!hex) return '-'
  try {
    return getBoard(game.config.boardName).label(hex)
  } catch {
    return `${hex.q},${hex.r}`
  }
}

/** One line about a moment, e.g. "turn 12 · play · Blue to move · 1 tangled". */
export function describeGlyphtender(state: unknown): string {
  const game = (state as GlyphtenderMoment | null)?.game
  if (!game) return 'main menu'
  const parts = [`turn ${game.turnCount}`, game.phase]
  if (game.phase === 'draft') parts.push(`${seatName(game.current)} placing (${game.draftIndex + 1}/${game.draftOrder.length})`)
  if (game.phase === 'play' || game.phase === 'refresh') parts.push(`${seatName(game.current)} to move`)
  if (game.phase === 'over') parts.push(`winner ${game.winners.map(seatName).join(' + ')}`)
  if (game.tangled.length > 0) parts.push(`${game.tangled.length} tangled`)
  return parts.join(' · ')
}

/** The lines to log when the store goes from `before` to `after` (empty when nothing worth saying changed). */
export function gameEvents(before: GameStore, after: GameStore): string[] {
  const lines: string[] = []
  const was = before.game
  const now = after.game
  if (now !== was) {
    if (!now) lines.push('left the game (main menu)')
    else if (!was || now.config.seed !== was.config.seed) {
      lines.push(`game started: ${now.config.players} players · ${now.config.boardName} board · seed ${now.config.seed} · ${describeGlyphtender({ game: now, trayOrder: [] })}`)
    } else if (now.turnCount < was.turnCount || now.draftIndex < was.draftIndex) {
      lines.push(`jumped back (a restore or a replay): ${describeGlyphtender({ game: now, trayOrder: [] })}`)
    } else {
      if (now.draftIndex !== was.draftIndex) {
        const placed = now.glyphlings.find((g) => !was.glyphlings.some((w) => w.id === g.id))
        lines.push(`draft: ${seatName(was.current)} placed a glyphling${placed ? ` at ${hexName(now, placed.hex)}` : ''}`)
      }
      // (a refresh copies lastTurn into the new state, so compare what it says, not which object it is)
      if (now.lastTurn && JSON.stringify(now.lastTurn) !== JSON.stringify(was.lastTurn)) {
        const t = now.lastTurn
        const cast = t.letter ? `, cast ${t.letter} at ${hexName(now, t.target)}` : ', move only'
        const words = t.words.length ? ` → ${t.words.map((w) => w.word).join(', ')} (${t.magic} Magic)` : ''
        lines.push(`${seatName(t.seat)} moved glyphling ${t.glyphlingId} ${hexName(now, t.from)} → ${hexName(now, t.to)}${cast}${words}`)
      }
      if (now.phase === 'play' && was.phase === 'refresh') lines.push(`${seatName(was.current)} refreshed their seeds`)
      if (now.phase !== was.phase) lines.push(`phase: ${was.phase} → ${now.phase}`)
      const newlyTangled = now.tangled.filter((id) => !was.tangled.includes(id))
      if (newlyTangled.length) lines.push(`tangled: glyphling ${newlyTangled.join(', ')} (${now.tangled.length} in all)`)
    }
  }
  if (after.note && after.note !== before.note) lines.push(`note shown: ${after.note}`)
  return lines
}

/**
 * A snapshot's tray order as seed ids, or null if it doesn't fit the hands (then the tray starts in hand order).
 * It fits when, in every seat, each seed in the hand is in the tray exactly once; empty places (TRAY_GAP) may sit
 * anywhere (B018: a snapshot taken right after a cast, with an empty place, used to lose its tray order).
 * Snapshots from before F33 hold hand indexes (-1 = an empty place): index i becomes the id of the hand's i-th seed
 * (`hands` = the game as loaded, its seeds in the same places as the saved one's).
 */
export function savedTrayOrder(saved: unknown, hands: SeedPiece[][]): string[][] | null {
  if (!Array.isArray(saved) || saved.length !== hands.length) return null
  const orders: string[][] = []
  for (let seat = 0; seat < hands.length; seat++) {
    const order = saved[seat]
    if (!Array.isArray(order)) return null
    const ids = order.map((place: unknown) => {
      if (place === TRAY_GAP || place === -1) return TRAY_GAP
      if (typeof place === 'number') return hands[seat][place]?.id ?? 'not in the hand'
      return typeof place === 'string' ? place : 'not in the hand'
    })
    const seeds = ids.filter((id) => id !== TRAY_GAP)
    const everySeedOnce = seeds.length === hands[seat].length && hands[seat].every((seed) => seeds.includes(seed.id)) && new Set(seeds).size === seeds.length
    if (!everySeedOnce) return null
    orders.push(ids)
  }
  return orders
}

// A saved moment from a file or an older build: check it's shaped like one before handing it to the store
function isMoment(state: unknown): state is GlyphtenderMoment {
  const s = state as GlyphtenderMoment | null
  if (typeof s !== 'object' || s === null || !('game' in s)) return false
  if (s.game === null) return true
  return typeof s.game === 'object' && Array.isArray(s.game.hands) && Array.isArray(s.game.glyphlings) && typeof s.game.phase === 'string'
}

export const glyphtenderAdapter: DevKitGame = {
  name: 'Glyphtender',
  version: `${versionFile.version}.${versionFile.build}`,

  getState: (): GlyphtenderMoment => {
    const { game, trayOrder, stats, options } = useGameStore.getState()
    return { game, trayOrder, stats, options }
  },

  setState: (state) => {
    if (!isMoment(state)) throw new Error("that isn't a Glyphtender snapshot")
    const store = useGameStore.getState()
    closeAllScreens() // a menu from the moment we're leaving (the end table, Pause) would sit on top, stuck
    if (!state.game) return store.leaveGame()
    const stats = state.stats?.length === state.game.config.players ? state.stats : undefined
    store.loadState(state.game, stats) // clears the planned move / cast / flying seed; brings an older save up to date (engine/migrate.ts)
    // Keep the tray order the snapshot had — empty places too (B018) — if it still fits the hands (loadState reset it to hand order)
    const trayOrder = savedTrayOrder(state.trayOrder, useGameStore.getState().game!.hands)
    useGameStore.setState({ landed: null, ...(trayOrder ? { trayOrder } : {}), ...(state.options ? { options: state.options } : {}) })
  },

  canRestore: () => useGameStore.getState().online === null, // online: never

  onEvent: (send) => useGameStore.subscribe((after, before) => {
    for (const line of gameEvents(before, after)) send(line)
  }),

  describe: describeGlyphtender,
}

// THE SEED TRAY — the current player's seeds at REAL SIZE (as wide as a board hex, ≥ 44 px; the kit's rackLayout),
// drawn by the framework UI kit's Hand view (HandView, "rack"): the kit places the slots, lifts / dims them and plays
// the refresh's shrink → grow. This file only says WHAT is in each place and draws the game's look: the hex slot,
// the seed / glyphling art and the rings. Sizes come from content/tuning/layout.json, colours from garden.json.
// Same piece-state look as the board: held = solid ring (lifted a little) · planned (aimed at the board) =
// an empty slot with a pulsing halo · waiting (move first) = dimmed. In refresh mode, set-aside seeds look held.
// During the draft it shows the glyphlings still waiting to be placed instead — while an AI on this device, or online
// another player (person or AI), drafts, THEIR waiting glyphlings (no secret), so their glyphling leaves the tray like
// a person's (F50 / F43, useBotDraft). While the device is being
// passed on (handoff) it shows empty slots: nobody sees the next player's seeds until they tap.
// It shows the VIEWER's seeds (store/viewer.ts): online always THIS device's (dimmed while it's someone else's turn),
// pass-and-play the player to move (it switches when the handoff is passed).
// REFRESH (B011, store/refreshFx.ts): the set-aside seeds shrink away one after another, then the new seeds grow
// into those slots (a small overshoot — feel.json refreshGrow); the store passes play on after. The Hand view
// animates the "staged" places (Web Animations, never React state per frame). Reduce motion → the store skips it.
// NO RE-SORT: a cast seed's place stays where it was — the drawn seed grows into it, or it stays empty (TRAY_GAP)
// until a refresh fills it; the other seeds never shift (Muzzy 2026-10-01; Table rack.ts refillRack).
// Taps and drags are handled by usePieceInput (data-hand / data-tray-pos / data-draft).
// Sound: refresh.out as the set-aside seeds shrink, refresh.in as the new ones grow — only when it's THIS tray (the
// viewer's) refreshing, so an AI's or another player's refresh stays as private as their seeds.
import { useEffect } from 'react'
import { playSound } from '../audio'
import { hexCorners } from '../engine/hex'
import { useGameStore } from '../store/gameStore'
import { isMyTurn } from '../store/myTurn'
import { isLocalHuman } from '../store/seats'
import { viewerOf } from '../store/viewer'
import { letterIn, TRAY_GAP } from '../store/turnPlan'
import { HandView, type HandPlace, type RackLayout } from '../ui/kit'
import { colourOf, glyphlingArt, seedArt } from './art'
import { juiceFor, juiceSound } from './feel'
import { useAnimTuning, useGardenTuning } from './useTuning'

/** What sits in a place: a seed (its letter), or during the draft a glyphling still to place ("next" = the one to place now). */
type Piece = { kind: 'seed'; letter: string } | { kind: 'glyphling'; next: boolean }

/** boxWidth: how wide the tray's box is (the side panel is wider than 4 seeds); the seeds sit in its middle. */
type Props = { layout: RackLayout; boxWidth: number }

export function SeedTray({ layout, boxWidth }: Props) {
  const game = useGameStore((s) => s.game)!
  const move = useGameStore((s) => s.move)
  const cast = useGameStore((s) => s.cast)
  const selected = useGameStore((s) => s.selected)
  const setAside = useGameStore((s) => s.setAside)
  const trayOrder = useGameStore((s) => s.trayOrder)
  const hidden = useGameStore((s) => s.handoff !== null) // passing the device: the next player's seeds stay hidden
  const refreshFx = useGameStore((s) => s.refreshFx)
  const colours = useGardenTuning()
  const timing = useAnimTuning()
  // (an AI here, or online another player, drafting: their glyphlings — the draft's tray shows whoever is placing, like
  // pass-and-play between people)
  const aiDrafting = useGameStore((s) => s.game?.phase === 'draft' && !isLocalHuman(s.seats[s.game.current]))
  const viewer = useGameStore(viewerOf)
  const seat = aiDrafting ? game.current : viewer
  const refreshing = refreshFx?.seat === seat ? refreshFx : null
  const stage = refreshing?.stage
  useEffect(() => {
    if (stage === 'out') playSound('refresh.out')
    if (stage === 'in') juiceSound('refreshGrow', 'refresh.in')
  }, [stage])
  const myTurn = useGameStore(isMyTurn) // online, the plan on the board may be another player's replay
  const player = colours[colourOf(seat)]
  const { tile } = layout

  // The game's look: an empty hex slot, a ring (held = solid, planned = pulsing), the piece art
  const art = tile * colours.pieceScale
  const slot = (x: number, y: number) => (
    <polygon points={hexCorners(x, y, tile / 2)} fill={colours.hexFill} stroke={colours.hexLine} strokeWidth={tile * colours.hexLineWidth / 2} />
  )
  const ring = (x: number, y: number, planned: boolean) => (
    <g pointerEvents="none">
      <polygon points={hexCorners(x, y, tile / 2)} fill="none" stroke={player} strokeWidth={tile * 0.1} strokeOpacity={0.3} strokeLinejoin="round" />
      <polygon points={hexCorners(x, y, tile / 2)} fill="none" stroke={player} strokeWidth={tile * 0.045} strokeLinejoin="round" />
      {planned && <animate attributeName="opacity" values="1;0.3;1" dur={`${timing.pulseTime}s`} repeatCount="indefinite" />}
    </g>
  )

  // What is in each place, left to right (then the next row)
  let places: HandPlace<Piece>[]
  if (hidden) {
    places = Array.from({ length: game.config.rules.handSize }, () => ({})) // (the Hand view draws only empty slots)
  } else if (game.phase === 'draft') {
    // The glyphlings this player still has to place; the next one is "held" (a ring, at full strength)
    const placed = game.glyphlings.filter((g) => g.seat === seat).length
    places = Array.from({ length: 2 - placed }, (_, pos) => ({
      key: `draft-${pos}`,
      piece: { kind: 'glyphling', next: pos === 0 && (myTurn || aiDrafting) },
      attrs: { 'data-draft': pos === 0 ? 'next' : undefined },
    }))
  } else {
    // (pass-and-play, while the new seeds grow in: the refreshed hand, before the game moves on to the next player)
    const hand = refreshing?.hand ?? game.hands[seat]
    const order = refreshing?.order ?? trayOrder[seat] ?? []
    const slots = Math.max(game.config.rules.handSize, order.length)
    places = Array.from({ length: slots }, (_, pos): HandPlace<Piece> => {
      const id = order[pos] // the seed in this place, by its id
      if (id === TRAY_GAP) return { key: `empty-${pos}`, attrs: { 'data-tray-pos': pos } } // a cast seed's place (a seed can be dropped into it)
      const letter = id === undefined ? undefined : letterIn(hand, id)
      if (id === undefined || letter === undefined) return { key: `empty-${pos}` }
      const seed = { key: `hand-${id}`, piece: { kind: 'seed', letter } as const, attrs: { 'data-hand': id, 'data-tray-pos': pos } }
      if (myTurn && cast?.seed === id) return { ...seed, aimed: true } // on the board, waiting for Cast
      const inRefresh = (stage === 'in' ? refreshing?.newSlots : refreshing?.slots)?.includes(pos) ?? false // its seed going, or its new one coming
      if (inRefresh && stage === 'gone') return { key: `empty-${pos}` } // (online: waiting for the new seeds)
      const held = myTurn && ((selected?.kind === 'seed' && selected.id === id) || (stage !== 'in' && setAside.includes(id)))
      const waiting = !refreshing && (!myTurn || (game.phase === 'play' && !move))
      return { ...seed, held, waiting, staged: inRefresh }
    })
  }

  return (
    <HandView<Piece> layout={layout} boxWidth={boxWidth} className="game-tray" label="Seeds" hidden={hidden} places={places}
      stage={stage}
      motion={{ shrinkTime: timing.refreshShrinkTime, growTime: timing.refreshGrowTime, stagger: timing.refreshStagger, overshoot: juiceFor('refreshGrow').grow }}
      renderEmpty={({ x, y }) => slot(x, y)}
      renderPiece={({ piece, held, aimed }, { x, y }) => {
        if (!piece) return null
        if (piece.kind === 'glyphling') {
          return <>
            <image href={glyphlingArt(seat)} x={x - art / 2} y={y - art / 2} width={art} height={art} opacity={piece.next ? 1 : 0.55} />
            {piece.next && ring(x, y, false)}
          </>
        }
        if (aimed) return ring(x, y, true) // the seed is on the board: its place shows only the pulsing halo
        return <>
          <image href={seedArt(piece.letter, seat)} x={x - art / 2} y={y - art / 2} width={art} height={art} />
          {held && ring(x, y, false)}
        </>
      }} />
  )
}

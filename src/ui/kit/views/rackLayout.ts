// RACK LAYOUT — how big a rack's places are and where each one sits. Plain maths, no drawing.  (Pure.)
// (First used by Glyphtender's seed tray, where it was trayLayout.ts.)
// Pieces are drawn at the size the game wants (e.g. as wide as a board hex), never smaller than a finger (tileMin).
// If one row of every place doesn't fit, the rack wraps to 2 rows rather than shrinking;
// only if 2 rows still don't fit do the places shrink (never below tileMin).

export interface RackLayout {
  columns: number
  rows: number
  /** One place's width and height, in pixels. */
  tile: number
  /** The places' whole size (all rows and columns, no outside margin), in pixels. */
  width: number
  height: number
}

export interface RackLayoutInput {
  /** How much width the rack may use, in pixels. */
  room: number
  /** How big the game would like each place to be, in pixels (e.g. a board hex's width right now). */
  tileWanted: number
  /** How many places to lay out (a full hand, so the rack doesn't jump as pieces come and go). */
  places: number
  /** The smallest a place may ever be, in pixels (a finger: 44). */
  tileMin: number
  /** The space between places, in pixels. */
  gap: number
}

export function rackLayout({ room, tileWanted, places, tileMin, gap }: RackLayoutInput): RackLayout {
  const widthOf = (columns: number, tile: number) => columns * tile + (columns - 1) * gap
  let tile = Math.max(tileMin, Math.round(tileWanted))
  let columns = places
  if (widthOf(columns, tile) > room) columns = Math.ceil(places / 2) // wrap to 2 rows first…
  if (widthOf(columns, tile) > room) tile = Math.max(tileMin, Math.floor((room - (columns - 1) * gap) / columns)) // …then shrink
  const rows = Math.ceil(places / columns)
  return { columns, rows, tile, width: widthOf(columns, tile), height: rows * tile + (rows - 1) * gap }
}

/** How far the places sit in from the left of a box `boxWidth` wide (they're centred in it; never less than 0). */
export function rackLeft(layout: RackLayout, boxWidth: number) {
  return Math.max(0, (boxWidth - layout.width) / 2)
}

/** The centre of place number `index` (left to right, then the next row), in pixels from the box's top-left. */
export function rackPlaceCentre(layout: RackLayout, boxWidth: number, index: number) {
  const { tile, columns, width } = layout
  const gap = columns > 1 ? (width - columns * tile) / (columns - 1) : 0
  return {
    x: rackLeft(layout, boxWidth) + (index % columns) * (tile + gap) + tile / 2,
    y: Math.floor(index / columns) * (tile + gap) + tile / 2,
  }
}

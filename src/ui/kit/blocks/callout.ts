// CALLOUT MATHS — where a Callout's bubble and pointer go (plain maths, no page needed), its types and words.
// The component itself is in teach.tsx.
export type CalloutPoint = { x: number; y: number }
export type CalloutTarget = Element | string | CalloutPoint | null | undefined
export type CalloutSide = 'top' | 'bottom' | 'left' | 'right'
export type CalloutPlacement = 'auto' | CalloutSide
type Box = { left: number; top: number; right: number; bottom: number }
type Size = { width: number; height: number }
export type CalloutSpot = { side: CalloutSide; x: number; y: number; tipX: number; tipY: number }

const opposite: Record<CalloutSide, CalloutSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
const across: Record<CalloutSide, CalloutSide[]> = { top: ['right', 'left'], bottom: ['right', 'left'], left: ['top', 'bottom'], right: ['top', 'bottom'] }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)))

// WHERE THE BUBBLE GOES — plain maths, no page needed (tested in teach.test.tsx).
// target: the rectangle to point at (already grown by the spotlight's room) · size: the bubble · frame: the room it
// may use (window or game picture, minus the edge room) · distance: target edge → bubble edge (the pointer sits in it)
// · tipInset: how close to a corner the pointer may go. Returns the bubble's top-left and the pointer's spot on its edge.
export function placeCallout(target: Box, size: Size, frame: Box, distance: number, placement: CalloutPlacement = 'auto', tipInset = 0): CalloutSpot {
  const order: CalloutSide[] = placement === 'auto' ? ['top', 'bottom', 'right', 'left'] : [placement, opposite[placement], ...across[placement]]
  // Room left over on each side once the bubble is in it (below 0 = doesn't fit)
  const spare = (side: CalloutSide) => {
    if (side === 'top') return target.top - frame.top - distance - size.height
    if (side === 'bottom') return frame.bottom - target.bottom - distance - size.height
    if (side === 'left') return target.left - frame.left - distance - size.width
    return frame.right - target.right - distance - size.width
  }
  const centreX = (target.left + target.right) / 2, centreY = (target.top + target.bottom) / 2
  // Can the pointer reach straight at the target's middle from this side? (Not when the target sits so close to a
  // frame edge that the pointer would have to go round the bubble's corner.)
  const aims = (side: CalloutSide) => side === 'top' || side === 'bottom'
    ? centreX >= frame.left + tipInset && centreX <= frame.right - tipInset
    : centreY >= frame.top + tipInset && centreY <= frame.bottom - tipInset
  // The first side it fits on with the pointer aimed straight; then the first it fits on at all; when none fits,
  // the side with the most room (it may then have to overlap)
  const side = order.find((s) => spare(s) >= 0 && aims(s)) ?? order.find((s) => spare(s) >= 0)
    ?? order.reduce((best, s) => (spare(s) > spare(best) ? s : best))
  const fitX = (x: number) => clamp(x, frame.left, frame.right - size.width)
  const fitY = (y: number) => clamp(y, frame.top, frame.bottom - size.height)
  let x: number, y: number
  if (side === 'top' || side === 'bottom') {
    x = fitX(centreX - size.width / 2)
    y = fitY(side === 'top' ? target.top - distance - size.height : target.bottom + distance)
  } else {
    y = fitY(centreY - size.height / 2)
    x = fitX(side === 'left' ? target.left - distance - size.width : target.right + distance)
  }
  // The pointer: on the edge facing the target, aimed at the middle of the target's facing edge
  const vertical = side === 'top' || side === 'bottom'
  const tipX = vertical ? clamp(centreX - x, tipInset, size.width - tipInset) : side === 'left' ? size.width : 0
  const tipY = vertical ? (side === 'top' ? size.height : 0) : clamp(centreY - y, tipInset, size.height - tipInset)
  return { side, x, y, tipX, tipY }
}


export const calloutWords = { label: 'Tip' }

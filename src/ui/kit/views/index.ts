// VIEWS — how a zone of pieces is drawn and touched (a hand, later a board). They position and animate;
// the game draws the pieces (render props) and keeps the rules.
import './views.css'

export { HandView, type HandLook, type HandMotion, type HandPlace, type HandSpot, type HandStage, type HandViewProps } from './HandView'
export { rackLayout, rackLeft, rackPlaceCentre, type RackLayout, type RackLayoutInput } from './rackLayout'

// CONTROL SOUNDS — the kit's controls say "I was pressed" here, and a game with sound plugs in ONCE at start-up:
//
//   import { setControlSound } from './ui/kit'
//   import { playSound } from './audio'
//   setControlSound((kind) => playSound(`ui.${kind}`))   // ui.tap · ui.back · ui.toggle in content/audio.json
//
// A kit without a listener stays silent (no audio code in the kit). Which kind each control says:
//   tap    — a Button (any variant), a Tab, a clickable ListRow, ◀ ▶ on a Selector / Stepper / Carousel
//   back   — a Button with sound="back" (Back, Close ✕, Resume — the kit's own back buttons already say it)
//   toggle — a Toggle switch
// A Button whose action has its own sound (the game plays it) passes sound={false}, so there's never a double sound.
export type ControlSoundKind = 'tap' | 'back' | 'toggle'

let listener: ((kind: ControlSoundKind) => void) | null = null

/** The game's sound for a kit control being pressed (null = silent again). */
export function setControlSound(play: ((kind: ControlSoundKind) => void) | null): void {
  listener = play
}

/** A kit control was pressed (the controls call this; games normally don't). */
export function controlSound(kind: ControlSoundKind): void {
  listener?.(kind)
}

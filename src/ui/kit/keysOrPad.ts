// KEYS OR PAD — is the player on the keyboard or a gamepad right now (not a mouse or a finger)?
// The kit moves the focus by code (a screen opening, a bubble or a pause you confirm). Browsers show the focus ring
// for that even before any click or key — e.g. a screen opened at load — so until a key or a pad press the kit
// focuses quietly (no ring). Mouse and touch players never see a ring; key and pad players see where they are.
// The latest kind of input wins: a click after some key presses makes the next screen quiet again, a key makes it ringed.
//
// What counts as a pad: the browser's gamepadconnected. Chrome and Firefox only report a pad to the page after one of
// its buttons is pressed (or a stick moved) while the page is open — a pad sitting on the desk stays hidden — so
// "connected" already means "pressed". The d-pad sent as arrow keys counts too (it's a key press).
// A game that reads its own pad (navigator.getGamepads) calls markPadUsed() when a button is pressed — needed after
// a click, when gamepadconnected has already happened once: e.g. markPadUsed() in its "A pressed" code.

let keysOrPad = false

/** Tell the kit the player is using a gamepad, so the next screen it opens shows the focus ring. */
export function markPadUsed() {
  keysOrPad = true
}

/** The focus() options for focus moved by code: with the ring for key and pad players, without for mouse and touch. */
export function focusRing(options?: FocusOptions): FocusOptions {
  // ("as FocusOptions": older TypeScript versions, like many games use, don't know focusVisible yet)
  return { ...options, focusVisible: keysOrPad } as FocusOptions
}

if (typeof window !== 'undefined') {
  // capture: seen first, even when the game stops the event for its own keys or taps
  window.addEventListener('keydown', () => { keysOrPad = true }, { capture: true })
  window.addEventListener('gamepadconnected', () => { keysOrPad = true })
  window.addEventListener('pointerdown', () => { keysOrPad = false }, { capture: true })
}

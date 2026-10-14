// THE RAILS' STEPS (F76, design/tutorial.md §2) — the tutorial game's draft and your first 2 turns, as a plain list.
// Each step says WHEN it is the one (from the game and the turn being planned), what its ONE callout points at (a CSS
// selector) and says (content/text/en.json → tutorial.rails), and the rails limit while it's up (railsLimit.ts: the one
// piece → hex the referee allows; the board glows the piece's whole template, that hex extra bright). A step with a button is a
// pause: it HOLDS the game (nobody may act, Sprout doesn't start) until its button is tapped — "Next" for an info line,
// "Got it" / "Play" for the two big pauses, which also dim the rest. Sprout's own steps have no callout: it plays its
// script (railsAction). The current step = the first one whose `when` holds and whose button hasn't been tapped yet;
// none = the rails are over (free play). Every hex and letter comes from content/tutorial/rails.json (rails.ts).
import text from '../../content/text/en.json'
import { hexKey } from '../engine/hex'
import type { GameState } from '../engine/types'
import type { RailsLimit } from '../store/railsLimit'
import { NEW_GLYPHLING } from '../store/referee'
import type { PlannedCast, PlannedMove } from '../store/turnPlan'
import type { CalloutPlacement } from '../ui/kit'
import { colourOf } from '../game/art'
import { rails, railsGlyphling, railsHex, railsStep, seedIdOf } from './rails'

const words = text.tutorial.rails
/** The words of a callout (a key of en.json → tutorial.rails). */
export type RailsWords = Exclude<keyof typeof words, '_help' | 'next' | 'gotIt' | 'play'>

/** What a step looks at: the game, the turn being planned, the seeds set aside, and the pauses already tapped through. */
export interface StepState {
  game: GameState
  move: PlannedMove | null
  cast: PlannedCast | null
  setAside: string[]
  seen: ReadonlySet<string>
}

export interface RailsStepDef {
  id: string
  when: (s: StepState) => boolean
  /** What the callout points at (a CSS selector). None = no callout (Sprout's turns). */
  target?: (s: StepState) => string
  /** Its words (en.json → tutorial.rails) and the values for their {placeholders} ({rival} is always filled). */
  text?: RailsWords
  values?: Record<string, string>
  /** The limit while this step is up. */
  limit: (s: StepState) => RailsLimit
  /** A pause: holds the game until tapped. 'gotIt' and 'play' dim the rest too. */
  button?: 'next' | 'gotIt' | 'play'
  /** Where the callout goes first (default: toward the nearer of the top bar / the tray — railsPlacement). */
  placement?: CalloutPlacement
}

// ─── Where things are on screen ───
const glyph = (id: number) => `[data-glyph="${id}"]`
const hexAt = (label: string) => `.game-garden > polygon[data-hex="${hexKey(railsHex(label))}"]`
const seedAt = (label: string) => `[data-seed="${hexKey(railsHex(label))}"]`
const handSeed = (game: GameState, letter: string) => `[data-hand="${seedIdOf(game, rails.you, letter)}"]`
const DRAFT = '[data-draft="next"]'
const PLANT = '[data-action="plant"]'
const REFRESH = '[data-action="refresh"]'
const TRAY = '.game-tray'

// ─── The pieces ───
const you = rails.you
const ai = rails.ai.seat
const yourFirst = railsGlyphling(you, rails.turn1.glyphling)
const yourOther = railsGlyphling(you, rails.turn1.glyphling === 'first' ? 'second' : 'first')
const yourTurn2 = railsGlyphling(you, rails.turn2.glyphling)
/** Sprout's glyphling on the hex that stops your turn-1 line short. */
const blocker = railsGlyphling(ai, rails.draft.ai.indexOf(rails.turn1.blockedAt) === 1 ? 'second' : 'first')
/** Sprout's glyphling your turn-1 seed blocks. */
const blocked = railsGlyphling(ai, rails.draft.ai.indexOf(rails.turn1.blocks) === 1 ? 'second' : 'first')

// ─── The limits ───
const reason = (key: RailsWords) => words[key]
const nothing = (key: RailsWords): RailsLimit => ({ piece: null, to: null, reason: reason(key) })
const draftLimit = (game: GameState): RailsLimit => {
  const placed = game.glyphlings.filter((g) => g.seat === you).length
  return { piece: NEW_GLYPHLING, to: railsHex(rails.draft.you[placed]), reason: reason(placed === 0 ? 'draft1' : 'draft2') }
}
const move1: RailsLimit = { piece: { kind: 'glyphling', id: yourFirst }, to: railsHex(rails.turn1.to), reason: reason('move1') }
const seed1 = (game: GameState): RailsLimit =>
  ({ piece: { kind: 'seed', id: seedIdOf(game, you, rails.turn1.seed) }, to: railsHex(rails.turn1.plant), reason: reason('seed1') })
const refreshLimit = (game: GameState): RailsLimit => ({
  piece: null, to: null, reason: reason('swap'),
  setAside: rails.turn1.refresh.map((letter) => seedIdOf(game, you, letter)),
})
/** Turn 2: either of your glyphlings may go there (both can plant the A between C and T from it — rails.test.ts). */
const move2: RailsLimit = {
  piece: { kind: 'glyphling', id: yourTurn2 }, alsoPiece: { kind: 'glyphling', id: railsGlyphling(you, rails.turn2.glyphling === 'first' ? 'second' : 'first') },
  to: railsHex(rails.turn2.to), reason: reason('move2'),
}
/** Turn 2: the glyphling you moved (either one). */
const movedOnTurn2 = (s: StepState) => s.game.lastTurn?.seat === you ? s.game.lastTurn.glyphlingId : yourTurn2
const seed2 = (game: GameState): RailsLimit =>
  ({ piece: { kind: 'seed', id: seedIdOf(game, you, rails.turn2.seed) }, to: railsHex(rails.turn2.plant), reason: reason('seed2') })
/** "Your seed blocks Blue's glyphling": its room glows, so you see the line your seed cut off. */
const blocksLimit = (game: GameState): RailsLimit => ({ ...refreshLimit(game), showMoves: blocked })
const SPROUT: RailsLimit = { piece: null, to: null, reason: 'Sprout is playing its scripted turn' }

// ─── When ───
const at = (step: ReturnType<typeof railsStep>) => (s: StepState) => railsStep(s.game) === step
const yourDraft = (placed: number) => (s: StepState) =>
  railsStep(s.game) === 'draft' && s.game.current === you && s.game.glyphlings.filter((g) => g.seat === you).length === placed
const sprouts = (s: StepState) => s.game.current === ai && ['draft', 'aiTurn1', 'aiRefresh'].includes(railsStep(s.game))
const both = (...tests: ((s: StepState) => boolean)[]) => (s: StepState) => tests.every((test) => test(s))
const noMove = (s: StepState) => !s.move
const moved = (s: StepState) => !!s.move && !s.cast
const aimed = (s: StepState) => !!s.move && !!s.cast
const refreshIds = (s: StepState) => rails.turn1.refresh.map((letter) => seedIdOf(s.game, you, letter))
const allSetAside = (s: StepState) => refreshIds(s).every((id) => s.setAside.includes(id))
/** After your turn 2's word has scored, before Sprout's turn 2 (a word made = no refresh: play passes straight on).
 *  These steps hold the game, so Sprout waits for the hand-over. (Your turn 2 is the game's turn 2 — rails.ts.) */
const afterTurn2 = (s: StepState) => s.game.phase === 'play' && s.game.current === ai && s.game.turnCount === 3

/** The rails, in order. */
export const RAILS_STEPS: RailsStepDef[] = [
  // Draft (snake 1-2-2-1: you, Sprout ×2, you)
  { id: 'draft1', when: yourDraft(0), target: () => DRAFT, text: 'draft1', limit: (s) => draftLimit(s.game) },
  { id: 'draft2', when: yourDraft(1), target: () => DRAFT, text: 'draft2', limit: (s) => draftLimit(s.game) },
  // Sprout's draft, turn 1 and Keep all: it plays its script, nothing to say
  { id: 'sprout', when: sprouts, limit: () => SPROUT },
  // Your turn 1 — move, plant
  { id: 'lines', when: both(at('turn1'), noMove), target: () => glyph(yourFirst), text: 'lines', limit: () => move1, button: 'next' },
  { id: 'block', when: both(at('turn1'), noMove), target: () => glyph(blocker), text: 'block', limit: () => move1, button: 'next' },
  { id: 'move1', when: both(at('turn1'), noMove), target: () => hexAt(rails.turn1.to), text: 'move1', limit: () => move1 },
  { id: 'overOwn', when: both(at('turn1'), moved), target: () => glyph(yourOther), text: 'overOwn', limit: (s) => seed1(s.game), button: 'next' },
  { id: 'seed1', when: both(at('turn1'), moved), target: (s) => handSeed(s.game, rails.turn1.seed), text: 'seed1', values: { letter: rails.turn1.seed }, limit: (s) => seed1(s.game) },
  { id: 'plant1', when: both(at('turn1'), aimed), target: () => PLANT, text: 'plant1', limit: () => nothing('plant1') },
  // …the refresh after it: no word, so swap
  { id: 'blocks', when: at('refresh1'), target: () => seedAt(rails.turn1.plant), text: 'blocks', limit: (s) => blocksLimit(s.game), button: 'next' },
  { id: 'noWord', when: at('refresh1'), target: () => TRAY, text: 'noWord', limit: (s) => refreshLimit(s.game), button: 'gotIt' },
  {
    id: 'swap', when: both(at('refresh1'), (s) => !allSetAside(s)), text: 'swap',
    target: (s) => `[data-hand="${refreshIds(s).find((id) => !s.setAside.includes(id))}"]`,
    values: { first: rails.turn1.refresh[0], second: rails.turn1.refresh[1] }, limit: (s) => refreshLimit(s.game),
  },
  { id: 'refresh', when: both(at('refresh1'), allSetAside), target: () => REFRESH, text: 'refresh', limit: (s) => refreshLimit(s.game) },
  // Your turn 2 — your first word
  { id: 'move2', when: both(at('turn2'), noMove), target: () => hexAt(rails.turn2.to), text: 'move2', limit: () => move2 },
  {
    id: 'seed2', when: both(at('turn2'), moved), target: (s) => handSeed(s.game, rails.turn2.seed), text: 'seed2',
    values: { letter: rails.turn2.seed, yours: rails.turn1.seed, theirs: rails.aiTurn1.seed }, limit: (s) => seed2(s.game),
  },
  { id: 'preview', when: both(at('turn2'), aimed), target: () => PLANT, text: 'preview', limit: () => nothing('preview') },
  // …it scored: what the numbers meant, then you're on your own
  { id: 'counts', when: afterTurn2, target: () => seedAt(rails.turn1.plant), text: 'counts', limit: () => nothing('counts'), button: 'next', placement: 'top' }, // (at your C, above it: the whole word stays in view)
  { id: 'secret', when: afterTurn2, target: (s) => glyph(movedOnTurn2(s)), text: 'secret', limit: () => nothing('secret'), button: 'next' },
  { id: 'handOver', when: afterTurn2, target: () => TRAY, text: 'handOver', limit: () => nothing('handOver'), button: 'play' },
]

/** The step the rails are on, or null = the rails are over (free play). */
export function currentRailsStep(s: StepState, steps: RailsStepDef[] = RAILS_STEPS): RailsStepDef | null {
  return steps.find((step) => !(step.button && s.seen.has(step.id)) && step.when(s)) ?? null
}

/** A step's callout words, with its {placeholders} filled ({rival} = Sprout's colour, e.g. Blue). */
export function railsText(step: RailsStepDef): string {
  const values: Record<string, string> = { rival: text.game.players[colourOf(ai)], ...step.values }
  return words[step.text!].replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all)
}

/** The words on a pause's button. */
export const railsButton = (step: RailsStepDef) => (step.button ? words[step.button] : undefined)

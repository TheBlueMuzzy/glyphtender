// THE AI MODULE — DATA SHAPES. What a personality, a skill and a game's plug look like.  (Pure: no screen, no network.)
//
// Every game's AI is the same kind of player with different instincts:
//   - a PERSONALITY is what it wants (trait ranges, goal order, how much the other goals nudge, mood shifts, chattiness)
//   - a SKILL is how well it sees and searches (how many moves it looks at, how many hidden worlds it imagines,
//     how close to the best it must pick, how blurry its personality and its beliefs get)
//   - the game's PLUG teaches it the game: its goals (each with a scorer), its readings, how to imagine hidden things,
//     which moves to look at, and any decisions that sit outside the goal roll (Glyphtender: draft, refresh, "call it").
// Personalities and skills are plain JSON (a game's content/ai/); the plug is code.
// Design: framework .planning/design/ai.md.

/** A trait's range, 0–100. Each turn the AI picks a value inside it, so a personality leans the same way but never
 *  plays exactly the same twice. */
export interface Range {
  min: number
  max: number
}

/** A mood shift: when a reading (0–10) climbs from `from` to `full`, the trait moves by up to `by` (both ends of its
 *  range, kept within 0–100). `from` above `full` works the other way round (the shift grows as the reading falls). */
export interface Shift {
  reading: string
  from: number
  full: number
  trait: string
  by: number
}

export interface Personality {
  id: string
  /** Trait name → range, 0–100 (Glyphtender: aggression, greed, spite, caution, patience, opportunism, pragmatism). */
  traits: Record<string, Range>
  /** Goal ids in priority order: the goal roll walks this list. */
  goals: string[]
  /** How much the OTHER goals count when scoring a move, 0–1 (0 = only the main goal; the original AI). Each other
   *  goal adds up to nudge × its trait ÷ 100. */
  nudge: number
  /** 0–1: how single-minded at a BIG MOMENT (the main goal's best move reaches the goal's `bigAt`): only moves at
   *  least this good for the main goal (0 = worst, 1 = best of this turn's) are considered; the other goals then pick
   *  among them. On ordinary turns it blends. Missing = 0 (always blends). */
  focus?: number
  /** Goals EVERY move also tries for, whatever the roll, with a weight 0–1 (Glyphtender: { SCORE: 0.6 } — "try to
   *  score, but also try to bully"). Missing = none. */
  steady?: Record<string, number>
  /** How clearly it sees each kind of move, 0–1 per goal (missing = 1, sees clearly). Low sight blurs that goal's
   *  scores, so it misjudges those moves — Glyphtender's Scholar can't see a trap closing on it. */
  sight?: Record<string, number>
  shifts: Shift[]
  /** 0–100: how likely it is to say something at a banter moment. */
  chattiness: number
  /** Game-specific numbers (Glyphtender: nerve, vocabulary). */
  extras?: Record<string, number>
}

export interface Skill {
  id: string
  /** The most moves it scores in one decision (the plug picks which). */
  candidates: number
  /** How many versions of the hidden things (rivals' hands, the bag) it imagines and averages over. */
  worlds: number
  /** 0–1: keep moves within this share of the best one (1 = only the best). */
  spread: number
  /** …and at most this many of them, picked weighted by score. */
  topN: number
  /** 0–1: widens every trait range around its centre (a less skilled player is less consistent). */
  wobble: number
  /** 0–1: how blurry its beliefs are (used by beliefs, framework F20). */
  beliefNoise: number
  /** Game-specific numbers (Glyphtender: vocabulary Zipf threshold). */
  extras?: Record<string, number>
}

/** What one decision can see. World = the game's state with hidden things imagined (never the real hidden things). */
export interface Context<View, World> {
  view: View
  world: World
  seat: number
  readings: Record<string, number>
  /** This turn's trait values (rolled inside the shifted ranges). */
  traits: Record<string, number>
  personality: Personality
  skill: Skill
  /** Scratch space for one decision, shared by every goal's scorer (e.g. a move's word preview, worked out once). */
  cache: Map<string, unknown>
}

/** How good a move is for one goal. Any scale (the brain compares moves within a goal, never across goals). */
export interface GoalScore {
  value: number
  /** Plain English for the note ("cut Blue's glyphling 9 → 2"). */
  why?: string
}

export interface Goal<View, Action, World> {
  id: string
  /** The trait whose range decides how often this goal wins the roll. */
  trait: string
  /** A big moment for this goal: its best move scores at least this (the goal's own scale). Missing = every turn
   *  counts as one (focus always applies). Games keep these numbers in data. */
  bigAt?: number
  score(action: Action, ctx: Context<View, World>): GoalScore
}

/** A decision the plug makes itself, outside the goal roll (draft, refresh, "call it"). */
export interface Special<Action> {
  action: Action
  /** Shown in the note in place of a goal ("CALL IT"). */
  goal: string
  why: string
}

export interface GamePlug<View, Action, World = View> {
  goals: Goal<View, Action, World>[]
  /** What it feels right now, each 0–10 ("myDanger", "handQuality", "behind"…). */
  readings(view: View, seat: number): Record<string, number>
  /** One version of the world with the hidden things filled in, consistent with what this seat knows. */
  imagine(view: View, seat: number, rng: number): { world: World; rng: number }
  /** The moves worth scoring this time — at most `limit` (the plug decides how to thin them; `sample` helps). */
  candidates(world: World, seat: number, limit: number, rng: number): { actions: Action[]; rng: number }
  /** A stable text key for a move (the same move in every imagined world gets the same key). */
  key(action: Action): string
  /** The move in plain English, for notes ("glyphling 1 → C4-3, cast E at D5-2"). */
  describe(action: Action, world: World): string
  /** Decisions outside the goal roll; null = no, use the goals. Runs after readings and the trait roll. */
  special?(ctx: Context<View, World>, rng: number): { special: Special<Action> | null; rng: number }
}

/** Why it did what it did — for the Dev Kit and bug reports, never shown to players. */
export interface Decision<Action> {
  action: Action
  /** The goal it chose (or the special decision's name). */
  goal: string
  /** The goal roll, in priority order up to the winner: threshold picked inside the range vs the d100 roll. */
  rolls: { goal: string; threshold: number; roll: number }[]
  readings: Record<string, number>
  /** Mood shifts that moved a trait this turn. */
  shifts: { trait: string; by: number; because: string }[]
  traits: Record<string, number>
  /** How many moves it scored, and the main goal had any opinion at all (false = every move scored the same). */
  considered: number
  mainGoalMattered: boolean
  /** The main goal saw a big moment, so it focused on it. */
  bigMoment: boolean
  chosen: { move: string; score: number; why: string[] }
  /** The next best moves it might have picked instead. */
  alternatives: { move: string; score: number }[]
  /** The whole decision in one plain-English line. */
  note: string
}

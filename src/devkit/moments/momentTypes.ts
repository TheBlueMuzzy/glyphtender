// MOMENTS — what a game hands the Dev Kit so Muzzy can watch one moment of the game loop (a score pop, a tangle,
// the reveal's winner) while he changes its feel. Written in src/devkit-game/previews.tsx, next to the screens:
//
//   export const moments: DevKitMoment[] = [{
//     id: 'score-pop', screen: 'board', label: 'Score pop',
//     play: () => { loadSample(); castTwoBirds() },      // runs INSIDE the Screens sandbox — may write the stores
//     knobs: [
//       { file: 'content/tuning/feel.json', path: 'tiers.big.grow' },
//       { file: 'content/audio.json', path: 'sounds.score.pop.volumeDb', values: { soft: -12, balanced: -8, punchy: -5 } },
//     ],
//   }]
//
// Screens → open the screen → its Moments: ▶ plays it once, 🔁 loops it, the knobs are sliders, and the
// Soft · Balanced · Punchy picker sets every knob at once. Why the sandbox: .planning/design/devkit-moments.md.

/** The three feel styles, gentlest first. */
export type FeelStyle = 'soft' | 'balanced' | 'punchy'
export const FEEL_STYLES: FeelStyle[] = ['soft', 'balanced', 'punchy']
export const STYLE_NAMES: Record<FeelStyle, string> = { soft: 'Soft', balanced: 'Balanced', punchy: 'Punchy' }

/**
 * What a knob does, for the presets' relative rules (momentLogic.ts STYLE_RULES). Guessed from the key when not
 * given ("scorePopMs" → duration, "grow" → size, "volumeDb" → volume…). 'none' = presets never move it.
 */
export type KnobRole = 'duration' | 'delay' | 'size' | 'shake' | 'overshoot' | 'volume' | 'randomPitch' | 'none'

/** One value a moment uses, in a content/ JSON file. */
export interface MomentKnob {
  /** The file, from the game's folder: "content/tuning/feel.json", "content/audio.json". */
  file: string
  /** Where in the file, keys joined with dots. Keys that hold dots work too: "sounds.score.pop.volumeDb". */
  path: string
  /** The name shown — otherwise the file's _labels (wildcards like "sounds.*.volumeDb" too), else made from the key. */
  label?: string
  /** What it does, for the presets. Otherwise guessed from the key. */
  role?: KnobRole
  /** Exact values per style. They win over the relative rules (use them once a look is decided). */
  values?: Partial<Record<FeelStyle, unknown>>
}

/** What play() is told each time it runs. */
export interface MomentRun {
  /** 0 the first time, then 1, 2… while it loops. */
  round: number
  /** True while 🔁 loops it. */
  looping: boolean
  /** The screen's variant that's open (e.g. "3p"), if it has variants. */
  variant: string | undefined
}

export interface DevKitMoment {
  /** Stable, unique, e.g. "score-pop". */
  id: string
  /** The screen it plays on: a preview's id from the same file (e.g. "board", "reveal"). */
  screen: string
  /** What the list shows, e.g. "Score pop". */
  label: string
  /** One short line: what you should see and hear. */
  note?: string
  /** The values that shape it — sliders under the moment, and what the style picker sets. */
  knobs: MomentKnob[]
  /**
   * Plays the moment once, in the screen's sandbox (never the real game). It is called again and again while it
   * loops, so it sets up what it needs every time (load the sample board, then trigger the pop). May be async:
   * the loop waits for it to finish before counting down to the next one.
   */
  play(run: MomentRun): void | Promise<void>
}

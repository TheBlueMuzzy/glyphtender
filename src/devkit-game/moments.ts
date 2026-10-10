// GLYPHTENDER'S DEV KIT MOMENTS (` → Screens → a screen → Moments; the Dev Kit finds them as previews.tsx `moments`).
// Watch one moment of the game loop — ▶ once, 🔁 again and again — while you change how it feels: its sliders
// span the feel tiers (content/tuning/feel.json), the timings (anim.json), the look (garden.json) and the sounds
// (audio.json), and Soft · Balanced · Punchy sets them all at once (Balanced = the files as saved; Soft / Punchy move
// each by what it does — framework .planning/design/devkit-moments.md — unless a knob gives exact `values`).
// A feel tier is shared: the score pops' "medium" swell is the same knob in every moment that uses it (same
// intention, same motion) — the panel says "Also changes: …".
// What each play does: momentPlays.ts (loaded only when a moment plays — this list stays plain data, so it's tested
// in node: moments.test.ts checks every knob is really in its file and every screen is a preview).
import feelFile from '../../content/tuning/feel.json'
import type { DevKitMoment, MomentKnob } from '../devkit/moments/momentTypes'

const FEEL = 'content/tuning/feel.json'
const ANIM = 'content/tuning/anim.json'
const GARDEN = 'content/tuning/garden.json'
const AUDIO = 'content/audio.json'

/** The feel tier (small / medium / big) a juiced event uses — its grow or shake is the knob. */
const tier = (event: keyof typeof feelFile.events, what: 'grow' | 'shake'): MomentKnob =>
  ({ file: FEEL, path: `tiers.${feelFile.events[event]}.${what}` })
const anim = (path: string, extra: Partial<MomentKnob> = {}): MomentKnob => ({ file: ANIM, path, ...extra })
const sound = (id: string, key: string, extra: Partial<MomentKnob> = {}): MomentKnob => ({ file: AUDIO, path: `sounds.${id}.${key}`, ...extra })

const plays = () => import('./momentPlays')

export const moments: DevKitMoment[] = [
  // ─── On the board ─────────────────────────────────────────────────────────────────────────────────
  {
    id: 'score-pop', screen: 'board', label: 'Score pop',
    note: 'A cast that grows one word: each seed\'s "+1" pops over it, a note higher each time, then flies into the glyphling\'s total',
    play: async () => (await plays()).castMoment('oneWord', ['cast.throw', 'seed.land', 'sprout.grow', 'score.pop', 'score.arrive', 'word.chord', 'glyph.step']),
    knobs: [
      tier('seedPop', 'grow'),
      tier('totalPop', 'grow'),
      anim('scorePopTime'),
      anim('scorePopGap'),
      anim('scoreFlyTime'),
      anim('scoreTotalHold'),
      sound('score.pop', 'volumeDb'),
      // a ladder sound (each pop a note higher): random pitch would put it out of tune, so the styles leave it alone
      sound('score.pop', 'randomPitch', { role: 'none' }),
      sound('score.arrive', 'volumeDb'),
    ],
  },
  {
    id: 'seed-lands', screen: 'board', label: 'Seed lands + sprout',
    note: 'A cast that grows no word: the hop and throw, the seed lands, the runeblossom sprouts',
    play: async () => (await plays()).castMoment('noWords', ['cast.throw', 'seed.land', 'sprout.grow', 'glyph.step']),
    knobs: [
      anim('hopTime'),
      anim('flightBase'),
      anim('arcHeight', { role: 'size' }),
      anim('growTime'),
      // lower = it grows from a tinier dot (more dramatic), so the styles go the other way from "size"
      anim('growFrom', { values: { soft: 0.3, balanced: 0.1, punchy: 0.05 } }),
      sound('cast.throw', 'volumeDb'),
      sound('seed.land', 'volumeDb'),
      sound('seed.land', 'randomPitch'),
      sound('sprout.grow', 'delayMs'),
      sound('sprout.grow', 'volumeDb'),
    ],
  },
  {
    id: 'two-birds', screen: 'board', label: 'Two birds (2-word cast)',
    note: 'A cast that grows two words: they score one after the other, the total grows with every point, then the magic flourish',
    play: async () => (await plays()).castMoment('twoWords', ['cast.throw', 'seed.land', 'sprout.grow', 'score.pop', 'score.arrive', 'word.chord', 'cast.flourish', 'glyph.step']),
    knobs: [
      anim('scorePopDelay'),
      anim('scoreWordTime'),
      anim('spotlightFade'),
      anim('scoreTotalGrow', { role: 'size' }),
      tier('totalPop', 'grow'),
      sound('cast.flourish', 'volumeDb'),
      sound('word.chord', 'volumeDb'),
    ],
  },
  {
    id: 'tangle', screen: 'board', label: 'Tangle',
    note: 'A turn that leaves a glyphling with nowhere to go: the vine wraps it and the tangle sound plays',
    play: async () => (await plays()).castMoment('tangle', ['cast.throw', 'seed.land', 'sprout.grow', 'tangle', 'danger.warn', 'glyph.step', 'score.pop', 'score.arrive']),
    knobs: [
      anim('moveBase'),
      anim('moveSettle', { role: 'overshoot' }),
      { file: GARDEN, path: 'vineWidth', role: 'size' },
      sound('tangle', 'volumeDb'),
      sound('tangle', 'randomPitch'),
      sound('danger.warn', 'volumeDb'),
    ],
  },
  {
    id: 'no-shake', screen: 'board', label: '"No" shake',
    note: 'A tap on something you can\'t move (here: a rival\'s glyphling): a quick sideways shake and a soft bonk',
    play: async () => (await plays()).noShakeMoment(['no']),
    knobs: [
      tier('noShake', 'shake'),
      anim('noShakeTime'),
      sound('no', 'volumeDb'),
      sound('no', 'randomPitch'),
    ],
  },
  {
    id: 'your-turn', screen: 'board', label: 'Your turn',
    note: 'Play passes on: the next player\'s glyphlings start to breathe and the "your turn" chime plays',
    play: async () => (await plays()).yourTurnMoment(['turn.yours']),
    knobs: [
      tier('turnPulse', 'grow'),
      anim('turnPulseTime'),
      sound('turn.yours', 'volumeDb'),
    ],
  },
  // ─── The end-of-game reveal ───────────────────────────────────────────────────────────────────────
  {
    id: 'reveal-count', screen: 'reveal', label: 'Reveal count-up',
    note: 'Each player\'s Magic counts up, lowest first (a rising run), then the "+3" tangle bonuses fly in — it stops before the winner',
    play: async ({ variant }) => (await plays()).revealMoment('count', variant, ['reveal.count', 'reveal.bonus']),
    knobs: [
      anim('revealCount'),
      anim('revealBonus'),
      anim('revealPopTime'),
      tier('totalPop', 'grow'),
      sound('reveal.count', 'volumeDb'),
      sound('reveal.bonus', 'volumeDb'),
    ],
  },
  {
    id: 'grand-glyphtender', screen: 'reveal', label: 'New Grand Glyphtender',
    note: 'The winner is named — "Grand Glyphtender!" and the fanfare — then the end table opens',
    play: async ({ variant }) => (await plays()).revealMoment('winner', variant, ['reveal.winner']),
    knobs: [
      anim('revealWinner'),
      sound('reveal.winner', 'volumeDb'),
    ],
  },
]

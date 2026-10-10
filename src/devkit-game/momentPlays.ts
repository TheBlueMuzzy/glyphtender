// HOW GLYPHTENDER'S DEV KIT MOMENTS PLAY (the list: moments.ts). Runs only INSIDE the Screens sandbox frame — a
// separate copy of the game — so it drives the stores freely; the real game never sees it. Every play sets up its own
// position first (a moment loops: round 2 must look and sound like round 1), then makes the moment happen through the
// game's own code paths (the store's actions, the same as a person's taps), so it looks, moves and sounds exactly
// like the game — and follows the Dev Kit's sliders (liveTuning / useAnimTuning). Each resolves once it has played out.
import animFile from '../../content/tuning/anim.json'
import { getAudio, readAudioSettings } from '../audio'
import { latestTuning, liveTuning } from '../devkit/tuning/liveTuning'
import { glideSeconds } from '../game/glide'
import { startSound } from '../game/sound'
import { useGameStore } from '../store/gameStore'
import { revealSteps, stepSeconds } from '../store/revealPlan'
import { settings } from '../ui/gameSettings'
import { loadSettings, screens } from '../ui/kit'
import { momentStart, type MomentStart, type MomentWant } from './momentTurns'
import type { SampleGame } from './sampleGames'
import { endGame, loadGame, words } from './sampleStore'

const anim = liveTuning('anim', animFile) // read when each moment plays, so a slider change counts on the next round
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))

/** Waits until `ready()` (checked every frame-ish), at most `ms`. */
async function until(ready: () => boolean, ms: number) {
  const end = performance.now() + ms
  while (!ready() && performance.now() < end) await wait(30)
}

// ─── Sound ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * The frame never ran the game's start-up, so the first moment starts the sound engine (sound.ts) with the player's
 * settings, gives it the Dev Kit's latest audio edit, and wakes it. Ambience is turned off in the frame, and music too
 * unless the moment is about the music (the reveal's ceremony: `music` — then the garden's track plays at the
 * player's Music volume): a moment is heard on its own. Its own sounds are loaded first — one not loaded would be dropped.
 */
async function soundReady(names: string[], music = false) {
  const fresh = !getAudio()
  const values = loadSettings(settings)
  startSound(values)
  const audio = getAudio()
  if (!audio) return
  if (fresh) {
    const edit = latestTuning().find(([file]) => file === 'audio') // (an edit made before the engine was here)
    if (edit) audio.setConfig(edit[1])
    audio.setBusVolume('ambience', 0)
  }
  audio.setBusVolume('music', music ? readAudioSettings(values).musicVolume : 0)
  audio.unlock()
  await audio.preload(names)
  await until(() => audio.state() === 'running', 1500)
}

// ─── The board moments ───────────────────────────────────────────────────────────────────────────────
const starts = new Map<MomentWant, MomentStart>() // found once per frame (momentTurns.ts), then reused every round

/** Loads the position a board moment starts from (2 players, seeds shown: no "pass the device" box after a turn). */
async function boardAt(want: MomentWant): Promise<MomentStart> {
  let start = starts.get(want)
  if (!start) {
    const found = momentStart(await words(), want)
    if (!found) throw new Error(`no board position found for "${want}" (momentTurns.ts)`)
    starts.set(want, (start = found))
  }
  while (screens.current.length) screens.pop() // (nothing over the board)
  loadGame(start, { hideSeeds: false })
  await frames() // the board has drawn the position, so what happens next animates from it
  return start
}

/** A cast, like a person's: the glyphling glides to its new hex, the seed is cast, flies, lands, sprouts, and the
 *  words it grew score one at a time. Resolves once the whole score sequence has faded. */
export async function castMoment(want: 'oneWord' | 'twoWords' | 'noWords' | 'tangle', sounds: string[]) {
  await soundReady(sounds)
  const { turn, game } = await boardAt(want)
  if (!turn) throw new Error(`the "${want}" position has no turn`)
  const store = useGameStore
  const from = game.glyphlings.find((g) => g.id === turn.glyphling)!.hex
  store.setState({ move: { glyphling: turn.glyphling, to: turn.to }, selected: null })
  await wait(glideSeconds(from, turn.to, anim.current) * 1000)
  store.setState({ cast: { seed: turn.seed, target: turn.target } })
  const landings = store.getState().landed?.count ?? 0
  store.getState().startCast()
  // landed (Board → finishCast), then the score sequence (if it grew words) has faded
  await until(() => (store.getState().landed?.count ?? 0) > landings && !store.getState().flying, 5000)
  await until(() => store.getState().scoring === null, 15000)
  await wait(anim.current.growTime * 1000) // (a cast that grew nothing: the sprout)
}

/** "No": a tap on a rival's glyphling — it shakes. */
export async function noShakeMoment(sounds: string[]) {
  await soundReady(sounds)
  const { game } = await boardAt('oneWord')
  const rival = game.glyphlings.find((g) => g.seat !== game.current)
  if (!rival) throw new Error('no rival glyphling to tap')
  useGameStore.getState().refuseTap({ glyph: rival.id })
  await wait(anim.current.noShakeTime * 1000)
}

/** "Your turn": the last player keeps all their seeds (the refresh step), play passes on — the next player's
 *  glyphlings start to breathe and the chime plays. Resolves after one breath. */
export async function yourTurnMoment(sounds: string[]) {
  await soundReady(sounds)
  await boardAt('refresh')
  useGameStore.getState().refresh(true) // Keep all: nothing shrinks or grows, play passes on at once
  await wait(anim.current.turnPulseTime * 1000)
}

// ─── The reveal moments ──────────────────────────────────────────────────────────────────────────────
// The reveal plays on by itself, step after step (Reveal.tsx). A moment starts it at its own step; the count-up is
// held before the winner (the store's setRevealAt is swapped, in this frame only, for one that won't go past it).
let realSetRevealAt: ((step: number | null) => void) | null = null

function holdRevealBefore(limit: number | null) {
  realSetRevealAt ??= useGameStore.getState().setRevealAt
  const real = realSetRevealAt
  useGameStore.setState({ setRevealAt: limit === null ? real : (step) => { if (step === null || step < limit) real(step) } })
}

const finished = new Map<string, SampleGame>() // a finished game per variant, played once per frame

/** The end-of-game reveal from `from`: 'count' (each player's Magic counts up, then the "+3" tangle bonuses — held
 *  before the winner) or 'winner' (Grand Glyphtender! — then the end table opens, as in the game). */
export async function revealMoment(from: 'count' | 'winner', variant: string | undefined, sounds: string[]) {
  await soundReady(sounds, true)
  const key = variant ?? '2p'
  let sample = finished.get(key)
  if (!sample) finished.set(key, (sample = await endGame(variant)))
  while (screens.current.length) screens.pop() // (the end table, from the last round)
  const steps = revealSteps(sample.game)
  const winner = steps.findIndex((s) => s.kind === 'winner')
  const first = from === 'count' ? steps.findIndex((s) => s.kind === 'count') : winner
  holdRevealBefore(from === 'count' ? winner : null)
  loadGame(sample)
  await frames() // (the game screen has drawn it — a new game sets the music back to calm: sound.ts useGardenSounds)
  // The garden's music, every round as the game would have it here: calm before the count-up; at its peak (where the
  // count-up left it) for the winner — then the reveal moves it (sound.ts ceremonyMusic). Never resting.
  const audio = getAudio()
  if (audio) {
    audio.playMusic('garden')
    if (['resting', 'fading'].includes(audio.musicState().phase)) audio.endMusicRest()
    audio.setMusicIntensity(from === 'count' ? anim.current.revealMusicCalm : anim.current.revealMusicPeak, { rampMs: 0 })
  }
  useGameStore.getState().setRevealAt(first)
  const seconds = steps.slice(first, from === 'count' ? winner : winner + 1).reduce((sum, step) => sum + stepSeconds(step, anim.current), 0)
  await wait(seconds * 1000)
}

// SOUND — the game's one audio engine (the framework Audio module in src/audio/), made once at start-up (main.tsx).
// Code never names a file: it says WHAT happened — playSound('seed.land') — at the moment the player SEES it (the
// animation's land / pop / end, never the raw event), and content/audio.json says what that sounds like.
// Where each sound plays: .planning/design/audio.md (the sound list). Rules that matter everywhere:
//   · bots and online rivals use the same code paths as a person, so they sound the same
//   · a jump (loading a game, an online rejoin / catch-up) is silent: catchingUp() → { catchUp: true }
//   · reduce motion: the sound still plays, at the instant the moment happens
// The Settings → Audio rows (content/ui/settings.json, the UI kit's standard ids) drive the volume groups: at start
// here, then live from src/ui/gameSettings.ts settingsChanged. The kit's buttons and switches play ui.tap / ui.back /
// ui.toggle.on / ui.toggle.off (UI kit setControlSound; menu sounds never vary — Muzzy 2026-10-10). Dev + Playwright: window.__audioLog (every play and drop, with why).
import { useEffect } from 'react'
import audioJson from '../../content/audio.json'
import { applyAudioSettings, createAudio, exposeLog, getAudio, seededRandom, setAudio, useLoop, useMusic, type PlayOptions } from '../audio'
import { onTuning } from '../devkit/tuning/liveTuning'
import { useGameStore } from '../store/gameStore'
import { reduceMotion, setControlSound, type SettingsValues } from '../ui/kit'
import { useAnimTuning, type AnimTuning } from './useTuning'

/** Make the engine (once). Nothing plays until the player's first tap — the engine unlocks itself then. */
export function startSound(settings: SettingsValues) {
  if (getAudio()) return
  const audio = createAudio(audioJson, {
    baseUrl: import.meta.env.BASE_URL, // (the game lives under /glyphtender/)
    // Its OWN dice for variants and random pitch: a sound never uses up the game's Math.random (?freeze screenshots
    // fix that sequence — a click's sound once shifted the tray's shuffle)
    rng: seededRandom(Date.now() >>> 0),
  })
  setAudio(audio)
  applyAudioSettings(audio, settings)
  setControlSound((kind) => audio.play(`ui.${kind}`)) // ui.tap · ui.back · ui.toggle.on · ui.toggle.off
  if (import.meta.env.DEV || navigator.webdriver) exposeLog(audio) // e2e tests read it; the console too
  onTuning('audio', (data) => audio.setConfig(data)) // a Dev Kit edit of content/audio.json applies at once
}

/** The screen JUMPED to this game (a new game, a load, an online rejoin or catch-up) — nothing "just happened", so
 *  anything that appears now is old news: silent (the framework's catch-up rule). */
export const catchingUp = () => useGameStore.getState().happened === null

/** Options for a sound that marks something appearing on the board: silent when the screen just jumped here. */
export const appearing = (options: PlayOptions = {}): PlayOptions => ({ ...options, catchUp: catchingUp() })

/** The game screen's bed: the night garden (amb.night) loops, and the garden's music (content/audio.json
 *  music.tracks.garden — the harp piece, a soft pad, and bells that only come in at high intensity) plays, rests with
 *  just the night garden for a while, then comes back (the audio module runs the rests). Leaving the game crossfades to
 *  the menus' track (App.tsx). Each new game starts the music at its calm intensity (anim.json revealMusicCalm). */
export function useGardenSounds() {
  const audio = getAudio()
  useLoop(audio, 'amb.night', 1200)
  useMusic(audio, 'garden')
  const calm = useAnimTuning().revealMusicCalm
  const options = useGameStore((s) => s.options) // (a new game always brings new options — a rematch too)
  useEffect(() => {
    audio?.setMusicIntensity(calm, { rampMs: 0 })
  }, [audio, options, calm])
}

type CeremonyTuning = Pick<AnimTuning, 'revealMusicCalm' | 'revealMusicPeak' | 'revealMusicSettle' | 'revealCount'>

/** THE REVEAL'S MUSIC (the ceremony, Reveal.tsx): each player's count-up raises the music's intensity a step, ramping
 *  over that count, so the bells fade in — count `count` of `of` reaches calm + (peak − calm) × count / of, the last
 *  one the peak. It holds through the "+3"s and the fanfare (reveal.winner ducks the music by itself: "duck": true),
 *  then 'settle' (the end table opens) brings it back to calm over revealMusicSettle. If the music is resting when the
 *  ceremony needs it, it comes back now. Reduce motion: the same changes, at once. Values: content/tuning/anim.json. */
export function ceremonyMusic(stage: { count: number; of: number } | 'settle', tuning: CeremonyTuning) {
  const audio = getAudio()
  if (!audio) return
  const quick = reduceMotion()
  if (stage === 'settle') {
    audio.setMusicIntensity(tuning.revealMusicCalm, { rampMs: quick ? 0 : tuning.revealMusicSettle * 1000 })
    return
  }
  const phase = audio.musicState().phase
  if (phase === 'resting' || phase === 'fading') audio.endMusicRest() // (the ceremony always has its music)
  const target = tuning.revealMusicCalm + (tuning.revealMusicPeak - tuning.revealMusicCalm) * Math.min(1, stage.count / Math.max(1, stage.of))
  audio.setMusicIntensity(target, { rampMs: quick ? 0 : tuning.revealCount * 1000 })
}

// SOUND — the game's one audio engine (the framework Audio module in src/audio/), made once at start-up (main.tsx).
// Code never names a file: it says WHAT happened — playSound('seed.land') — at the moment the player SEES it (the
// animation's land / pop / end, never the raw event), and content/audio.json says what that sounds like.
// Where each sound plays: .planning/design/audio.md (the sound list). Rules that matter everywhere:
//   · bots and online rivals use the same code paths as a person, so they sound the same
//   · a jump (loading a game, an online rejoin / catch-up) is silent: catchingUp() → { catchUp: true }
//   · reduce motion: the sound still plays, at the instant the moment happens
// The Settings → Audio rows (content/ui/settings.json, the UI kit's standard ids) drive the volume groups: at start
// here, then live from src/ui/gameSettings.ts settingsChanged. The kit's buttons and switches play ui.tap / ui.back /
// ui.toggle (UI kit setControlSound). Dev + Playwright: window.__audioLog (every play and drop, with why).
import { useEffect } from 'react'
import audioJson from '../../content/audio.json'
import { applyAudioSettings, createAudio, exposeLog, getAudio, setAudio, useLoop, type PlayOptions } from '../audio'
import { onTuning } from '../devkit/tuning/liveTuning'
import { useGameStore } from '../store/gameStore'
import { setControlSound, type SettingsValues } from '../ui/kit'

/** Make the engine (once). Nothing plays until the player's first tap — the engine unlocks itself then. */
export function startSound(settings: SettingsValues) {
  if (getAudio()) return
  const audio = createAudio(audioJson, { baseUrl: import.meta.env.BASE_URL }) // (the game lives under /glyphtender/)
  setAudio(audio)
  applyAudioSettings(audio, settings)
  setControlSound((kind) => audio.play(`ui.${kind}`)) // ui.tap · ui.back · ui.toggle
  if (import.meta.env.DEV || navigator.webdriver) exposeLog(audio) // e2e tests read it; the console too
  onTuning('audio', (data) => audio.setConfig(data)) // a Dev Kit edit of content/audio.json applies at once
}

/** The screen JUMPED to this game (a new game, a load, an online rejoin or catch-up) — nothing "just happened", so
 *  anything that appears now is old news: silent (the framework's catch-up rule). */
export const catchingUp = () => useGameStore.getState().happened === null

/** Options for a sound that marks something appearing on the board: silent when the screen just jumped here. */
export const appearing = (options: PlayOptions = {}): PlayOptions => ({ ...options, catchUp: catchingUp() })

/** The game screen's bed: the night garden (amb.night) loops; the harp (mus.garden) plays ONCE near the start of each
 *  game (it has an ending — then the garden rests; F58 adds layers and rests). Both fade out when the game is left. */
export function useGardenSounds() {
  const audio = getAudio()
  useLoop(audio, 'amb.night', 1200)
  const options = useGameStore((s) => s.options) // (a new game always brings new options — a rematch too)
  useEffect(() => {
    if (!audio) return
    let left = false
    // Music isn't preloaded with the effects (it's big): load it, then play — unless the game was left meanwhile
    void audio.preload(['mus.garden']).then(() => {
      if (!left) audio.play('mus.garden')
    })
    return () => {
      left = true
      audio.stop('mus.garden', { fadeMs: 1200 })
    }
  }, [audio, options])
}

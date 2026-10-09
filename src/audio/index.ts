// THE AUDIO MODULE — public API. A game imports from here (src/audio/index.ts after install).
//
//   import audioJson from '../content/audio.json'
//   import { createAudio, setAudio, playSound, exposeLog } from './audio'
//   const audio = createAudio(audioJson, { baseUrl: import.meta.env.BASE_URL })
//   setAudio(audio)                          // so playSound works anywhere
//   if (import.meta.env.DEV) exposeLog(audio) // window.__audioLog for e2e tests and the console
//   …
//   playSound('seed.land')                   // at the animation's moment, not when the event arrives
//   playSound('score.pop', { at: popTime })  // scheduled sequences hand over their times
export { createAudio, type Audio, type AudioOptions, type BusOrMaster } from './engine.ts'
export {
  readAudioConfig, DEFAULT_CONFIG, DEFAULT_SOUND, SOUND_RANGES, SCALES, BUSES, PICK_MODES,
  dbToGain, semitonesToRate, sliderToGain,
  type AudioConfig, type SoundConfig, type BusName, type PickMode, type Tier, type LadderConfig, type SnapshotConfig, type ScaleName,
} from './config.ts'
export { planPlay, seededRandom, ladderSemitones, freshMemory, type PlayOptions, type PlayPlan, type Drop, type DropReason, type EngineState, type ActiveVoice } from './planner.ts'
export { createLog, exposeLog, type AudioLog, type LogEntry } from './log.ts'
export { setAudio, getAudio, playSound, playTier } from './shared.ts'
export { audioUrl } from './loader.ts'
export { DEFAULT_AUDIO_SETTINGS, applyAudioSettings, readAudioSettings, type AudioSettings } from './settings.ts'
export { useAudioSettings, useAudioSnapshot, useLoop } from './react.ts'

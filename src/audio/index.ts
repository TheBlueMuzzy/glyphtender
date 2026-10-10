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
//   audio.playMusic('garden') · audio.setMusicIntensity(0.8) · useMusic(audio, 'menu')   // music tracks (music.ts)
export { createAudio, type Audio, type AudioOptions, type BusOrMaster } from './engine.ts'
export {
  readAudioConfig, DEFAULT_CONFIG, DEFAULT_SOUND, DEFAULT_TRACK, DEFAULT_LAYER, SOUND_RANGES, TRACK_RANGES, LAYER_RANGES, SCALES, BUSES, PICK_MODES, STREAM_MODES,
  dbToGain, semitonesToRate, sliderToGain,
  type AudioConfig, type SoundConfig, type BusName, type PickMode, type Tier, type LadderConfig, type SnapshotConfig, type ScaleName,
  type StreamMode, type MusicConfig, type MusicTrackConfig, type MusicLayerConfig,
} from './config.ts'
export { layerLevel, restLengthMs, type MusicState, type MusicPhase } from './music.ts'
export { planPlay, seededRandom, ladderSemitones, freshMemory, soundStreams, type PlayOptions, type PlayPlan, type Drop, type DropReason, type EngineState, type ActiveVoice } from './planner.ts'
export { createLog, exposeLog, type AudioLog, type LogEntry, type MusicEvent } from './log.ts'
export { setAudio, getAudio, playSound, playTier } from './shared.ts'
export { audioUrl } from './loader.ts'
export { DEFAULT_AUDIO_SETTINGS, applyAudioSettings, readAudioSettings, type AudioSettings } from './settings.ts'
export { useAudioSettings, useAudioSnapshot, useLoop, useMusic } from './react.ts'

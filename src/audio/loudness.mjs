// HOW LOUD IS A SOUND FILE? — the audio module's one loudness matcher (framework F31). Plain Node, no packages.
// Used by audio-check.mjs (npm run audio:check), the check:framework audio warning (conformance.mjs) and the
// Dev Kit's Sound tab drop (it loads this file from the game's src/audio/).
//
// What it measures, per file (design: framework/.planning/design/audio.md "Loudness"):
//   loudnessDb  how loud it sounds —
//                 effects, menus, stingers (sfx · ui · stg): the "active loudness" (Goops F29): the average power of
//                   the 20 ms slices within 20 dB of the loudest slice. Short sounds are mostly silence and one hit,
//                   so a plain average (or LUFS, which needs 400 ms blocks) reads a click as far too quiet.
//                 music + ambience (mus · amb): LUFS (EBU R128 / ITU BS.1770) — the broadcast and games standard,
//                   made for long sounds: K-weighted (like the ear), 400 ms blocks, quiet blocks left out.
//   peakDb      the loudest single sample (dBFS, 0 = the most a file can hold)
//   onsetMs     where the sound really starts: the first sample at 10 % of the peak (Glyphtender B026)
//   lengthMs    how long the file is
// Then: evening it out — the onset trim for effects and menus, the gain that brings it to its folder's target, and a
// fast limiter so the spikes stay under the ceiling — done on the samples here, then written back with ffmpeg.
//
// The pure parts (measuring samples, the verdict, the gain) are tested with made-up samples. Reading and writing files
// uses the computer's own ffmpeg (or FFMPEG_PATH) — never a bundled copy.
import { execFile, spawn, spawnSync } from 'node:child_process'

// ---------- the settings (content/audio.json "loudness") ----------

/** The sound folders under public/audio/ */
export const FOLDERS = ['sfx', 'ui', 'stg', 'amb', 'mus']
/** Music and ambience: long, measured in LUFS, never trimmed. The rest: short, active loudness, trimmed to the onset. */
export const isLongFolder = (folder) => folder === 'mus' || folder === 'amb'

/**
 * The defaults when content/audio.json has no "loudness" block. Every file is brought to the SAME level (-18): the
 * files are even, and the mix (menus under effects, music under both) is done by the volume groups ("buses").
 */
export const DEFAULT_LOUDNESS = {
  targets: { sfx: -18, ui: -18, stg: -18, amb: -18, mus: -18 },
  toleranceDb: 3, // further off than this = flagged
  ceilingDb: -1, // no sample louder than this (the games / broadcast standard is -1)
  lateMs: 20, // an effect or menu sound that starts later than this = flagged
  maxLimitingDb: 3.5, // how much of a spike the limiter may shave (Goops F29); a spikier file ends a little under target
}

/** The limiter sits this far under the ceiling: an MP3 can come out a little hotter than what went in */
export const LIMITER_MARGIN_DB = 0.5
/** The onset trim keeps this much before the onset, then fades in over ONSET_FADE_MS (the same rule as the Dev Kit drop) */
export const ONSET_LEAD_MS = 4
export const ONSET_FADE_MS = 3

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * content/audio.json → the loudness settings (defaults for anything missing). A bad value is named in `warnings`
 * and the default is used. `audioJson` may be null (no file).
 */
export function readLoudness(audioJson) {
  const settings = structuredClone(DEFAULT_LOUDNESS)
  const warnings = []
  const raw = audioJson && typeof audioJson === 'object' ? audioJson.loudness : undefined
  if (raw === undefined) return { settings, warnings }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push('loudness should be an object like { "targets": { "sfx": -18 } } — using the defaults.')
    return { settings, warnings }
  }
  const number = (value, where, min, max, fallback) => {
    if (value === undefined) return fallback
    if (!isNumber(value) || value < min || value > max) {
      warnings.push(`${where} should be a number from ${min} to ${max} (got ${JSON.stringify(value)}) — using ${fallback}.`)
      return fallback
    }
    return value
  }
  if (raw.targets !== undefined) {
    if (typeof raw.targets !== 'object' || raw.targets === null) warnings.push('loudness.targets should be an object like { "sfx": -18 } — using the defaults.')
    else {
      for (const folder of FOLDERS) settings.targets[folder] = number(raw.targets[folder], `loudness.targets.${folder}`, -40, 0, settings.targets[folder])
      for (const key of Object.keys(raw.targets)) if (!FOLDERS.includes(key)) warnings.push(`loudness.targets.${key} is not a sound folder (${FOLDERS.join(' · ')}) — ignored.`)
    }
  }
  settings.toleranceDb = number(raw.toleranceDb, 'loudness.toleranceDb', 0.5, 12, settings.toleranceDb)
  settings.ceilingDb = number(raw.ceilingDb, 'loudness.ceilingDb', -12, 0, settings.ceilingDb)
  settings.lateMs = number(raw.lateMs, 'loudness.lateMs', 0, 500, settings.lateMs)
  settings.maxLimitingDb = number(raw.maxLimitingDb, 'loudness.maxLimitingDb', 0, 12, settings.maxLimitingDb)
  return { settings, warnings }
}

// ---------- measuring (pure: samples in, numbers out) ----------

/** Linear level → dB (silence = -Infinity) */
export const toDb = (x) => 20 * Math.log10(x)
/** dB → linear level */
export const fromDb = (db) => 10 ** (db / 20)

/** The loudest sample, as a level (0…1+) */
export function peakOf(samples) {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  return peak
}

/** Where the sound really starts, in ms: the first sample at 10 % of the peak. Silence → 0. */
export function onsetMsOf(samples, sampleRate) {
  const threshold = peakOf(samples) * 0.1
  if (threshold === 0) return 0
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= threshold) return (i / sampleRate) * 1000
  return 0
}

/**
 * Active loudness (dB) of a short sound (Goops F29): split it into 20 ms slices, keep the slices within 20 dB of the
 * loudest one, and average their power. The silence around a hit doesn't drag it down. Silence → -Infinity.
 */
export function activeDbOf(samples, sampleRate) {
  const size = Math.max(1, Math.floor(0.02 * sampleRate))
  const powers = []
  for (let start = 0; start < samples.length; start += size) {
    let sum = 0
    const end = Math.min(start + size, samples.length)
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    powers.push(sum / (end - start))
  }
  const loudest = Math.max(0, ...powers)
  if (loudest === 0) return -Infinity
  const active = powers.filter((p) => p > loudest / 100) // 20 dB = a power 100 times smaller
  return 10 * Math.log10(active.reduce((a, p) => a + p, 0) / active.length)
}

// The ear's weighting for LUFS (ITU BS.1770 "K-weighting"): a gentle lift of the highs, a cut of the deep lows.
// Two filters, worked out for any sample rate from the standard's own design values (as libebur128 does — at 48 kHz
// they give exactly the coefficients printed in BS.1770).
function kWeightingFilters(sampleRate) {
  // 1. high shelf: +4 dB above ~1.7 kHz (the head's effect)
  let K = Math.tan((Math.PI * 1681.974450955533) / sampleRate)
  let Q = 0.7071752369554196
  const Vh = 10 ** (3.999843853973347 / 20)
  const Vb = Vh ** 0.4996667741545416
  let a0 = 1 + K / Q + K * K
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  }
  // 2. high pass: the rumble below ~40 Hz barely counts
  K = Math.tan((Math.PI * 38.13547087602444) / sampleRate)
  Q = 0.5003270373238773
  a0 = 1 + K / Q + K * K
  const pass = { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] }
  return [shelf, pass]
}

function applyFilter(samples, { b, a }) {
  const out = new Float32Array(samples.length)
  const [b0, b1, b2] = b
  const [, a1, a2] = a
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y
    x2 = x1; x1 = x; y2 = y1; y1 = y
  }
  return out
}

/**
 * Integrated loudness (LUFS, ITU BS.1770 / EBU R128) of one or more channels (stereo = [left, right]).
 * 400 ms blocks every 100 ms; blocks quieter than -70 LUFS, then those 10 LU under the average, are left out.
 * A file shorter than one block is measured as one block. Silence → -Infinity.
 */
export function lufsOf(channels, sampleRate) {
  const weighted = channels.map((ch) => kWeightingFilters(sampleRate).reduce(applyFilter, ch))
  const length = channels[0]?.length ?? 0
  const block = Math.min(length, Math.round(0.4 * sampleRate))
  const step = Math.max(1, Math.round(0.1 * sampleRate))
  if (block === 0) return -Infinity
  const powers = []
  for (let start = 0; start + block <= length; start += step) {
    let sum = 0
    for (const ch of weighted) for (let i = start; i < start + block; i++) sum += ch[i] * ch[i]
    powers.push(sum / block)
  }
  const loudness = (p) => -0.691 + 10 * Math.log10(p)
  const mean = (list) => list.reduce((a, p) => a + p, 0) / list.length
  const loudEnough = powers.filter((p) => loudness(p) > -70)
  if (!loudEnough.length) return -Infinity
  const relativeGate = loudness(mean(loudEnough)) - 10
  const kept = loudEnough.filter((p) => loudness(p) > relativeGate)
  return loudness(mean(kept))
}

/**
 * Measures one sound. `channels`: its samples (one Float32Array per channel). `folder` picks the method.
 * → { loudnessDb, method: 'active' | 'lufs', peakDb, onsetMs, lengthMs }
 */
export function measure(channels, sampleRate, folder) {
  const long = isLongFolder(folder)
  const first = channels[0] ?? new Float32Array(0)
  const peak = Math.max(0, ...channels.map(peakOf))
  return {
    loudnessDb: long ? lufsOf(channels, sampleRate) : activeDbOf(first, sampleRate),
    method: long ? 'lufs' : 'active',
    peakDb: toDb(peak),
    onsetMs: onsetMsOf(first, sampleRate),
    lengthMs: (first.length / sampleRate) * 1000,
  }
}

// ---------- the verdict and the fix (pure) ----------

/**
 * How to bring a measured sound to its target: { gainDb, trimMs, peakLimited }.
 *   gainDb: target - loudness, but never pushing a spike more than settings.maxLimitingDb into the limiter
 *           (peakLimited = true when that cap made it less than the full way)
 *   trimMs: effects + menus only: cut the silence before the onset (keeping ONSET_LEAD_MS)
 * fixedBefore: the file was already evened out once (its original is kept in audio-originals/). Its spikes were
 *   already shaved, so it gets no more limiting: shaving again on every run would squash it a little more each time.
 */
export function planFix(measured, folder, settings, { fixedBefore = false } = {}) {
  if (!isNumber(measured.loudnessDb)) return { gainDb: 0, trimMs: 0, peakLimited: false } // silence: nothing to do
  const wanted = settings.targets[folder] - measured.loudnessDb
  const limiterDb = settings.ceilingDb - LIMITER_MARGIN_DB
  const mostAllowed = limiterDb + (fixedBefore ? 0 : settings.maxLimitingDb) - measured.peakDb
  const gainDb = Math.min(wanted, mostAllowed)
  const trimMs = isLongFolder(folder) ? 0 : Math.max(0, measured.onsetMs - ONSET_LEAD_MS)
  return { gainDb, trimMs, peakLimited: gainDb < wanted - 0.05 }
}

const dB = (x) => `${Math.abs(x).toFixed(1)} dB`

/**
 * Is it fine? → { ok, problems: ['3.5 dB too quiet', 'starts 60 ms late', …], note }
 * A file that's quiet only because its spikes stop it going louder (the fix can't raise it by even 1 dB) is fine,
 * with a note — otherwise it would be flagged forever. `options` as planFix ({ fixedBefore }).
 */
export function judge(measured, folder, settings, options = {}) {
  const problems = []
  let note = ''
  if (!isNumber(measured.loudnessDb)) return { ok: false, problems: ['silent'], note }
  const off = measured.loudnessDb - settings.targets[folder]
  if (Math.abs(off) >= settings.toleranceDb + 0.05) { // a file shown as "3.0 dB" off is within 3 dB
    const { gainDb, peakLimited } = planFix(measured, folder, settings, options)
    if (off < 0 && peakLimited && gainDb < 1) note = `${dB(off)} under target: as loud as its spikes allow`
    else problems.push(`${dB(off)} too ${off < 0 ? 'quiet' : 'loud'}`)
  }
  if (measured.peakDb > settings.ceilingDb + 0.05) problems.push(`peaks ${dB(measured.peakDb - settings.ceilingDb)} over ${settings.ceilingDb} dB`)
  if (!isLongFolder(folder) && measured.onsetMs > settings.lateMs) problems.push(`starts ${Math.round(measured.onsetMs)} ms late`)
  return { ok: problems.length === 0, problems, note }
}

// ---------- evening a sound out (pure: samples in, samples out) ----------
// Done here on the samples, not with ffmpeg's own limiter: on a 50 ms click ffmpeg's alimiter (40 ms release) turned
// the WHOLE sound down, so a "fixed" file came out quieter than before (found on Goops' tank spin, F31).

/** Cuts `ms` off the start, then fades in over ONSET_FADE_MS so the cut doesn't click. New arrays. */
export function trimStart(channels, sampleRate, ms) {
  const cut = Math.min(Math.round((ms / 1000) * sampleRate), channels[0]?.length ?? 0)
  const fade = Math.round((ONSET_FADE_MS / 1000) * sampleRate)
  return channels.map((ch) => {
    const out = ch.slice(cut)
    for (let i = 0; i < fade && i < out.length; i++) out[i] *= i / fade
    return out
  })
}

/** Every sample × the gain (dB). New arrays. */
export function applyGain(channels, gainDb) {
  const g = fromDb(gainDb)
  return channels.map((ch) => ch.map((s) => s * g))
}

/**
 * A fast "look-ahead" limiter: no sample comes out louder than `limitDb`. Around a spike the volume dips smoothly
 * (down over 1 ms just before it, back up over ~10 ms after), so only the spike is shaved — the rest of a short click
 * keeps its level. All channels dip together (stereo stays put). New arrays.
 */
export function limitPeaks(channels, sampleRate, limitDb) {
  const limit = fromDb(limitDb)
  const length = channels[0]?.length ?? 0
  const ahead = Math.max(1, Math.round(0.001 * sampleRate)) // 1 ms
  const release = 1 - Math.exp(-1 / (0.01 * sampleRate)) // ~10 ms back up
  // 1. the gain each sample needs on its own
  const need = new Float32Array(length).fill(1)
  for (const ch of channels) for (let i = 0; i < length; i++) {
    const a = Math.abs(ch[i])
    if (a > limit) need[i] = Math.min(need[i], limit / a)
  }
  if (need.every((n) => n === 1)) return channels.map((ch) => ch.slice()) // nothing over the limit: nothing to do
  // 2. look ahead: the lowest need in the next 2 ms (a min-hold), then a 1 ms average to smooth the dip —
  //    the average of a 2-wide hold over 1 ms is never above what the spike itself needs
  //    (the lowest in a sliding window, kept in a queue so a 3-minute song takes a moment, not minutes)
  const held = new Float32Array(length)
  const window = 2 * ahead
  const queue = new Int32Array(length) // sample numbers whose need is rising from front to back
  let front = 0, back = 0
  for (let j = length - 1; j >= 0; j--) { // walk backwards: the window is [j, j + window)
    while (back > front && need[queue[back - 1]] >= need[j]) back--
    queue[back++] = j
    while (queue[front] >= j + window) front++
    held[j] = need[queue[front]]
  }
  const gain = new Float32Array(length)
  let sum = ahead // the 1 ms before the start counts as "no dip"
  for (let i = 0; i < length; i++) {
    sum += held[i] - (i >= ahead ? held[i - ahead] : 1)
    gain[i] = sum / ahead
  }
  // 3. down at once, back up slowly
  for (let i = 1; i < length; i++) gain[i] = Math.min(gain[i], gain[i - 1] + (1 - gain[i - 1]) * release)
  // hard safety: never above the limit, whatever the rounding
  return channels.map((ch) => ch.map((s, i) => Math.max(-limit, Math.min(limit, s * gain[i]))))
}

/**
 * Brings samples to the folder's target: trim to the onset (effects + menus), then the gain, then the limiter.
 * The gain is searched so the result really lands on target (limiting takes a little loudness away), but never pushes
 * a spike more than settings.maxLimitingDb over the limiter (none at all when fixedBefore — see planFix).
 * → { channels, before, after, gainDb, trimMs, peakLimited }
 */
export function levelSamples(channels, sampleRate, folder, settings, { fixedBefore = false, trimMs, limitDb } = {}) {
  const before = measure(channels, sampleRate, folder)
  const plan = planFix(before, folder, settings, { fixedBefore })
  const trim = trimMs ?? plan.trimMs
  const trimmed = trim > 0 ? trimStart(channels, sampleRate, trim) : channels
  if (!isNumber(before.loudnessDb)) return { channels: trimmed, before, after: measure(trimmed, sampleRate, folder), gainDb: 0, trimMs: trim, peakLimited: false }
  const limiterDb = limitDb ?? settings.ceilingDb - LIMITER_MARGIN_DB
  const target = settings.targets[folder]
  const at = (gainDb) => {
    const out = limitPeaks(applyGain(trimmed, gainDb), sampleRate, limiterDb)
    return { out, m: measure(out, sampleRate, folder), gainDb }
  }
  const wanted = target - before.loudnessDb
  const most = limiterDb + (fixedBefore ? 0 : settings.maxLimitingDb) - before.peakDb
  let best = at(Math.min(wanted, most))
  // the limiter took some loudness: raise the gain (up to the cap) until it lands on target — halving the gap 10 times
  if (best.m.loudnessDb < target - 0.1 && best.gainDb < most) {
    let low = best.gainDb, high = most
    const top = at(high)
    if (top.m.loudnessDb <= target) best = top
    else for (let step = 0; step < 10; step++) {
      const middle = at((low + high) / 2)
      if (middle.m.loudnessDb < target) low = middle.gainDb
      else high = middle.gainDb
      if (Math.abs(middle.m.loudnessDb - target) < Math.abs(best.m.loudnessDb - target)) best = middle
    }
  }
  return { channels: best.out, before, after: best.m, gainDb: best.gainDb, trimMs: trim, peakLimited: best.m.loudnessDb < target - 0.5 }
}

/**
 * ffmpeg's settings to write samples (44.1 kHz floats on its input) to `output`. MP3s get the module's usual
 * encoding: effects + menus mono 96 kbps, music + ambience stereo 128 kbps. Other types: ffmpeg's own choice.
 */
export function encodeArgs(output, channelCount, folder) {
  const long = isLongFolder(folder)
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', String(channelCount), '-i', '-',
    ...(/\.mp3$/i.test(output) ? ['-c:a', 'libmp3lame', '-b:a', long ? '128k' : '96k'] : []),
    output,
  ]
}

// ---------- files (need ffmpeg) ----------

export const FFMPEG_MISSING = 'ffmpeg is not installed (it reads and writes the sound files). Install it — Windows: winget install Gyan.FFmpeg · Mac: brew install ffmpeg — then open a new terminal.'

/** The ffmpeg to run: FFMPEG_PATH, else `ffmpeg` on the PATH. null = not installed. (Same rule as the Dev Kit's drop.) */
export function findFfmpeg(env = process.env.FFMPEG_PATH) {
  const command = env && env.trim() ? env.trim() : 'ffmpeg'
  const probe = spawnSync(command, ['-version'], { stdio: 'ignore', windowsHide: true })
  return probe.error || probe.status !== 0 ? null : command
}

/** Runs ffmpeg; resolves with what it printed, or fails with its last error line. */
export function runFfmpeg(ffmpeg, args) {
  return new Promise((done, fail) => {
    execFile(ffmpeg, args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) fail(new Error(`ffmpeg couldn't read that file: ${stderr.toString().trim().split('\n').pop() || error.message}`))
      else done(stdout)
    })
  })
}

export const SAMPLE_RATE = 44100

/** Decodes a file to 44.1 kHz float samples, one Float32Array per channel (mono for effects, stereo for music). */
export async function decode(ffmpeg, file, channelCount) {
  const raw = await runFfmpeg(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', String(channelCount), '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'])
  const copy = new Uint8Array(raw.byteLength)
  copy.set(raw)
  const all = new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4))
  const frames = Math.floor(all.length / channelCount)
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames))
  for (let i = 0; i < frames; i++) for (let c = 0; c < channelCount; c++) channels[c][i] = all[i * channelCount + c]
  return channels
}

/** Reads and measures a sound file (see measure). */
export async function measureFile(ffmpeg, file, folder) {
  return measure(await decode(ffmpeg, file, isLongFolder(folder) ? 2 : 1), SAMPLE_RATE, folder)
}

/** Writes samples (one Float32Array per channel, 44.1 kHz) to a sound file with ffmpeg (see encodeArgs). */
export function encode(ffmpeg, channels, output, folder) {
  const frames = channels[0]?.length ?? 0
  const interleaved = new Float32Array(frames * channels.length)
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels.length; c++) interleaved[i * channels.length + c] = channels[c][i]
  return new Promise((done, fail) => {
    const child = spawn(ffmpeg, encodeArgs(output, channels.length, folder), { windowsHide: true })
    let errors = ''
    child.stderr.on('data', (chunk) => (errors += chunk))
    child.on('error', fail)
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg couldn't write ${output}: ${errors.trim().split('\n').pop()}`))))
    child.stdin.on('error', () => { /* ffmpeg stopped early: its own error comes through 'close' */ })
    child.stdin.end(Buffer.from(interleaved.buffer))
  })
}

/**
 * Evens out one file: reads `input`, levels it (levelSamples), writes `output`, and measures what was written.
 * An MP3 can come out a little hotter than its samples; if the written file peaks over the ceiling, it is made again
 * once with the limiter lowered by that much. → { before, after, gainDb, trimMs, peakLimited }
 * `options`: { fixedBefore, trimMs } (trimMs: how much to cut — default: to the onset, effects + menus only).
 */
export async function levelFile(ffmpeg, input, output, folder, settings, options = {}) {
  const channels = await decode(ffmpeg, input, isLongFolder(folder) ? 2 : 1)
  let limitDb = settings.ceilingDb - LIMITER_MARGIN_DB
  let result
  for (let attempt = 0; attempt < 2; attempt++) {
    result = levelSamples(channels, SAMPLE_RATE, folder, settings, { ...options, limitDb })
    await encode(ffmpeg, result.channels, output, folder)
    const written = await measureFile(ffmpeg, output, folder)
    result = { ...result, after: written }
    if (written.peakDb <= settings.ceilingDb + 0.05) break
    limitDb -= written.peakDb - settings.ceilingDb + 0.1
  }
  const { before, after, gainDb, trimMs, peakLimited } = result
  return { before, after, gainDb, trimMs, peakLimited }
}

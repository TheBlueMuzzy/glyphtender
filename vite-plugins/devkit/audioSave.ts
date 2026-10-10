// SAVING SOUND FILES FROM THE DEV KIT — the Sound tab's "drop a file in" (framework F30). Dev server only.
// Used by devkitVite.ts, which adds two endpoints next to the JSON Save:
//
//   POST /__devkit/save-audio?folder=sfx&stem=sfx_seed_land&bus=sfx&ext=wav     body: the file's raw bytes
//     → { ok: true, path: "sfx/sfx_seed_land_03.mp3", file: "public/audio/sfx/sfx_seed_land_03.mp3", trimmedMs: 42 }
//     Safety: writes ONLY public/audio/<folder>/<stem>_<NN>.mp3 — folder one of sfx · ui · amb · mus · stg, the stem
//     named like category_object_action (lower case, the category = the folder), NN the next free number (never
//     overwrites). Anything else is refused.
//     Any common file (wav · ogg · m4a · flac · mp3 · aac · webm · opus) is converted to MP3 with ffmpeg:
//       effects + menu sounds (bus sfx / ui): mono 96 kbps, and the start trimmed to its onset (first sample at
//         10 % of the peak, minus 4 ms, then a 3 ms fade-in) — Glyphtender B026: tap sounds with 40–90 ms of quiet
//         at the front felt "really delayed".
//       music + ambience: stereo 128 kbps, untouched (their quiet starts are on purpose).
//   POST /__devkit/add-credit   body: { "entry": { paths, source, author, licence, light, url, credit } }
//     → appends the entry to content/credits.json (a list; made if missing).
//
// ffmpeg: the system's `ffmpeg` (or the FFMPEG_PATH environment variable). Missing → a clear message:
//   "install ffmpeg: winget install Gyan.FFmpeg" (Mac: brew install ffmpeg).
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

export const SAVE_AUDIO_URL = '/__devkit/save-audio'
export const ADD_CREDIT_URL = '/__devkit/add-credit'

/** The folders under public/audio/ a sound may be saved in (design: framework/.planning/design/audio.md) */
export const AUDIO_FOLDERS = ['sfx', 'ui', 'amb', 'mus', 'stg'] as const
export type AudioFolder = (typeof AUDIO_FOLDERS)[number]

/** File types the Dev Kit takes in (all converted to MP3) */
export const INPUT_TYPES = ['wav', 'ogg', 'oga', 'm4a', 'flac', 'mp3', 'aac', 'webm', 'opus', 'aif', 'aiff']

/** The biggest file accepted (bytes) — a long music track in WAV fits */
export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024

export const FFMPEG_MISSING = 'ffmpeg is not installed (it converts sounds to MP3). Install it — Windows: winget install Gyan.FFmpeg · Mac: brew install ffmpeg — then restart npm run dev.'

/** The onset rule (B026): first sample at this share of the loudest one… */
export const ONSET_SHARE = 0.1
/** …minus this much, so the very start of the attack stays… */
export const ONSET_LEAD_SEC = 0.004
/** …and a fade-in this short, so the cut doesn't click */
export const ONSET_FADE_SEC = 0.003

const BUS_NAMES = ['music', 'ambience', 'sfx', 'ui'] as const
export type Bus = (typeof BUS_NAMES)[number]

/** Music and ambience: stereo, gentler compression, start left alone. Effects + menu sounds: mono, trimmed. */
export const isLongBus = (bus: Bus) => bus === 'music' || bus === 'ambience'

export type AudioTarget = { folder: AudioFolder; stem: string; bus: Bus; ext: string }

/**
 * Checks a save request's settings. Returns the target, or a plain-English reason it's refused.
 * The stem is "category_object_action" (2–6 parts of a–z / 0–9) and must start with its folder: sfx_seed_land in sfx/.
 */
export function readAudioTarget(params: { folder?: unknown; stem?: unknown; bus?: unknown; ext?: unknown }): AudioTarget | string {
  const { folder, stem, bus, ext } = params
  if (typeof folder !== 'string' || !(AUDIO_FOLDERS as readonly string[]).includes(folder)) {
    return `folder must be one of ${AUDIO_FOLDERS.join(' · ')} (got ${JSON.stringify(folder)})`
  }
  if (typeof stem !== 'string' || !/^[a-z0-9]+(?:_[a-z0-9]+){1,5}$/.test(stem)) {
    return `the name must look like category_object_action, lower case (got ${JSON.stringify(stem)})`
  }
  if (!stem.startsWith(`${folder}_`)) return `a file in ${folder}/ must be named ${folder}_… (got ${stem})`
  if (typeof bus !== 'string' || !(BUS_NAMES as readonly string[]).includes(bus)) {
    return `bus must be one of ${BUS_NAMES.join(' · ')} (got ${JSON.stringify(bus)})`
  }
  const type = typeof ext === 'string' ? ext.toLowerCase().replace(/^\./, '') : ''
  if (!INPUT_TYPES.includes(type)) return `that file type can't be read (${JSON.stringify(ext)}) — use ${INPUT_TYPES.join(', ')}`
  return { folder: folder as AudioFolder, stem, bus: bus as Bus, ext: type }
}

/** The next free name: ["sfx_pop_01.mp3", "sfx_pop_03.mp3"] + "sfx_pop" → "sfx_pop_04.mp3". Never reuses a number. */
export function nextFileName(existing: string[], stem: string): string {
  let highest = 0
  for (const name of existing) {
    const found = name.match(/^(.+)_(\d{2,})\.mp3$/)
    if (found && found[1] === stem) highest = Math.max(highest, Number(found[2]))
  }
  return `${stem}_${String(highest + 1).padStart(2, '0')}.mp3`
}

/**
 * Where the sound really starts (seconds): the first sample at ONSET_SHARE of the loudest, minus ONSET_LEAD_SEC.
 * Silence (or an empty file) → 0.
 */
export function findOnsetSec(samples: Float32Array, sampleRate: number): number {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  if (peak === 0) return 0
  const threshold = peak * ONSET_SHARE
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) return Math.max(0, i / sampleRate - ONSET_LEAD_SEC)
  }
  return 0
}

/** ffmpeg's settings for the MP3: effects + menu sounds mono 96 kbps (trimmed from `startSec`), music + ambience stereo 128 kbps. */
export function encodeArgs(input: string, output: string, bus: Bus, startSec: number): string[] {
  const long = isLongBus(bus)
  const filters = !long && startSec > 0
    ? ['-af', `atrim=start=${startSec.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${ONSET_FADE_SEC}`]
    : !long ? ['-af', `afade=t=in:st=0:d=${ONSET_FADE_SEC}`] : []
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-vn', '-map_metadata', '-1', // no cover art, no tags
    ...filters,
    '-ac', long ? '2' : '1',
    '-ar', '44100',
    '-c:a', 'libmp3lame',
    '-b:a', long ? '128k' : '96k',
    output,
  ]
}

/** The ffmpeg to run: FFMPEG_PATH, else `ffmpeg` on the PATH. null = not installed. */
export function findFfmpeg(env: string | undefined = process.env.FFMPEG_PATH): string | null {
  const command = env && env.trim() ? env.trim() : 'ffmpeg'
  const probe = spawnSync(command, ['-version'], { stdio: 'ignore', windowsHide: true })
  return probe.error || probe.status !== 0 ? null : command
}

function run(command: string, args: string[], maxBuffer = 512 * 1024 * 1024): Promise<Buffer> {
  return new Promise((done, fail) => {
    execFile(command, args, { encoding: 'buffer', maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      if (error) fail(new Error(`ffmpeg couldn't read that file: ${stderr.toString().trim().split('\n').pop() || error.message}`))
      else done(stdout)
    })
  })
}

/** Decodes a file to mono 44.1 kHz samples (for finding its onset). */
async function decodeMono(ffmpeg: string, input: string): Promise<Float32Array> {
  const raw = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'])
  const copy = new Uint8Array(raw.byteLength)
  copy.set(raw)
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4))
}

export type SavedAudio = { path: string; file: string; trimmedMs: number }

/**
 * Converts `bytes` to MP3 and saves it under <root>/public/audio/<folder>/<stem>_<NN>.mp3.
 * Throws with a plain-English reason (ffmpeg missing, unreadable file, refused name).
 */
export async function saveAudioFile(root: string, target: AudioTarget, bytes: Buffer, ffmpeg = findFfmpeg()): Promise<SavedAudio> {
  if (!ffmpeg) throw new Error(FFMPEG_MISSING)
  if (bytes.length === 0) throw new Error('the file is empty')
  const audioDir = resolve(root, 'public', 'audio')
  const folderDir = resolve(audioDir, target.folder)
  if (!folderDir.startsWith(audioDir + sep)) throw new Error('Not allowed: outside public/audio/')
  mkdirSync(folderDir, { recursive: true })
  const name = nextFileName(readdirSync(folderDir), target.stem)
  const output = resolve(folderDir, name)
  if (!output.startsWith(folderDir + sep) || existsSync(output)) throw new Error(`Not allowed: ${name}`)

  const work = mkdtempSync(join(tmpdir(), 'devkit-audio-'))
  try {
    const input = join(work, `in.${target.ext}`)
    writeFileSync(input, bytes)
    const startSec = isLongBus(target.bus) ? 0 : findOnsetSec(await decodeMono(ffmpeg, input), 44100)
    const temp = join(work, 'out.mp3')
    await run(ffmpeg, encodeArgs(input, temp, target.bus, startSec))
    writeFileSync(output, readFileSync(temp))
    return { path: `${target.folder}/${name}`, file: `public/audio/${target.folder}/${name}`, trimmedMs: Math.round(startSec * 1000) }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// ---------- credits ----------
export type CreditEntry = { paths: string[]; source: string; author: string; licence: string; light: string; url: string; credit: string }

/** Is this a credits entry for sound files? Returns the entry (only its known fields), or a reason it's refused. */
export function readCreditEntry(raw: unknown): CreditEntry | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'entry must be an object'
  const e = raw as Record<string, unknown>
  if (!Array.isArray(e.paths) || e.paths.length === 0 || !e.paths.every((p) => typeof p === 'string' && /^public\/audio\/[a-z]+\/[a-z0-9_]+\.mp3$/.test(p))) {
    return 'paths must be sound files like public/audio/sfx/sfx_pop_01.mp3'
  }
  const text = (key: string) => (typeof e[key] === 'string' ? (e[key] as string).trim() : '')
  if (!text('source')) return 'say where the sound came from (source)'
  if (!text('licence')) return 'say which licence it has (licence)'
  return { paths: e.paths as string[], source: text('source'), author: text('author'), licence: text('licence'), light: text('light'), url: text('url'), credit: text('credit') }
}

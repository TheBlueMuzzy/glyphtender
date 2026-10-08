# Web Audio Tech for the Game Framework audio module

Research date: 2026-10-08. Target: React + TS + Vite (some R3F), phones (iOS Safari, Android Chrome) + desktop, some online multiplayer (Cloudflare PartyServer). Every tweakable value lives in `content/*.json` and is edited live in the Dev Kit.

Confidence: items marked **(verified)** were checked against a source this session. Items marked **(from experience)** are well-known Web Audio behaviour that I did not re-check this session. Bundle sizes are approximate.

---

## TL;DR: recommendation

- **Build our own thin wrapper on the raw Web Audio API** (roughly 500–800 lines of TS, no runtime dependency) and add **ZzFX** (<1 KB) for placeholder sounds made in code.
- The audio graph: `source → per-sound voice (gain + optional filter + pan) → bus (SFX / UI / Music / Ambient) → Master → limiter → speakers`, plus one shared **reverb bus** that each sound can send to.
- Short sounds are decoded into `AudioBuffer`s. **Music streams through an `<audio>` element** routed into the Music bus (`MediaElementAudioSourceNode`), because a decoded 3-minute stereo track takes about 69 MB of memory.
- One `content/audio.json` describes every sound: file(s) or a ZzFX preset, volume in dB, pitch in semitones, random ranges, variants, trim, fades, loop points, voice limit, cooldown, bus, filters, pan and reverb send. The Dev Kit "Sound Board" edits it and saves it.
- Howler is still a fine library, but it is the wrong fit here. It has no bus graph and no filters, it hasn't had an npm release since 2023, and its main extra (an HTML5 Audio fallback) no longer matters in 2026.

---

## 1. Libraries compared

| Option | State (2025–26) | Size (gzip) | License | Buses | Pitch | Filters | Reverb | Pan | Sprites | Fades | Loop points | Mobile unlock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Raw Web Audio API** | Baseline in all browsers | 0 | - | GainNode per bus | `playbackRate` + `detune` | BiquadFilterNode (LP/HP/BP/shelf/peaking) | ConvolverNode | StereoPannerNode / PannerNode | DIY (`start(when, offset, dur)`) | AudioParam ramps | `loop`, `loopStart`, `loopEnd` | DIY (~20 lines) |
| **Howler.js** 2.2.4 | Last npm release Sep 2023. Repo still gets commits (last push Nov 2025). 25k stars, ~360 open issues **(verified)** | ~7 KB core, ~10 KB with spatial plugin | MIT | No real buses: one global `Howler.masterGain`, volume per Howl | `rate()` (speed and pitch together) | None built in (you'd hack `Howler.ctx`) | No | `stereo()`, 3D via plugin | **Yes, first-class** | `fade()` | Via sprites only | Yes, automatic |
| **Tone.js** 15.x | Active, 15.1.x releases through 2025 **(verified)** | ~75 KB gzip (329 KB min) **(verified)** | MIT | Channel / Volume nodes | Yes (incl. PitchShift effect) | Many | Reverb, Freeverb | Panner, Panner3D | No | Yes | Player `loopStart/End` | `Tone.start()` |
| **@pixi/sound** 6.0.1 | Active, made for PixiJS v8 **(verified)** | ~15–20 KB | MIT | No buses (global plus per sound) | `speed` | EqualizerFilter, Reverb, Distortion, Stereo, Telephone **(verified)** | ReverbFilter | StereoFilter | Yes | Limited | Sprites | Yes |
| **Phaser sound manager** (reference) | Active, part of Phaser | n/a (tied to Phaser) | MIT | Global plus per sound | `rate` + `detune` | No | No | `pan` | "markers" | Via tweens | Markers | Yes, plus `pauseOnBlur` |
| **Kaplay** `play()` | Active | n/a (engine) | MIT | Global volume | `speed`, `detune` | No | No | `pan` (newer) | No | No | `loop` | Yes |
| **Wad.js** | Slow / low activity | ~30 KB+ | MIT | Wad.Poly groups | Yes | Yes | Yes (convolver) | Yes | Sprites | Envelopes | Partial | Yes |
| **ZzFX** | Stable, tiny, MIT. Has a designer web app **(verified)** | **<1 KB** | MIT | n/a: it generates samples | `rate` on play | Built-in low/high-pass param (newer versions) | No | No | n/a | Envelope (ADSR) | n/a | Uses its own ctx (can share) |
| **jsfxr / sfxr** | Stable, sfxr.me | ~5 KB | Public domain / Unlicense | n/a | Synth param | Synth LP/HP | No | No | n/a | Envelope | n/a | n/a |
| **three.js Audio / PositionalAudio** (+ drei `<PositionalAudio>`) | Active | part of three | MIT | Listener gain only | `setPlaybackRate`, `setDetune` | `setFilters([...])` | No | HRTF PannerNode | No | No | `setLoopStart/End` | `listener.context.resume()` |

### Pitch: `playbackRate` vs `detune`
- Both `AudioBufferSourceNode.playbackRate` and `.detune` **change speed and pitch together**: the buffer is simply played faster or slower. `detune` is in cents, and `rate = 2^(cents/1200)`. +12 semitones means 2× speed and half the duration. **(from experience)**
- For a designer, show **pitch in semitones** and compute `playbackRate = 2^(st/12)` ourselves. This works everywhere and avoids old-Safari `detune` gaps.
- **Changing speed without changing pitch (time-stretch):**
  - Web Audio has no native time-stretch. The spec authors left it out on purpose because there is no single standard algorithm and it is expensive **(verified, W3C public-audio list)**.
  - Options:
    1. **Music on `<audio>`**: `HTMLMediaElement.playbackRate` with `preservesPitch = true` (the default; Safari also has `webkitPreservesPitch`). This is free and fine for "music speeds up when the timer runs low".
    2. **WASM/AudioWorklet libraries**: `signalsmith-stretch` (independent rate and pitch) or `soundtouchjs` (WSOLA) **(verified)**. These are heavy for short sounds and add latency.
    3. **Pre-render offline**: make a stretched copy at load time.
  - **Recommendation:** expose a single "Pitch (semitones)" control for SFX, where pitch and speed are linked, like Unity's `pitch`. Offer "tempo without pitch change" only on music (through the media element).

### Recommendation: own wrapper, not Howler
1. **Buses and filters are first-class in raw Web Audio and missing in Howler.** Making a bus in Howler means reaching into `Howler.ctx` and rewiring its private nodes. Once you do that, Howler is no longer saving you any work.
2. **Howler's big extra (an HTML5 Audio fallback plus format juggling) no longer matters.** Web Audio is Baseline everywhere. Howler's sprites are also easy to do with `source.start(0, offset, duration)`.
3. **Tone.js** is ~75 KB and built around music (transport, synths). Too big for a UI-sound game kit.
4. **@pixi/sound** is tied to the PixiJS asset system.
5. **One shared `AudioContext`** lets ZzFX, three.js `AudioListener` (`THREE.AudioContext.setContext(ctx)`) and our buses all use the same graph, so the global Mute and the bus sliders affect 3D sounds too. To do that, reroute `listener.gain` from `ctx.destination` to our SFX bus.
6. **Testability.** The tricky logic (dB math, variant choice, voice limiting, cooldown, catch-up suppression) is plain TS that we own, so it can be unit-tested (see §7).

---

## 2. iOS / Safari and mobile realities (2025–26)

### Unlocking audio
- Every browser starts an `AudioContext` as `suspended` until a user gesture.
- **Unlock recipe:**
  - Listen once on `pointerdown`, `touchend` and `keydown` (capture phase).
  - In the handler, call `ctx.resume()`, then play a 1-sample silent buffer, then remove the listeners when `ctx.state === 'running'`.
  - iOS needs this to happen synchronously inside the gesture handler. Firing it from a `setTimeout` or after an `await` does not count. **(from experience)**
- **Show nothing to the player.** The first tap on "Play" unlocks audio. Sounds requested before the unlock are **dropped, not queued** (see the burst gotcha below).

### Ringer / silent switch: `navigator.audioSession` (Safari)
- By default, iOS treats page audio as `ambient`:
  - Web Audio **goes silent when the ringer switch is on silent**.
  - It **mixes with** the user's Spotify or podcast.
  - Setting `navigator.audioSession.type = 'playback'` makes audio ignore the silent switch, but then it **interrupts** other apps' music. **(verified, MDN + WebKit bug 237322)**
- Types: `auto | playback | transient | transient-solo | ambient | play-and-record`. There is also `audioSession.state` (`active | interrupted | inactive`) with a `statechange` event **(verified, MDN)**.
- Only Safari (16.4+, per the WebKit rollout) supports it. MDN marks it "limited availability", not Baseline. **Feature-detect:** `if ('audioSession' in navigator)`.
- **Recommendation:** default to `'ambient'`, which respects the silent switch and lets players keep their own music. This is the polite choice for a casual game. Add a Settings toggle "Play sound even when phone is on silent" that switches to `'playback'`. Store the default in `content/audio.json`.

### Interruptions: phone call, tab hidden, lock screen
- iOS moves the context to the non-standard state **`'interrupted'`**. Some versions get stuck there until `resume()` is called again from a gesture **(verified, WebKit bugs 205599 / 243727 / 273511)**. The permanent-mute-after-call bug mostly affects WKWebView apps (Capacitor!), not Safari itself.
- **Handling (do all of these):**
  - On `visibilitychange` to hidden: `ctx.suspend()` (saves battery, is polite) and pause music.
  - On visible: try `ctx.resume()`. If the state is still not `running`, re-arm the gesture unlock listeners.
  - On `ctx.onstatechange` and `audioSession.onstatechange`: same re-arm logic.
  - Some iOS versions need `suspend()` then `resume()` to recover **(verified, workaround from WebKit bug discussion)**.
- **Burst gotcha:** `source.start()` called while the context is suspended or interrupted is scheduled at the *frozen* `currentTime`. **All of those sounds then play at once on resume.** **Rule: if `ctx.state !== 'running'`, don't start one-shot SFX at all.**

### Formats (`decodeAudioData`)
- **MP3, AAC (.m4a) and WAV decode everywhere.**
- **Opus/Vorbis in Ogg:** Safari 18.4+ (iOS 18.4, macOS 15.4) added Ogg Opus/Vorbis **(verified)**, but people report the support is still buggy or incomplete **(verified, frequal.com)**. WebM-Opus also decodes in Web Audio on iOS 15+, but `canPlayType()` lies on iOS, so you can't feature-detect it reliably **(verified, WebKit bug 238546)**.
- **Recommendation for 2026: ship MP3 (or AAC .m4a) only.** One format, one file per sound, simple for the designer. Revisit Opus (~30–40% smaller at the same quality) once iOS < 18.4 is negligible.
- **Gapless loops:** MP3 and AAC add encoder padding (silence) at the start and end, so `loop = true` on the whole buffer may "hiccup".
  - Fix: always store **`loopStart` / `loopEnd`** in the JSON. The Dev Kit waveform lets the designer drag them, and `AudioBufferSourceNode` then loops sample-accurately inside the padding.
  - Or loop music through a WAV or Ogg file where the browser supports it.

### Memory
- Decoded audio is uncompressed 32-bit float, resampled to the context rate:
  `bytes = seconds × sampleRate × channels × 4`.
  - 1 s mono SFX at 48 kHz ≈ 190 KB. 100 short SFX ≈ 10–20 MB: fine.
  - **3-minute stereo music ≈ 69 MB: not fine on phones** (iOS tabs get killed at a few hundred MB total).
- **So music and long ambience stream via `<audio>` + `MediaElementAudioSourceNode`**: low memory, and it still goes through the Music bus gain. SFX are decoded buffers.
- Make SFX **mono** (half the memory and download) unless stereo matters.

### Latency
- `new AudioContext({ latencyHint: 'interactive' })`.
- Typical output latency: desktop ~10–20 ms, iOS ~10–20 ms, Android Chrome ~20–40 ms, **Bluetooth headphones 150–300 ms** (nothing we can do). Read `ctx.baseLatency` / `ctx.outputLatency` for the Dev Kit stats panel. **(from experience)**
- Buffers play with near-zero scheduling delay. `<audio>.play()` for SFX is slow and imprecise, so never use it for SFX.

### PWA / home-screen apps
- **The same unlock rules apply in standalone mode.**
- **iOS standalone PWAs freeze in the background.** Expect `interrupted` on return and use the same re-arm logic.
- **Capacitor/WKWebView:** the phone-call bug above is real. Test that case specifically if we wrap for the App Store.
- **Media Session API** (lock-screen controls) is only relevant if music should keep playing in the background. Usually it shouldn't for a game, so pause it on hidden.

---

## 3. What is tweakable per sound (pro tools → what we need)

What the big tools expose **(from experience; FMOD Studio, Wwise and Unity docs)**:
- **FMOD event:** volume (dB, −80 to +10), pitch (semitones), Random modulators on volume/pitch, Multi Instrument with playlist (random / shuffle / sequential), trigger delay, start offset, fade-in/out curves, loop region, max instances + stealing (oldest / quietest / furthest / none / virtualize), cooldown, priority, mixer bus, sends, effects.
- **Wwise:** voice volume (dB), pitch (cents, ±2400), LPF/HPF (0–100), randomizer on any property, random/sequence containers with "avoid repeating last N", initial delay, trim, fades, loop count, playback limit + priority, output bus, aux sends.
- **Unity AudioSource:** volume 0–1, pitch as a rate multiplier (−3..3, so speed and pitch are linked), priority 0–256, stereo pan, spatial blend, reverb zone mix, loop, output Mixer Group.

### What matters for a small 2D web game: the Dev Kit list
| Property | Unit shown to designer | Slider range / default | Why it matters |
|---|---|---|---|
| **file / variants[]** | file picker + drop zone | 1–N files | Swap without code. Several takes fight repetition. |
| **variantMode** | dropdown | `random-no-repeat` (default) / `shuffle` / `sequence` | "Random but never the same twice" is the sweet spot. |
| **volume** | **dB** | −40 … +6 dB, default 0, step 0.5 | dB feels even. Linear 0–1 sliders "do nothing" until the bottom. Gain = 10^(dB/20). |
| **pitch** | **semitones** | −12 … +12 st, default 0, step 0.1 | Musical and intuitive. Show the resulting "speed ×1.12" as a hint. |
| **pitchRandom** | ± semitones | 0 … 3 st, default 0.5 for repeated SFX | The cheapest way to stop the "machine-gun" effect. |
| **volumeRandom** | ± dB | 0 … 6 dB, default 1 | Same purpose. |
| **delay** | ms | 0 … 1000 | Syncs a sound to an animation beat without code. |
| **startOffset / endTrim** | ms (drag on waveform) | 0 … duration | Cuts silence or "uhh" at the start. Lowers felt latency. |
| **fadeIn / fadeOut** | ms | 0 … 3000 (always ≥5 ms internally to avoid clicks) | Music, ambience, long sounds. |
| **loop + loopStart/loopEnd** | toggle + seconds (drag on waveform) | - | Music, ambience, gapless loops (see §2). |
| **maxVoices** | count | 1 … 8, default 4 | Ten pieces landing sound full, not distorted. |
| **stealMode** | dropdown | `oldest` / `none` (skip new) | Same reason. |
| **cooldown** | ms | 0 … 500, default 30 | Stops two triggers in the same frame from doubling up (phasey, loud). |
| **bus** | dropdown | sfx / ui / music / ambient | Player Settings sliders act on buses. |
| **pan** | L–R | −1 … +1, default 0 | Small: board games can pan by board X. |
| **lowpass / highpass** | Hz (log slider) | LP 200 … 20000 (off = 20000), HP 20 … 2000 (off = 20) | Quick "muffled / thin" without re-exporting. Also used for "paused menu muffles music". |
| **reverbSend** | dB | −60 (off) … 0 | Optional. One shared room. |
| **priority** | - | **skip for now** | Only matters with a global voice budget. Revisit if needed. |
| **playback speed without pitch** | - | **music only** | See §1. |

**Bus-level (mixer) properties:** volume dB, mute, and for Music, **ducking** (when a `duck: true` sound plays: −8 to −12 dB, attack ~100 ms, release ~400 ms). Master gets a `DynamicsCompressorNode` set as a soft limiter (threshold −3 dB, ratio 20, fast attack) as a safety net.

### Example `content/audio.json` entry
```json
{
  "buses": { "master": 0, "music": -8, "sfx": 0, "ui": -4, "ambient": -12 },
  "duck": { "amountDb": -10, "attackMs": 100, "releaseMs": 400 },
  "iosSession": "ambient",
  "sounds": {
    "tile-place": {
      "files": ["audio/sfx/tile-place-1.mp3", "audio/sfx/tile-place-2.mp3"],
      "variantMode": "random-no-repeat",
      "bus": "sfx",
      "volumeDb": -3, "volumeRandomDb": 1.5,
      "pitchSt": 0, "pitchRandomSt": 0.7,
      "delayMs": 0, "startMs": 12, "endTrimMs": 0,
      "fadeInMs": 0, "fadeOutMs": 0,
      "maxVoices": 4, "steal": "oldest", "cooldownMs": 30,
      "pan": 0, "lowpassHz": 20000, "highpassHz": 20, "reverbSendDb": -60
    },
    "coin": { "zzfx": [1,0.05,925,0.04,0.3,0.6,1,0.3,0,6.27,-184,0.09,0.17], "bus": "sfx", "volumeDb": -6 },
    "theme": { "files": ["audio/music/theme.mp3"], "bus": "music", "stream": true,
               "loop": true, "loopStart": 2.48, "loopEnd": 94.1, "fadeInMs": 1500 }
  }
}
```
Every field except the name is optional. Defaults live in code and are shown greyed in the Dev Kit. A sound with `files` uses them. Otherwise it falls back to `zzfx`, and with neither it is silent but **logged** as "missing sound".

---

## 4. Procedural / synth sounds as editable presets

### ZzFX (MIT, <1 KB) **(verified: size, license, designer app)**
- **Call signature** (positional array, every field optional): `zzfx(volume=1, randomness=.05, frequency=220, attack=0, sustain=0, release=.1, shape=0, shapeCurve=1, slide=0, deltaSlide=0, pitchJump=0, pitchJumpTime=0, repeatTime=0, noise=0, modulation=0, bitCrush=0, delay=0, sustainVolume=1, decay=0, tremolo=0, filter=0)`.
  - `shape` values: 0 sin, 1 triangle, 2 saw, 3 tan, 4 noise.
  - `filter`: positive = high-pass, negative = low-pass (newest versions).
  - The parameter order is from memory. Check it against the installed version's README.
- **Designer app:** zzfx.3d2k.com / killedbyapixel.github.io/ZzFX. It has sliders, a randomizer and "copy code", and the copied array pastes straight into `content/audio.json`.
- **Integration:**
  - Call `ZZFX.buildSamples(...params)` once (or whenever the preset changes in the Dev Kit), wrap the result in an `AudioBuffer` on **our** context, and play it like any file.
  - That way **every per-sound property (bus, pitch, random, voices, filters) works the same for synth and file sounds**. The swap from placeholder to final file is just adding `files`.
- **Dev Kit for ZzFX:** show the ~21 params as labelled sliders grouped as Envelope / Pitch / Tone / FX. Add buttons for "Randomize", "Mutate ±10%" and "Paste from ZzFX designer", plus preset seeds (blip, coin, hit, jump, powerup, explosion, click, error).
- **ZzFXM** is a tiny tracker-format music player. It's fine for jam-quality placeholder loops but not worth it for real music.

### jsfxr / sfxr (sfxr.me)
- sfxr's classic preset generators: **pickupCoin, laserShoot, explosion, powerUp, hitHurt, jump, blipSelect** (plus `synth`, `tone`, `click`, `random`). jsfxr can render to a WAV or a buffer.
- **Use it as an outside tool:** the designer makes a sound there, exports a WAV, and drops it in. We don't need it as a runtime dependency, since ZzFX covers the "sounds from code" role at 1/5 the size.

### Quality expectations
- Both make **retro/chiptune-flavoured** sounds:
  - Great for UI blips, clicks, coins, errors and "your turn" chimes.
  - OK for placeholder impacts.
  - Poor for anything organic (wood tiles, paper, cloth, voices, music).
- Tell the designer plainly: **placeholders prove timing and mix. Final sounds should usually be files** (Kenney, Sonniss GDC bundles, or recorded). Soft synth UI sounds can ship if the art style is minimal.

---

## 5. Dev Kit UI patterns for audio tuning

Borrowed from these tools **(from experience)**:
- **FMOD Studio / Wwise:** event browser tree, property sheet with randomizer "dice" next to each property, waveform with draggable loop region, live mixer with faders and meters, a "Profiler" listing every event as it fires.
- **Unity Audio Mixer / Godot Audio Buses:** a horizontal strip of bus faders with peak meters, plus mute/solo/bypass and effect slots per bus.
- **sfxr web:** preset buttons, "mutate" and "randomize", sliders labelled in plain words.
- **Leva / Tweakpane:** auto panels from a schema. Good for quick sliders, but they can't do a waveform or a file drop. **Recommendation:** build the Sound Board as a custom Dev Kit panel using the framework UI kit, with plain HTML range inputs.

### Proposed Dev Kit "Sound Board"
1. **List of every sound** (searchable, grouped by bus). Each row shows:
   - ▶ play
   - a 🎲 "play 5×" button that triggers the sound 5 times at ~300 ms spacing, so you can hear the randomization
   - the source badge (`file` / `zzfx` / `missing`)
   - the file's loudness (LUFS or peak dBFS from the build script)
   - a "last played Xs ago" indicator
2. **Detail pane** for the selected sound:
   - **waveform** on a canvas, from the decoded buffer's min/max peaks per pixel, with draggable `start`, `endTrim`, `loopStart` and `loopEnd` handles
   - the sliders from §3 with units and a reset-to-default ↺ per slider
   - **drop a file here / pick file**: the Vite plugin writes it into `assets/audio/...` and updates `files`; in dev Vite's glob picks it up via HMR
   - **A/B:** toggle between the saved values (or old file) and the current edits to compare by ear
   - **"Play in context":** fire the game event that triggers this sound (if the game registered a demo trigger), so the designer hears it with the real animation and the rest of the mix
3. **Mixer strip:** one fader per bus in dB, mute/solo, and a **peak + RMS meter** per bus.
   - Built from an `AnalyserNode` on each bus: `getFloatTimeDomainData` → peak = max |x|, RMS = √mean(x²) → `20·log10` = dBFS, refreshed on requestAnimationFrame. Turn the analysers on only while the panel is open.
   - Optional red "clip" light when the master peak goes above −0.3 dBFS.
   - **LUFS-ish in the browser:** K-weighting is a high-shelf (+4 dB @ ~1.5 kHz) plus a high-pass (~38 Hz) `BiquadFilterNode` pair before a 400 ms mean-square window. That is close enough for a "momentary loudness" meter. A true BS.1770 integrated reading is better done offline in the build script.
4. **"Recent sounds" log:** the last ~30 triggers with time, name, variant, dropped/stolen/cooled-down reason. This is the single most useful debug tool for a non-engineer ("why didn't it play?" → "dropped: cooldown").
5. **Save** writes `content/audio.json` via the existing Dev Kit Vite plugin, in the same style as the other content files.

### Loudness measurement in Node (normalize script)
- Use `ffmpeg-static` (an npm package that ships an ffmpeg binary) so the script works on both machines without installing ffmpeg.
- **Measure:** `ffmpeg -hide_banner -i in.wav -af ebur128=peak=true -f null -` (prints integrated LUFS, LRA, true peak). Or use `-af loudnorm=print_format=json -f null -` to get JSON.
- **Targets:**
  - Music/ambience: about **−18 LUFS integrated** for mobile/handheld, a figure commonly cited from the Audio Standards Working Group's ASWG-R001 guidance (console guidance is around −24). True peak ≤ −1 dBTP.
  - **Short SFX (<1–3 s):** integrated LUFS is unreliable because its gating uses 400 ms blocks. Normalize SFX by **peak (−1 dBFS)** or by **short-term max loudness**, then balance with the per-sound `volumeDb` by ear.
- **The script reports, it doesn't silently rewrite.** It lists a table of loudness per file and can write the normalized copies the designer approves.

---

## 6. Asset pipeline

### ffmpeg recipes
```bash
# WAV master → game MP3 (mono SFX, VBR ~130 kbps)
ffmpeg -i in.wav -ac 1 -ar 44100 -c:a libmp3lame -q:a 4 out.mp3
# Music: keep stereo
ffmpeg -i in.wav -ac 2 -ar 44100 -c:a libmp3lame -q:a 3 out.mp3
# AAC alternative
ffmpeg -i in.wav -c:a aac -b:a 128k out.m4a
# Opus (future / non-iOS): ~64 kbps is plenty for SFX
ffmpeg -i in.wav -c:a libopus -b:a 64k out.ogg
# Trim leading silence
ffmpeg -i in.wav -af silenceremove=start_periods=1:start_threshold=-50dB out.wav
# Peak-normalize SFX to -1 dBFS: first read max_volume, then apply the difference
ffmpeg -i in.wav -af volumedetect -f null -          # prints max_volume
ffmpeg -i in.wav -af volume=XdB out.wav
# Loudness-normalize music (two-pass loudnorm)
ffmpeg -i in.wav -af loudnorm=I=-18:TP=-1:LRA=11:print_format=json -f null -
ffmpeg -i in.wav -af loudnorm=I=-18:TP=-1:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true out.wav
```
- Keep the **source WAVs** in the repo, in a `source/audio/` folder that isn't bundled, so you can re-encode them later. Ship only the encoded files.

### Audio sprites
- Tools: `audiosprite` (npm, uses ffmpeg, outputs Howler-format JSON). It is old but works.
- Sprites made sense in the HTML5-Audio era: one element, one download, iOS single-channel limits.
- **With Web Audio plus HTTP/2 they bring little.** They also **hurt editability**: swapping one sound means rebuilding the sprite and shifts every offset.
- **Recommendation: no sprites.** One file per sound. If a game ever has 100+ tiny UI sounds, add a build-time sprite step later. The runtime already supports `start(0, offset, dur)`.

### Vite
- `import.meta.glob('/src/assets/audio/**/*.{mp3,m4a,ogg,wav}', { query: '?url', import: 'default', eager: true })` builds a map from source path to hashed URL. `audio.json` stores the readable path (`audio/sfx/coin.mp3`), and the loader looks up the hashed URL.
  - Benefits: hashed filenames, so caches can keep them forever, plus HMR when the Dev Kit drops a new file.
  - Small files are inlined as base64 under `assetsInlineLimit` (4 KB). That's fine, or set the limit to 0 for audio.
- The alternative, `public/audio/` (no hashing, served as-is), is simpler but needs cache-busting by hand. Prefer the glob.
- **Loading strategy:**
  - Decode the "critical" SFX (UI, core loop) right after unlock. `fetch` + `arrayBuffer` can start before unlock; `decodeAudioData` works on a suspended context.
  - Lazy-load the rest per scene/screen.
  - Music streams through the media element, so there's nothing to preload except a `preload="auto"` hint.

### PWA service worker (vite-plugin-pwa / Workbox)
- **Precache** SFX: small, and needed offline.
- **Do not precache music.** Use runtime caching `CacheFirst` with an expiration limit. Media elements send **Range requests** (Safari especially), so add Workbox's `RangeRequestsPlugin` + `CacheableResponsePlugin({statuses:[0,200]})` on the music route, or Safari playback from cache can fail. **(from experience; Workbox docs "serving cached audio and video")**

---

## 7. Testing audio in CI / headless

1. **Most logic is pure TS. Test it with plain Vitest, no audio at all:**
   - dB↔gain and semitone↔rate math
   - variant selection (no-repeat, shuffle)
   - voice limiter and steal mode
   - cooldown
   - the random ranges (use a seeded RNG)
   - JSON schema defaults and validation (missing file → falls back to zzfx → "missing" log)
   - the multiplayer catch-up filter (§8)

   **Design for this:** a `SoundPlanner` (pure: "given this trigger, now, and these active voices → play this variant at this gain/rate, or drop with reason X") separate from a thin `WebAudioBackend` that just builds nodes.
2. **Graph wiring tests:** inject the `AudioContext` (never `new AudioContext()` inside the module). Then either:
   - use **`standardized-audio-context-mock`**, which provides mock `AudioContext` / `AudioBuffer` plus a `registrar` for asserting which nodes were created and connected **(verified)**, or
   - write a small hand-rolled fake. Note that the mock is designed to pair with `standardized-audio-context`. For our raw-API code, a ~100-line fake that records `createGain`/`connect`/`start` calls is often simpler.
3. **Real rendering in Node:** `node-web-audio-api` (the Rust-backed implementation from IRCAM) supports `OfflineAudioContext`. Render a graph faster than real time, then check the samples: the fade reaches 0, the bus at −6 dB gives about half the amplitude, the loop points are sample-exact. Use it for a few golden tests only.
4. **In-browser rendering:** run `OfflineAudioContext` inside Playwright (`page.evaluate`) to check the same things in real Chromium/WebKit.
5. **Playwright end-to-end:**
   - Launch Chromium with `--autoplay-policy=no-user-gesture-required`, or just click first.
   - Headless Chromium has a fake audio output, so the context runs.
   - **Assert on a debug log, not on sound:** in dev/test builds the module pushes every trigger and decision to `window.__audioLog`. The test then does "click tile → expect `tile-place` played once".
   - The WebKit project in Playwright catches Safari-specific decode failures. Also run a test that loads every file in `audio.json` and confirms it decodes.
6. **A content lint test (cheap, high value):** every sound referenced in code exists in `audio.json`, every file in `audio.json` exists on disk, and no unused files remain.

---

## 8. Multiplayer gotchas

The model: other players' actions arrive as events and are replayed locally. That means sounds are local and can misfire in bursts.

- **Catch-up bursts after a reconnect, a late join or a tab return:** the client may receive 20 events at once. **Tag each event `live` vs `catchUp`/`replay`**, using the server timestamp or a "sync complete" marker from PartyServer. Then:
  - Play no sounds for catch-up events, or
  - play **one summary sound** for the final state (e.g. one "your turn" chime).
  - Also drop any event sound older than ~300–500 ms compared with the server clock, measured on receipt.
- **Initial room-state snapshot:** applying the snapshot must **never** trigger per-item sounds. Mute the bus or flag the apply as `silent` during hydration.
- **Hidden tab:** sockets keep receiving, timers get throttled, and the context is suspended. **Don't queue sounds while hidden.** Combined with the "only play if running" rule from §2, this avoids the resume-burst.
- **Many events in one frame** (e.g. an opponent's whole move applied as 5 tile placements):
  - Coalesce by sound name per frame/tick, using `cooldownMs` and `maxVoices`.
  - Or **stagger them deliberately**, e.g. 60–80 ms apart. That spacing matches the move animation, so it feels intentional, and it follows Muzzy's "same intention → same motion" rule: the same stagger timing as the visual.
- **Global SFX budget:** cap the total simultaneous SFX at ~12–16 voices. Above that, drop the newest, low-priority first.
- **Own vs other players' sounds:**
  - Sounds for your own action play on input (optimistic), not on the server echo. Otherwise you hear them twice or late.
  - So the event sound handler needs `if (event.actor === me && alreadyPlayedLocally) skip`.
  - Optional: play opponents' sounds slightly quieter or panned (a `remoteVolumeDb` in config).
- **Turn timers / countdown ticks:** derive them from the server deadline, not from local intervals. Otherwise ticks drift or burst after the tab comes back.

---

## Proposed module shape (framework `audio/`)
```
audio/
  AudioEngine.ts      // owns the ctx, unlock, visibility/interrupt handling, buses, limiter, reverb, ducking
  SoundPlanner.ts     // PURE: config + trigger + active voices + now + rng → PlayPlan | Drop(reason)
  loader.ts           // glob map, fetch+decode cache, zzfx → AudioBuffer, music <audio> streams
  config.ts           // types + defaults + validation for content/audio.json
  devlog.ts           // ring buffer of decisions (window.__audioLog in dev/test)
  react.ts            // useSound('name'), <AudioUnlock/>, settings bindings
  devkit/SoundBoard.tsx, devkit/Mixer.tsx, devkit/Waveform.tsx
scripts/audio-loudness.mjs   // ffmpeg-static ebur128 report + optional normalize/encode
```
Public API: `audio.play('tile-place', { pan?, delayMs?, silent? })`, `audio.playMusic('theme')`, `audio.stopMusic({fadeMs})`, `audio.setBusDb('music', -8)`, `audio.duck()`, `audio.onLog(cb)`.

---

## Sources
- Howler maintenance: [gittrend.io/repo/goldfire/howler.js](https://gittrend.io/repo/goldfire/howler.js), [snyk advisor howler](https://snyk.io/advisor/npm-package/howler)
- Tone.js size/version: [depscope.dev/pkg/npm/tone](https://depscope.dev/pkg/npm/tone), [npmjs.com/package/tone](https://www.npmjs.com/package/tone)
- @pixi/sound v6: [npmjs.com/package/@pixi/sound](https://www.npmjs.com/package/@pixi/sound), [github.com/pixijs/sound](https://github.com/pixijs/sound)
- ZzFX: [github.com/KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX)
- Time-stretch: [peteris.rocks: playback rate preserve pitch](https://peteris.rocks/blog/web-audio-api-playback-rate-preserve-pitch/), [W3C public-audio (Chris Rogers)](https://lists.w3.org/Archives/Public/public-audio/2012OctDec/0499.html), [signalsmith-stretch](https://npmjs.com/package/signalsmith-stretch), [soundtouch-js](https://github.com/ZVK/soundtouch-js)
- Audio Session API: [MDN AudioSession](https://developer.mozilla.org/docs/Web/API/AudioSession), [W3C Audio Session spec](https://www.w3.org/TR/audio-session/), [WebKit bug 237322](https://auto-bugs.webkit.org/show_bug.cgi?id=237322), [unmute (mute-switch workaround lib)](https://github.com/swevans/unmute)
- iOS interrupted state: [WebKit 205599](https://bugs.webkit.org/show_bug.cgi?id=205599), [WebKit 243727](https://bugs.webkit.org/show_bug.cgi?id=243727), [WebKit 273511](https://bugs.webkit.org/show_bug.cgi?id=273511), [PlayCanvas forum: iOS resume](https://forum.playcanvas.com/t/ios-audio-playback-does-not-resume-when-minimizing-and-bringing-the-web-browser-back-into-focus/41643)
- Safari Opus/Ogg: [frequal: Ogg Opus still not working in Safari 18.4](https://frequal.com/java/OggOpusStillNotWorkingInSafari18_4.html), [MacG: Apple adds Ogg Vorbis (2026-02)](https://www.macg.co/macos/2026/02/apple-ajoute-le-support-de-logg-vorbis-en-douce-dans-macos-et-ios-avec-une-lecture-native-306585), [WebKit 238546 (WebM Opus canPlayType on iOS)](https://bugs.webkit.org/show_bug.cgi?id=238546), [WebKit 245428](https://bugs.webkit.org/show_bug.cgi?id=245428)
- Testing: [standardized-audio-context-mock README](https://cdn.jsdelivr.net/npm/standardized-audio-context-mock@10.0.1/README.md)
- Existing BMUZ skill this aligns with: `~/.claude/skills/audio-setup/SKILL.md`. Note: it currently recommends Howler. If this architecture is adopted, that skill should be updated to point at the framework module.

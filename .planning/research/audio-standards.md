# Game Audio Standards for Small Web Games — research notes

*For Glyphtender (cozy night-garden hex word game, web, phone + desktop) and the reusable BMUZ audio framework module. Researched 2026-10-08.*

**How to read this.** Plain English first, then numbers. Each claim comes from the cited source or from common practice in the field. **(practice)** means it is widely used but nobody publishes it as a standard. **(verify)** means the sources disagree or may be out of date.

Quick glossary:
- **dB (decibel):** a loudness step. −6 dB is about half the signal level. A −10 dB change sounds roughly "half as loud" to a listener.
- **LUFS:** loudness averaged the way ears hear it, so it measures perceived loudness rather than raw signal. More negative means quieter. −24 LUFS is quieter than −16 LUFS.
- **dBTP (true peak):** the loudest single instant. Keep it under the ceiling or the sound crackles (clips).
- **Bus:** a volume group. Every sound is sent to one bus (music, sfx, ui…), and each bus has its own volume knob.

---

## 1. Mixing standards

### Loudness targets
| Platform | Target (integrated loudness of the whole game over a long play session) | Peak ceiling | Source |
|---|---|---|---|
| Console / PC (Sony ASWG-R001) | −24 LUFS ±2 (some summaries say −23) | −1 dBTP | [Designing Sound: Sony's Garry Taylor](https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/), [Audiokinetic: Mastering with Wwise](https://audiokinetic.com/ko/blog/mastering-a-game-with-wwise-part1) |
| Portable / mobile (Sony) | −18 LUFS ±2 | −1 dBTP | same |
| Mobile / handheld (IESD / Audio Gang recommendation) | −16 LUFS ±2 | −1 dBTP | [IESD Mix Ref Levels](https://www.audiogang.org/wp-content/uploads/2015/04/IESD-Mix-Ref-Levels-v03.02.pdf), [Designing Sound: console vs mobile ranges](https://designingsound.org/2013/02/20/different-loudness-ranges-for-console-and-mobile-games) |

**What this means for us:** a web game played mostly on phones should land around **−16 to −18 LUFS** for the whole mix, with **nothing louder than −1 dBTP**. Phone speakers are small and the room is noisy, so mobile targets are louder. Desktop players have their own volume knob, so a single mobile-level mix is fine for a small web game.
- Measure with the free **Youlean Loudness Meter** ([AudioTechnology](https://www.audiotechnology.com/free-stuff/youlean-loudness-meter)). Play for 5–10 minutes, record the game output, and read the "integrated" number.
- **Headroom:** many sounds can play at once and they add up. To leave room for that, author individual files quieter than the final mix target. Then put a **limiter on the master bus** at −1 dBTP as a safety net. In Web Audio this is a `DynamicsCompressorNode` with fast attack and a high ratio. **(practice)**

### Per-sound normalization (practice)
- Normalize every file **before** it goes in the game, so a "volume 1.0" means the same loudness for every sound. Then set the mix with bus volumes and a small per-event trim.
- Common working levels for short one-shot sounds: peaks normalized to about **−3 to −1 dBFS**, or short-term loudness of roughly **−20 to −14 LUFS**. Loops and ambience are authored quieter (around −24 to −30 LUFS) because they play all the time.
- Keep **one volume trim number per event in `content/`** (for example `"gain": -6`) so a sound can be tuned without re-exporting the file.

### Bus structure indies use
`master → music, ambience, sfx, ui, (voice)`. Board, card and dice web games usually skip voice.
- **Xbox Accessibility Guideline 105** lists separate controls for music, voice, active SFX, background/ambient SFX, narration and voice chat ([XAG 105](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/105)). Splitting ambience from sfx follows this directly.
- **Priority when sounds compete:** Voice > player SFX > other SFX > Music > Ambient ([Wayline](https://www.wayline.io/blog/organizing-game-audio-files-without-overwhelm)).

### Ducking (turning one bus down while another plays)
- Typical amounts: **−6 to −12 dB** is a gentle dip. About −20 dB keeps the music clearly under the important sound but still audible ([CapCut ducking guide](https://www.capcut.com/create/audio-ducking-for-clear-dialogue-in-video), [Vindral sidechain docs](https://composer-docs.vindral.com/script-objects/script-objects-operators-sidechain-ducking.html)).
- **Attack** (how fast it ducks): about **10 ms**. **Release** (how fast it comes back): **250–700 ms**, or up to 1.5 s for smooth recovery. If the release is too short, the music audibly "pumps" ([bugnet: Unity ducking pumping](https://bugnet.io/blog/how-to-fix-unity-sidechain-ducking-pumping-on-sustained-music)).
- For us: duck **music and ambience by about 6–8 dB** under big moments (a long word, the "secret magic" reveal stinger), with a 10 ms attack and 600 ms release. Do **not** duck for ordinary taps.

---

## 2. Avoiding repetition and fatigue

### Variation tricks
| Trick | Typical numbers | Notes |
|---|---|---|
| Random pitch | ±0.5 to ±1 semitone (≈ ±3–6%). A common starting range is playbackRate **0.95–1.05** ([O'Reilly: Web Audio API ch. 4](https://www.oreilly.com/library/view/web-audio-api/9781449332679/ch04.html)) | 1 semitone = ×2^(1/12) ≈ ×1.0595. UI sounds use a smaller range (±0.3 st). Never use random pitch on musical or scale-locked sounds. |
| Random volume | ±1 to ±3 dB **(practice)** | Subtle. More than this sounds like a bug. |
| Variants (round-robin / random container) | **2–3 variants plus pitch randomization** is the indie norm ([O'Reilly / Web Audio](https://www.oreilly.com/library/view/web-audio-api/9781449332679/ch04.html)). Larger productions use 8, and 15–20 for very frequent sounds ([Wayline](https://www.wayline.io/blog/organizing-game-audio-files-without-overwhelm)) | For a word game: 3–5 variants for the most frequent sound (letter or tile tap), 1–2 for rare sounds. |
| No-repeat-last (shuffle) | Pick randomly but never the same variant twice in a row. This is FMOD's "shuffle" and Wwise's "avoid repeating last N". | Cheap and very effective. |

### Voice limiting, cooldown, priority
- In middleware, **every event gets a max-instance count, a priority and a "steal mode"** (what happens when the limit is hit) ([game-audio skill summary](https://openskillindex.com/skills/absolutelyskilled-absolutelyskilled-game-audio), [Audiokinetic Q&A](https://www.audiokinetic.com/qa/14299/random-ambience-with-voice-limit-isnt-rotating-back)).
- Practical defaults for a small web game **(practice)**:
  - Max instances per event: **3–4** (UI: 1–2, restart the sound).
  - Global voice cap: about **24–32**. Phones are fine with this in Web Audio.
  - **Cooldown / min interval:** ignore a re-trigger of the same event within **30–60 ms**. This stops ugly flams (two hits smeared together) when 10 tiles score in the same frame. For cascades, stagger them on purpose instead.
  - Steal mode: "steal oldest" for one-shots. Loops are never stolen.

### Rising-pitch combos (the "each pop a step higher" feel)
- **Peggle 2:** "each peg hit signals a musical note, with each consecutive hit moving up the scale". The scale or mode changes with the music on the fly. **Peggle Blast** reads the current key and scale from the music and plays peg hits in that key ([Audiokinetic: Peggle Blast peg hits and the music system](https://blog.audiokinetic.com/en/peggle-blast-peg-hits-and-the-music-system)). The same pattern appears in Candy Crush cascades and Tetris Effect's per-action notes. Those last two are well known but I did not find a primary source this round **(verify)**.
- **How to build it for us:**
  - Pick a **pentatonic scale**. It has no "wrong" note combinations, so any chain sounds pleasant. Major pentatonic steps in semitones: 0, 2, 4, 7, 9, 12, 14, 16…
  - Step k plays the base sample at `rate = 2^(scale[k]/12)`.
  - Cap at about **8–12 steps** (one and a half octaves), then hold the top note or add a sparkle layer. Pitching a sample up more than about +12 semitones makes it sound chipmunky. A "high" variant sample avoids that.
  - Reset the chain after about **1–1.5 s** with no pop.
  - If background music plays, use the **music's key** (Peggle Blast trick). The easiest way is to compose all music in one key (for example C or D major) and use that key's pentatonic for pops.
- **Mini Metro** (Disasterpeace) goes further: there are no looping music tracks at all. All music comes from game data, with line length setting sequence length, station type setting timbre and occupancy setting dynamics. Sounds are mostly sine-wave variations ([Designing Sound interview](https://designingsound.org/2016/02/18/the-programmed-music-of-mini-metro-interview-with-rich-vreeland-disasterpeace)). This is a great model for "secret magic": the game's own events become the music.

---

## 3. Middleware concepts worth borrowing (FMOD / Wwise) — without the middleware

| Concept | What it is | Do we need it? |
|---|---|---|
| **Events instead of files** | Code says `play('word.scored')` and never names a file. A content file maps events to files, variants, volume, pitch and bus ([game-audio skill summary](https://openskillindex.com/skills/absolutelyskilled-absolutelyskilled-game-audio)). | **YES, the core of the framework.** It lets Muzzy swap or tune sounds in `content/audio.json` without touching code. |
| **Random container** | One event, N files, picked randomly (with no-repeat). | **YES**, as a `variants: []` list. |
| **Sequence container** | Plays files in order (step 1, 2, 3…). | **YES**, as a `mode: "sequence"`. Use it for the combo-pitch ladder or multi-part stingers. |
| **Blend container** | Crossfades between sounds by a parameter (for example a "speed" value). | Rarely. Skip for now. |
| **Parameters / RTPC** (real-time parameter control) | A game number such as `combo=5` or `tension=0.7` drives pitch, volume or layer volume. | **A light version**: pitch-by-combo-step and music-layer-by-game-phase. |
| **Snapshots / mix states** | Named mixes, for example "paused" (music −10 dB, low-pass filter), "reveal" (duck everything but the stinger), "menu". | **YES, 2–4 snapshots.** Very cheap to build with GainNode ramps. |
| **Voice limits / priority / steal** | See §2. | **YES**, as per-event `maxInstances` and `cooldownMs`. |
| 3D / spatial, occlusion, reverb zones | | No. At most a little stereo pan by board column, and only if it helps. Keep it off when mono mode is on. |

Bottom line: a small game needs **event → variants → bus → snapshot**, plus two parameters (combo step and music intensity). Howler.js (~10 KB gzipped) or plain Web Audio covers this ([abratabia: Howler tutorial](https://www.abratabia.com/web-game-audio/howler-js-tutorial.php)).

---

## 4. Music

### Loops
- Typical in-game loop lengths are **1–2 minutes**, longer where players stay a long time ([Stobbe seminar paper (PDF)](https://intern.fh-wedel.de/fileadmin/mitarbeiter/iw/Lehrveranstaltungen/2019WS/Seminar/Ausarbeitung11_Stobbe.pdf), [Game Developer: Rethinking the audio loop](https://www.gamedeveloper.com/audio/rethinking-the-audio-loop-in-games)). A word game round lasts 5–20 minutes and the board is the "hub", so aim for **2–4 minute** loops, or 2–3 tracks that rotate.
- **Silence is a tool.** After N repeats, fade to silence or ambience only (the "bored now" switch). That avoids fatigue ([Devon Thome: reducing music fatigue](https://world.hey.com/thome/game-101-reducing-music-fatigue-d0214e31)). Minecraft and Animal Crossing–style "music plays, then gaps" fits cozy games well **(practice)**.
- **Seamless loop warning:** MP3 encoders add silent padding (LAME adds about 576 samples at each end), which makes a click or gap at the loop point ([web.dev: MSE seamless playback](https://web.dev/articles/mse-seamless-playback), [Soft8Soft: perfect loops](https://www.soft8soft.com/wiki/index.php/Making_sounds_perfectly_looped)). Fixes:
  - (a) Decode to a Web Audio buffer and set `loopStart`/`loopEnd` in seconds, using values stored in the content file.
  - (b) Use AAC/M4A or Opus, which carry gapless info more reliably.
  - (c) For the music bed, a 1–2 s crossfade between repeats hides any seam.

### Layered / adaptive music (vertical remixing)
- **Vertical:** several stems of the same length play in sync (pad, melody, percussion…). Layers fade in or out with the game state. **A Short Hike** does this: each piece has layers that fade by area, weather and actions such as flying ([Wikipedia](https://en.wikipedia.org/wiki/A_Short_Hike), [PlayStation Blog](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/)).
- **Horizontal:** switch to a different section at a bar line.
- **Stingers:** short musical hits (1–4 s) played over or instead of the bed for big moments: a long word, round end, the "secret magic" reveal. Duck the bed under them (§1).
- **Crossfades:** 1–3 s between tracks. Use about 0.3 s for stingers in, and a longer tail out.
- **Recommended for Glyphtender:** a quiet bed of 2–3 vertical layers (night ambience, soft pad, a gentle melody that enters as the board fills or the endgame nears) plus 3–5 stingers, all in one key so pentatonic pops harmonize.

### Do cozy and puzzle games use music? Yes, quietly, with layers you can control.
| Game | What its audio does |
|---|---|
| **Wordscapes** | Each destination has its own theme and background music, with a relaxing, meditative mood ([App Store](https://apps.apple.com/app/1420294918)). Words of Wonders Zen lets players adjust music and nature sounds separately ([App Store](https://apps.apple.com/us/app/-/id6756706316)). |
| **Wingspan (digital)** | Each bird sings when played. Songs blend into an ambient aviary with background birds plus classical-guitar music. **Players control each layer**, which made it a "work companion" ([PC Gamer](https://pcgamer.com/wingspan-review), [Meeple Mountain](https://www.meeplemountain.com/reviews/wingspan-digital/)). This is the closest model for us: *the thing you play makes the music*. |
| **Townscaper** | No real music, just wind and waves. Every placement gives a soft "pop/squish", and those plops are what make it satisfying ([Taylor Holmes](https://taylorholmes.com/2021/09/10/townscaper-video-game-shout-out)). |
| **Unpacking** | 14,000 hyper-realistic foley sounds (recorded everyday objects) set against pixel art. Every item was recorded literally. It won the GDC 2022 Best Audio award ([Audiokinetic](https://www.audiokinetic.com/en/blog/unpacking-the-fun-behind-the-foley/), [Game Developer](https://www.gamedeveloper.com/marketing/auditory-tales-from-the-making-of-zen-puzzler-unpacking)). |
| **Mini Metro** | Procedural music made from game data (see §2). |
| **A Short Hike** | Layered adaptive soundtrack (above). |
| **Dorfromantik** | Mellow instrumental soundtrack built on nostalgia ([The Ongaku](https://www.theongaku.com/posts/dorfromantik-soundtrack)). |
| **Stardew / Spiritfarer** | Acoustic instruments: flute, ocarina, felt piano, guitar ([SDLC: cozy audio](https://sdlccorp.com/post/the-impact-of-audio-design-on-the-cozy-gaming-experience/)). |

### What makes a sound "cozy" and satisfying (MDA angle)
These are **(practice)**, synthesized from the games above:
- **Soft attack, round tone:** wood, felt, glass, water, plucked strings, and sine or marimba-like tones. Avoid harsh high frequencies above about 8 kHz and loud short transients. Use one material palette for everything ("woody taps for a cozy game") ([bugnet: UI sound design](https://bugnet.io/blog/ui-sound-design-for-indie-games)).
- **Short and quiet:** cozy comes from restraint. Most sounds are under 300 ms.
- **Satisfying = confirmation of a good action:** a sound arriving *exactly* on the visual (under about 20 ms apart), with a small reward tail (sparkle or bell) that grows with the size of the achievement. That is the "feel tiers" idea from the game-feel module, so reuse the same small / medium / big tiers.
- **Musical feedback:** pops on a scale (Peggle, Mini Metro, Wingspan birds) turn the player's actions into music. That gives the feeling "I'm making something beautiful", which fits "cozy cleverness".
- **Ambience over music** for long thinking time. A night garden suits crickets, a soft breeze and the occasional owl or water drip, with music entering sparingly.

---

## 5. UI sound conventions
Main source: [bugnet: UI sound design for indie games](https://bugnet.io/blog/ui-sound-design-for-indie-games), plus [Audiokinetic: UI audio from a UI-design perspective](https://www.audiokinetic.com/en/approaching-ui-audio-ui-design-perspective-2).
- **Mix UI quieter than you think,** because UI sounds repeat hundreds of times. A rule of thumb **(practice)**: put the UI bus **6–10 dB below** the gameplay SFX bus.
- **Confirm rises in pitch, cancel falls.** Errors are soft but distinct, a low "bonk" or two-note downward step, never a buzzer. **Hover is nearly silent or absent.** Desktop only; never "machine-gun" hovers across a menu.
- **Button tap:** 30–80 ms, one variant plus ±0.3 st pitch.
- **Toggle:** two related sounds, on (up) and off (down).
- **Turn notification ("your turn"):** a gentle 2–3 note chime, louder than UI taps. It must be paired with a visual (accessibility).
- **Timer warning:** a soft tick that speeds up or rises in pitch in the last 5–10 s. Make it optional. For a cozy game, consider a single gentle chime at 10 s instead of ticking.
- **Invalid word:** soft, short, low. Pair it with a tiny shake. It must not feel punishing.
- **Shortest and softest wins** when in doubt.

---

## 6. Formats and delivery (web and mobile, 2025–2026)

### Codec support
| Format | Chrome / Edge / Firefox / Android | Safari / iOS | Notes |
|---|---|---|---|
| **AAC in .m4a (MP4)** | Yes | **Yes** | Safest single format everywhere. 96 kbps stereo at 48 kHz is the recommended quality level ([MDN audio codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)). |
| **MP3** | Yes | Yes | Universal, but loops get gaps (§4). 128 kbps minimum for music (MDN). |
| **Opus (.webm / .ogg)** | Yes | **iOS / Safari 18.4+ (March 2025)** added Ogg Opus and Vorbis. Before that, iOS 11–18.3 had partial support (CAF container only) ([caniuse: Opus](https://caniuse.com/opus)). Some reports say Safari's Ogg Opus is still buggy ([frequal](https://frequal.com/java/OggOpusStillNotWorkingInSafari18_4.html)). | Best quality per KB. Fine as a primary format, but **keep an AAC/MP3 fallback** for older iPhones **(verify on a real iPhone)**. |
| Vorbis (.ogg) | Yes | Only Safari 18.4+ | Older format than Opus; no reason to choose it now. |
| WAV | Yes | Yes | Too big. Use it for source and masters only. |

**Recommendation:** ship **Opus (.webm) + AAC (.m4a)** and let the loader pick, or **AAC only** for simplicity. Store `.wav` masters in the repo's `audio-src/` (or Git LFS) and convert with ffmpeg.

### Sample rates and bitrates (practice)
- SFX: **44.1 or 48 kHz, mono**. Most SFX don't need stereo, and mono halves the size. Opus at 48–64 kbps or AAC at 64–96 kbps.
- Music and ambience: stereo, Opus 96–128 kbps or AAC 128 kbps (MDN recommends 96 kbps AAC stereo).

### Size budgets and loading
- **Audio sprites:** pack many short SFX into one file plus a JSON map, which means fewer network requests. Load core gameplay SFX as one sprite during the loading screen. UI gets its own small sprite. Rarer sounds and ambience load later ([abratabia: audio sprites](https://www.abratabia.com/web-game-audio/audio-sprites.php)).
- **Preload vs lazy:** preload the tap, score and error sounds (anything in the first 10 seconds). **Stream or lazy-load music** (Howler `html5: true` streams without decoding the whole file into memory) ([abratabia: Howler tutorial](https://www.abratabia.com/web-game-audio/howler-js-tutorial.php)). A 5 MB file can take seconds to decode on old phones.
- Budget **(practice)** for a small web game: **SFX under ~300–500 KB total, music about 1 MB per minute (stereo 128 kbps) or about 0.7 MB per minute (96 kbps).** Music should never block the first play.

### Platform rules (must-handle)
- **Autoplay / unlock:** Chrome and iOS block audio until a user gesture. The AudioContext starts **"suspended"**, so call `ctx.resume()` inside the first tap, click or keydown ([abratabia: mobile audio issues](https://www.abratabia.com/web-game-audio/mobile-audio-issues.php)). Our title screen's "Play" tap is the natural unlock point.
- **iOS silent switch:** Web Audio counts as "ambient" by default, so **when the ringer switch is on silent, Web Audio is muted**. `<audio>` elements are not muted. Setting `navigator.audioSession.type = "playback"` (Safari 17+) makes it play through the silent switch ([audjust: unmute web audio on iOS](https://www.audjust.com/blog/unmute-web-audio-on-ios), [WebKit bug 237322](https://auto-bugs.webkit.org/show_bug.cgi?id=237322)). **Decision needed:** respect the silent switch, which is polite and matches most casual mobile games (Muzzy's "respect the device"), or override it. Recommendation: **respect it by default** (leave it "ambient"). Optionally show a tiny "sound is on but your phone is on silent" hint.
- **Background tab / phone lock:** Safari suspends the AudioContext when the page is hidden. After coming back, it may need **another user tap** to resume. A known workaround is to call `resume()` in `visibilitychange` after about 300 ms, and on failure resume on the next tap ([bugnet: iOS background audio](https://bugnet.io/blog/fix-html5-game-audio-cut-off-on-ios-background), [Babylon forum](https://forum.babylonjs.com/t/audio-is-not-resuming-to-play-after-visibilitychange-in-iphone-browsers-works-on-android-and-desktop/54164)). Also **pause music ourselves on hidden** so nothing plays from a pocket.
- **Bluetooth latency:** typically **100–300 ms**. Low-latency codecs (aptX LL) bring it to 30–40 ms ([Soundcore](https://us.soundcore.com/blogs/headphones/storefront-how-to-fix-headphone-latency)). For a turn-based word game this is fine. Just never make *timing* depend on hearing a sound. An optional "audio offset" setting isn't needed for us.

---

## 7. Accessibility and settings
Sources: [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/intermediate/), [Xbox Accessibility Guideline 105](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/105).
- **Separate volume controls** for effects, speech and music (GAG basic), and per output type (XAG 105). For us: **Master, Music, Ambience, Sound effects (gameplay), Interface**. Each has a slider (0–100%) and a mute. Five sliders is the upper end; 3 (Master / Music / Effects) is the minimum. Recommendation: Master, Music (incl. ambience?), Effects, UI. Or merge UI into Effects with a small "UI sounds" on/off toggle.
- **Mono toggle:** sums stereo to both ears, for players with hearing in one ear (GAG and XAG). Easy in Web Audio.
- **Visual alternative for every important sound:** "your turn", invalid word, timer warning and opponent move must all show on screen too (GAG: "all important information conveyed by audio should be replicated in text/visuals").
- **"Reduce" options (practice):** "Reduce repetitive sounds" (turns off ticking and hover), and an optional "calm mode" that lowers high frequencies and stingers. Tie these to the game-feel module's "reduce motion" settings.
- **Default volumes (practice):** Master 80%, Music 50–60%, Ambience 60%, SFX 80%, UI 70%. Remember the player's choice (save system). **First launch:** music at a moderate level. Many players open web games in public, so never blast audio on first gesture.
- **Respect the device:** follow the silent switch (§6), pause when the page is hidden, and never autoplay before a tap.
- **Haptics pairing:** `navigator.vibrate` works on Android Chrome but **iOS Safari doesn't support it** (the function exists but always returns false). A workaround using `<input type=checkbox switch>` worked on iOS 17.4–26.4 but **Apple patched it in iOS 26.5** ([bugnet: vibrate on iOS](https://bugnet.io/blog/fix-web-game-vibrate-api-not-available-ios-safari), [WebHaptics browser support](https://www.mintlify.com/lochie/web-haptics/advanced/browser-support)). Treat haptics as an Android-only bonus (10–20 ms taps, 30–50 ms for big moments) with its own on/off toggle.

---

## 8. Where to get sounds, and licensing

| Source | Licence | Good for | Notes |
|---|---|---|---|
| **Kenney** (kenney.nl): UI, impacts, jingles, RPG, casino packs | **CC0**: no attribution, commercial OK ([Cinevva guide](https://app.cinevva.com/guides/free-sound-effects-music)) | UI clicks, placeholders, jingles | Clean and "game-y". May sound generic. |
| **Freesound** | Per-sound **CC0 / CC-BY / CC-BY-NC** | Nature ambience (crickets, wind, water), foley | **Filter to CC0 or CC-BY.** CC-BY needs a credit line. **CC-BY-NC is not allowed in a game you sell** (same source). |
| **OpenGameArt** | Mixed, so filter by CC0 | Same as above | |
| **Sonniss #GameAudioGDC bundle** (yearly, free, 200+ GB archive) | Royalty-free, commercial, **no attribution**, unlimited projects. **Can't resell or redistribute the raw files. Can't use them to train AI** ([gamefromscratch](https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/), [licenseorg](https://licenseorg.com/guide/music-audio/sonniss)) | Pro-quality foley, nature, magic and chimes | Best free pro source. Keep the bundle's license file. |
| **itch.io / Humble packs** | Varies by pack | Cozy music packs, UI packs | Read each license. Most allow games with no attribution. |
| **Splice Sounds** | Royalty-free, **game use allowed** ([Splice licensing FAQ](https://intercom.help/splice-b7a2d5b83f2e/en/articles/8652642-splice-sounds-licensing-faq)) | Musical one-shots (bells, plucks, kalimba) for pops and stingers | Subscription; samples stay licensed after you cancel **(verify)**. |
| **Epidemic Sound** | The personal plan covers social media only, not standalone games. Rights for new use stop when you cancel ([Epidemic: game dev](https://www.epidemicsound.com/game-development/)) | Trailers | **Avoid for in-game audio** unless you buy a business or game licence. |
| **sfxr / jsfxr / bfxr / ZzFX** (procedural) | You own the output | Placeholder sounds, and retro blips: pickup/coin, blip/select, power-up, jump, hit ([ZzFX for Playdate](https://devforum.play.date/t/zzfx-sound-effect-generator-for-playdate/25770)) | Chiptune tone. **Great for placeholders, wrong for "cozy night garden" final sounds** (too square and buzzy). Sine-based ZzFX with soft attacks can make OK soft "plinks". |
| **ElevenLabs SFX** (AI) | **Free tier: no commercial use** and attribution required. **Paid (from about $6/mo): commercial licence** ([costbench](https://www.costbench.com/software/ai-voice-tools/elevenlabs/free-plan/)) | Quick custom foley or magic sounds | Generate on a paid month and keep receipts or the date in the manifest. |
| **Stable Audio** (AI) | Paid tiers give commercial rights. A reported cap is apps and games up to 100k monthly active users on the Creator licence. **Stable Audio Open** (open weights) uses the Community Licence: commercial use OK under $1M revenue, though some sources call it non-commercial **(verify on stability.ai)** ([HF model card](https://huggingface.co/stabilityai/stable-audio-open-1.0), [picassoia](https://blog.picassoia.com/stable-audio-25-game-app-soundtracks)) | Ambience beds, short musical stingers | Stable Audio 3.0 was released in May 2026 ([the-decoder](https://the-decoder.com/stability-ai-launches-stable-audio-3-0-with-up-to-six-minute-tracks-and-open-weights/)). Check its current terms before using it. |
| **Hire a sound designer** | Work-for-hire, so we get full rights (put it in the contract) | Final signature sounds and music | Per sound: **$20–50** (emerging), **$40–75** (mid), **~$100** (experienced). About $50/hr or $300–400/day. Music and ambience about **$300–500 per finished minute** ([ElevenLabs blog on SFX cost](https://elevenlabs.io/blog/how-much-do-video-game-sound-effects-cost/), [GameSoundCon survey 2025](https://www.gamesoundcon.com/post/gamesoundcon-game-audio-industry-survey-2025)). A cozy word game's full set (about 30 SFX plus 3 loops plus 4 stingers) would cost roughly **$1.5k–6k**. |

**Attribution tracking (practice):** keep one **`content/audio/CREDITS.json`** or a manifest column. For each file, record source URL, author, licence (CC0 / CC-BY / Sonniss / paid-pack name / AI-tool + plan + date), whether attribution is required, and whether it was modified. Generate the in-game Credits screen from it. This is the only reliable way to stay legal across multiple games.

---

## 9. Workflow

### Naming
- Pattern: `[category]_[object]_[action]_[variant].ext`, for example `ui_button_tap_01.ogg`, `sfx_tile_place_03.ogg`, `mus_garden_layer-pad.ogg`, `amb_night_crickets_loop.ogg`, `stg_reveal_magic.ogg`. Audiokinetic recommends the same kind of structure ([Audiokinetic: naming conventions](https://www.audiokinetic.com/en/blog/naming-convention-best-practices), [Krotos](https://krotos.studio/blog/audio-for-games)).
- Lowercase, underscores between parts, two-digit variant numbers, and `_loop` on anything that loops. **Event names** in code use dots (`tile.place`), and **file names** use underscores, so they are never confused.
- Prefixes: `ui_`, `sfx_`, `amb_`, `mus_`, `stg_` (stinger), `vo_`.

### The sound list (spec sheet), one per game
This is a table in the GDD/TDD or `content/audio.json`. It is how teams plan before recording ([Lincoln: Sound List](https://gamesounddesignproject.blogs.lincoln.ac.uk/?p=34)).

| Event | When it plays | Feel tier | Bus | Priority | Variants | Loop? | Pitch rand | Max inst | Status |
|---|---|---|---|---|---|---|---|---|---|
| `tile.place` | letter placed on hex | small | sfx | med | 4 | no | ±0.5 st | 4 | placeholder (ZzFX) |
| `word.score.pop` | each letter scores, chained | small→big | sfx | high | 1 + scale ladder | no | scale | 6 | |
| `word.invalid` | rejected word | small | ui | med | 2 | no | ±0.2 | 1 | |
| `turn.yours` | your turn starts | medium | ui | high | 1 | no | none | 1 | |
| `amb.night` | always in game | — | amb | low | 1 | yes | — | 1 | |
| `stg.reveal` | secret-magic reveal | big | music | top (ducks) | 1 | no | none | 1 | |

### Iteration: placeholder to final
1. **Spec sheet first** (event list plus feel tier).
2. **Placeholder everything** with ZzFX/jsfxr or Kenney in an hour, so timing and feel can be judged in play. The `audio-setup` skill already does code-made ZzFX placeholders.
3. **Tune in game:** volume trims, pitch range, cooldowns. Do it live via `content/audio.json` and a Dev Kit "Sound board" (list of events, play button, sliders).
4. **Replace with final** (curated, AI-generated or commissioned), keeping the same event names. No code changes.
5. **Loudness pass:** record 10 minutes of play, measure with Youlean (target −16 to −18 LUFS, ≤ −1 dBTP), and adjust bus volumes.
6. **Device pass:** a real iPhone (silent switch, lock/unlock, Bluetooth), an Android phone, and desktop.

---

## Decisions to make (summary)
1. **Mix target:** −16 to −18 LUFS integrated, −1 dBTP ceiling, master limiter.
2. **Buses:** master / music / ambience / sfx / ui. **Settings sliders:** Master, Music, Ambience(?), Effects, UI, plus Mono and a haptics toggle.
3. **Silent switch:** respect it (default "ambient") vs override with `audioSession.type="playback"`.
4. **Format:** Opus .webm plus AAC .m4a fallback, or AAC-only.
5. **Music approach:** ambience-led night garden plus a layered bed (2–3 stems, one key) plus stingers. Or Wingspan/Mini Metro style, where letters and words become the music.
6. **Scoring pops:** pentatonic ladder in the music's key, capped at 8–12 steps, reset after 1–1.5 s.
7. **Sourcing:** placeholders via ZzFX/Kenney now. Finals from Sonniss and Freesound CC0, or a paid AI tier, or a hired designer ($1.5k–6k). Keep CREDITS.json from day one.

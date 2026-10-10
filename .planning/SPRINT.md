# Sprint 21 — The garden sings
Started 2026-10-10 · Milestone v0.9 The garden sings (audio) · Features: fw F28 Music + mix → F57 The garden sings + F58 Night garden mix (framework first, then here) · Branch dev/audio (framework: dev/audio)
Muzzy will hear: the music comes and goes (rests with just the night garden between), the score pops sit in tune with the music, the reveal builds (music swells through the count-up, dips for the Grand Glyphtender fanfare, settles), Pause during the reveal no longer breaks the mix. **Stays the same:** every visual, every sound effect, the Dev Kit tools (plus new music sliders).
Already in from sprint 19: score pops climb D pentatonic (ladder), word.chord, cast.flourish, reveal.count ladder + reveal.winner, amb.night loop, mus.garden once, mus.menu loop, paused/reveal snapshots.

## fw F28 🧱 Music + mix (framework/audio — design: framework/.planning/design/audio.md)
Done when: music + ambience stream (MediaElementSource into their bus) instead of fully decoding; synced layers with per-layer volume faded by one 0–1 "intensity"; gapless loops (loop points in JSON); crossfades; rests (N loops → fade to ambience-only for M s → back); stingers duck the music; mixes (snapshots) stack so one on top of another returns to it; the Sound tab shows music layers / intensity / rests as sliders.
- [x] 🤖 1. Spike: the key (and tempo) of mus.garden (harp) + mus.menu (kalimba) vs the pops' D pentatonic — retune the files to D (ffmpeg) or move the ladder root to the music's key; decide, note
- [x] 🤖 2. framework audio music.ts: streaming, synced layers + intensity, loop points, crossfades, rests, stingers duck — tests
- [x] 🤖 3. Snapshot stack (push/pop: Pause over Reveal returns to Reveal) + duck/snapshot timings in content — tests; audio 0.2.0
- [x] 🤖 4. Sound tab: a Music section (layers, intensity, rest times as sliders) — devkit

## F57 🎮 The garden sings
- [x] 🤖 5. Music in tune with the pops (apply the spike) + a soft CC0 pad/drone bed layer in that key (Freesound — key in ~/.config/freesound.json) + credits
- [x] 🤖 6. Reveal ceremony: music intensity rises through the count-up, dips for the reveal.winner fanfare, then settles (src/game/Reveal.tsx, src/game/sound.ts); the reveal Moments (src/devkit-game/moments.ts) get music knobs

## F58 🎮 Night garden mix
- [x] 🤖 7. In a game: amb.night + the bed's layers with rests · menus: mus.menu · paused: muffled — all times in content/audio.json; design/audio.md "Mix" updated
- [x] 🤖 8. Tests: framework (layers, rests, stack); e2e audio-log — a rest happens (short test times), Pause during the reveal returns to the reveal mix; check:full (Area check ALL PASS 8/8; check:full still to run)
- [ ] 🙋 9. Muzzy: a full game, listening — does the music rest? are the pops in tune? does the reveal feel like a ceremony?

Check: check:fast after each task · check:full once at the end.
Ask Muzzy: —

## Notes
- Default rests: ~2 plays, then 60–90 s of just the night garden (content/audio.json, Sound tab sliders).
- Task 1 key spike (librosa chroma × Krumhansl + Temperley profiles): harp = **A major** (r 0.92–0.97), kalimba = **G minor / B♭** (E♭maj7↔Gm). Decision: the ladder root stays D — the D pentatonic notes (D E F# A B) all sit inside A major, so the harp is left alone (D would be a +5/−7 st shift); the kalimba is retuned **−3 st to E minor/G major** (smallest shift that holds every pop note; +4 to B minor was the alternative), measured after: G-major family (G major / B minor, r 0.78–0.80; Cmaj7 ↔ Em).
- Task 5: the bed is in **A, not D** — a D drone under the A-major harp would grind against its E-major (G#) passages; an A drone suits the harp and is in the pops' scale. Bells layer is A major too (no G/G#).
- fw F28 built (framework dev/audio 06106cf, cb392cf, 1959c1c): audio 0.2.0 (121 tests) — music.tracks.<name> {layers {file, volumeDb, fromIntensity, fullAtIntensity}, loop, loopStart/EndMs, loopCrossfadeMs, playsBeforeRest, restSeconds [min,max], fadeIn/OutMs}; playMusic/stopMusic/setMusicIntensity/musicState/useMusic; music + ambience STREAM by default (amb.night gets a 100 ms crossfade at its seam — "stream": "never" if a seam is heard); push/popSnapshot — useAudioSnapshot now stacks (Pause over Reveal fixed by reinstalling). Dev Kit 0.9.0: Sound tab Music section (▶/■, Now line, Rest now / Come back now, Intensity slider, layer + rest sliders). Not tested on a real iPhone.
- Tasks 6–8 (audio 0.2.0 + Dev Kit 0.9.1 installed; 0.9.1 = framework fix: the Sound tab re-sent its copy of audio.json whenever React re-ran its effect, undoing Moments' live audio edits):
  - **garden** track = harp (first: a piece, counts the plays) · pad −8 dB always on · bells −6 dB from intensity 0.4, full 0.9. **1 play then a rest** (one 2.5-min piece, then 60–90 s of night garden — hearing the same piece twice back-to-back felt like more of a radio than a garden; Sound tab → Music → plays before a rest). Fades 4 s in / 5 s out. **The pad fades with the harp** for each rest (the whole track rests — the night garden carries the quiet).
  - Bells file rebuilt at the harp's length (149.4 s: the 40-bar loop played on, seamless, 3 s fade) — a track's layers start together, so the 106 s loop went silent for the harp's last 43 s (a reveal there would have had no bells). `mus_garden_bells_loop.mp3` → `mus_garden_bells_01.mp3`, credits updated.
  - **menu** track = kalimba loop, never rests (short visits). Old `mus.garden` / `mus.menu` sounds removed (now tracks).
  - Ceremony knobs in **content/tuning/anim.json** (Tuning → End-of-game reveal + the reveal Moments): calm 0.2 (in play + after), peak 0.9, settle 3 s; each count ramps over revealCount (1.5 s). 2 players: 0.2 → 0.55 → 0.9.
  - The ceremony **ends a rest** if the music is resting at the count-up (it always has its music).
  - Reveal mix music **−6 → −3 dB** (the music has to swell now) — Sound tab → Mixer if it crowds the counts.
- Checks: check:full ALL PASS 24/24 (c4f9118). Review (low, 2582acf..c4f9118): no findings.

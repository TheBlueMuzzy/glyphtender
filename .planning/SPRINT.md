# Sprint 21 — The garden sings
Started 2026-10-10 · Milestone v0.9 The garden sings (audio) · Features: fw F28 Music + mix → F57 The garden sings + F58 Night garden mix (framework first, then here) · Branch dev/audio (framework: dev/audio)
Muzzy will hear: the music comes and goes (rests with just the night garden between), the score pops sit in tune with the music, the reveal builds (music swells through the count-up, dips for the Grand Glyphtender fanfare, settles), Pause during the reveal no longer breaks the mix. **Stays the same:** every visual, every sound effect, the Dev Kit tools (plus new music sliders).
Already in from sprint 19: score pops climb D pentatonic (ladder), word.chord, cast.flourish, reveal.count ladder + reveal.winner, amb.night loop, mus.garden once, mus.menu loop, paused/reveal snapshots.

## fw F28 🧱 Music + mix (framework/audio — design: framework/.planning/design/audio.md)
Done when: music + ambience stream (MediaElementSource into their bus) instead of fully decoding; synced layers with per-layer volume faded by one 0–1 "intensity"; gapless loops (loop points in JSON); crossfades; rests (N loops → fade to ambience-only for M s → back); stingers duck the music; mixes (snapshots) stack so one on top of another returns to it; the Sound tab shows music layers / intensity / rests as sliders.
- [x] 🤖 1. Spike: the key (and tempo) of mus.garden (harp) + mus.menu (kalimba) vs the pops' D pentatonic — retune the files to D (ffmpeg) or move the ladder root to the music's key; decide, note
- [ ] 🤖 2. framework audio music.ts: streaming, synced layers + intensity, loop points, crossfades, rests, stingers duck — tests
- [ ] 🤖 3. Snapshot stack (push/pop: Pause over Reveal returns to Reveal) + duck/snapshot timings in content — tests; audio 0.2.0
- [ ] 🤖 4. Sound tab: a Music section (layers, intensity, rest times as sliders) — devkit

## F57 🎮 The garden sings
- [x] 🤖 5. Music in tune with the pops (apply the spike) + a soft CC0 pad/drone bed layer in that key (Freesound — key in ~/.config/freesound.json) + credits
- [ ] 🤖 6. Reveal ceremony: music intensity rises through the count-up, dips for the reveal.winner fanfare, then settles (src/game/Reveal.tsx, src/game/sound.ts); the reveal Moments (src/devkit-game/moments.ts) get music knobs

## F58 🎮 Night garden mix
- [ ] 🤖 7. In a game: amb.night + the bed's layers with rests · menus: mus.menu · paused: muffled — all times in content/audio.json; design/audio.md "Mix" updated
- [ ] 🤖 8. Tests: framework (layers, rests, stack); e2e audio-log — a rest happens (short test times), Pause during the reveal returns to the reveal mix; check:full
- [ ] 🙋 9. Muzzy: a full game, listening — does the music rest? are the pops in tune? does the reveal feel like a ceremony?

Check: check:fast after each task · check:full once at the end.
Ask Muzzy: —

## Notes
- Default rests: ~2 plays, then 60–90 s of just the night garden (content/audio.json, Sound tab sliders).
- Task 1 key spike (librosa chroma × Krumhansl + Temperley profiles): harp = **A major** (r 0.92–0.97), kalimba = **G minor / B♭** (E♭maj7↔Gm). Decision: the ladder root stays D — the D pentatonic notes (D E F# A B) all sit inside A major, so the harp is left alone (D would be a +5/−7 st shift); the kalimba is retuned **−3 st to E minor/G major** (smallest shift that holds every pop note; +4 to B minor was the alternative), measured after: G-major family (G major / B minor, r 0.78–0.80; Cmaj7 ↔ Em).
- Task 5: the bed is in **A, not D** — a D drone under the A-major harp would grind against its E-major (G#) passages; an A drone suits the harp and is in the pops' scale. Bells layer is A major too (no G/G#).

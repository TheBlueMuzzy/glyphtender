# Sprint 20 — Tune every sound and moment by ear in the Dev Kit
Started 2026-10-10 · Milestone v0.9 The garden sings (audio) · Features: fw F30 Sound Board → fw F32 Moments + feel presets (framework first, then installed here) + Dev Kit search per tab (Muzzy 2026-10-10) · Branch dev/audio (framework: dev/audio)
Muzzy will see: the Dev Kit (` key) gets a **Sound** tab (every sound: play, sliders, swap files by dropping them in, A/B, mixer, log) and **Screens** gets **Moments** (fire or loop a moment — score pop, tangle, the Grand Glyphtender fanfare… — with a 3-style preset picker that sets all its sliders, then every slider stays tweakable); the search box only searches the tab you're on. **Stays the same:** the game itself — nothing changes unless he saves a tweak.

## fw F30 🔧 Sound Board (framework/audio/devkit → Dev Kit tab) — design: framework/.planning/design/audio.md "Dev Kit — Sound Board"
Done when: the Sound tab lists every sound in content/audio.json by bus; ▶ / ▶×5; every knob a slider reading the wildcard `_ranges` (live via setConfig, Save writes the JSON, ↺ per field); files list (▶ each, remove, reorder, drop to add → converted to MP3, trimmed to its onset, saved under public/audio, credits asked); A/B; mixer + meters; play/drop log; waveform trim + loop handles.
- [ ] 🤖 1. Spike: how a Moment plays WITH sound — the Screens sandbox mutes audio (src/devkit/previews/sandbox.ts); unmute it there for Moments, or fire the moment in the live game through the game adapter (like Snapshots). Pick, note in the design doc
- [x] 🤖 2. Binary save route (devkit vite plugin: only public/audio, dev only) + convert to MP3 + onset trim (ffmpeg — B026 lesson) + source/licence prompt → content/credits.json
- [x] 🤖 3. The Sound tab: list by bus · ▶ / ▶×5 · knob sliders (live, Save, ↺) · files (▶, remove, reorder, drop) · A/B · mixer with faders + meters · log
- [x] 🤖 4. Waveform with drag handles for trim + loop points

## fw F32 🔧 Moments + feel presets (Dev Kit → Screens)
Done when: Screens → a screen → its Moments; ▶ fires one, 🔁 loops it while sliders change; each moment's sliders span feel (content/tuning/feel.json), timing (anim.json) and sound (audio.json); a 3-position preset picker sets them all; any slider stays tweakable after; Save writes the files.
- [ ] 🤖 5. Research the preset styles (Unity Feel / MMFeedbacks, DOTween, Celeste's subtle vs Vlambeer's loud, "Juice it or lose it", the UI kit's 5 styles as the model) → our 3 styles (working names Soft · Balanced · Punchy) and what each moves → framework design doc
- [ ] 🤖 6. Moments in the Dev Kit: the game registers moments (id, screen, label, play, knobs); Screens → Moments section; ▶ / 🔁 loop; sliders; preset picker; Save
- [ ] 🤖 7. Glyphtender's moments: score pop · seed lands + sprout · two-birds cast · tangle · no-shake · your turn · reveal count-up · new Grand Glyphtender — each with its knobs + 3 preset values; install Dev Kit + audio updates; TDD §3 Dev Kit tools

## Dev Kit search per tab (Muzzy 2026-10-10: "the search board should only function for the tab the developer is on… if I'm in screens, my search should function within screens content only")
Today the search box searches every tab at once (DevKit.tsx countMatches, grouped by tab) and Screens doesn't take part.
- [ ] 🤖 8. Framework devkit: search scoped to the open tab; every tab answers it (Color, Tuning, AI, Snapshots, Bugs, Screens — by screen name, Sound, Moments); e2e devkit-search updated

## Checks
- [ ] 🤖 9. Tests: preset + save unit tests; e2e — a Sound tab edit changes what plays, a dropped file lands + plays, a fired Moment logs its sounds, search stays in its tab; check:full
- [ ] 🙋 10. Muzzy: try the Sound tab + Moments — tweak a sound, loop the score pop through the 3 presets, search inside a tab

Check: check:fast after each task · check:full once at the end.
Ask Muzzy: —

## Notes
- fw F30 built (framework dev/audio 92004fd, df5ca05): devkit 0.7.0 + audio 0.1.2. Sound tab in devkit/kit/sound (soundTab(getAudio, { file: audioJson })); POST /__devkit/save-audio (public/audio/<folder>/<stem>_NN.mp3, never overwrites; system ffmpeg; sfx/ui trimmed to onset) + POST /__devkit/add-credit. Removing a file only drops it from the list (MP3 stays); a dropped file stays in the list only after Save. Tried in a throwaway worktree: ▶×5, waveform trim, WAV drop → trimmed 76 ms → plays, meters move. devkit 246 tests, audio 92.

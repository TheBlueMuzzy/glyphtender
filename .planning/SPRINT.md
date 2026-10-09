# Sprint 19 — You hear the game for the first time
Started 2026-10-09 · Milestone v0.9 The garden sings (audio) · Features: fw F27 → fw F29 + F59 → F56 → F55 (framework first, then switched on here) · Branch dev/audio (framework: dev/audio) · **Auto mode** (Muzzy 2026-10-09: "I mostly want you to do this in auto mode so i can sleep")
Muzzy will see: after the first tap the game makes a sound at every moment (31 sounds, free-library placeholders); Settings → Audio has working Master · Music · Ambience · Effects · UI sliders + Mute everything · Mute in background · Mono (Voices row gone). **Stays the same:** every visual and timing — the game looks and plays exactly as before (golden + shots).

## fw F27 🧱 Audio engine + rules (framework/audio — design: framework/.planning/design/audio.md)
Done when: framework/audio/kit installs to src/audio/; code plays named sounds; content/audio.json drives them; planner rules unit-tested; engine tested with a fake AudioContext; window.__audioLog in dev/tests.
- [ ] 🤖 1. Spike: script-download free sound packs (Kenney, OpenGameArt CC0); Freesound / Sonniss need a login? → if the vibe can't be met, `Ask Muzzy:` for an account (Muzzy: "you can ask me to create an account for the others")
- [ ] 🤖 2. Module skeleton (framework/audio: kit/, scripts/install-audio.mjs + test, package.json, README, VERSION) + config.ts (types, defaults, validation of content/audio.json)
- [ ] 🤖 3. planner.ts: variants (random-no-repeat · sequence · shuffle), random pitch/volume, voices + cooldown + priority, ladder (pentatonic, steps, reset), stale + suspended drop — unit tests
- [ ] 🤖 4. engine.ts + loader.ts + log.ts + react.ts: first-tap unlock, buses → master → limiter, silent switch (audioSession ambient), hidden/interrupted = drop not queue, mono, basic snapshots, decode cache — fake-context tests
Check: framework audio tests + tsc.

## fw F29 + F59 🎮 Settings → Audio
Done when: the kit's standard Audio tab (Master · Music · Ambience · Effects · UI · Mute everything · Mute in background · Mono; defaults 80/50/60/80/70) moves the engine's buses live; slider → dB curve.
- [ ] 🤖 5. Kit standard rows (framework ui-kit template) → content/ui/settings.json + src/ui/gameSettings.ts → audio buses; visibilitychange for "mute in background"

## F56 🎮 Placeholder sound set
Done when: ~60 files for the 31 sounds in public/audio/{sfx,ui,amb,mus,stg}/ (MP3, mono sfx), garden palette (wood, glass, bells, kalimba/harp, soft earth, water — never arcade), every file in content/credits.json.
- [ ] 🤖 6. Pick, trim, convert and name the files; credits

## F55 🎮 Every moment wired (design/audio.md sound list)
Done when: all 31 sounds play at their animation's moment (not the event's); bots/online rivals sound like people; online catch-up silent; reduce motion keeps sounds; feel tiers carry a default sound.
- [ ] 🤖 7. content/audio.json (31 sounds, _help/_labels/_sections/_ranges) + playSound at each moment (useThrow, useGlide, usePieceInput, gameStore, scoreSequence/ScorePops, DangerCue, refuseTap, useTurnPulse, Handoff, Reveal, EndHighlights, OnlineSession, kit Button/Toggle) + feel.json tiers → sounds
- [ ] 🤖 8. Install in Glyphtender (src/audio/), PWA cache for sfx (vite.config.ts globPatterns), audio-setup skill → points at the module
- [ ] 🤖 9. Tests: e2e reads __audioLog (a cast logs seed.land at the landing; a reconnect plays no burst); check:golden + check:shots unchanged
- [ ] 🙋 10. Muzzy plays a game with sound on phone + desktop — first impressions (tuning is sprint 21)

Check: check:fast after each feature · check:full once at the end.
Ask Muzzy: —

## Notes

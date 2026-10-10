# Sprint 19 — You hear the game for the first time
Started 2026-10-09 · Milestone v0.9 The garden sings (audio) · Features: fw F27 → fw F29 + F59 → F56 → F55 (framework first, then switched on here) · Branch dev/audio (framework: dev/audio) · **Auto mode** (Muzzy 2026-10-09: "I mostly want you to do this in auto mode so i can sleep")
Muzzy will see: after the first tap the game makes a sound at every moment (31 sounds, free-library placeholders); Settings → Audio has working Master · Music · Ambience · Effects · UI sliders + Mute everything · Mute in background · Mono (Voices row gone). **Stays the same:** every visual and timing — the game looks and plays exactly as before (golden + shots).

## fw F27 🧱 Audio engine + rules (framework/audio — design: framework/.planning/design/audio.md)
Done when: framework/audio/kit installs to src/audio/; code plays named sounds; content/audio.json drives them; planner rules unit-tested; engine tested with a fake AudioContext; window.__audioLog in dev/tests.
- [x] 🤖 1. Spike: script-download free sound packs (Kenney, OpenGameArt CC0); Freesound / Sonniss need a login? → if the vibe can't be met, `Ask Muzzy:` for an account (Muzzy: "you can ask me to create an account for the others")
- [x] 🤖 2. Module skeleton (framework/audio: kit/, scripts/install-audio.mjs + test, package.json, README, VERSION) + config.ts (types, defaults, validation of content/audio.json)
- [x] 🤖 3. planner.ts: variants (random-no-repeat · sequence · shuffle), random pitch/volume, voices + cooldown + priority, ladder (pentatonic, steps, reset), stale + suspended drop — unit tests
- [x] 🤖 4. engine.ts + loader.ts + log.ts + react.ts: first-tap unlock, buses → master → limiter, silent switch (audioSession ambient), hidden/interrupted = drop not queue, mono, basic snapshots, decode cache — fake-context tests
Check: framework audio tests + tsc.

## fw F29 + F59 🎮 Settings → Audio
Done when: the kit's standard Audio tab (Master · Music · Ambience · Effects · UI · Mute everything · Mute in background · Mono; defaults 80/50/60/80/70) moves the engine's buses live; slider → dB curve.
- [x] 🤖 5. Kit standard rows (framework ui-kit template) → content/ui/settings.json + src/ui/gameSettings.ts → audio buses; visibilitychange for "mute in background"

## F56 🎮 Placeholder sound set
Done when: ~60 files for the 31 sounds in public/audio/{sfx,ui,amb,mus,stg}/ (MP3, mono sfx), garden palette (wood, glass, bells, kalimba/harp, soft earth, water — never arcade), every file in content/credits.json.
- [x] 🤖 6. Pick, trim, convert and name the files; credits

## F55 🎮 Every moment wired (design/audio.md sound list)
Done when: all 31 sounds play at their animation's moment (not the event's); bots/online rivals sound like people; online catch-up silent; reduce motion keeps sounds; feel tiers carry a default sound.
- [x] 🤖 7. content/audio.json (31 sounds, _help/_labels/_sections/_ranges) + playSound at each moment (useThrow, useGlide, usePieceInput, gameStore, scoreSequence/ScorePops, DangerCue, refuseTap, useTurnPulse, Handoff, Reveal, EndHighlights, OnlineSession, kit Button/Toggle) + feel.json tiers → sounds
- [x] 🤖 8. Install in Glyphtender (src/audio/), PWA cache for sfx (vite.config.ts globPatterns), audio-setup skill → points at the module
- [x] 🤖 9. Tests: e2e reads __audioLog (a cast logs seed.land at the landing; a reconnect plays no burst); check:golden + check:shots unchanged
- [x] 🙋 10. Muzzy plays a game with sound on phone + desktop — first impressions (tuning is sprint 21)

Check: check:fast after each feature · check:full once at the end.
Ask Muzzy: —

## Notes
- F56 (9f261a4): 56 MP3s, effects 269 KB (mono 96 kbps, peak −3 dBFS), music ~2.4 MB, ambience 717 KB. Kenney + OpenGameArt by script (no login); Freesound needs a login, Sonniss 403s scripts. Licences: CC0 + two CC-BY 3.0 (glass bell → turn.yours; wind loop → amb.night) → credit lines on Credits. Ladder notes pre-tuned to D (score.pop kalimba D4, reveal.count tongue drum D5). mus.garden is a 149 s harp piece with an ending (play once, then rest — not a loop). Weak fits listed in design/audio.md "Placeholder files". Can't listen → picks by description + ffmpeg measurements.
- Kenney Interface Sounds + OGA "Cozy Farm SFX" measure as code-made tones (spectral flatness ≈ 0) → avoided (Roll Better lesson).
- fw F27 + F29 built (framework dev/audio badce88..af30113): audio 0.1.0 — 90 tests; ui-kit 0.4.1 standard Audio tab (212 tests). API: createAudio / setAudio / playSound(name,{at,catchUp,step…}) / playTier / setBusVolume(slider) / snapshot / duck / useLoop / exposeLog. Slider curve gain = (s/100)² (50 → −12 dB). Ladder sounds get no random pitch. Mute everything keeps loops running silently. Streaming music → fw F28 (beta loops fully decoded for now). _ranges use wildcard keys ("sounds.*.volumeDb") → the Sound Board must read them.
- F55 wiring (sprint 19, overnight): engine made in `src/game/sound.ts` (startSound in main.tsx, never in the Dev Kit preview frame → the Screens sandbox stays silent). Sounds play where each animation plays; taps in the store actions. Online: my own draft sounds on my tap; a rival's replay plays the same paths (glide, throw, score); another seat's placement → draft.place in onlinePlay.show.
- Call: **catch-up = a jump** (startFrom / jumpTo / loadState → `happened` null). Things that appear on a jump (danger cues, the turn chime) pass `catchUp` → silent. **Queued replays after a reconnect still sound**: they animate one at a time (trail → glide → throw → score), so there's no burst and the sound matches what's seen.
- Call: feel tiers → `feel.ts juiceSound(moment, sound)`: every juiced moment already has its own sound (seedPop → score.pop, totalPop → score.arrive / reveal.bonus, turnPulse → turn.yours, noShake → no, refreshGrow → refresh.in), so the tier sound (tier.small / medium / big in audio.json) plays only if that sound has no files. No double sounds.
- Call: ladder steps 8 (was 10 — above ~+12 semitones sounds chipmunky); score.pop names its step (pop 0, 1, 2…), reveal.count the player's count step. Word chord at 5+ letters, flourish at 2+ words → `feel.json sounds` (tweakable).
- Call: reveal.winner on the **effects** bus (not music): the reveal mix dips music −6 dB and its own duck would dip it too. Skip / reduce motion jumping to the end still plays the fanfare.
- Call: mus.garden (one-shot, has an ending) is preloaded when the game screen opens, then played — one-shots that aren't loaded yet are dropped by the engine, and music isn't in the effects preload. A new game (new options) plays it again.
- Call: PWA precaches effects (+392 KB, 188 entries); music + ambience runtime CacheFirst (`glyphtender-music`, rangeRequests on for F28).
- Call: kit buttons whose press has its own sound pass `sound={false}` (Shuffle, Undo, Cast with a seed, Refresh N, Show my seeds). Back / Close ✕ / Resume say ui.back (UI kit 0.4.2, framework dev/audio e5e99c6).
- Surprise: the engine used Math.random → under `?freeze` a click's sound shifted the tray's shuffle (game-play / pause / rules shots differed). Fix: the engine gets its own dice (`rng: seededRandom(Date.now())`). Framework follow-up: make that the engine's default.
- Surprise: one out-of-range value (online.idle cooldown 1000 > 500) — sound.test.ts caught it (audio.json must read with zero warnings).
- Surprise: `src/audio/react.ts` has an exhaustive-deps lint warning → src/audio ignored by the game's lint like src/ui/kit (framework copy).
- Pause during the reveal: closing Pause sets the mix to normal, not back to "reveal" (one snapshot at a time) — minor, for the Sound Board / F58.
- check:shots: only Settings → Audio differs (new rows, 7 sizes; 768×343 shows only the tabs) → re-recorded those 7, all 192 SAME after. check:golden SAME.

- Area check (Fast + audio game pass online online4 score spotlight end previews devkit-search): 14/14 PASS, 7.8 min. e2e:audio = new, registered in check:full (ports 5417 / 1992).
- Checks: check:full ALL PASS 23/23 (c76b377). Two earlier loaded runs failed e2e:game desktop (reveal already showing) → B025 watching. Review (low, 2492550..71be2d3): 1 fix — word.chord guard for a word with no pops (c76b377). Framework audio 0.1.1: the engine uses its own seeded random by default.
- Freesound (Muzzy made the account 2026-10-09; key in ~/.config/freesound.json, PC only) → 96ca02c replaced the 5 weak fits, all CC0: owl mixed into amb.night (loop length kept), leafy sprout + soft chime, vine rustle + tree creak (tangle — may be quiet on phone speakers), harp glissando → choir fanfare in D (reveal.winner), 3 soft whooshes (cast.throw — longer, may overlap seed.land; delayMs/trimEndMs). mus.menu kept.
- Muzzy 2026-10-10: "sounds are okay - not amazing. good enough for now since it proved out the system of implementation. keep." → approved. His one report: dragging during setup sounded "really delayed" → B026 (5 tap files started with 40–70 ms of near-silence; trimmed).

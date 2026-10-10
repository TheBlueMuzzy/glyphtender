# Glyphtender — sound design (beta)

Defined with Muzzy 2026-10-09. Engine and rules: the framework Audio module (`../../../framework/.planning/design/audio.md`). Research: `research/audio.md`.

## Direction: **The garden sings** (Muzzy 2026-10-09: "B")
> "remember the theme/setting. it's a grand competition for who becomes the Grand Glyphtender. It happens once a generation. However, it's a cozy magical world."

- **A night garden at a once-in-a-generation contest.** Quiet, warm, a little ceremonial: lanterns, crickets, a soft breeze, the hush of an audience that's mostly owls.
- **Your play is the melody.** Gentle tones at the moments that matter, all in one key (**D major pentatonic**, so nothing ever clashes):
  - score pops climb that key, so a clever cast rings out
  - a long word lands a chord
  - a two-birds cast gets a flourish
- **The Magic reveal is the ceremony.** It builds as each total counts up (a rising run), and the new **Grand Glyphtender** gets a short, grand-but-gentle fanfare (soft horn or choir swell, bells). Grand because it happens once a generation; gentle because nobody is attacked.
- **Material palette** (one family, so it all belongs together):
  - wood and felt (taps, steps)
  - glass and small bells (magic, pops)
  - kalimba, harp and celesta (melodic)
  - soft earth (seeds)
  - water (the magic splash)
  - Never harsh, buzzy or "arcade".
- **Beta = good enough** (Muzzy 2026-10-09: "don't let perfect be the enemy of good").
  - **Must:** the systems are right and every moment is placeholder-sounded from free libraries.
  - **Try to:** a vibe that's on theme.
  - **Later (1.0's final audio pass):** finals may come from paid or AI tools or a sound designer.
- **Feel tiers get sounds** (Muzzy: "idk. try it"): small / medium / big each get a default sound. We try it and judge by ear; it's easy to turn off per moment.

## Mix
- **Volume groups:** Ambience (night garden) · Music (a very quiet bed + the reveal ceremony) · Effects (the board) · UI (menus, tray taps).
- **The garden at rest:** ambience always; the music bed comes in softly and **rests** after a few loops. Thinking time should feel like a quiet night, not a radio.
- **Big moments duck the music:** two-birds, tangle, reveal.
- **Pause:** muffled and quieter (snapshot). **Reveal:** ambience and music dip so the ceremony is clear.

## Sound list (beta)
Each sound fires at its animation's moment (code: where the visual plays), never on the raw event. **Twin** = what you also see, so sound is never the only signal.

| # | Sound (`content/audio.json`) | Plays when | Code moment | Tier · bus | Twin |
|---|---|---|---|---|---|
| 1 | `draft.place` | a glyphling lands on its draft spot | `draftAt`, `landBotDraft` | small · sfx | the glyphling appears |
| 2 | `glyph.lift` | you pick a glyphling up (drag) | `usePieceInput` startDrag | tiny · ui | it lifts |
| 3 | `glyph.step` | a glide settles on its hex | `useGlide` end | small · sfx | glide |
| 4 | `seed.pick` / `seed.drop` | a seed is picked or put back in the tray | `tapSeed` / `grabSeed` | tiny · ui | tray |
| 5 | `seed.aim` | a seed is aimed at a hex (planned) | `tapHex` | tiny · ui | planned look |
| 6 | `cast.throw` | the hop → throw whoosh | `useThrow` hop end | small · sfx | flight |
| 7 | `seed.land` | the seed lands (soft earth + a little water) | `useThrow` onLanded | medium · sfx | landing |
| 8 | `sprout.grow` | the letter grows | `useThrow` grow | small · sfx | grow |
| 9 | `score.pop` **ladder** | each scoring seed pops: each pop one step higher | `scoreSequence` pop times | small → · sfx | pop |
| 10 | `score.arrive` | points land in the total | `scoreSequence` arrivals | medium · sfx | total grows |
| 11 | `word.chord` | a word of 5+ letters finishes scoring | score sequence, per word | medium · sfx | spotlight |
| 12 | `cast.flourish` | a two-birds cast (2+ words) — ducks the music | score sequence end | big · sfx | — |
| 13 | `danger.warn` | a glyphling has one move left | `DangerCue` appears | small · sfx | warning cue |
| 14 | `tangle` | a glyphling gets tangled: a "smile or groan", not an alarm | `tangled` event, cue shows | big · sfx | vine |
| 15 | `no` | the no-shake (soft wooden bonk) | `refuseTap` | small · ui | shake |
| 16 | `refresh.out` / `refresh.in` | seeds leave and arrive in the tray | `refreshNow` stages | small · ui | tray |
| 17 | `tray.shuffle` | shuffle | `shuffleTray` | tiny · ui | tray |
| 18 | `undo` | take back | `undo` | tiny · ui | glide back |
| 19 | `turn.yours` | your turn starts (only on your device) | `useTurnPulse` | medium · ui | pulse |
| 20 | `handoff` | "pass to Blue" | `Handoff` opens | small · ui | screen |
| 21 | `reveal.tangles` | reveal step 1 | `Reveal.tsx` steps | medium · sfx | — |
| 22 | `reveal.count` **ladder** | each player's total counts up: a rising run | count step | small → · sfx | count-up |
| 23 | `reveal.bonus` | each +3 tangle bonus pops | bonus landing | small · sfx | +3 |
| 24 | `reveal.winner` (stinger) | the Grand Glyphtender is named | winner step | big · music | winner |
| 25 | `end.award` | an award card shows on the end screen | `EndHighlights` | small · ui | card |
| 26 | `online.idle` | the idle bar appears on your screen | `OnlineSession` | small · ui | the bar |
| 27 | `online.toast` | a player left / is back / bot plays | seat toasts | tiny · ui | toast |
| 28 | `ui.tap` / `ui.back` / `ui.toggle` | menu buttons (confirm up, back down) | kit Button / Toggle | tiny · ui | — |
| 29 | `amb.night` (loop) | in a game: crickets, breeze, the odd owl | game screen | — · ambience | — |
| 30 | `mus.garden` (layers, rests) | in a game, very quiet; menus too | game + menu | — · music | — |
| 31 | `mus.menu` | main menu | menu | — · music | — |

That's about 31 sounds and ~60 files with variants. The heaviest repeaters (`glyph.step`, `seed.pick`, `score.pop`, `ui.tap`) get 3–5 variants.

## Rules this game adds
- **Bots and online rivals sound exactly like people** (AI-looks-human standard): same sounds, same moments.
- **Secrets stay secret:** sounds only you should hear stay on your device, like your own tray refresh in pass-and-play.
- **Online catch-up is silent** (framework rule). A rival's replayed turn plays its sounds as it animates.
- **Reduce motion:** the score sequence and reveal skip their flying, but the sounds still play, compressed: the ladder run still rises.
- **Handoff (pass-and-play):** the turn chime plays once the new player is looking (after "I'm Blue"), not to the room.

## Sources (beta: free only — Muzzy 2026-10-09: "free libraries… for now")
- **Kenney** (CC0): UI taps, impacts, jingles.
- **Sonniss GDC bundles** (free, commercial, no credit needed, can't resell the raw files): foley, nature, magic, bells.
- **Freesound — CC0 / CC-BY only, never CC-BY-NC**: night ambience, kalimba, harp, water.
- **OpenGameArt — CC0**: cozy music loops and stingers.
- Every file → `content/credits.json`, with 🟡 credit lines shown in Credits.

## Placeholder files (sprint 19)
All in `public/audio/`, real recordings only (no code-made sounds), every file in `content/credits.json`. Effects: mono MP3 96 kbps, lead silence trimmed, faded, peak −3 dBFS with RMS capped at −15 dBFS (set per-sound volume in `content/audio.json`). Stinger −16 LUFS, music −20 LUFS, ambience −26 LUFS (stereo, 128 kbps; garden harp is VBR to stay under 2 MB). Effects total ≈ 290 KB (+83 KB stinger); music ≈ 2.4 MB; ambience 0.7 MB. **Ladder notes are pre-tuned to D**, so playbackRate = 2^(semitones/12) up the D major pentatonic (0, 2, 4, 7, 9, 12…).

| Sound | File(s) | Source | Notes |
|---|---|---|---|
| `draft.place` | `sfx/sfx_draft_place_01–02` | Kenney Impact (wood medium) | soft wooden thunk |
| `glyph.lift` | `ui/ui_glyph_lift_01–02` | Kenney RPG (cloth) | felt lift, cut to 220 ms |
| `glyph.step` | `sfx/sfx_glyph_step_01–05` | Kenney Impact (wood light) | light wood taps |
| `seed.pick` | `ui/ui_seed_pick_01–04` | cogitollc Pop sounds | round mouth pops |
| `seed.drop` | `ui/ui_seed_drop_01–02` | rubberduck 100 CC0 SFX (plop) | |
| `seed.aim` | `ui/ui_seed_aim_01–02` | Kenney Impact (glass light) | tiny glass tink, low-passed |
| `cast.throw` | `sfx/sfx_cast_whoosh_01–03` | Freesound: Sadiquecat Stick Whoosh 7 (Soft), Woosh Plastic Tray 2, Woosh Metal Skimmer 1 (slowed, +2 st) | ✅ *F56:* soft airy swings, 460–580 ms, mic rumble cut (high-pass 150 Hz) — resolved |
| `seed.land` | `sfx/sfx_seed_land_01–02` | Kenney soft impact + rubberduck splash | layered: earth thud + a little water |
| `sprout.grow` | `sfx/sfx_sprout_leaf_01–02` | Freesound: squidge316 "one plant grows with lettuce" / elliotlp "Crumple Dry Leaf 1" + ZenithInfinitiveStudios Fantasy UI Button 5 / 4 | ✅ *F56:* leafy growth crunch (low-passed 6 kHz) + a soft chime 7 dB under, ~0.6 s — resolved (brighter than the old bloop; trim `volumeDb` if it pokes out) |
| `score.pop` **ladder** | `sfx/sfx_score_pop_01` | railkill Kalimba Two-Notes | real kalimba, **root D4 (measured D4 −2 c)**, 610 ms |
| `score.arrive` | `sfx/sfx_score_arrive_01–02` | Kenney Impact (glass medium) | glass clink (pitch ≈ B5/C6, not in key — fine for a clink) |
| `word.chord` | `sfx/sfx_word_chord_01` | the kalimba note, layered | D4-F#4-A4-D5 strum, 35 ms apart (in key) |
| `cast.flourish` | `sfx/sfx_cast_flourish_01` | Spring Spring "health restore" | harp-like magic run, 1.7 s |
| `danger.warn` | `sfx/sfx_danger_warn_01` | pwl Bell dings | small bell with a tremble (D#4) — **weak-ish**: gentle but could read as "ding" rather than "careful" |
| `tangle` | `sfx/sfx_tangle_vine_01–02` | Freesound: j1987 "bushhit" / zepurple "tree shake" + Comradar tree_creak_3 / _2 | ✅ *F56:* leafy wrap (low-passed) + a soft wooden tree creak (the "groan"), 0.64–0.71 s — resolved; the old boing's "smile" is gone, the creak carries it |
| `no` | `ui/ui_no_bonk_01–02` | Kenney Impact (wood heavy) | soft wooden bonk |
| `refresh.out` | `ui/ui_refresh_out_01` | artisticdude Swishes | low soft swish |
| `refresh.in` | `ui/ui_refresh_in_01` | cogitollc pops, layered | three rising pops |
| `tray.shuffle` | `ui/ui_tray_shuffle_01` | Kenney Casino (card fan) | paper riffle, 450 ms |
| `undo` | `ui/ui_undo_01` | artisticdude Swishes (reversed) | a "whoop" back |
| `turn.yours` | `ui/ui_turn_yours_01` | Varkalandar Glass Bell (🟡 credit) | glass bell **retuned to D5** |
| `handoff` | `ui/ui_handoff_01` | Kenney Casino (card slide) | passing slide |
| `reveal.tangles` | `sfx/sfx_reveal_tangles_01` | railkill Mystery Sting | steel tongue drum A3→E4, mysterious opener |
| `reveal.count` **ladder** | `sfx/sfx_reveal_count_01` | railkill Mystery Sting | steel tongue drum note, **root D5 (measured D5 ±0 c)** |
| `reveal.bonus` | `sfx/sfx_reveal_bonus_01–02` | rubberduck gem + Kenney glass | small tinks |
| `reveal.winner` | `stg/stg_reveal_winner_01` | Freesound: oggraphics "Good answer harp glissando" + qubodup "Angelic Fanfare 2" | ✅ *F56:* harp sweep up into a choir fanfare, both **retuned C → D major** (+2 st, measured key D major), 5.2 s, −16 LUFS — resolved (grander but still soft: no brass/drums) |
| `end.award` | `ui/ui_end_award_01` | Spring Spring Pleasing Bell | F#5 — in key |
| `online.idle` | `ui/ui_online_idle_01` | railkill Kalimba Two-Notes | both notes, retuned to D4→A4 |
| `online.toast` | `ui/ui_online_toast_01` | Kenney Impact (glass light) | tiny tink |
| `ui.tap` | `ui/ui_button_tap_01–03` | rubberduck wood (wood_hit, wood_misc) | wood knocks, 120 ms |
| `ui.back` | `ui/ui_button_back_01` | rubberduck wood_hit_09 | lower knock |
| `ui.toggle` | `ui/ui_toggle_flip_01` | rubberduck wooden_01 | |
| `amb.night` (loop) | `amb/amb_night_garden_loop` | wolfgang Crickets (CC0) + AntumDeluge/InspectorJ Wind Loop (🟡) + Freesound: Anthousai "owl.wav" (CC0) | **loop 0 → 45 808 ms** (4 × the 11.45 s cricket loop; breeze low-passed, seam crossfaded). ✅ *F56:* a distant owl (band-passed 180–1400 Hz + echo) mixed in twice per loop: a hoo-hoooo phrase at 13 s (left, 9 dB under the bed) and one hoo at 33.5 s (right, 13 dB under); loop length and loudness (−26 LUFS) unchanged — resolved |
| `mus.garden` | `mus/mus_garden_harp_01` | Écrivain "Meadow Thoughts" (solo harp, CC0) | 149 360 ms, a through-composed piece with a natural ending (**not a loop**): play once, then rest, fits "rests after a few loops". *F57:* measured **A major** (r 0.92–0.97, two methods; rubato, ~59/117 BPM) — every D-pentatonic pop note (D E F# A B) is in A major, so **not retuned** |
| `mus.garden` pad layer (loop) | `mus/mus_garden_pad_loop` | Freesound: speakwithanimals "Rain Slowly Passing PAD A440" (CC0) | *F57:* a soft sustained **A drone** (A + E + C# overtones — the harp's key, also inside D pentatonic), high-pass 100 Hz + low-pass ~2 kHz (warm, no bass), **loop 0 → 150 000 ms** (4 s crossfade at the seam), −22 LUFS. Not yet wired in content/audio.json (task 7) |
| `mus.garden` bells layer (loop, for "intensity") | `mus/mus_garden_bells_loop` | Freesound: deadrobotmusic "Ambient Cute Bell Texture [90bpm]" (CC0) | *F57:* soft bell texture, measured **A major** (A C# D E B — no G/G#, so it fits D pentatonic too), 90 BPM, **loop 0 → 106 667 ms** (exactly 40 bars, made as a loop, kept whole), −22 LUFS. ~150 notes/min — keep it low; meant to fade in only for the reveal |
| `mus.menu` (loop) | `mus/mus_menu_kalimba_loop` | extenz "Short kalimba loop" (CC0) | *F57:* **retuned −3 st** (measured G minor/B♭ — E♭maj7 ↔ Gm, clashes with the pops' F# and B — now **G major family (Cmaj7 ↔ Em; measured G major / B minor)**, which holds every D-pentatonic note; rubberband, tempo ~82 BPM kept, seam crossfaded 186 ms), −20.4 LUFS. **loop 0 → 46 837 ms** (made as a loop, kept whole). Not heard; alt: "Gentle Lullaby Loop" by Frances Calceta (CC-BY 3.0, 34 s). *F56:* kept — no clearly better CC0 loop on Freesound (candidates if it bores: blankie.rest "Sleepy Upright Piano Seamless Loop" 116 s, csnmedia "Music box lullaby" 84 s) |

Freesound replacements (F56) were rebuilt by a script in the session scratchpad (`fs/build2.py`, reusing `sounds/build.py`'s processing); every source is CC0.

Loop points assume the browser's MP3 decoder honours the LAME gapless header (Chrome and Firefox do). If a click shows up at the seam, set `loopStart`/`loopEnd` to the times above.

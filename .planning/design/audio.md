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

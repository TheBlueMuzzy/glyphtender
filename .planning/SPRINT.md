# Sprint 26 — A new player is dropped straight into a game against Sprout
Started 2026-10-13 · Milestone v0.14 The first game teaches itself · Features: F72, F73, F74, F75 (in this order; F72 / F73 framework / F75 run side by side, F74 after F73)
Design: design/tutorial.md · Branch: dev/tutorial

## F72 🎮 "Plant" everywhere
Done when: no player-facing or Dev Kit text says "cast" (code names stay); the button reads Plant / Plant · +N.
- [x] 🤖 1. en.json: the 8 player strings (game.prompts cast/castHeld/ready/moveOnly, buttons cast/castMagic, submitWord.placeSeed, rules page 1) — content/text/en.json
- [x] 🤖 2. Dev Kit words: tuning `_labels` / `_help` / `_sections` ("Move & plant highlights") + content/devkit.json sectionOrder + content/ai/pace.json + modes.json + audio.json help; Dev Kit-only strings in src/devkit-game/moments.ts, previews.tsx, src/ai/meters.ts
- [x] 🤖 3. e2e scripts that look for "Cast" text → "Plant"; re-record screenshots (meant change)
- [x] 🤖 4. update GDD §4 (rules + controls say plant)
Check: grep finds no player/Dev Kit "cast" text; check:fast + Area (game pass score spotlight screenshots).

## F73 🧱 Callouts + tips (framework-first)
Done when: the kit has a Callout (rounded box + pointer) and a tips memory; Settings has Tips + Reset tips.
- [x] 🤖 1. UI kit Callout: rounded rectangle + pointer aimed at an element or a point, flips/shifts to fit the screen, never covers its target, ≤ 12 words styling, dismiss on tap; gallery ?screen=teach + CATALOG row — framework/ui-kit/kit/blocks/teach.tsx
- [x] 🤖 2. UI kit tips memory: `useTips` — seen ids (localStorage), tipsOn switch, resetTips — same file
- [x] 🤖 3. install UI kit 0.9.0 into the game (install-kit --dry-run first)
- [x] 🤖 4. Settings → Tips on/off · Reset tips — content/ui/settings.json, src/ui/gameSettings.ts
- [x] 🤖 5. Dev Kit Screens: a callout preview — src/devkit-game/previews.tsx
Check: kit check-ui + game check:fast; gallery shots at 390×844 + 1440×900; e2e:previews.

## F74 🧱 Tutorial shell
Done when: a brand-new device goes Play → 3 overview cards → a game vs Sprout; online/New Game locked until finished or left; a device that has played before sees no locks; Settings → Replay tutorial game.
- [x] 🤖 1. src/tutorial/progress.ts — done / not done (localStorage glyphtender:tutorial); a device with `glyphtender:new-game` counts as done (D95)
- [x] 🤖 2. content/tutorial/rails.json (stand-in: fixed seed, Small, you Yellow first, Sprout Blue) + startTutorialGame — src/ui/newGame.ts
- [x] 🤖 3. Main menu for a new player: Play → overview → tutorial game; Play online greyed + callout "Finish your first game to unlock this" — src/ui/menus.tsx
- [x] 🤖 4. The 3 overview cards + Skip — en.json tutorial.overview (kit HowToPlay)
- [x] 🤖 5. Pause → Leave tutorial (askConfirm) · finishing → unlocked + toast "Everything's unlocked!" — menus.tsx, store
- [x] 🤖 6. Settings → Replay tutorial game — settings.json, gameSettings.ts
- [x] 🤖 7. e2e/tutorial-shell.mjs: new device → locks → leave → unlocked · returning device no locks (own port)
Check: e2e:tutorial-shell + Area (previews margins); screenshots at all sizes.

## F75 🎮 Sprout
Done when: Sprout plays the tutorial game; hidden everywhere else; prefers one self-tangle from turn 6 and keeping its other glyphling free; always plays a legal turn.
- [x] 🤖 1. Sprout in content/ai/personalities.json (`hidden: true`) + en.json bio; personalityIds() filters hidden (New Game, online lobby, Surprise me) — src/ui/newGame.ts
- [x] 🤖 2. a hidden smallest-vocabulary skill (content/ai/skills.json, zipf ~4)
- [x] 🤖 3. goal src/ai/goals/selfTangle.ts (plug.ts, goals.json bigAt) — prefers a pocket next to rival pieces for ONE glyphling from selfTangleBy; prefers keeping the other free; preferences only
- [x] 🤖 4. content/tuning/tutorial.json (selfTangleBy 6, maxTurns 20 + _labels/_sections)
- [x] 🤖 5. tests: walled-in Sprout still plays a legal turn, never stalls · 300 sims vs Apprentice: one-tangle rate, who ends it, game length — src/ai/sprout.test.ts
- [x] 🤖 6. Sprout's feel from the sims (tuning)
Check: npm test + sims numbers in Notes.

Ask Muzzy: Sprout drops its habits after its 20th turn (maxTurns) — a Small game is ~22–25 of its turns, so for the last few turns it plays like a plain Apprentice and may end the game itself (33% of sims; while its habits are on, 2–4%, all forced). Keep 20 (rec. — 30 made it end the game itself in 27% of games while still "Sprout", mostly forced on a crowded board), or change it in Dev Kit → Tuning → Tutorial?
Notes:
- F72 (helper): 70 strings → plant (en.json 8, Dev Kit help/labels, Moments, e2e). Left on purpose: code names, engine guard messages players never see ("That can't be done" shows instead), golden notation. Shots re-recorded (58 files — many only pixel noise; end4-story-round6@1920 flickers 1 px between runs).
- F73: UI kit 0.9.0 on framework dev/teach (Callout + tipsMemory/useTips; 260 kit tests; 90 gallery shots measured — no overlap, no clipping). Tips on/off lives in kit-tips; Settings → Tips copies into it (gameSettings.ts syncTips). Dev Kit Screens → Tutorial callout (tip / pause).
- **For F76 (seen in the callout preview):** on a phone a tip above a glyphling covers a board row — rails callouts should prefer the side away from the board (toward the tray / top bar) when that still fits; the kit's pulse ring and dim hole are RECTANGLES — on the board use the game's own hex glow (the turn pulse / option template) for the target instead of `pulse`, so the highlight matches every other board highlight (same intention → same motion).
- F75 (helper): Sprout = nerve 60, steady SELFTANGLE 1, clumsiness 75–90; Seedling = zipf 4 (~6.3k words), spread 0.5. 300 sims vs the Survivor (Apprentice): Sprout tangles one of its own 77% (median its turn 12; rival pieces next to it ~63%), the Survivor wins 80%, games ~48 turns. `npm run sim:sprout`. Hidden from New Game / Surprise / lobby / server (party/aiSeats.ts) / balance sims; shown in Dev Kit AI.
- F74: e2e:tutorial-shell 29/29 (port 5440); e2e starts as a returning device unless ?tutorial=fresh (DEV + webdriver). Kit 0.9.0 grew MainMenu `locked` items (tap still works → the callout) + HowToPlay `onSkip`. Fixed after screenshots: the locked callout covered Play (now below), and stayed up over the overview (other buttons close it now).
- "Already played" = any device that has ever started a game (`glyphtender:new-game` exists) — D95.
- Sprout's small vocabulary is its own hidden skill, so New Game's 3 skills don't change.

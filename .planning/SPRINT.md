# Sprint 26 — A new player is dropped straight into a game against Sprout
Started 2026-10-13 · Milestone v0.14 The first game teaches itself · Features: F72, F73, F74, F75 (in this order; F72 / F73 framework / F75 run side by side, F74 after F73)
Design: design/tutorial.md · Branch: dev/tutorial

## F72 🎮 "Plant" everywhere
Done when: no player-facing or Dev Kit text says "cast" (code names stay); the button reads Plant / Plant · +N.
- [ ] 🤖 1. en.json: the 8 player strings (game.prompts cast/castHeld/ready/moveOnly, buttons cast/castMagic, submitWord.placeSeed, rules page 1) — content/text/en.json
- [ ] 🤖 2. Dev Kit words: tuning `_labels` / `_help` / `_sections` ("Move & plant highlights") + content/devkit.json sectionOrder + content/ai/pace.json + modes.json + audio.json help; Dev Kit-only strings in src/devkit-game/moments.ts, previews.tsx, src/ai/meters.ts
- [ ] 🤖 3. e2e scripts that look for "Cast" text → "Plant"; re-record screenshots (meant change)
- [ ] 🤖 4. update GDD §4 (rules + controls say plant)
Check: grep finds no player/Dev Kit "cast" text; check:fast + Area (game pass score spotlight screenshots).

## F73 🧱 Callouts + tips (framework-first)
Done when: the kit has a Callout (rounded box + pointer) and a tips memory; Settings has Tips + Reset tips.
- [ ] 🤖 1. UI kit Callout: rounded rectangle + pointer aimed at an element or a point, flips/shifts to fit the screen, never covers its target, ≤ 12 words styling, dismiss on tap; gallery ?screen=teach + CATALOG row — framework/ui-kit/kit/blocks/teach.tsx
- [ ] 🤖 2. UI kit tips memory: `useTips` — seen ids (localStorage), tipsOn switch, resetTips — same file
- [ ] 🤖 3. install UI kit 0.9.0 into the game (install-kit --dry-run first)
- [ ] 🤖 4. Settings → Tips on/off · Reset tips — content/ui/settings.json, src/ui/gameSettings.ts
- [ ] 🤖 5. Dev Kit Screens: a callout preview — src/devkit-game/previews.tsx
Check: kit check-ui + game check:fast; gallery shots at 390×844 + 1440×900; e2e:previews.

## F74 🧱 Tutorial shell
Done when: a brand-new device goes Play → 3 overview cards → a game vs Sprout; online/New Game locked until finished or left; a device that has played before sees no locks; Settings → Replay tutorial game.
- [ ] 🤖 1. src/tutorial/progress.ts — done / not done (localStorage glyphtender:tutorial); a device with `glyphtender:new-game` counts as done (D95)
- [ ] 🤖 2. content/tutorial/rails.json (stand-in: fixed seed, Small, you Yellow first, Sprout Blue) + startTutorialGame — src/ui/newGame.ts
- [ ] 🤖 3. Main menu for a new player: Play → overview → tutorial game; Play online greyed + callout "Finish your first game to unlock this" — src/ui/menus.tsx
- [ ] 🤖 4. The 3 overview cards + Skip — en.json tutorial.overview (kit HowToPlay)
- [ ] 🤖 5. Pause → Leave tutorial (askConfirm) · finishing → unlocked + toast "Everything's unlocked!" — menus.tsx, store
- [ ] 🤖 6. Settings → Replay tutorial game — settings.json, gameSettings.ts
- [ ] 🤖 7. e2e/tutorial-shell.mjs: new device → locks → leave → unlocked · returning device no locks (own port)
Check: e2e:tutorial-shell + Area (previews margins); screenshots at all sizes.

## F75 🎮 Sprout
Done when: Sprout plays the tutorial game; hidden everywhere else; prefers one self-tangle from turn 6 and keeping its other glyphling free; always plays a legal turn.
- [ ] 🤖 1. Sprout in content/ai/personalities.json (`hidden: true`) + en.json bio; personalityIds() filters hidden (New Game, online lobby, Surprise me) — src/ui/newGame.ts
- [ ] 🤖 2. a hidden smallest-vocabulary skill (content/ai/skills.json, zipf ~4)
- [ ] 🤖 3. goal src/ai/goals/selfTangle.ts (plug.ts, goals.json bigAt) — prefers a pocket next to rival pieces for ONE glyphling from selfTangleBy; prefers keeping the other free; preferences only
- [ ] 🤖 4. content/tuning/tutorial.json (selfTangleBy 6, maxTurns 20 + _labels/_sections)
- [ ] 🤖 5. tests: walled-in Sprout still plays a legal turn, never stalls · 300 sims vs Apprentice: one-tangle rate, who ends it, game length — src/ai/sprout.test.ts
- [ ] 🤖 6. Sprout's feel from the sims (tuning)
Check: npm test + sims numbers in Notes.

Ask Muzzy: —
Notes:
- "Already played" = any device that has ever started a game (`glyphtender:new-game` exists) — D95.
- Sprout's small vocabulary is its own hidden skill, so New Game's 3 skills don't change.

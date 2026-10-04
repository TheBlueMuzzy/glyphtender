# Sprint 14 — The seven personalities play whole games against each other, every decision explained
Started 2026-10-04 (autonomous run) · Milestone v0.7 AI opponents · Features: framework F19, F38, F39, F40 (in this order)
Muzzy will see: `npm run ai:arena` — AI-vs-AI games with a decision note per turn and a small per-personality table. **Stays the same:** the live game, menus and online play (no AI menu yet — that's F42); golden games + screenshots SAME.

## framework F19 🧱 Brain (framework v0.5, dev/framework `ai/`)
Done when: a brain built from (game plug, personality, skill) turns a seat's view into an action + an explain note — readings → mood shifts → goal roll → candidates → main + nudge scoring → human choice; seeded (same game → same moves); tested with a toy game.
- [x] 🤖 1. Scaffold `framework/ai/` like `table/` (kit/, scripts/install-ai.mjs, package.json, README, VERSION 0.1.0)
- [x] 🤖 2. Data shapes: Personality (trait ranges, goal order, nudge, shifts, chattiness, nerve, extras) · Skill (candidates, worlds, pick spread, top N, belief noise, extras) · GamePlug (goals + scorers, readings, imagine, candidates, special decisions) — kit/types.ts
- [x] 🤖 3. Pipeline — kit/brain.ts: shift traits from readings · goal roll (range threshold vs d100, priority walk) · candidate cut · score main × 1 + others × nudge · pick within spread / top N weighted · explain note
- [x] 🤖 4. Tests with a toy game (kit/brain.test.ts): goal roll odds match ranges; Bully-like picks TRAP most; nudge breaks ties toward two-birds; seeded replay identical; never sees outside the view it's given
- [x] 🤖 5. Install into Glyphtender `src/ai/kit/` (install-ai.mjs, version stamp); framework ROADMAP F19 ✅

## F38 🧱 Glyphtender AI plug
Done when: Glyphtender gives the brain its readings, imagined seeds, candidate list and behaviour meters, and one decision is timed on a phone-speed budget.
- [ ] 🤖 1. Spike: time legalActions + previewTurn scoring for 150 / 300 / 800 candidates on mid-game golden positions (Node, then ×4 for a phone) → candidate counts in content/ai/skills.json
- [ ] 🤖 2. Readings — src/ai/readings.ts: hand quality, my danger, rivals' danger, board fill, territory (who reaches each hex first, on insight.ts reachArea), end near
- [ ] 🤖 3. Imagine — src/ai/imagine.ts: deal rivals' '?' seeds + the bag from the unseen letters (seeded); test it never uses the real hidden seeds
- [ ] 🤖 4. Beliefs' evidence — src/ai/evidence.ts: each rival's Magic as SEEN growing on the board (no totals); a plain estimate now, fuzz comes with framework F20
- [x] 🤖 5. Behaviour meters — src/ai/meters.ts: reuse the award detectors in src/game/stats.ts (lockdown, pincer, weed toss, walled garden, hijack, power play, called it…) + near-rival turns, word length, multi-word share, times tangled, room to move
- [ ] 🤖 6. TDD §2b AI section (files, data flow)

## F39 🧱 Goals + special decisions
Done when: all 7 goals score candidates sensibly (each has a hand-made position test: TRAP finds the tangle, ESCAPE runs, STEAL grows a rival word…), plus draft, refresh and "call it".
- [ ] 🤖 1. TRAP + ESCAPE (with territory) — src/ai/goals/trap.ts, escape.ts + testkit positions
- [ ] 🤖 2. SCORE + BUILD + STEAL — score.ts, build.ts, steal.ts (vocabulary = Zipf threshold)
- [ ] 🤖 3. DENY + DUMP — deny.ts (imagined rival best there), dump.ts
- [ ] 🤖 4. Draft + refresh + call it — src/ai/decisions.ts
- [ ] 🤖 5. The brain as a Bot — src/engine/bot.ts aiBot(personality, skill) alongside greedyBot (greedyBot stays the server's until F43)

## F40 🎮 Seven personalities + three skills as data
Done when: content/ai/ holds the 7 personalities (original ranges + priority), 3 skills and feel targets; bios in en.json; `npm run ai:arena` plays them against each other and prints a note per decision + a per-personality meter table.
- [x] 🤖 1. content/ai/personalities.json, skills.json, feel-targets.json, pace.json (+ Dev Kit _labels/_sections)
- [x] 🤖 2. Bios (one line each) in content/text/en.json `ai` (stand-in — Muzzy reviews tone)
- [x] 🤖 3. scripts/ai-arena.mjs (`npm run ai:arena -- --games 50 --seats bully,scholar`) — notes for one game, meter table for many
- [ ] 🤖 4. Prove it: npm test, check:fast (golden SAME), arena run; first read of feel targets → Notes (tuning comes in F45)

Check: framework ai tests green · Glyphtender npm test + check:fast green, golden SAME · `npm run ai:arena` runs all 7 · a decision takes ≤ ~300 ms at First Class on a phone budget.
Ask Muzzy: F37 (4 AI calls — defaults in place: Strategist multi-word · banter big moments only · host may add AI online · personality names + seat glyphling).
Notes:
- F40 1–2 / F38 5 (personalities helper): the festive-booth source isn't readable from a worktree, so traits the digest doesn't give (e.g. Scholar's aggression) were filled by priority position — Claude then copied ALL 7 personalities' ranges exactly from festive-booth AIPersonality.cs (30 values corrected). Each content/ai file is an OBJECT (`personalities: [...]`, `skills: [...]`) so it can carry Dev Kit notes; notes are keyed by the path inside ONE item (fits the F23 AI tab, not the Tuning tab — which only reads content/tuning/, pace.json included). Every personality has extras.extraWordBonus (3; Strategist 8 — its multi-word lean, for SCORE). Shifts: danger/opportunity/hand for all (Survivor danger and Vulture opportunity stronger, Scholar hand stronger), endgame only Bully + Builder, desperation only Scholar + Survivor (as the original). feel-targets adds ops `nearAverage` / `neverExtreme` for Balanced and a `gotTangled` (0/1) meter for Survivor. Meters: `setups` = a no-Magic cast next to its own earlier seed (simple, as asked); `secondHalfRatio` divides by max(1st half, 1); `hijacks()` was lifted out of earnedAwards (same awards, golden SAME).

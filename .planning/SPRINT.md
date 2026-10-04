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
- [x] 🤖 1. Spike: time legalActions + previewTurn scoring for 150 / 300 / 800 candidates on mid-game golden positions (Node, then ×4 for a phone) → candidate counts in content/ai/skills.json
- [x] 🤖 2. Readings — src/ai/readings.ts: hand quality, my danger, rivals' danger, board fill, territory (who reaches each hex first, on insight.ts reachArea), end near
- [x] 🤖 3. Imagine — src/ai/imagine.ts: deal rivals' '?' seeds + the bag from the unseen letters (seeded); test it never uses the real hidden seeds
- [x] 🤖 4. Beliefs' evidence — src/ai/evidence.ts: each rival's Magic as SEEN growing on the board (no totals); a plain estimate now, fuzz comes with framework F20
- [x] 🤖 5. Behaviour meters — src/ai/meters.ts: reuse the award detectors in src/game/stats.ts (lockdown, pincer, weed toss, walled garden, hijack, power play, called it…) + near-rival turns, word length, multi-word share, times tangled, room to move
- [x] 🤖 6. TDD §2b AI section (files, data flow)

## F39 🧱 Goals + special decisions
Done when: all 7 goals score candidates sensibly (each has a hand-made position test: TRAP finds the tangle, ESCAPE runs, STEAL grows a rival word…), plus draft, refresh and "call it".
- [x] 🤖 1. TRAP + ESCAPE (with territory) — src/ai/goals/trap.ts, escape.ts + testkit positions
- [x] 🤖 2. SCORE + BUILD + STEAL — score.ts, build.ts, steal.ts (vocabulary = Zipf threshold)
- [x] 🤖 3. DENY + DUMP — deny.ts (imagined rival best there), dump.ts
- [x] 🤖 4. Draft + refresh + call it — src/ai/decisions.ts
- [x] 🤖 5. The brain as a Bot — src/engine/bot.ts aiBot(personality, skill) alongside greedyBot (greedyBot stays the server's until F43)

## F40 🎮 Seven personalities + three skills as data
Done when: content/ai/ holds the 7 personalities (original ranges + priority), 3 skills and feel targets; bios in en.json; `npm run ai:arena` plays them against each other and prints a note per decision + a per-personality meter table.
- [x] 🤖 1. content/ai/personalities.json, skills.json, feel-targets.json, pace.json (+ Dev Kit _labels/_sections)
- [x] 🤖 2. Bios (one line each) in content/text/en.json `ai` (stand-in — Muzzy reviews tone)
- [x] 🤖 3. scripts/ai-arena.mjs (`npm run ai:arena -- --games 50 --seats bully,scholar`) — notes for one game, meter table for many
- [x] 🤖 4. Prove it: npm test, check:fast (golden SAME), arena run; first read of feel targets → Notes (tuning comes in F45)

Check: framework ai tests green · Glyphtender npm test + check:fast green, golden SAME · `npm run ai:arena` runs all 7 · a decision takes ≤ ~300 ms at First Class on a phone budget.
Ask Muzzy: F37 (4 AI calls — defaults in place: Strategist multi-word · banter big moments only · host may add AI online · personality names + seat glyphling).
Notes:
- F40 1–2 / F38 5 (personalities helper): the festive-booth source isn't readable from a worktree, so traits the digest doesn't give (e.g. Scholar's aggression) were filled by priority position — Claude then copied ALL 7 personalities' ranges exactly from festive-booth AIPersonality.cs (30 values corrected). Each content/ai file is an OBJECT (`personalities: [...]`, `skills: [...]`) so it can carry Dev Kit notes; notes are keyed by the path inside ONE item (fits the F23 AI tab, not the Tuning tab — which only reads content/tuning/, pace.json included). Every personality has extras.extraWordBonus (3; Strategist 8 — its multi-word lean, for SCORE). Shifts: danger/opportunity/hand for all (Survivor danger and Vulture opportunity stronger, Scholar hand stronger), endgame only Bully + Builder, desperation only Scholar + Survivor (as the original). feel-targets adds ops `nearAverage` / `neverExtreme` for Balanced and a `gotTangled` (0/1) meter for Survivor. Meters: `setups` = a no-Magic cast next to its own earlier seed (simple, as asked); `secondHalfRatio` divides by max(1st half, 1); `hijacks()` was lifted out of earnedAwards (same awards, golden SAME).
- F38-1 spike (Node, 15 mid-game golden positions — 2p small / 3p + 4p large, avg 2,172 legal actions): legalActions 0.2 ms; legalActions + previewTurn for 150 / 300 / 800 candidates = 2 / 3.5 / 8.6 ms. Previewing words is cheap — the whole decision (7 goals × every candidate × worlds) is the real cost, first dominated by territory (0.33 ms per candidate as text-keyed BFS → rewritten on numbered cells, ~12× faster). Whole aiBot decision now: Apprentice (150, 1 world) avg 11 / worst 24 ms · First Class (300, 2 worlds) avg 22 / worst 33 ms · Archmage (800, 4 worlds) avg 55 / worst 81 ms → phone (×4) First Class ~90–130 ms, Archmage ~220–325 ms. **Candidate counts 150 / 300 / 800 hold** (Archmage's worst case sits at the phone budget; fine for the top tier).
- F38/F39 surprises: (1) a seat's view zeroes even its OWN Magic and the game seed — beliefs count its own words from the board too, and the belief key is made from the seats (D75). (2) STEAL first counted any borrowed rival seed, so 2-letter crossings out-scored real steals — now it must grow a word that was already a rival's (D76). (3) First look (20 games, 2p small, First Class, test personalities, not the real data): the Bully tangled both Scholar glyphlings in most games yet lost all 20 on Magic (~2:1); calls it happened in 7 games, all won by the caller. Tuning is F45 — the tangle bonus / Bully's SCORE nudge are the knobs to watch.
- Belief noise: the plug's readings use the skill's beliefNoise (aiBot passes it into glyphtenderPlug); "call it" needs lead ≥ nerve ÷ the least confidence among rivals.
- **First Personality Check (2026-10-04, `npm run ai:arena -- --games 60 --ladder 4`, 88 games, 84 s): decision median 13 ms · 90% 29 ms · slowest 63 ms (phone ≈ ×4 → well inside 300 ms).** Feel 9/16 green · tell-apart 61% · for-all 2/5.
  - ✅ Bully 3/3 (tangles a rival in 89% of games, 79% of turns near a rival, cuts 7.6 rival moves/turn vs next 2.9; told apart 94%) · Builder 2/2 · skill ladder holds for all 7 · everyone calls it sometimes.
  - ❌ **The catchphrase is broken by the AIs:** win share Strategist 79% · Scholar 77% · Balanced 53% · Vulture 41% · Bully 6% · Survivor 4% · Builder 0%. Positional play (tangles) isn't paying enough to beat spelling-first play. → F45's first diagnosis (MDA): is it the personalities (positional ones barely score: nudge 0.2) or the rules (tangle bonus +3/piece too small vs word Magic)? Try the personality knob first (nudge for Bully/Survivor/Builder), the rules knob only with Muzzy.
  - ❌ Vulture steals ~0.04/game (target ≥ 2) — STEAL rarely finds a real hijack; check the goal vs the meter's definition (rival word ≥ 3 letters grown into one it owns most of).
  - ❌ Scholar / Strategist / Balanced blur together (told apart 23% / 46% / 32%) — all score-first. Scholar's word length isn't the longest (2.35 vs Vulture 2.53): vocabulary is aimed but the 2-letter words still dominate.
  - ❌ Survivor never calls it wrongly (it rarely calls it at all: 4%).
  - Report: e2e-shots/ai-check.html.
- Review (sprint 14, fresh-eyes helper): no fairness leaks, no illegal or non-repeatable moves. Fixed: "call it" counted tangle bonuses already on the board twice (now only what the ending adds) and skipped endings worth > 10 (shortcut removed); the calledIt meter now means the self-tangle gamble (ended the game by tangling its OWN glyphling) — `endedGame` keeps "its turn ended the game"; framework neverExtreme no longer passes a personality that didn't play. Left: look.ts board cache could hand BUILD an old hand if the same seat plays twice on an unchanged board (all others skipped) — rare, scoring only → BUGS? logged here, fix with F45.
- Full check after merges: 688e869 — all green, 19/19 (10.2 min).


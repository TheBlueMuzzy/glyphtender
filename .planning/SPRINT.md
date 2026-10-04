# Sprint 08 — A safety net that proves nothing changed
Started 2026-10-04 · Milestone v0.6 · Features: F29

## F29 🧱 Safety net
Done when: `npm run check:golden` and `npm run check:shots` both say "same" on an untouched game, and both say exactly where when something changes.
- [x] 🤖 1. Record ~300 golden games — 2/3/4 players × small/large boards, sim players (greedy + random); each = seed + every action + a state fingerprint after each — scripts/golden.mjs (runnerImport pattern from scripts/sim.mjs; engine src/engine/sim.ts, engine.ts) → saved in the repo
- [x] 🤖 2. `npm run check:golden` — replay every game through applyAction, report first game + move that differs; a small sample also runs in `npm test` — scripts/golden.mjs, src/engine/golden.test.ts
- [x] 🤖 3. Freeze the screen for screenshots — fixed seed (src/ui/newGame.ts Math.random), fixed tray order (src/store/turnPlan.ts shuffled), animations off, fonts loaded, carousel still — via the dev-only hook src/game/devHook.ts
- [x] 🤖 4. Before-screenshots of every screen × 8 sizes (390×844, 360×780, 844×390, 768×343, 1066×1192, 1099×846, 1440×900, 1920×1080): menu screens (src/ui/menuScreens.ts), lobby, game in draft/play/refresh, handoff, reveal, results, story, scorecard, see board — e2e/shots.mjs
- [x] 🤖 5. `npm run check:shots` — pixel compare against the before set, writes diff images — e2e/shots.mjs
- [x] 🤖 6. Prove it: two clean runs match exactly (no flakes); a deliberate rule tweak fails check:golden; a deliberate 2 px nudge fails check:shots
- [x] 🤖 7. TDD Testing section + STATE Key facts: how to run both checks, when to re-record
Check: both commands green twice in a row; both red on a planted change.
Ask Muzzy: —
Notes: Golden half of task 6 done: check:golden SAME twice (300 games, 23,407 actions, ~6 s); a planted tangle-bonus +1 → all 300 flagged at the exact move; a rule value change in rules.json → "inputs changed" (spacing / _labels edits ignored). Fingerprint = goldenView() in src/engine/golden.ts — a rebuild that reshapes GameState updates goldenView to build the same view; actions also keep the letters used so F33's stable seed ids can translate them. golden/ = 2.8 MB, 12 files. Shots half of task 6 (helper): 192 shots (24 screens × 8 sizes, 30 MB); check:shots SAME twice + once more after the merge (0 px); a planted 2 px button nudge failed 54/192 — exactly the screens showing that button row. Lobby shot from the Dev Kit preview (no party server); join-error / seat-status / reconnecting and 3p / shared-win end screens not shot. Found B019 (768×343 prompt over ☰). Gotcha: bmuz cleanup.sh wipes e2e-shots/ — never run it while check:shots is running. Golden games + before-shots are committed to the repo (both machines compare against the same set). F30 not pulled in — the safety net lands first.

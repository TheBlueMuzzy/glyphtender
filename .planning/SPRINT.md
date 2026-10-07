# Sprint 17 — Settled by real AI games
Started 2026-10-07 · Milestone v0.7 AI opponents (→ beta) · Features: F46, F47 (the last two beta musts) — F46 ∥ F47 (different scripts), both run on the AI arena
Muzzy will see: maybe a different default board for some player counts, maybe a different first player, and end-of-game awards that show up at the rates they were designed for. **Stays the same:** how the AI plays, every screen, online play, pass-and-play.

## F46 ❓ Sims with real AIs settle GDD §9
Done when: hundreds of AI-vs-AI games per row (2/3/4 players × Small/Large, mixed personalities, First Class) answer board size per player count, bag run-out and first-player edge; Muzzy has decided each; the decisions are in content/ defaults and GDD §9 is marked settled.
- [ ] 🤖 1. Arena records per game: board, seat order, winner seat, bag left / ran out, turns, score margin (scripts/ai-arena.mjs)
- [ ] 🤖 2. Run it: 2/3/4 × Small/Large → .planning/research/sims-ai.md (tables + what they mean)
- [ ] 🤖 3. One recommendation per question with the numbers behind it (→ Ask Muzzy)
- [ ] 🙋 4. Muzzy decides: board per player count · bag run-out rule · first player (Yellow or random)
- [ ] 🤖 5. Apply the calls (content/ defaults, engine if the bag rule changes) + GDD §9 settled + TDD Decisions

## F47 ✨ Re-tune the 14 award thresholds
Done when: award rates come from real AI personalities (not random/greedy bots), each award lands in its target band (research/sims.md), positional personalities earn the positional awards, and the new thresholds are in content/tuning/endscreen.json.
- [ ] 🤖 1. sim:awards can play real AI personalities (scripts/award-rates.mjs `--players ai`), rates per personality
- [ ] 🤖 2. Propose new thresholds per award (content/tuning/endscreen.json) → table in research/awards-ai.md
- [ ] 🙋 3. Muzzy OKs them (Dev Kit edits endscreen.json)
- [ ] 🤖 4. (tuning) Apply + check:fast (golden) + award tests

Check: check:fast after each feature · check:full once at the end.
Ask Muzzy: (after F46 3) the three §9 calls · (after F47 2) the new thresholds · (carried) AI aim hold keep / shorten / drop · online AI named after the personality OK? · no "Surprise me" online OK? · first-time New Game default = you + 1 AI? · F37 confirms.

## Notes
- F49 "What wins?" left out: needs framework F25 (not built) — should, later.
- No open P0/P1 bugs (BUGS.md 2026-10-07).
- 2026-10-07 auto mode: work branch dev/beta (re-made from main). F46 1–3 and F47 1–2 run as two parallel helpers (worktrees) — F46 owns scripts/ai-balance.mjs + research/sims-ai.md, F47 owns scripts/award-rates.mjs + research/awards-ai.md.

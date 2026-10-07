# Sprint 17 — Settled by real AI games
Started 2026-10-07 · Milestone v0.7 AI opponents (→ beta) · Features: F46, F47 (the last two beta musts) — F46 ∥ F47 (different scripts), both run on the AI arena
Muzzy will see: maybe a different default board for some player counts, maybe a different first player, and end-of-game awards that show up at the rates they were designed for. **Stays the same:** how the AI plays, every screen, online play, pass-and-play.

## F46 ❓ Sims with real AIs settle GDD §9
Done when: hundreds of AI-vs-AI games per row (2/3/4 players × Small/Large, mixed personalities, First Class) answer board size per player count, bag run-out and first-player edge; Muzzy has decided each; the decisions are in content/ defaults and GDD §9 is marked settled.
- [x] 🤖 1. Arena records per game: board, seat order, winner seat, bag left / ran out, turns, score margin (scripts/ai-arena.mjs)
- [x] 🤖 2. Run it: 2/3/4 × Small/Large → .planning/research/sims-ai.md (tables + what they mean)
- [x] 🤖 3. One recommendation per question with the numbers behind it (→ Ask Muzzy)
- [~] 🙋 4. (Claude decided overnight — Muzzy confirms; D80) Muzzy decides: board per player count · bag run-out rule · first player (Yellow or random)
- [x] 🤖 5. Apply the calls (content/ defaults, engine if the bag rule changes) + GDD §9 settled + TDD Decisions

## F47 ✨ Re-tune the 14 award thresholds
Done when: award rates come from real AI personalities (not random/greedy bots), each award lands in its target band (research/sims.md), positional personalities earn the positional awards, and the new thresholds are in content/tuning/endscreen.json.
- [x] 🤖 1. sim:awards can play real AI personalities (scripts/award-rates.mjs `--players ai`), rates per personality
- [x] 🤖 2. Propose new thresholds per award (content/tuning/endscreen.json) → table in research/awards-ai.md
- [~] 🙋 3. (Claude applied a softened set overnight — Muzzy confirms; D81) Muzzy OKs them (Dev Kit edits endscreen.json)
- [x] 🤖 4. (tuning) Apply + check:fast (golden) + award tests

Check: check:fast after each feature · check:full once at the end.
Ask Muzzy: (after F46 3) the three §9 calls · (after F47 2) the new thresholds · (carried) AI aim hold keep / shorten / drop · online AI named after the personality OK? · no "Surprise me" online OK? · first-time New Game default = you + 1 AI? · F37 confirms.

## Notes
- F49 "What wins?" left out: needs framework F25 (not built) — should, later.
- No open P0/P1 bugs (BUGS.md 2026-10-07).
- 2026-10-07 auto mode: work branch dev/beta (re-made from main). F46 1–3 and F47 1–2 run as two parallel helpers (worktrees) — F46 owns scripts/ai-balance.mjs + research/sims-ai.md, F47 owns scripts/award-rates.mjs + research/awards-ai.md.
- F46 helper: 4,200 games (700/row, 37.9 min, `npm run ai:balance -- --games 700 --jobs 24`). F47 helper: 486 games (`sim:awards --players ai`).
- Muzzy (2026-10-07, going to bed): "you shouldn't ask me questions or wait for me to confirm things… you need to continue yourself" → his two 🙋 calls made by Claude, all in content/ (one number each to undo):
  - F46 (D80): 3 players → Small (boards.json defaultForPlayers "3") · random first player (rules.json randomFirstPlayer 1; 0 = Yellow) · bag run-out unchanged.
  - F47 (D81): lockdown 7 · pincer from 10 (share 0.75 kept for Muzzy's game, D68) · weed cut 7 · hijack 4 · trickster 24 · called it 24 · close call 3 · hedge stays 3 (D55). Muzzy's first game: same 5 awards + Weed toss.
- Engine: newGame firstSeat (default 0 → tests/golden/sims Yellow-first); online picks it from bagSeed (no extra draw); test servers pass makeRules yellowFirst. Code-only golden SAME before re-record.
- Fixed: ai-arena "4-player" tables only seated 3 (slice of 3 personalities) — now one personality sits twice.
- To Ideas: Power Play / Bridge rule shape · RPS broken leg (Scholar > Strategist) · bag-empty notice.

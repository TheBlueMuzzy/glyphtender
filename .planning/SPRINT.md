# Sprint 33 — Awards during the game
Started 2026-11-02 · Milestone v0.18 Awards during the game (this sprint is all of it) · Features: F100, F101, F102 (in this order)
Muzzy 2026-11-02: "yes" — design in GDD §4 Highlights → During the game; sketch S1 approved (research/awards-live/picks.json); TDD D103.
What changes: a small banner over the board after the score count-up when a turn sets or takes an award's game record (one glyphling slot: the old holder shrinks away, the new one overshoots and settles); the end screen marks the award that held its record at the end. What stays the same: scoring, turn order, rules, and everyone's own awards at the end.

## F100 🧱 Award records
Done when: per live award (Lockdown · Through the hedge · Complete tangle · Power Play · Long word · Hijack · Super Bridge — Weed toss stays end-only), the game record so far (holder, proof, turn) comes from the same measures as the end screen; a tie keeps the first; online screens get the records from the server in their view (never the log); the store notices a record set or taken, the same way for local, bot and online turns.
- [x] 🤖 1. Spike: records over a mid-game state; when a turn reaches the log (after a refresh); stats.ts runs in the server bundle — src/game/stats.ts
  done 2026-11-02: earnedAwards runs on a game in progress — 15 random games (2/3/4 players × 5 seeds, a throwaway vitest in src/game, deleted): after every logged turn the live records never went DOWN (0 in 15 games) and the last mid-game records = the end screen's in 15/15. A cast turn sits in state.pendingLog until its refresh choice is made (~85% of states between logged turns), so a record is known when the turn is FINISHED (after the refresh choice), which is after its score count-up. stats.ts + en.json + endscreen.json bundle for the server with esbuild --platform=neutral (54 KB, no node: imports). Random play almost never earns a live award (Through the hedge only, 5 record changes in 15 games) → tests use hand-built positions (engine/testkit), not random games.
- [x] 🤖 2. Records for the 7 live awards (tie keeps the first) + tests; the live list in content — src/game/stats.ts
  done 2026-11-02: stats.ts awardRecords(game) — per live award the biggest effect by anyone, a tie keeps the earlier turn, built on earnedAwards (so it can't disagree with the end screen); Weed toss refused in code (NEVER_LIVE). content/tuning/endscreen.json liveAwards (7 × 1) + help + labels + section "Awards during the game"; select.json: on the Award object for now ("During the game") — moves to the banner's object in task 6. 3 new tests (taken by a bigger moment while both keep their own award · tie keeps the first · liveAwards 0); stats 47 + select 5 pass.
- [x] 🤖 3. Online: the server adds the records' public facts to each view (never the log) + test — party/views.ts
  done 2026-11-02: GameView.records (party/protocol.ts, optional: an older server sends none) = awardRecords on the server's full game, worked out once per game state (WeakMap), not once per seat. Cost measured (throwaway vitest): 2.8–4.5 ms on 2-player games (24–56 turns), 17–19 ms on 4-player games (63–69 turns) on the PC — fine for a Durable Object (30 s CPU per event, TDD §risks), and why it's cached per state. server.test: every view carries records; the last equals awardRecords(server game). stats + server 91 pass, tsc clean.
- [ ] 🤖 4. The store notices a finished turn that sets or takes a record (local, bot, online) + test — src/store/gameStore.ts
Check: stats + views + store tests; check:fast.

## F101 🎮 Award banner during the game
Done when: after the turn's score count-up, a record set or taken shows the banner (one glyphling slot, title, who, proof; taking = old holder shrinks away, new one overshoots and settles), fixed size from the start, kit parts only, values in content, the end screen's award sound; reduce motion = no swap; proven locally and online at desktop + phone.
- [ ] 🤖 5. The banner (fixed size, swap animation) — src/game/AwardBanner.tsx
- [ ] 🤖 6. Its values in content + Dev Kit labels/help (hold 2 · afterScore 0.3 · swapDelay 0.5 · swapSeconds 0.5 · overshoot 1.15) — content/tuning/endscreen.json
- [ ] 🤖 7. Its words (who / takes it from) — content/text/en.json
- [ ] 🤖 8. Shown after the score count-up with end.award; reduce motion — src/game/GameScreen.tsx
- [ ] 🤖 9. e2e: a record set, then taken, plays the banner — local + online, desktop + phone shots — e2e/award-banner.mjs
Check: e2e award-banner, online, online-ai; check:fast; screenshots looked at.

## F102 ✨ Record mark on the end screen
Done when: the award card that held its record at the end carries a small record mark in Highlights and the Story slot.
- [ ] 🤖 10. The record mark on AwardRow — src/game/EndHighlights.tsx
- [ ] 🤖 11. Re-take the end-screen shots — e2e/end-screen-shots.mjs
- [ ] 🙋 12. Muzzy looks at the mark: does it read? — src/game/EndHighlights.tsx
- [ ] 🙋 13. Play a game (local, then online with a friend) and tune the banner in the Dev Kit (tuning) — content/tuning/endscreen.json
Check: end-screen shots; check:full before the hand-off.

## Notes
- Claude's call (2026-11-02, task 3): with word indicators OFF ("spot words yourself") the awards whose proof names a word or +Magic (Through the hedge, Power Play, Long word, Hijack, Super Bridge) wait for the end screen — showing GARDENS mid-game would spot the word for everyone; Lockdown and Complete tangle still show. (stats.ts WORD_AWARDS; same rule local and online.)
- Ask Muzzy: with word indicators off, only Lockdown and Complete tangle show live — OK?
- Claude's call (2026-11-02, task 1): the banner shows when the turn that set the record is FINISHED (after its refresh choice) — the record isn't known before; that is always after the score count-up, so the GDD's "after the score" holds.
- Open bugs: no P0/P1. B030 (P3) — a Dev Kit tab slow under load — not in files this sprint touches.
- Claude's call (2026-11-02): the banner is built in the game from kit parts (like AwardRow), not a new kit piece — it's Glyphtender's glyphlings + award words; promote to the kit if a second game wants one.
- Claude's call (2026-11-02): no new sound — the banner reuses end.award (same moment as the end screen's award card).

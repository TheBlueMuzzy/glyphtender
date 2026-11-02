# Sprint 32 — Online waits for you
Started 2026-11-02 · Milestone v0.17 Online waits for you (this sprint is all of it) · Features: F99, F98 + B032 (in this order)
Muzzy 2026-11-02: "yes" — F99 + F98 + the B032 fix.
What changes: an online match every player has left stops — no bots finish it; it waits (up to keepMatchDays, 7) for someone to come back. The full check stops failing on its own. What stays the same: a player who leaves while others are still there gets a bot in their seat as today; local games don't change.

## F99 🧱 Bots wait in an empty match
Done when: in the rooms kit, a match with nobody connected makes no bot moves and runs no turn timers (so no storage writes), and carries on when a person reconnects; a persistentId starting `bot:` is refused; Glyphtender has the new kit and an e2e proves both; B033 is fixed.
- [ ] 🤖 1. Measure today: a match everyone leaves — storage writes + bot moves over 2 min (TEST_LOG_STORAGE) — party/worker.ts
- [ ] 🤖 2. Rooms kit: no bot or timer moves while nobody is connected; timers restart when someone reconnects (+ unit tests) — ../../framework/rooms/kit/server/roomServer.ts
- [ ] 🤖 3. Rooms kit: refuse a persistentId that starts with `bot:` (security review, low) — ../../framework/rooms/kit/protocol.ts
- [ ] 🤖 4. Release the rooms kit (UPGRADES.md note) and install it in Glyphtender — ../../framework/rooms/UPGRADES.md
- [ ] 🤖 5. e2e: everyone leaves → no moves, no writes; one comes back → the game goes on — e2e/online-restart.mjs
- [ ] 🤖 6. Privacy page + GDD Online line: a match everyone leaves waits for its players — public/privacy.html
Check: rooms kit tests + check:framework; e2e online, online4, online-ai, restart; check:fast.

## F98 🐞 Steady Story chart shot
Done when: end4-story-round6 matches every time — alone and under check:full load — fixed at its cause (B028).
- [ ] 🤖 7. Measure it alone, 20 runs: how often it differs, which pixels, the chart's svg box each run — e2e/end-screen-shots.mjs
- [ ] 🤖 8. Fix at the cause (the outline underlay line / a sub-pixel chart width) — src/game/StoryChart.tsx
- [ ] 🤖 9. B032: online-ai waits for turns played, not seconds — e2e/online-ai.mjs
- [ ] 🤖 10. Screenshots 3× under full load, all SAME — e2e/shots.mjs
Check: check:full twice, screenshots SAME both times.

## Notes
- Claude's call (2026-11-02): when someone returns to a waiting match, the seats of players still away go to bots after botTakesOverAfterMs, as today.
- Open bugs: no P0/P1. B033 (P2) is F99. B032 (P3) is task 9; B028 (P3) is F98.

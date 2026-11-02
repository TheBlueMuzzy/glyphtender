# Sprint 32 — Online waits for you
Started 2026-11-02 · Milestone v0.17 Online waits for you (this sprint is all of it) · Features: F99, F98 + B032 (in this order)
Muzzy 2026-11-02: "yes" — F99 + F98 + the B032 fix.
What changes: an online match every player has left stops — no bots finish it; it waits (up to keepMatchDays, 7) for someone to come back. The full check stops failing on its own. What stays the same: a player who leaves while others are still there gets a bot in their seat as today; local games don't change.

## F99 🧱 Bots wait in an empty match
Done when: in the rooms kit, a match with nobody connected makes no bot moves and runs no turn timers (so no storage writes), and carries on when a person reconnects; a persistentId starting `bot:` is refused; Glyphtender has the new kit and an e2e proves both; B033 is fixed.
- [x] 🤖 1. Measure today: a match everyone leaves — storage writes + bot moves over 2 min (TEST_LOG_STORAGE) — party/worker.ts
  done 2026-11-02: Bo Leaves + Ada closes her tab mid-match, 120 s with nobody connected → 52 bot moves (turn 4 → 49), 53 saves + 53 alarm moves = 106 rows written (~0.9 rows/s); numbers in Notes. The measuring section is the new F99 part of e2e/online-restart.mjs (EMPTY_WAIT_SECONDS=120).
- [x] 🤖 2. Rooms kit: no bot or timer moves while nobody is connected; timers restart when someone reconnects (+ unit tests) — ../../framework/rooms/kit/server/roomServer.ts
  done 2026-11-02: framework a986720 (dev/rooms-bots-wait) — Timers.hold/release (time left kept; a timer started while held is held); RoomServer holds the game's timers + the away → bot timers while a match being played has nobody connected (also right after a restore), saves them as heldTimers (no storage alarm for them), releases when someone is back; new optional rules.onResume gets the new end times. keepMatchDays / keepUnplayedMatchHours still run. 5 new RoomServer tests (empty: no moves/writes after 3 days; back: game goes on, turn end moved, away seat → bot after 60 s; one person here: unchanged; restore with nobody: waits, twice through a restart; keepMatchDays still ends it) + 2 Timers tests; 3 old restore tests now rejoin first.
- [x] 🤖 3. Rooms kit: refuse a persistentId that starts with `bot:` (security review, low) — ../../framework/rooms/kit/protocol.ts
  done 2026-11-02: framework b7ee4b4 — parseClientMessage refuses a join whose persistentId starts `bot:` (+ protocol test; `robot:…` still fine).
- [x] 🤖 4. Release the rooms kit (UPGRADES.md note) and install it in Glyphtender — ../../framework/rooms/UPGRADES.md
  done 2026-11-02: framework e8312a0 — rooms 0.14.0 (README + UPGRADES note); framework check:fast: rooms test/typecheck/lint green (the 1 red = devkit/ui-kit README notes vs kit/VERSION, already on main, not rooms). Installed with install-module.mjs (0.13.1 → 0.14.0); hand step done: party/turnClock.ts resumeTimers → rules.onResume moves turnEndsAt. party/savedMatch.test.ts: 2 restore tests rejoin first + a new F99 test (3 days empty: same version, 0 rows; back: plays on). check:fast ALL PASS.
- [x] 🤖 5. e2e: everyone leaves → no moves, no writes; one comes back → the game goes on — e2e/online-restart.mjs
  done 2026-11-02: e2e/online-restart.mjs (area `restart`, ports 5452/1979) — after the restart part: Bo Leaves + Ada closes her tab → 20 s (EMPTY_WAIT_SECONDS) with 0 rows written; Ada reopens → Rejoin match → same version + turn → the game goes on (turn 4 → 6). The restart check now allows the turn end to move by the moment before the first reconnect (measured 0.0 s). PASS.
- [x] 🤖 6. Privacy page + GDD Online line: a match everyone leaves waits for its players — public/privacy.html
  done 2026-11-02: privacy.html Online play: "A match everyone has left waits for its players: nobody plays it for them (no computer moves) until someone comes back or those 7 days pass." + its HTML comment (waitWhileNobodyHere, read 2026-11-02); GDD Online (F96 line) gets the F99 sentence.
Check: rooms kit tests + check:framework; e2e online, online4, online-ai, restart; check:fast.
Checked: 2026-11-02 — before: 52 bot moves + 106 rows in 120 s with nobody connected; after: 0 moves, 0 rows, and Rejoin match → the same turn, play goes on (e2e restart). Framework rooms tests 212 pass + typecheck + lint. check:full at c3dea17 37/38 — the 1 = screenshots, B028 only (end4-story-round6, 1 pixel); online, online4, online-ai, rejoin, restart, framework PASS. Code read by Claude: no bugs.

## F98 🐞 Steady Story chart shot
Done when: end4-story-round6 matches every time — alone and under check:full load — fixed at its cause (B028).
- [ ] 🤖 7. Measure it alone, 20 runs: how often it differs, which pixels, the chart's svg box each run — e2e/end-screen-shots.mjs
- [ ] 🤖 8. Fix at the cause (the outline underlay line / a sub-pixel chart width) — src/game/StoryChart.tsx
- [ ] 🤖 9. B032: online-ai waits for turns played, not seconds — e2e/online-ai.mjs
- [ ] 🤖 10. Screenshots 3× under full load, all SAME — e2e/shots.mjs
Check: check:full twice, screenshots SAME both times.

## Notes
- Claude's call (2026-11-02): when someone returns to a waiting match, the seats of players still away go to bots after botTakesOverAfterMs, as today.
- Measured before F99 (2026-11-02, task 1, rooms 0.13.1, e2e/online-restart.mjs with EMPTY_WAIT_SECONDS=120, ports 5463/1972): a 2-player match with the 120 s turn timer, both gone at turn 4 (Bo Leave → bot at once; Ada tab closed → bot after 60 s) → in 120 s with nobody connected: **52 bot moves** (version 13 → 65, turn 4 → 49, not finished yet), **53 saves + 53 alarm moves = 106 rows written**. While both played: 10 actions → 17 rows (1.7 a action).
- Measured after F99 (2026-11-02, rooms 0.14.0, same script + EMPTY_WAIT_SECONDS=120): 120 s with nobody connected → **0 bot moves, 0 rows written** (was 52 moves, 106 rows); Ada back → the game goes on (turn 4 → 6). Restart part unchanged (10 actions → 17 rows).
- Claude's call (2026-11-02, F99): the turn timer also waits right after a server restart (nobody is connected yet) — its end moves by the moment before the first reconnect (seconds; measured 0.0 s). New rules.onResume in the kit moves turnEndsAt, so every screen shows the real end. A match restored with nothing held (an older save) holds its timers at once too.
- Open bugs: no P0/P1. B033 (P2) is F99. B032 (P3) is task 9; B028 (P3) is F98.

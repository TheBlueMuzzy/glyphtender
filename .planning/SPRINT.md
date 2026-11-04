# Sprint 34 — Maintenance
Started 2026-11-04 · Milestone v0.19 Maintenance · Features: F103, F104 (in this order)
Muzzy 2026-11-04: "just run maintenance list through tasking… don't touch player-facing tasks yet… after maintenance, we can do an audit of the system to determine what might be taken out and sent to the framework."
What changes: nothing a player sees. The game keeps playing exactly the same; `npm run ai:arena` runs on the framework's arena.
Stays the same: every banner that shows today still shows. No framework updates in this sprint (Muzzy: those come after his next framework step).

## F103 🧱 Live award safety
Done when: Biggest comeback, Called it and Trickster's Victory can't show during the game even with liveAwards switched on for them in content, a test proves it, and the 7 live awards behave as before.
- [ ] 🤖 1. Show the gap on today's code with a failing test, then add the 3 to NEVER_LIVE — src/game/stats.ts
- [ ] 🤖 2. Dev Kit must not offer a live switch that does nothing for them — content/tuning/endscreen.json
- [ ] 🤖 3. Record it: the GDD's list of what waits for the end + TDD Decisions — .planning/TDD.md
Check: stats tests; check:fast; e2e:awards.

## F104 🔧 Framework AI arena
Done when: `npm run ai:arena` runs through the kit's arena on src/ai/arenaGame.ts and gives the same numbers as scripts/ai-arena.mjs for the same games, and the old script is gone. Scope: only that script. src/ai/arena.ts stays, because the Dev Kit's check and the balance sims still use it (a question for the framework audit).
- [ ] 🤖 4. Write the game's half: plug, personalities, skills, targets — src/ai/arenaGame.ts
- [ ] 🤖 5. Run old and new on the same games and compare the numbers — scripts/ai-arena.mjs
- [ ] 🤖 6. Point `ai:arena` at the kit's arena, retire the old script, fix what names it — package.json
- [ ] 🤖 7. Record it: TDD Decisions, Key facts — .planning/TDD.md
Check: the comparison; arena + AI tests; check:fast; devkit-ai.

Notes: F89 — Half pause holds Glyphtender, Crashes 0.3.0 and Rooms 0.15.0 are not in this sprint: each needs the framework (a new helper, or an update), and Muzzy said those come after his next framework step. They wait at the top of ROADMAP's Later.
Bugs: 0 open.

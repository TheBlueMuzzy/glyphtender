# Sprint 09 — One rules door: every change is an action, every action can be replayed
Started 2026-10-04 · Milestone v0.6 · Features: F30

## F30 🧱 Game core
Done when: the game, dev shortcuts, sims and the online server all change the game only through one rules contract (framework Table module); every action returns events tagged with who may see them; `legalActions` lists every choice; fast mode plays the same game without end-screen bookkeeping; the server keeps a replayable move record — and check:golden + check:shots both say SAME (results pages linked for Muzzy).
- [x] 🤖 1. Framework (v0.4 F12): `table/` module — the rules contract (setup · legalActions · check · apply → {state, events} · isOver · viewFor), events with who-may-see, move record + replay, eventsFor(seat), a contract self-test any game runs; install script → game `src/table/` — dev/framework branch dev/table
- [x] 🤖 2. Glyphtender plugs in: `src/engine/rules.ts` wraps the engine (no rule rewrites); viewFor moves in from party/views.ts hideSecrets
- [x] 🤖 3. `legalActions(state, seat)` — draft hexes · move (+ cast seed × target, or no cast) · refresh subsets; same-letter seeds deduped; self-test: every listed action passes check, every sim pick is listed
- [x] 🤖 4. Events from apply — placed / moved / cast / scored / drew (only that seat) / refreshed / tangled / turnStarted / gameOver; nothing on screen reads them yet (F31)
- [x] 🤖 5. Fast mode — skips log / pendingLog / insight (log.ts, insight.ts, turn.ts:82, tangle.ts); test: same goldenView apart from the log; sim speed before → after
- [x] 🤖 6. One door + move record — store send (src/store/gameStore.ts), devHook jumps, sim, party/serverGame.ts play + turnClock bots go through rules.apply; the server keeps {setup secrets, actions} (glyphtenderRules onStart re-seed), never sent to a client; test: replaying an online game's record = the server's state
- [x] 🤖 7. Prove it — check:golden + check:shots SAME, npm test, build, lint, e2e:pass, e2e:online (one at a time); results pages + game links for Muzzy
- [x] 🤖 8. TDD (engine section + Decision) · framework ROADMAP F12 + version · STATE Key facts
Check: both checks SAME; contract self-test green for Glyphtender; online game replays from its record.
Ask Muzzy: —
Notes: Built (helper, tasks 2–6): see TDD D61 for every call (rules made by glyphtenderRules(words) — no context slot; setup carries bagSeed/rngSeed; no Magic in events before gameOver; drew + drewHidden; fast mode only in simulateGame: sim 36 s → 20 s). legalActions play median 1,624, max 11,304. 396 tests; golden SAME; shots SAME; e2e:pass + e2e:online green (0 leaks in 165 frames). Code review (low): nothing. Lessons for the framework → framework design/table.md "Learned in the slices". Decided: framework module named "Table" (table/kit → src/table). Online records keep the server's secret setup numbers (seed + bag reshuffle + rng) so any online game replays exactly. randomAction/greedyAction keep their exact RNG call order (golden games depend on it) — legalActions is new, not a rewrite of them.

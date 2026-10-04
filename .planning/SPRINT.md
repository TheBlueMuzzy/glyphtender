# Sprint 11 — The screen plays what happened (events), not what it guesses
Started 2026-10-04 (autonomous run) · Milestone v0.6 · Features: F31

## F31 🧱 Events drive the screen
Done when: the glide, throw, score sequence, trails, refresh stages, reveal, online replays of other seats and the Dev Kit adapter read the rules' events (numbered event feed) instead of diffing lastTurn / states; online, each seat's view carries its feed so a skipped view or a reconnect loses nothing — and check:golden + check:shots SAME, every e2e green.
- [x] 🤖 1. Framework (v0.4 F13): event feed in table/ — numbered changes, feedFor(seat), newChanges(lastPlayed) with `missed`, Listeners hub — Table 0.4.0 (framework 275dcd4)
- [ ] 🤖 2. The feed in the game: install Table 0.4.0; party ServerGame keeps the feed (addChange per change, numbered by version) and each seat's view carries feedFor(feed, seat); local play keeps each send's events in the store — party/serverGame.ts, party/views.ts, src/engine/rules.ts, src/store/gameStore.ts
- [ ] 🤖 3. Local screen reads events: finishCast / startScoring / refresh's new tray places / handoff / Board pops / Handoff / Reveal / ScorePops / trails take the turn's events instead of lastTurn diffing (same timings, same look) — src/store/{gameStore,refreshFx,wordMarks,trail}.ts, src/game/{Board,Handoff,Reveal,ScorePops}.tsx
- [ ] 🤖 4. Online plays the feed: onlinePlay plays newChanges from each view (rivals' turns from moved / cast / scored, my refresh from drew), drops isNewTurn + lastTurn diffing; a `missed` gap jumps straight to the view — src/store/onlinePlay.ts, src/ui/online/OnlineSession.tsx
- [ ] 🤖 5. Dev Kit adapter: gameEvents reads the engine's events — src/devkit-game/glyphtenderAdapter.ts
- [ ] 🤖 6. Prove it — check:golden + check:shots SAME; npm test, build, lint; e2e:game, pass, pass4, online, online4, score, spotlight, trails, end, previews (one at a time); links for Muzzy
- [ ] 🤖 7. TDD Decision + STATE key fact · framework ROADMAP F13
Check: both checks SAME; every e2e green; no lastTurn diffing left in the store's animation paths.
Ask Muzzy: —
Notes: Decided (autonomous): events reach online seats INSIDE their view (a per-seat feed of the last 12 changes) rather than room sendEvent — views can be skipped when several arrive at once, so a numbered feed is the only way nothing is lost; no rooms-kit change needed. Animation timings (anim.json) stay exactly as they are — this sprint changes what the screen listens to, not how long things take.

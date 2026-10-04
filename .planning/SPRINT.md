# Sprint 13 — Every seat sees only what it may: one seat model, per-seat views, bots see only their view
Started 2026-10-04 (autonomous run) · Milestone v0.6 · Features: F36 (the last v0.6 slice)

## F36 🧱 Seats & per-seat views
Done when: one seat model (Table seats.ts) for local human · online human · local bot · online bot · reconnecting; one viewer seat (pass-and-play switches at the handoff); the server's bot decides from its seat's view only; per-seat events are possible in the rooms kit; side-door leak tests cover ids, hidden order, events, log, undo, seed — and check:golden + check:shots SAME, every e2e green.
- [x] 🤖 1. Framework (v0.4 F18): Table 0.6.0 seats.ts (TableSeat, isLocalHuman / isLocalBot / playsHere, viewerSeat, needsHandoff, Bot = view → action) + rooms 0.2.0 sendEventPerSeat — installed (framework 967ae5c)
- [ ] 🤖 2. One seat model in the game: src/store/seats.ts on TableSeat (local / online / bot, connected from the room message — B015 badges unchanged); onlinePlay maps room seats into it; myTurn uses playsHere / isLocalHuman
- [ ] 🤖 3. One viewer seat: the store's viewerSeat (Table viewerSeat) used by SeedTray, GameOver, prompt, Handoff — replaces `mySeat ?? current` and friends
- [ ] 🤖 4. Bots see only their view: party/turnClock autoPlay decides from rules.viewFor(state, seat) (Bot shape); test: on every golden game position the bot picks the same action from the view as from the full state (so nothing plays differently); a local bot seat exists in the store (tests / Dev Kit only — NO menu, no AI)
- [ ] 🤖 5. Side-door leak tests: ids, hidden order (own hand order vs feed; rivals' hand order), events, log / pendingLog, undo (a plan never leaves the device), seed / rng / bagSeed / record — party/server.test.ts + e2e/online-kit.mjs frame checks
- [ ] 🤖 6. Prove it — check:golden + check:shots SAME; npm test, build, lint; e2e:pass, pass4, online, online4 (drop / rejoin, B015), previews, game (one at a time); links
- [ ] 🤖 7. TDD Decision + STATE · framework ROADMAP F18 · v0.6 wrap-up in STATE (what Muzzy should play in the morning)
Check: both checks SAME; every e2e green; leak tests green.
Ask Muzzy: —
Notes: Decided (autonomous): no new-game menu for bots (that's visible change + AI scope); the local bot seat is plumbing only. partykit.json from the rooms installer removed (Glyphtender runs on wrangler / partyserver).

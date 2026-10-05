# Sprint 16 — The AI moves like a person, plays online, and every snapshot says who was who
Started 2026-10-05 (autonomous overnight run — Muzzy: "run the auto over night sprints for glyphtender") · Milestone v0.7 AI opponents · Features: F50, F43, F51 (+ research task) — F50 ∥ F43 (different files), then F51
Muzzy will see: an AI's draft glyphling travels out of the tray onto the board the way his own does, and every other AI action moves like a person's; online, a player who goes idle is played by the real AI (not the old stand-in bot) and the host can add AI seats in the lobby; Dev Kit snapshots name each seat's personality + skill. **Stays the same:** rules, pass-and-play between people, every screen not listed.

## F50 🎮 AI looks human
Done when: every AI action (draft, move, cast, refresh, call-it, aim) plays the same motion, speed and path as a person's doing the same thing — first case: draft placements travel from the tray instead of popping in; the rule is written into the framework AI module's design.
- [ ] 🤖 1. Audit: list every AI action vs the person's version (motion, timing, path, sounds/pops) → SPRINT Notes
- [ ] 🤖 2. Draft: the AI's glyphling leaves the tray (SeedTray draft) and travels to its hex like a person's drop (src/store/gameStore.ts draftAt, localBot.ts)
- [ ] 🤖 3. Fix any other mismatch the audit finds (same timings — reuse the existing animation, never a second one)
- [ ] 🤖 4. Framework `design/ai.md`: the "AI looks human" standard; TDD Decisions
- [ ] 🤖 5. e2e: an AI draft shows the travel (frame check) + screenshots at every size

## F43 🎮 Online AI
Done when: online, an idle / dropped seat is played by the real AI (Survivor at First Class = seats.ts defaultAi) instead of greedyBot, thinking inside the room within its CPU budget; the host can add AI seats in the lobby; no secret leaks; e2e:online / online4 green.
- [ ] 🤖 1. Server thinking: party/ runs the AI brain for a bot seat on viewFor(game, seat) only, with a time budget + the never-freeze fallback
- [ ] 🤖 2. Idle takeover uses it (replaces greedyBot); human pace on the server (pace.json)
- [ ] 🤖 3. Lobby: host can add / remove AI seats (personality + skill) — game-ui kit parts only
- [ ] 🤖 4. Tests: server.test (AI seat sees only its view, never the log), e2e:online with an AI seat
- [ ] 🤖 5. GDD / TDD (server AI, CPU budget)

## F51 🔧 Snapshots record the seats
Done when: a Dev Kit snapshot saves each seat's kind (person / AI) + personality + skill, and loading an old snapshot still works.
- [ ] 🤖 1. Snapshot save + load carry seats (Dev Kit snapshot plug in src/devkit-game/)
- [ ] 🤖 2. Test: old snapshot (content/snapshots/first-game-with-ai.json) still loads

## Research (no menu changes)
- [ ] 🤖 R1. How other games set up AI opponents → .planning/research/ai-setup-menus.md (Ideas 2026-10-05)

Check: check:fast (golden SAME) · check:full once after merges · screenshots at 390×844, 360×780, 844×390, 768×343, 1100 wide, 1440×900, 1920×1080.
Ask Muzzy: (carried) first-time New Game default = you + 1 AI? · F46 / F47 go or skip · F37 confirms.
Notes:

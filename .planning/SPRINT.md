# Sprint 16 — The AI moves like a person, plays online, and every snapshot says who was who
Started 2026-10-05 (autonomous overnight run — Muzzy: "run the auto over night sprints for glyphtender") · Milestone v0.7 AI opponents · Features: F50, F43, F51 (+ research task) — F50 ∥ F43 (different files), then F51
Muzzy will see: an AI's draft glyphling travels out of the tray onto the board the way his own does, and every other AI action moves like a person's; online, a player who goes idle is played by the real AI (not the old stand-in bot) and the host can add AI seats in the lobby; Dev Kit snapshots name each seat's personality + skill. **Stays the same:** rules, pass-and-play between people, every screen not listed.

## F50 🎮 AI looks human
Done when: every AI action (draft, move, cast, refresh, call-it, aim) plays the same motion, speed and path as a person's doing the same thing — first case: draft placements travel from the tray instead of popping in; the rule is written into the framework AI module's design.
- [x] 🤖 1. Audit: list every AI action vs the person's version (motion, timing, path, sounds/pops) → SPRINT Notes
- [x] 🤖 2. Draft: the AI's glyphling leaves the tray (SeedTray draft) and travels to its hex like a person's drop (src/store/gameStore.ts draftAt, localBot.ts)
- [x] 🤖 3. Fix any other mismatch the audit finds (same timings — reuse the existing animation, never a second one)
- [x] 🤖 4. Framework `design/ai.md`: the "AI looks human" standard; TDD Decisions
- [x] 🤖 5. e2e: an AI draft shows the travel (frame check) + screenshots at every size

## F43 🎮 Online AI
Done when: online, an idle / dropped seat is played by the real AI (Survivor at First Class = seats.ts defaultAi) instead of greedyBot, thinking inside the room within its CPU budget; the host can add AI seats in the lobby; no secret leaks; e2e:online / online4 green.
- [x] 🤖 1. Server thinking: party/ runs the AI brain for a bot seat on viewFor(game, seat) only, with a time budget + the never-freeze fallback
- [x] 🤖 2. Idle takeover uses it (replaces greedyBot); human pace on the server (pace.json)
- [x] 🤖 3. Lobby: host can add / remove AI seats (personality + skill) — game-ui kit parts only
- [x] 🤖 4. Tests: server.test (AI seat sees only its view, never the log), e2e:online with an AI seat
- [x] 🤖 5. GDD / TDD (server AI, CPU budget)

## F51 🔧 Snapshots record the seats
Done when: a Dev Kit snapshot saves each seat's kind (person / AI) + personality + skill, and loading an old snapshot still works.
- [ ] 🤖 1. Snapshot save + load carry seats (Dev Kit snapshot plug in src/devkit-game/)
- [ ] 🤖 2. Test: old snapshot (content/snapshots/first-game-with-ai.json) still loads

## Research (no menu changes)
- [ ] 🤖 R1. How other games set up AI opponents → .planning/research/ai-setup-menus.md (Ideas 2026-10-05)

Check: check:fast (golden SAME) · check:full once after merges · screenshots at 390×844, 360×780, 844×390, 768×343, 1100 wide, 1440×900, 1920×1080.
Ask Muzzy: (carried) first-time New Game default = you + 1 AI? · F46 / F47 go or skip · F37 confirms.
Notes:
- **F50 audit (2026-10-05) — every AI action vs a person's** (local AI, pass-and-play screen; code: store/localBot.ts → gameStore.botPlays):

  | Action | A person here | The AI (before F50) | Verdict |
  |---|---|---|---|
  | Draft | the tray shows the drafter's waiting glyphlings; they DRAG one out (it floats in the drag layer under the finger) and drop it on a lit hex (a tap on a lit hex also places it) | tray kept showing the person's glyphlings; after its think pause the AI's glyphling POPPED onto its hex | ❌ fix (task 2) |
  | Move (incl. call-it / self-tangle, a move-only End turn) | tap or drag a glyphling → it GLIDES (useGlide: moveBase + movePerHex × hexes, moveSettle bounce), ghost at its old hex, pulsing halo, dotted plan trail | botPlays sets the same `move` → the same useGlide, ghost, halo and plan trail; a move-only turn ends after the glide | ✅ same |
  | Aim + cast | pick a tray seed, aim it (planned seed on the hex, word spotlight), Cast → hop + arc flight (useThrow), grow, score sequence | after the glide: cast + flying together → the same hop, flight, grow and score sequence (its tray isn't shown — its seeds are secret) | ✅ same motion · it had no aim beat (threw the moment the glide ended) → fixed in task 3: it holds its aim 0.3–0.6 s at Normal (pace.json thinkSeconds.aim, Dev Kit AI tab → AI: pace; 0 at Instant) |
  | Refresh | set-aside seeds ringed, Refresh → shrink → grow on their tray, then play passes on | same refreshNow, same shrink + grow time before play passes on — on its own tray, which the screen doesn't show (secret seeds) | ✅ same timing; unseen on purpose |
  | Tray reorder / shuffle | cosmetic, the person's own tray | not needed (its tray is never shown) | n/a |
  | Turn pulse | the person's glyphlings breathe on their turn (a "your turn" cue to the person holding the device) | none (TurnBar robot badge + "… is thinking…" instead) | by design |
  | Handoff box | between people when seeds are hidden | never | by design |
  | Online (another device's draft, a server bot) | — | a remote seat's draft still pops in (onlinePlay: "draft placements are simply shown") | out of F50 (local); note for F43: reuse useBotDraft for a replayed draft |
- **F43 (helper, 2026-10-05):** server AI = the same seatBrain thinking as the phone, run inside the room (turnClock.ts aiAction): the seat's view only, rules-checked, greedy / "keep all" fallback (logged). Pace = pace.json Normal (draft · move+cast · refresh, each its own paced step) — rooms.json botTurnDelayMs retired. Timing (`npm run ai:server-timing`, this PC, worst per decision): Apprentice 45/98 ms, First Class 83/204 ms, Archmage 231/497 ms (2p/4p) vs serverBudgetMs 1000 (DO CPU limit 30 s per event). The Worker's clock stands still while code runs, so the room can't time itself — the budget is checked by the script, not live.
- **F43 rooms kit change (game copy, src/rooms — port to framework rooms):** add_bot carries an optional `profile`, the public Seat carries it, GameRules gets optional `botProfile(profile) → { profile, name }` (named bots numbered on repeats). Helpers can't touch the framework repo (permission denied) — the lead/Muzzy ports it.
- **F43 calls:** an AI seat is named after its personality ("The Survivor", repeats "The Survivor 2"); no "Surprise me" online yet (its name would give it away) — Ideas.
- **F43 lobby:** the host's "Add an AI player" card (next seat's glyphling, personality ◀ ▶ with its bio — sized to the longest bio like New Game — skill, Add AI) sits under the players; an AI row reads "The Survivor / 🤖 First Class" with a ✕ Remove for the host only. UI kit change (game copy, src/ui/kit — port to framework ui-kit): LobbyPlayer `detail` + `bot` (no Ready badge — bots always are), Lobby `onRemove` (the host's ✕ on bots). rooms.json allowBots → true.

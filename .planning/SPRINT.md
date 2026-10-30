# Sprint 30 — Glyphtender on today's framework
Started 2026-10-30 · Milestone v0.16 On today's framework · Features: F90, F97, F91, F92 (in this order)
Muzzy 2026-10-30: plan OK'd with two answers — (1) "glyphtender should be a vertical game only, not horizontal (portrait only, not landscape)" → F97; (2) "the board should be closer to the center so that the ergonomics aren't as bad" → F91 lays the game screen out so the board sits near the vertical middle on a phone. Bots stay silent (chattiness 0; chatty bots wait for /define). Source: framework .planning/research/2026-10-29-glyphtender-catchup.md (the rehearsal) + framework v0.34.0 (its fixes).
What changes: every framework module current; portrait only (a phone on its side shows "turn your phone"); the board sits nearer the middle of a phone screen; slightly roomier player cards; a version number in the menu; a "Send crash reports" switch in Settings. What stays the same: how the game plays, the bots (silent), how it sounds (the tuned mix is kept). Not in this sprint (Sprint 31): F93 lint clean-up, F94 saves switch-over, F95 Rejoin match, F96 matches survive a server restart. Work branch: dev/framework-checks (holds the unreleased 10-19 framework update; the catch-up releases with it).

## F90 🔧 Quiet module updates
Done when: Dev Kit, table, ai, rooms and audio are at the framework's newest (devkit 0.28.1, table 0.8.2, ai 0.8.3, rooms 0.13.1, audio 0.5.0), every hand step install-module prints is done, the game plays the same, check:full green and the online e2e 3/3.
- [x] 🤖 1. Dev Kit first (install-module refuses ai on the old Dev Kit) — src/devkit/VERSION
- [x] 🤖 2. table, ai, rooms with each printed hand step: ai chattiness → 0 for all 4 personalities (bots stay silent), the Dev Kit previews' fake OnlineRoom gets matchEnded/cameBack/clearCameBack/sendEmote, roomsPort() in vite.config, /health in party/worker.ts — src/devkit-game/PreviewApp.tsx
- [x] 🤖 3. audio 0.5.0 + `npm run audio:check -- --fix` (the tuned mix kept via volumeDb) — content/audio.json
- [x] 🤖 4. The template's checks.yml (browser cache) + check-all's port pre-flight (scripts/ports.mjs) — scripts/check-all.mjs
- [x] 🤖 5. check:full green; e2e online, online4, online-ai pass — scripts/check-all.mjs
- [x] 🙋 6. Listen to seed.pick, seed.drop, no and reveal.bonus (variants of one sound now even with each other, up to 2.6 dB per variant) — content/audio.json
Check: install-module's checks green per module; check:full; the three online e2e; Muzzy's listen.
Checked: install-module per module (devkit, table green; ai + rooms green after their wiring, Rejoin = known gap F95; audio green); check:full 32/34 then both fixed + re-run green (STATE Last full check); online, online4, online-ai PASS; /health answers {"ok":true} on party:dev. Muzzy's listen 2026-10-30: "the 4 sounds are fine" — approved.

## F97 🎮 Portrait only
Done when: content/ui/style.json says "orientation": "portrait", installed / full screen it stays upright (a plain browser tab does nothing — Muzzy 2026-10-30), check:framework and the e2e/screenshot sizes drop 844x390 and 768x343, and the GDD says portrait only.
- [x] 🤖 1. "orientation": "portrait" in style.json (Muzzy 2026-10-30, after a "Turn your phone" screen was built and shown: "do nothing for browsers. it'll be obvious to the user they need to turn back upright" → screen removed, 22c0b52) — content/ui/style.json
- [x] 🤖 1b. ~~Queue the turn-your-phone screen for the framework~~ — withdrawn with the screen (framework X01 removed from the queue) — src/ui/TurnPhone.tsx
- [x] 🤖 1c. Upright when installed and in full screen: PWA manifest "orientation": "portrait"; full screen asks the phone to hold portrait (Android; iPhone ignores it) — vite.config.ts
- [x] 🙋 1d. Muzzy's change mid-feature (2026-10-30): "do nothing for browsers" → the Turn your phone screen, its words, setting, Select object, e2e and framework X01 removed (22c0b52, framework 6d8e2cb) — src/App.tsx
- [x] 🤖 2. Drop the landscape sizes from Glyphtender's own e2e + screenshot lists (and their reference shots) — e2e/shots.mjs
- [x] 🤖 3. Update GDD §6 Look & sound / §4 How it plays: portrait only (Muzzy 2026-10-30) — .planning/GDD.md
- [x] 🤖 4. check:full green — scripts/check-all.mjs
Check: the built manifest says orientation portrait; full screen asks for the portrait lock; check:full green.
Checked: built dist/manifest.webmanifest has "orientation":"portrait"; fullscreen unit tests 4/4 + e2e:fullscreen on an upright phone pass (the lock itself: Muzzy tried it on his Android phone in Chrome 2026-10-30 — "it didn't change. it's approved"); check:full 37/38 at 2a9893d, the 1 = screenshots' known 1-pixel flake (B028), alone 162/162 the same; no e2e tests a sideways size any more (grep clean, 54 reference shots removed).

## F91 🎮 New kit look
Done when: UI kit 0.38.0 installed with Glyphtender's two test-helper fixes, the game screen lays out so the board sits near the vertical middle of a phone (player cards above/below it), Muzzy approved the look from before/after screenshots, and the reference screenshots are re-recorded.
- [x] 🤖 1. UI kit 0.38.0 via install-module; fix e2e/shots.mjs's animation wait (ignore scroll-driven animations) and the pass e2e's "button words wrapped" count (only the words' own boxes) — e2e/shots.mjs
- [x] 🤖 2. Board near the vertical middle on a phone (Muzzy: ergonomics) — the game screen's layout, player cards above/below — src/App.tsx
- [x] 🤖 3. Before/after screenshots at every portrait size (390x844, 360x780, ~1100 wide, 1440x900, 1920x1080) — look at each, describe them — e2e/shots.mjs
- [x] 🙋 4. Muzzy's call on the look (roomier player cards, the board's new spot) — Muzzy 2026-10-30: ".5 is good" (boardVertical 0.5: turn words at the top, board in the middle — replaces D41) — e2e/shots.mjs
- [ ] 🤖 4b. Tutorial bubbles that point at the tray don't cover the board's bottom row any more (Muzzy 2026-10-30: "yes" — in this feature) — src/tutorial/
  - done (eafedce, 3491922): one rule in tipsPlace.ts — with the prompt on top, a tray/button bubble goes BELOW its target (seed1, seed2, swap, idle nudge, seedFirst, explore tray seed: board hexes covered 9–18 → 0; plant1 / refresh / preview were already clear); desktop + boardVertical 0 unchanged; tipsPlace.test.ts + tutorial-rails (now also 360×780), tutorial-tips, explore guard it.
  - Ask Muzzy: (1) the draft steps still cover 2 hexes at 390 (5 at 360) · (2) the noWord / handOver pauses (big, board dimmed) cover 23–40 hexes · (3) the plantNothing nudge covers 9–14.
- [x] 🤖 4c. GDD §4 + TDD: the prompt now sits under the top bar on an upright phone (D101 replaces D41) — .planning/TDD.md
- [ ] 🤖 5. Apply his choice; `npm run shots:record` once approved — e2e/shots.mjs
Check: check:framework (every kit promise at every portrait size); screenshots looked at; Muzzy's OK.
Checked:

## F92 🔧 Version label + crash reports
Done when: the version module shows the version in the main menu footer and Settings; crashes is wired (startCrashes, crashRootOptions, the Privacy → "Send crash reports" row) on a port of its own; its server is live with Muzzy; a privacy page says what a report holds.
- [ ] 🤖 1. version 0.1.3: versionPlugin, MainMenu + Settings version, Dev Kit adapter, checkVersion in an e2e check:full runs — src/main.tsx
- [ ] 🤖 2. crashes 0.2.2 wired + "Send crash reports" row; its local port not 1995 (that's the online e2e's wrangler) — content/ui/settings.json
- [ ] 🙋 3. Put the crash server online together (~10 min: a token, `npm run crashes:deploy`) — package.json
- [ ] 🤖 4. client.url in content/crashes.json + a privacy page (what a report holds, how to turn it off) + the Crashes: line in STATE Key facts — package.json
Check: crashes + version checks green; a test crash reaches the live server; check:full green.
Checked:

Notes:
- Open bugs: none P0/P1 (BUGS.md: P2 1 verified, P3 6 — all test flakes).
- Install order (framework v0.34.0's install-module enforces it): devkit before ai.
- F90 task 2 (Claude's calls): ai's banter steps 2–4 skipped (bots silent, chattiness 0 → check:framework skips both banter checks). ai's arena steps 1 + 5 → ROADMAP Ideas (optional, no player change). rooms steps 3–4 (keep a match through a server restart) = F96 — Matches survive a server restart, sprint 31; rooms' "Rejoin match" promise = F95 — Rejoin match → listed as a known gap in content/devkit.json until then. Table 0.8.0 → 0.8.2 changed only its VERSION in the game.
- F90 task 4: checks.yml = the template (browser + apt cache); check-all's pre-flight covers E2E + ALONE. Proof attempt: a dummy server on 5243 was NOT caught, because netstat shows no row for it in Claude's shell (the shared Windows port lookup, not this copy) → added to the framework ROADMAP Ideas note. The pre-flight is in place for when that lookup is fixed.
- F90 task 5: two test fixes the new Dev Kit needed — words-tab pressed ` at a fixed 1.5 s, but Dev Kit 0.28 arrives ~2 s after the page (probe: 2045 ms) → waits for aside.devkit now (devkit-ai's way); devkit-sound left audio-originals/ui/<test sound> behind (the Sound tab keeps an original of each added file) → its put-back removes it.
- F91 task 2 (helper, 315efd7 + 4fe6a22): the board was already as low as its box allows at 390×844 — the space under it is the prompt's fixed 3-line frame (B013). The only lever: move the prompt ABOVE the board. layout.boardVertical 0–1 (0 = today exactly; >0 = prompt under the top bar, board placed between prompt and tray; default 0.5). Board centre at 390×844: 36.5% → 49.7% (0.5) → 52.9% (1); 360×780: 33.3% → 49.7% → 51.0%. Desktop unchanged at every value. Reverses D41 (2026-09-30, "the prompt sits just above the tray") — Muzzy's call. Open if >0: tutorial callouts that point at the tray still sit where the prompt was, covering the board's bottom row(s). Shots: ~/Documents/dev/.scratch/gt-f91/.
- Surprise: stop-servers.mjs said "nothing is listening" while party:dev still held 1997 → logged in the framework ROADMAP Ideas; `stop-servers.mjs wrangler` stops it by name.
Retro:

# Sprint 30 — Glyphtender on today's framework
Started 2026-10-30 · Milestone v0.16 On today's framework · Features: F90, F97, F91, F92 (in this order)
Muzzy 2026-10-30: plan OK'd with two answers — (1) "glyphtender should be a vertical game only, not horizontal (portrait only, not landscape)" → F97; (2) "the board should be closer to the center so that the ergonomics aren't as bad" → F91 lays the game screen out so the board sits near the vertical middle on a phone. Bots stay silent (chattiness 0; chatty bots wait for /define). Source: framework .planning/research/2026-10-29-glyphtender-catchup.md (the rehearsal) + framework v0.34.0 (its fixes).
What changes: every framework module current; portrait only (a phone on its side shows "turn your phone"); the board sits nearer the middle of a phone screen; slightly roomier player cards; a version number in the menu; a "Send crash reports" switch in Settings. What stays the same: how the game plays, the bots (silent), how it sounds (the tuned mix is kept). Not in this sprint (Sprint 31): F93 lint clean-up, F94 saves switch-over, F95 Rejoin match, F96 matches survive a server restart. Work branch: dev/framework-checks (holds the unreleased 10-19 framework update; the catch-up releases with it).

## F90 🔧 Quiet module updates
Done when: Dev Kit, table, ai, rooms and audio are at the framework's newest (devkit 0.28.1, table 0.8.2, ai 0.8.3, rooms 0.13.1, audio 0.5.0), every hand step install-module prints is done, the game plays the same, check:full green and the online e2e 3/3.
- [x] 🤖 1. Dev Kit first (install-module refuses ai on the old Dev Kit) — src/devkit/VERSION
- [x] 🤖 2. table, ai, rooms with each printed hand step: ai chattiness → 0 for all 4 personalities (bots stay silent), the Dev Kit previews' fake OnlineRoom gets matchEnded/cameBack/clearCameBack/sendEmote, roomsPort() in vite.config, /health in party/worker.ts — src/devkit-game/PreviewApp.tsx
- [ ] 🤖 3. audio 0.5.0 + `npm run audio:check -- --fix` (the tuned mix kept via volumeDb) — content/audio.json
- [ ] 🤖 4. The template's checks.yml (browser cache) + check-all's port pre-flight (scripts/ports.mjs) — scripts/check-all.mjs
- [ ] 🤖 5. check:full green; e2e online, online4, online-ai pass — scripts/check-all.mjs
- [ ] 🙋 6. Listen to seed.pick, seed.drop, no and reveal.bonus (variants of one sound now even with each other, up to 2.6 dB per variant) — content/audio.json
Check: install-module's checks green per module; check:full; the three online e2e; Muzzy's listen.
Checked:

## F97 🎮 Portrait only
Done when: content/ui/style.json says "orientation": "portrait", a phone on its side shows the kit's "turn your phone" screen, check:framework and the e2e/screenshot sizes drop 844x390 and 768x343, and the GDD says portrait only.
- [ ] 🤖 1. "orientation": "portrait" in style.json; the kit's turn-your-phone screen on a sideways phone (as Goops does) — content/ui/style.json
- [ ] 🤖 2. Drop the landscape sizes from Glyphtender's own e2e + screenshot lists (and their reference shots) — e2e/shots.mjs
- [ ] 🤖 3. Update GDD §6 Look & sound / §4 How it plays: portrait only (Muzzy 2026-10-30) — .planning/GDD.md
- [ ] 🤖 4. check:full green — scripts/check-all.mjs
Check: a sideways phone shows the turn-your-phone screen (screenshot); check:full green.
Checked:

## F91 🎮 New kit look
Done when: UI kit 0.38.0 installed with Glyphtender's two test-helper fixes, the game screen lays out so the board sits near the vertical middle of a phone (player cards above/below it), Muzzy approved the look from before/after screenshots, and the reference screenshots are re-recorded.
- [ ] 🤖 1. UI kit 0.38.0 via install-module; fix e2e/shots.mjs's animation wait (ignore scroll-driven animations) and the pass e2e's "button words wrapped" count (only the words' own boxes) — e2e/shots.mjs
- [ ] 🤖 2. Board near the vertical middle on a phone (Muzzy: ergonomics) — the game screen's layout, player cards above/below — src/App.tsx
- [ ] 🤖 3. Before/after screenshots at every portrait size (390x844, 360x780, ~1100 wide, 1440x900, 1920x1080) — look at each, describe them — e2e/shots.mjs
- [ ] 🙋 4. Muzzy's call on the look (roomier player cards, the board's new spot) — e2e/shots.mjs
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
- Surprise: stop-servers.mjs said "nothing is listening" while party:dev still held 1997 → logged in the framework ROADMAP Ideas; `stop-servers.mjs wrangler` stops it by name.
Retro:

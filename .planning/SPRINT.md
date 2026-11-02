# Sprint 31 — Nothing gets lost
Started 2026-11-01 · Milestone v0.16 On today's framework (this sprint finishes it) · Features: F93, F94, F95, F96 + B028 (in this order)
Muzzy 2026-11-01: "1a, 2a" — all four features plus the B028 fix; a saved online match waits 7 days for its players (keepMatchDays 7).
What changes: a "Rejoin match" button after closing a tab mid-match; online matches survive the server restarting; saved choices carry over through the saves module (they already carry over today). What stays the same: how the game plays and looks.

## F93 🔧 Lint clean-up
Done when: the framework lint module (0.4.0) is installed, the real finds are fixed (player words in content/text/en.json, AI weights in content/ai/, other numbers in content/ or marked `// tuning-ok:`), and its rules are errors in check:fast.
- [x] 🤖 1. `install-module.mjs lint .` (lint 0.4.0) and list every find (player text, tuning numbers, own-clock) before fixing — eslint.config.js
  - done 2026-11-01: installed clean (the comma bug is gone — F165 worked); 29 finds as warnings, 0 own-clock. **Player text (9):** Board.tsx:178 aria "Garden" · GameScreen.tsx:167 aria "Seeds and actions" · SeedTray.tsx:147 "Seeds" · HelpLayer.tsx:213 + 217 "Tip" · TutorialLayer.tsx:73 "Tutorial" · decisions.ts:113 "CALL IT" · arena.ts:152 report title · railsSteps.ts:94 "Sprout is playing its scripted turn". **Numbers (20):** AI weights — DRAFT (decisions.ts:23), BUILD, DUMP, ESCAPE, SCORE, SELF_TANGLE, STEAL, TRAP (src/ai/goals/*) = 23 settings · readings.ts:22 MAGIC_PER_POINT 2.5 · look.ts:102 FAR 9999 · GameScreen.tsx:41 BIG_HEX 64 · scoreFrames.ts:34 FLIGHT_STEPS 14 · spotlight.ts:42–43 LETTER 0.8 / STEP 0.25 · StoryChart.tsx:33 MIN_TANGLE_COLUMN 44 · main.tsx:64 a 1000 ms timer · gameStore.ts:189 SCORE_BEAT_MS 120 · onlinePlay.ts:48 WAIT_FOR_VIEW_MS 3000 · ExploreLayer.tsx:265 REMIND_ROOM 96 · newGame.ts:46 MAX_PLAYERS 4. Not lint's: usePieceInput.ts:139 a React hooks warning that was already there (left as is).
- [x] 🤖 2. Player words into en.json: Board, GameScreen, SeedTray, HelpLayer, TutorialLayer, the AI arena report title, the decisions "CALL IT" — content/text/en.json
  - done 2026-11-01: 7 into en.json — game.labels (garden, panel, tray: screen-reader names), tutorial.tipLabel / tutorialLabel, tutorial.sproutPlaying (the rails refusal the referee gives — outside tutorial.rails, whose keys are the step words). 2 marked `// text-ok:` — "CALL IT" (an AI goal name in the Dev Kit's notes; no game screen reads .goal) and the arena report title (Dev Kit / ai:arena page). Player-text finds 0; check:fast green. No visual change (aria labels + a refusal reason).
- [x] 🤖 3. AI weights (*_WEIGHTS in goals + decisions, look FAR, readings MAGIC_PER_POINT) into content/ai; the other ~9 numbers (spotlight, scoreFrames, StoryChart, GameScreen, main.tsx, gameStore, onlinePlay, ExploreLayer, newGame) into content/ or `// tuning-ok: <why>` — content/ai
  - done 2026-11-01: **new content/ai/weights.json** — every goal's weights (DENY too, for one place), draft, magicPerPoint; each file now reads its group (a one-off script checked every old value equals the file's — moved, not changed; TDD data table names it). **Into tuning files (Dev Kit + Select):** layout.bigHexPx 64 (prompt + reveal objects), endscreen.chartTangleColumnMin 44 (storyChart), anim.scoreEndBeat 0.12 s (scorePop; was SCORE_BEAT_MS 120). **`// tuning-ok:` with a reason:** look.ts FAR (a "never" stand-in), scoreFrames FLIGHT_STEPS (drawing quality), spotlight LETTER / STEP (art size, search grid), main.tsx Dev Kit idle fallback (as the starter), onlinePlay WAIT_FOR_VIEW_MS (a network retry), ExploreLayer REMIND_ROOM (a measurement of the kit's callout), newGame MAX_PLAYERS (4 colours). Lint: 0 bmuz finds left (only the old React hooks warning). check:fast green incl. golden SAME; e2e ai, online-ai, devkit-select pass. No visual change (same values).
- [x] 🤖 4. Rules to errors; golden games still SAME (the AI weights moved, not changed) — eslint.config.js
  - done 2026-11-01: all 4 bmuz rules are errors. Proof: a throwaway `export const GLOW_SPEED = 0.7` → eslint exit 1 with the "setting written into the code" message (file deleted). `npm run lint` green (1 old React hooks warning). Golden SAME at task 3.
- [ ] 🤖 5. B028 (P3, the Sprint 30 retro's change): the Story chart shot waits for the chart's own drawing animations (getAnimations) before the picture; 3 check:full runs in a row with screenshots 162/162 — e2e/shots.mjs
  - 2026-11-01, not fixed: the planned fix wouldn't help (settle() already waits for every animation) and Chrome's deterministic-drawing switches didn't either (still 1 pixel, alone). The pixels are a few shades on the yellow line's soft edge under the purple line's outline. Findings + next ideas in BUGS B028; switches reverted. Ask Muzzy: keep chasing it in this sprint, or move it out?
Check: check:fast (lint as errors) + golden SAME + e2e ai, online-ai (the AI reads its weights from content/ now); B028: three check:full runs, screenshots 162/162 each.
Checked:

## F94 🧱 Saves switch-over
Done when: the saves module is installed and Glyphtender's 4 saved things (New Game choices, online lobby choices, tutorial "done", words waiting to send) go through createSave with oldSave, an old save from every past version loads (golden saves), and full screen goes through the kit's settings.
- [ ] 🤖 1. `install-module.mjs saves .` (saves 0.7.0) — its starter test waits for the first createSave — src/ui/newGame.ts
- [ ] 🤖 2. New Game + online lobby choices onto createSave + oldSave; the 2-letter marker becomes upgrade step v2 — src/ui/online/onlineOptions.ts
- [ ] 🤖 3. Tutorial "done" (plain text — saves 0.7.0 adopts it) and the words waiting to send onto createSave — src/tutorial/progress.ts
- [ ] 🤖 4. Golden saves: v1 of all 4, v2 of New Game + lobby, each in the saves test — src/ui/online/wordOutbox.ts
- [ ] 🤖 5. Full screen writes through the kit's settings, not its key directly — src/ui/fullscreen.ts
Check: check:fast (golden saves) + e2e game, new-game, word-switches, submit-word, tutorial-shell; a browser with old saves (v0.11.2's keys) keeps its choices.
Checked:

## F95 🎮 Rejoin match
Done when: a player who closed the tab mid-match sees "Rejoin match" on the main menu and gets their seat back with one tap; the game's own room-code copy is gone (the kit's lastRoom is the one memory); the Dev Kit's known gap is closed.
- [ ] 🤖 1. The kit's lastRoom replaces the game's own room-code copy (sessionStorage ROOM_KEY) — src/ui/online/session.ts
- [ ] 🤖 2. "Rejoin match" on the main menu from matchToRejoin(), words in en.json — src/ui/menus.tsx
- [ ] 🤖 3. e2e: start a 2-player match, close one tab, reopen → Rejoin → same seat, the game goes on — e2e/online-kit.mjs
- [ ] 🤖 4. Close the known gap ("a closed tab can rejoin its match") + GDD §Online line — content/devkit.json
Check: check:framework (the rooms Rejoin promise kept) + e2e online, online4 + the new rejoin e2e; screenshots of the menu with Rejoin at phone + desktop.
Checked:

## F96 🔧 Matches survive a server restart
Done when: an online match is kept in the room's storage, so a server restart or a redeploy doesn't lose it; the turn timer and bot timers start again where they were; a match nobody plays for 7 days ends (keepMatchDays 7); the privacy page says so.
- [ ] 🤖 1. Measure first: storage writes per turn and per game on a local server against Cloudflare's free plan (Durable Object SQLite writes a day), written in Notes — party/worker.ts
- [ ] 🤖 2. Room storage + alarm in the worker, from the framework starter's party/worker.ts (saveRoom, restore on start, onAlarm); keepMatchDays 7 — content/rooms.json
- [ ] 🤖 3. onRestore restarts the turn timer and the bot's timers — party/turnClock.ts
- [ ] 🤖 4. e2e: a match, the local server restarted mid-game, both players carry on — party/glyphtenderRules.ts
- [ ] 🤖 5. Privacy page's Online play part: rooms kept up to 7 days without a move, then deleted (+ the GDD line) — public/privacy.html
Check: e2e online, online4, online-ai + the restart e2e; server.test; the write count within the free plan's daily limit with room to spare.
Checked:

Notes:
- Framework v0.34.0 already fixed three things the catch-up rehearsal hit: the lint installer's comma (F165), saves adopting a plain-text old value like the tutorial's "done" (F166), and lint's false alarms on refusal reasons from check* helpers (F167). If any of them shows up again, it's a framework bug — fix it there first.
- F96 rehearsal note: the starter's worker.ts is the model; Glyphtender's worker already uses SQLite storage (Words), so no new migration for the Main class beyond what the starter shows — check wrangler.json migrations before deploying.
- B028's entry also suspects the tray tile images on game-play shots; this task covers the Story chart only (the case that keeps showing). If the tray case comes back, it's a second task.
- Deploy: F96 changes the server → at /deliver, `npm run party:deploy` before the site.
Retro:

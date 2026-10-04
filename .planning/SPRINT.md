# Sprint 15 — Play against the AI, tune its personalities in the Dev Kit, and make positional play win
Started 2026-10-04 (autonomous run) · Milestone v0.7 AI opponents · Features: F42 (+ framework F21), F41 (+ framework F23), F45 (in this order; F45 joins once F41 works — sprint rule)
Muzzy will see: New Game → any seat can be an AI (personality card + skill); it plays at a human pace with a thinking cue; Settings → AI speed; the Dev Kit gets an AI tab (pick a personality, drag its sliders, watch AIs play with their thoughts showing, run the Personality Check). **Stays the same:** online play (the server keeps its stand-in bot until F43), pass-and-play between people, every screen not listed.

## F42 🎮 Play vs AI (+ framework F21: background thinking in a game)
Done when: a solo game (you + 1–3 AIs) and a mixed pass-and-play game (people + AIs) play to the end on phone + desktop; the AI never freezes the screen; Settings → AI speed works; no handoff screen for an AI.
- [ ] 🤖 1. Thinking off the main thread: src/ai/think.worker.ts (serveThinking) + src/ai/thinker.ts (makeThinker; inlineThinker fallback) — the brain runs in a Web Worker with the word list + content/ai loaded once
- [ ] 🤖 2. localBot.ts plays AI seats through the thinker at the pace (kit pace.ts thinkDelay + waitLeft, content/ai/pace.json, speed from Settings); greedyBot stays only for tests
- [ ] 🤖 3. New Game: seat = Person / AI; AI → personality picker (name, seat glyphling as portrait, bio — en.json ai.*) incl. "Surprise me", + skill (Apprentice · First Class · Archmage); remembered like the other choices (src/ui/NewGameScreen.tsx, newGame.ts) — game-ui kit parts only
- [ ] 🤖 4. On its turn: "thinking…" cue on its chip/prompt; Settings → AI speed (Slow · Normal · Fast · Instant) in content/ui/settings.json + gameSettings.ts
- [ ] 🤖 5. e2e: solo vs 1 AI and 2 people + 2 AIs play to the end (Instant), screenshots at every size; the end screen's awards/Story still work
- [ ] 🤖 6. GDD §5 / TDD §2 (AI seats in the store, worker)

## F41 🔧 Dev Kit AI tab (+ framework F23)
Done when: in the running game, the Dev Kit's AI tab lets Muzzy pick a personality, drag two-handled trait sliders, reorder goals, edit nudge / shifts / skill / bio, Save (to content/ai/ like Tuning saves), watch AIs play each other at human pace with each decision's note and belief meters, and run a small Personality Check.
- [x] 🤖 1. Framework F23 (framework-first, devkit/): a generic AI tab — personality editor (range sliders, goal order, numbers), skill editor, notes feed, belief bars; the game plugs in its personalities, skills and an "arena" callback through the game-tab API
- [x] 🤖 2. Install (install-devkit --dry-run, then run) + Glyphtender's plug-in: src/devkit-game/ (personalities/skills files, watch-a-game on the real board with notes, run N games in a worker → the ai-check report)
- [x] 🤖 3. e2e:devkit-ai — open tab, change a range, save, reload, value kept; watch mode shows notes
- [x] 🤖 4. TDD §1 Dev Kit tools (AI tab)

## F45 🎛️ Personality Check pass (first pass)
Done when: positional personalities win their share (everyone 35–65% vs Balanced), feel targets mostly green, tell-apart ≥ 70%, skill ladder holds — or the cause is diagnosed and the rules knob is put to Muzzy.
- [ ] 🤖 1. Diagnose (mda-analyze): why do Bully / Survivor / Builder lose ~95% while tangling most? (their Magic vs others', what the tangle bonus pays, how often their goal had nothing to do) → SPRINT Notes
- [ ] 🤖 2. Personality knobs first (one at a time, arena after each): nudge / goal order / shifts — Tuning lines in Notes (tuning)
- [ ] 🤖 3. Vulture steals, Scholar's long words, Scholar vs Strategist vs Balanced told apart (tuning)
- [ ] 🤖 4. If personality knobs can't fix it: the rules knob (tangle bonus / ownership) → Ask Muzzy with the numbers (never changed without him)

Check: npm test · check:fast (golden SAME) · check:full · `npm run ai:arena` report · screenshots at 390×844, 360×780, 844×390, 768×343, 1100 wide, 1440×900, 1920×1080.
Ask Muzzy: F37 (4 AI calls — defaults in place) · bios' tone (en.json ai.personality.*.bio).
Notes:
- **F45 diagnosis (2026-10-04, `scripts/ai-diagnose.mjs` head-to-heads + arena):** Bully vs Scholar 0–30: Bully Magic 28 words + 14 tangles vs Scholar 104 + 2; Bully refreshed on 35% of its turns (its hunting casts spell nothing); **tangling while behind helps the leader** — 2 tangles end the game, so the Bully's tangle let the Scholar self-tangle to end it while ahead (14/30 games).
- Tuning (one knob at a time, 60 mixed games + ladder each):
  - brain: other goals nudge by their own trait (not a share split) — tiny effect alone.
  - TRAP: a tangle that ends the game / leaves it one from the end is worth nothing while it believes it's behind; ending while behind −100 → the Bully stopped handing the Scholar the ending (ended 9 → 2 of 30), still 0 wins.
  - nudge 0.2 → 1 for all: wins spread (Bully 17% vs Scholar, Balanced 45%) but tell-apart 61% → 36%, Bully's hunting halved — identity lost.
  - **Muzzy's call (2026-10-04): "make sure they are scoring points WHILE performing their personality goal… but maybe bully looks at whether it can pincer really strongly and will prio that over spelling."** → brain: **steady goals** (every move also tries to SCORE, 0.6) + **big moments** (content/ai/goals.json bigAt per goal ≈ top quarter of its chances; then focus 0.8 keeps only strong main-goal moves, spelling breaks ties), nudge 0.3. Result: Bully wins 15% (was 6%), tangles 0.94/game, cuts 5.4 rival moves/turn (table best), tell-apart 52%, for-all 3/5; Scholar 73% · Strategist 65% · Balanced 53% · Vulture 26% · Survivor 16% · Builder 7%.
  - Muzzy floated (2026-10-04): tangles worth more for players behind (catch-up, scaling with place) — discussed: secret Magic means players can't aim for it unless the reveal shows it plainly; sim it beside a flat bigger tangle bonus → numbers to Muzzy (rules = his call).
- F41 (2026-10-04): AI tab built framework-first (Dev Kit 0.6.0, framework `devkit/kit/ai/`), plugged in from `src/devkit-game/aiDevKit.ts`. Watch + Run check use the tab's UNSAVED values (tweak → watch without saving). Proved: framework devkit npm test 173 ✓, check:fast (golden SAME), check:devkit, `npm run e2e:devkit-ai` (phone 390×844, 844×390, 1440×900: pick Bully, move a handle, Save, reload → kept, file restored; Watch → notes + belief bars; desktop: Run check 6 games in a worker → report), check:full previews devkit-search devkit-ai.
- F41 ⚠ merge with F42: `src/devkit-game/aiWatch.ts` startWatch drives the bot seats ITSELF (startGame bots + botPlays). F42 makes GameScreen run driveLocalBots() for local bot seats → after merging, both would play the same turn. Swap startWatch to: startGame({ bots, ai: {[seat]: {personality, skill}} }) + localBot.onAiDecision((seat, d) → note + beliefsOf) + setAiSpeedOverride(...) (play-vs-ai's hooks). Catch: F42's `ai` takes personality IDS, so Watch then plays the SAVED personalities, not the tab's unsaved edits — say so in the tab's Watch help line, or let the store accept a Personality object.
- F41 surprises: (1) a phone's first tap goes full screen, which put the page ABOVE the open Dev Kit panel (it vanished) — fixed in the framework (DevKit.tsx re-shows its popover on fullscreenchange). (2) Dev Kit Save pretty-prints JSON, so the first AI-tab Save expands personalities.json's one-line `{ "min": 80, "max": 95 }` ranges and skills.json's one-line skills (12 KB → 17 KB, same data) — a noisy diff once; a framework formatJson "short objects on one line" rule would fix it (not done). (3) Copy to new copies the bio, but not en.json's `ai.personality.<id>.name` — a new personality has no player-facing name until one is added. (4) pace.json isn't in any tab yet (Tuning reads only content/tuning/) — Obsidian for now. (5) Watch's decisions run on the main thread until F42's worker (a short hitch per AI turn at First Class).

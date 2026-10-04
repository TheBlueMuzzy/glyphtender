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
- [ ] 🤖 1. Framework F23 (framework-first, devkit/): a generic AI tab — personality editor (range sliders, goal order, numbers), skill editor, notes feed, belief bars; the game plugs in its personalities, skills and an "arena" callback through the game-tab API
- [ ] 🤖 2. Install (install-devkit --dry-run, then run) + Glyphtender's plug-in: src/devkit-game/ (personalities/skills files, watch-a-game on the real board with notes, run N games in a worker → the ai-check report)
- [ ] 🤖 3. e2e:devkit-ai — open tab, change a range, save, reload, value kept; watch mode shows notes
- [ ] 🤖 4. TDD §1 Dev Kit tools (AI tab)

## F45 🎛️ Personality Check pass (first pass)
Done when: positional personalities win their share (everyone 35–65% vs Balanced), feel targets mostly green, tell-apart ≥ 70%, skill ladder holds — or the cause is diagnosed and the rules knob is put to Muzzy.
- [ ] 🤖 1. Diagnose (mda-analyze): why do Bully / Survivor / Builder lose ~95% while tangling most? (their Magic vs others', what the tangle bonus pays, how often their goal had nothing to do) → SPRINT Notes
- [ ] 🤖 2. Personality knobs first (one at a time, arena after each): nudge / goal order / shifts — Tuning lines in Notes (tuning)
- [ ] 🤖 3. Vulture steals, Scholar's long words, Scholar vs Strategist vs Balanced told apart (tuning)
- [ ] 🤖 4. If personality knobs can't fix it: the rules knob (tangle bonus / ownership) → Ask Muzzy with the numbers (never changed without him)

Check: npm test · check:fast (golden SAME) · check:full · `npm run ai:arena` report · screenshots at 390×844, 360×780, 844×390, 768×343, 1100 wide, 1440×900, 1920×1080.
Ask Muzzy: F37 (4 AI calls — defaults in place) · bios' tone (en.json ai.personality.*.bio).
Notes:

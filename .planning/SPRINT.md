# Sprint 12 — One referee for every drag, and the tray becomes the framework Hand view
Started 2026-10-04 (autonomous run) · Milestone v0.6 · Features: F34, F35 (in this order)

## F34 🧱 Drag referee
Done when: one referee answer (framework Table referee) drives the drop glow, the nope shake and the drop; the 7 rule copies in screen code ask the rules instead — and check:golden + check:shots SAME, e2e green.
- [x] 🤖 1. Framework (v0.4 F16): referee.ts (judge / targetsFor / mayPickUp) + rack.ts (GAP, moveInRack, refillRack, placesOf, shuffleRack) — Table 0.5.0 (framework 77f1ec3)
- [ ] 🤖 2. The rules answer what the screen re-worked: rules.ts exports mayMoveOnly, movesLeft (danger: 0 tangled / 1 warning), movable glyphlings (pulse), per-seed Magic of a turn (score pops), tangle bonus details (reveal) — and turnPlan.mayMoveOnly, danger.ts, turnPulse.ts, wordMarks.scorePops, revealPlan ask them
- [ ] 🤖 3. One referee for the drag: src/store/referee.ts (makeReferee: myTurn's isMyTurn/isBusy → accepts → live rules check) — nope.nopeFor, usePieceInput.startDrag, turnPlan.dropKind/boardHighlight (the glow) and tapHex (the drop) all ask it; B008 (no tray drag before the move) stays
- [ ] 🤖 4. Prove it — check:golden + check:shots SAME; npm test, build, lint; e2e:game, pass, portrait, score, spotlight, trails, end (one at a time)

## F35 🧱 Hand view
Done when: the seed tray IS the framework ui-kit Hand view with a "rack" preset (the game only draws the seed art) — pixel-identical (check:shots SAME at all 8 sizes), same drag / reorder / shuffle / refresh shrink-grow behaviour, same selectors (.game-tray, [data-tray-pos], [data-hand], [data-refresh-slot], data-refresh-stage).
- [ ] 🤖 5. Framework (v0.4 F17): ui-kit HandView (rack preset: rows, slot maths, gaps, held / aimed / waiting / hidden states, shrink-grow stages, reorder-drag hooks; the piece art is the game's render prop) + gallery entry + CATALOG — ui-kit 0.3.0
- [ ] 🤖 6. The tray becomes HandView "rack": SeedTray.tsx draws seeds through it; trayLayout / refreshFx order maths → Table rack.ts; install ui-kit 0.3.0 + Table 0.5.0
- [ ] 🤖 7. Prove it — check:shots SAME (pixel-identical), check:golden SAME; e2e:game (B008, B011, tray never re-sorts), portrait, margins, pass, pass4, online, previews; links
- [ ] 🤖 8. TDD Decisions + STATE key facts · framework ROADMAP F16/F17 · ui-kit CATALOG
Check: both checks SAME; every e2e green.
Ask Muzzy: —
Notes: Decided (autonomous): the referee is pure (Table); the Hand view is React (ui-kit) and knows nothing about seeds — the game passes the art. Pixel-identical is proven by check:shots, not by eye.

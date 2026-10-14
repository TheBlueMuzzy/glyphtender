# Sprint 29 — Click a thing in the game, tweak it (Dev Kit Select Mode)
Started 2026-10-14 · Milestone v0.15 · Features: F86 (framework F55 + F56 built first, in framework branch dev/select-mode) · Branch: dev/select-mode
Muzzy (2026-10-14): "My goal is the simplicity of click on a thing > see the attributes associated with it compiled in one place > update those things and hit save." · On the 14-object list: "I think we can start with these, but expand as we prove it out… run on auto. i'm going to bed"

## F86 🔧 Select Mode on Glyphtender
Done when: with the Dev Kit open, Select → select mode on → hover a glyphling = thin pink outline + "Glyphling"; click = thick outline, the other glyphlings dashed, and the panel lists its knobs (Look · Drag · Move…) with the real sliders — changing one shows in the game live, Save writes the tuning file; a score pop that flashed by is in "Recently on screen" and can be picked from there; + Add a knob adds a setting to the object and saves content/devkit/select.json.
- [x] 🤖 1. Framework kit/select/: selectMap.ts (read, pick, add/remove, checkSelectMap) + tests — framework/devkit/kit/select/
- [x] 🤖 2. Framework picker + store + SelectLayer (outlines, capture clicks, seen scanner) + tests
- [x] 🤖 3. Framework SelectTab + DevKit.tsx pick view (Tuning / Text / Sound filtered by the pick, grouped by the object's sections) + tests; Dev Kit 0.14.0
- [x] 🤖 4. Glyphtender: install Dev Kit 0.14, write content/devkit/select.json (14 objects), data-knobs tags in Board, WordBorders, ScorePops, DangerCue, TurnBar, EndResults, Reveal…
- [x] 🤖 5. Glyphtender src/devkit-game/select.test.ts (file ↔ tags agree, no unknown keys) + e2e/devkit-select.mjs (port 5448) + screenshots
- [x] 🤖 6. Full check, code review, /save
Check: e2e:devkit-select phone + desktop screenshots (hover, pick, knobs list, recent list); devkit tests; check:full.
Ask Muzzy: (4 questions — see also the danger-ring note in Notes) (1) knob lists in content/devkit/select.json that you own, with "+ Add a knob" — OK? (recommended in chat 2026-10-14, no objection) (2) game rules left out of Select (add one with + Add a knob if you want it) — agree? (3) the outline slider + the pick are remembered per browser (not in a synced file) — fine?
Notes:
- Built 2026-10-14 overnight (auto). Framework branch dev/select-mode (Dev Kit 0.14.0, pushed); game branch dev/select-mode.
- Phone (found while writing the e2e): the panel covers most of a 390 px screen, so select mode shrinks it to a bar at the bottom ("Tap something in the game to pick it · Done"); a tap picks and brings the panel back with the pick.
- A glyphling in danger: a click on it picks the warning ring (Danger & tangle) — its box is the smaller one. Pick the glyphling from Recently on screen, or click a safe one. Ask Muzzy: OK, or should the glyphling win there?
- Outlines show only while select mode is on (not while you play with a pick) — so they never cover the game while tuning.
- UI style colours (Color tab tokens) aren't in Select yet — Glyphtender's colours are tuning keys, so nothing needs them.
- Review (low): 1 bug fixed (recent list order). Full check 35/35 after 2 fixes (10 tabs fit a desktop row; 1-pixel shot flake re-ran SAME).

## F87 ❓ Muzzy tries Select Mode
- [ ] 🙋 1. Play with the Dev Kit open, pick things, say what's missing / wrong / hard to click

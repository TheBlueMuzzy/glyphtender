# Sprint 29 — Click a thing in the game, tweak it (Dev Kit Select Mode)
Started 2026-10-14 · Milestone v0.15 · Features: F86 (framework F55 + F56 built first, in framework branch dev/select-mode) · Branch: dev/select-mode
Muzzy (2026-10-14): "My goal is the simplicity of click on a thing > see the attributes associated with it compiled in one place > update those things and hit save." · On the 14-object list: "I think we can start with these, but expand as we prove it out… run on auto. i'm going to bed"

## F86 🔧 Select Mode on Glyphtender
Done when: with the Dev Kit open, Select → select mode on → hover a glyphling = thin pink outline + "Glyphling"; click = thick outline, the other glyphlings dashed, and the panel lists its knobs (Look · Drag · Move…) with the real sliders — changing one shows in the game live, Save writes the tuning file; a score pop that flashed by is in "Recently on screen" and can be picked from there; + Add a knob adds a setting to the object and saves content/devkit/select.json.
- [ ] 🤖 1. Framework kit/select/: selectMap.ts (read, pick, add/remove, checkSelectMap) + tests — framework/devkit/kit/select/
- [ ] 🤖 2. Framework picker + store + SelectLayer (outlines, capture clicks, seen scanner) + tests
- [ ] 🤖 3. Framework SelectTab + DevKit.tsx pick view (Tuning / Text / Sound filtered by the pick, grouped by the object's sections) + tests; Dev Kit 0.14.0
- [ ] 🤖 4. Glyphtender: install Dev Kit 0.14, write content/devkit/select.json (14 objects), data-knobs tags in Board, WordBorders, ScorePops, DangerCue, TurnBar, EndResults, Reveal…
- [ ] 🤖 5. Glyphtender src/devkit-game/select.test.ts (file ↔ tags agree, no unknown keys) + e2e/devkit-select.mjs (port 5448) + screenshots
- [ ] 🤖 6. Full check, code review, /save
Check: e2e:devkit-select phone + desktop screenshots (hover, pick, knobs list, recent list); devkit tests; check:full.
Ask Muzzy: (1) knob lists in content/devkit/select.json that you own, with "+ Add a knob" — OK? (recommended in chat 2026-10-14, no objection) (2) game rules left out of Select (add one with + Add a knob if you want it) — agree? (3) the outline slider + the pick are remembered per browser (not in a synced file) — fine?
Notes:

## F87 ❓ Muzzy tries Select Mode
- [ ] 🙋 1. Play with the Dev Kit open, pick things, say what's missing / wrong / hard to click

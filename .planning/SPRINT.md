# Sprint 29 — Click a thing in the game, tweak it (Dev Kit Select Mode)
Started 2026-10-14 · Milestone v0.15 · Features: F86, F88 (framework F55 + F56 built first, in framework branch dev/select-mode) · Branch: dev/select-mode
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

## F88 🔧 Select Mode on menus (added 2026-10-14 morning)
Muzzy (2026-10-14): "we chose not to make this work with menu/system items yet, right?" → "Go ahead and add those elements in. It'd be nice to be able to click on a button, or a toggle and update the settings for it."
Done when: on a menu, Select mode → click a button / switch / tab… → its shared UI style values (Color tab rows: colours + corners, outline, shadow, press feel, timings, menu sizes) + its kit sounds; a change restyles every one live; Save style writes content/ui/style.json; the menu under the top one is never picked.
- [x] 🤖 1. Framework Dev Kit 0.15.0 (F58): "style" knob kind; Color tab "UI shape & feel" section (styleValues.ts) + pick view; [inert] never picked; outlines never over the panel; phone pick waits for the tap
- [x] 🤖 2. Glyphtender: 12 kit-part objects in content/devkit/select.json (find selectors + style + sounds)
- [x] 🤖 3. e2e:devkit-select menu part (phone + desktop: pick Button → 19 style rows + 2 sounds, corners live + Undo, Settings: main menu behind it not picked, pick Tab + Toggle switch)
- [x] 🤖 4. Full check 35/35 (after fixing 3 test problems: Color wording, Dev Kit tab "in view" = pressable, Select test tries several seeds), /save
Notes:
- One look per part (the kit's rule): a button's knobs change EVERY button — the panel says "Shared — changes every button". A per-button override was not added (D98).
- At 1440 px wide the Dev Kit panel covers the right side of Settings (its switches): widen the window or close the panel to reach them. Ask Muzzy: worth a "slide the panel to the left" button?
- Fixed on the way: on a phone, the tap that picked could press the panel row that popped up under the finger (it re-picked "Word").

## F87 ❓ Muzzy tries Select Mode
- [ ] 🙋 1. Play with the Dev Kit open, pick things (game AND menus), say what's missing / wrong / hard to click

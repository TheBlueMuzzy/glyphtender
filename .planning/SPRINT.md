# Sprint 23 — Drag carry styles: see every way a dragged piece can look, live on the real board
Started 2026-10-10 · Milestone v0.11 · Features: fw F53 Carry styles → F63 in Glyphtender ∥ fw F54 Target feedback → F64 in Glyphtender → F65 ❓ pick · Branch dev/drag (from dev/story — carries v0.10; framework: dev/drag)
Muzzy will see: dragging a seed or a draft glyphling no longer leaves a solid copy in the tray (first guesses: draft = A, plan a cast = C, tray reorder = A); a wrong drop flies back home instead of vanishing; a Dev Kit "Dragging" dropdown flips every style live. **Stays the same:** rules, which drops are allowed, tap-then-tap, the nope shake, the AI's motions, online.

## fw F53 🧱 Carry styles (framework ui-kit, kit/drag/)
Done when: a game can pick, per drag type, what the carried piece looks like (solid | ghost, lift = scale + shadow), what its origin shows (solid | ghost | empty), how a valid drop ends (settle · turn solid · fly from origin) and how an invalid one returns (fly back · fade) — presets A–D; tested; ui-kit 0.5.0.
- [x] 🤖 1. Carry layer: carried solid|ghost + lift feedback (scale + shadow) — framework/ui-kit/kit/drag/
- [x] 🤖 2. Origin look solid|ghost|empty — a "dragging" state separate from "held" (tap-select); HandView place state
- [x] 🤖 3. Endings: valid drop settles / turns solid / flies from origin; invalid flies back from the pointer / fades (start rect captured on pointer-down)
- [x] 🤖 4. Presets A Pick it up · B Lift, mark home · C Aim · D Float + tests + check-ui; ui-kit 0.5.0
- [ ] 🤖 5. Dev Kit Tuning tab: a dropdown (choice) field — framework/devkit (tuningLogic.ts only knows number / on-off / text)

## F63 🎮 Carry styles in Glyphtender
Done when: draft, plan a seed, tray reorder and glyphling move each use their style from content/tuning/drag.json; no solid copy left behind (unless the style says so); wrong drops return; the Dev Kit dropdown switches them live; e2e covers each style × drag type.
- [ ] 🤖 1. Install ui-kit + devkit; replace the one fixed drag `<image>` (game/usePieceInput.ts, game/GameScreen.tsx) with the carry layer
- [ ] 🤖 2. Tray + board read "dragging" (game/SeedTray.tsx, game/Board.tsx) → origin solid / ghost / empty per style
- [ ] 🤖 3. Draft + seed drops get a short landing phase (like store.botDraft → useBotDraft); glyphling move keeps useGlide
- [ ] 🤖 4. content/tuning/drag.json — one style per drag type + timings, _labels/_sections/_help, Dev Kit dropdowns; TDD §1/§3
- [ ] 🤖 5. e2e: each style × drag type, mid-drag + after-drop shots; Area check

## fw F54 🧱 Target feedback (framework ui-kit, kit/drag/)
Done when: a game can show, per drag type, at the target: highlight (today) · ghost preview at the landing spot · insertion marker between items · make room (neighbours slide apart) · tether/aim arrow origin → pointer; magnetic snap near a valid spot; tested.
- [ ] 🤖 1. Ghost preview at the landing spot
- [ ] 🤖 2. Insertion marker between two items (a graphic, not the piece)
- [ ] 🤖 3. Make room — neighbours slide apart (FLIP)
- [ ] 🤖 4. Tether / aim arrow origin → pointer
- [ ] 🤖 5. Magnetic snap near a valid spot + tests; ui-kit 0.5.x

## F64 🎮 Target feedback in Glyphtender
Done when: board drops can show highlight | ghost preview | tether, tray reorder can show insertion marker | make room, snap strength is a knob — all switchable in the Dev Kit.
- [ ] 🤖 1. Board: highlight | ghost preview | tether per drag type (game/dropTarget.ts, Board.tsx)
- [ ] 🤖 2. Tray reorder: insertion marker | make room (SeedTray.tsx) — groundwork for card hands
- [ ] 🤖 3. Snap strength + switches in drag.json / Dev Kit
- [ ] 🤖 4. e2e + phone/desktop screenshots at every size; Full check

## F65 ❓ Pick a style per drag type
- [ ] 🙋 1. Try them on phone + desktop with the Dev Kit "Dragging" dropdowns, pick per drag type
- [ ] 🤖 2. Lock the picks in drag.json, update GDD controls section + framework design note

## Notes
- Decisions: carry styles live in **ui-kit** (looks), Table's referee stays a pure yes/no. Tray reorder is the proving ground for insertion marker / make room (card hands later).
- Ask Muzzy (before F63 task 4): defaults = my guesses (draft A · plan C · reorder A) or today's look until F65?
- Today (code map 2026-10-10): one shared drag `<image>` opacity 0.85 (GameScreen.tsx:110); origin stays solid because grab* sets `selected` (held); draft + seed drops are instant; glyphling move already glides (≈ style C); invalid drop just vanishes.

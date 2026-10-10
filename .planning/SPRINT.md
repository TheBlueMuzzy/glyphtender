# Sprint 23 — Drag carry styles: see every way a dragged piece can look, live on the real board
Started 2026-10-10 · Milestone v0.11 · Features: fw F53 Carry styles → F63 in Glyphtender ∥ fw F54 Target feedback → F64 in Glyphtender → F65 ❓ pick · Branch dev/drag (from dev/story — carries v0.10; framework: dev/drag)
Muzzy will see: dragging a seed or a draft glyphling no longer leaves a solid copy in the tray (first guesses: draft = A, plan a cast = C, tray reorder = A); a wrong drop flies back home instead of vanishing; a Dev Kit "Dragging" dropdown flips every style live. **Stays the same:** rules, which drops are allowed, tap-then-tap, the nope shake, the AI's motions, online.

## fw F53 🧱 Carry styles (framework ui-kit, kit/drag/)
Done when: a game can pick, per drag type, what the carried piece looks like (solid | ghost, lift = scale + shadow), what its origin shows (solid | ghost | empty), how a valid drop ends (settle · turn solid · fly from origin) and how an invalid one returns (fly back · fade) — presets A–D; tested; ui-kit 0.5.0.
- [x] 🤖 1. Carry layer: carried solid|ghost + lift feedback (scale + shadow) — framework/ui-kit/kit/drag/
- [x] 🤖 2. Origin look solid|ghost|empty — a "dragging" state separate from "held" (tap-select); HandView place state
- [x] 🤖 3. Endings: valid drop settles / turns solid / flies from origin; invalid flies back from the pointer / fades (start rect captured on pointer-down)
- [x] 🤖 4. Presets A Pick it up · B Lift, mark home · C Aim · D Float + tests + check-ui; ui-kit 0.5.0
- [x] 🤖 5. Dev Kit Tuning tab: a dropdown (choice) field — framework/devkit (tuningLogic.ts only knows number / on-off / text) — Dev Kit 0.10.0 `_choices` (framework e5f07a2)

## F63 🎮 Carry styles in Glyphtender
Done when: draft, plan a seed, tray reorder and glyphling move each use their style from content/tuning/drag.json; no solid copy left behind (unless the style says so); wrong drops return; the Dev Kit dropdown switches them live; e2e covers each style × drag type.
- [x] 🤖 1. Install ui-kit + devkit; replace the one fixed drag `<image>` (game/usePieceInput.ts, game/GameScreen.tsx) with the carry layer
- [x] 🤖 2. Tray + board read "dragging" (game/SeedTray.tsx, game/Board.tsx) → origin solid / ghost / empty per style
- [x] 🤖 3. Draft + seed drops get a short landing phase (like store.botDraft → useBotDraft); glyphling move keeps useGlide
- [x] 🤖 4. content/tuning/drag.json — one style per drag type + timings, _labels/_sections/_help, Dev Kit dropdowns; TDD §1/§3
- [x] 🤖 5. e2e: each style × drag type, mid-drag + after-drop shots; Area check

## fw F54 🧱 Target feedback (framework ui-kit, kit/drag/)
Done when: a game can show, per drag type, at the target: highlight (today) · ghost preview at the landing spot · insertion marker between items · make room (neighbours slide apart) · tether/aim arrow origin → pointer; magnetic snap near a valid spot; tested.
- [x] 🤖 1. Ghost preview at the landing spot
- [x] 🤖 2. Insertion marker between two items (a graphic, not the piece)
- [x] 🤖 3. Make room — neighbours slide apart (FLIP)
- [x] 🤖 4. Tether / aim arrow origin → pointer
- [x] 🤖 5. Magnetic snap near a valid spot + tests; ui-kit 0.5.x

## F64 🎮 Target feedback in Glyphtender
Done when: board drops can show highlight | ghost preview | tether, tray reorder can show insertion marker | make room, snap strength is a knob — all switchable in the Dev Kit.
- [x] 🤖 1. Board: highlight | ghost preview | tether per drag type (game/dropTarget.ts, Board.tsx)
- [x] 🤖 2. Tray reorder: insertion marker | make room (SeedTray.tsx) — groundwork for card hands
- [x] 🤖 3. Snap strength + switches in drag.json / Dev Kit
- [x] 🤖 4. e2e + phone/desktop screenshots at every size; Full check

## F65 ❓ Pick a style per drag type
- [ ] 🙋 1. Try them on phone + desktop with the Dev Kit "Dragging" dropdowns, pick per drag type
  Ask Muzzy: in play a seed drag switches to the "reorder" style while it's over another tray place (seed C → reorder A: home goes empty, carried turns solid) — keep the switch as a signal, or one look per drag?
- [ ] 🤖 2. Lock the picks in drag.json, update GDD controls section + framework design note

## Notes
- Muzzy 2026-10-10 (Dev Kit save): **draft A · seed B · reorder A · move B**; targets unchanged (highlight · tray none · snap 0.5). Then: "you forgot a rule — if the player's actions look a specific way, so too should the AI's" → the AI's / online rival's draft is carried in the draft style (useBotDraft + ui-kit 0.6.1 carrier.travel; its tray place empties in A) and every PLANNED move's glide (AI, rival, tap-tap) wears the move style (useGlide liftOnTheWay; C glides as itself); e2e: draft-travel reads drag.json's draft style, drag-styles checks a tap-planned move lifts in B. Seeds: an AI's / rival's seed tray is hidden (seeds are secret) — no home on screen to carry from, so its aim still appears on the hex, then the throw.
- fw F54 done (framework 026301a · 38f6b93 · 4b331f5, ui-kit 0.6.0): createPreview, insertionIndex + HandView insertAt/renderMarker, HandView makeRoomAt, createTether, snapTarget + carrier.move(at, snap); TargetFeel defaults; 243/243 tests, check-ui, lint clean. A 2-row tray's shared gap shows its marker at the end of row 1.
- Decisions: carry styles live in **ui-kit** (looks), Table's referee stays a pure yes/no. Tray reorder is the proving ground for insertion marker / make room (card hands later).
- Muzzy 2026-10-10: defaults = Claude's guesses until F65 — draft A · plan a seed C · tray reorder A · glyphling move C.
- Today (code map 2026-10-10): one shared drag `<image>` opacity 0.85 (GameScreen.tsx:110); origin stays solid because grab* sets `selected` (held); draft + seed drops are instant; glyphling move already glides (≈ style C); invalid drop just vanishes.
- F63 landings (Claude 2026-10-10): a legal drop plays its landing FIRST and the store changes when it resolves (usePieceInput drop → carrier.drop → commit). Chosen over "commit now + hide the arriving piece" because nothing in the store / Board / online flow had to learn about a hidden piece; online the action is sent after the landing (≤ 0.22 s later). While a drop lands, a new press is ignored (≤ 0.22 s). Online, the home stays carried until the server answers (carryState endCarry waits for store.waiting), so a draft never flashes back into the tray.
- F63 seed drags: in play a seed drag is "seed" (aiming) and turns "reorder" only while it's over ANOTHER tray place (the look follows what you're about to do); in the refresh phase it's "reorder" throughout. With the defaults (seed C, reorder A) the look flips when you hover another tray place — Muzzy may want the two the same (F65).
- F63 size: the carried piece = its home's art size (lifted by liftScale), not the old fixed max(tray, hex) × 1.2 — so a landing or C's fly ends exactly the size of the real piece.
- F63 wrong drops: after the return, the drop still does what a tap there does (as before: an illegal hex lets go of the held piece; dropping the moved glyphling on its own ghost still takes the move back — then it flies home AND glides back, a rare double motion).
- F63 e2e/drag-styles.mjs (port 5432, check:full "drag"): 64 drags × 2 sizes, 371 checks; the reorder style in the refresh phase isn't driven (only in play).
- F64 (Claude 2026-10-10): ui-kit 0.6.0 installed. drag.json `targets` { draft / seed / move: highlight (default) · ghost · tether; reorder: none (default) · marker · room } + snap 0.5 / snapRadius 0.6 / makeRoom 0.35 / roomTime 0.15 / tetherBend 0.15 / arrowSize 12 / ghostGlow 0.5 — all Dev Kit → Tuning → Dragging, live from the next drag (snap even mid-drag).
- F64 glow per look: highlight = today's glow; ghost = the see-through copy on the hex + the glow at ghostGlow (0.5 — the ring still marks the hex round the piece); tether = the aim line + the full glow (the line says where from, the glow where to).
- F64 tray rule (D86): the marker / make room show the gap moveInRack REALLY inserts into — the seed dropped on place `to` lands just right of that seed when dragged rightwards, just left when leftwards (whatever half of it the pointer is on), and only over ANOTHER seed; over an empty place (a swap) or its own place nothing shows. The kit's insertionIndex (pointer side) is not used: half the time it would show a gap the drop ignores. Groundwork for card hands: a hand that wants pointer-side insertion must change its drop rule in the same step.
- F64 snap: candidates = the referee's legal hexes (dropKind), listed once per drag; a drop while a hex pulls the piece lands on THAT hex (else the pull would lie), so near-misses just off a legal hex now count. Off the board / over the tray nothing snaps; a seed over another tray place (reorder) never snaps.
- F64 rough: the tether ends at the pointer, so its arrow head sits under the carried piece (only the line shows) — a taste call for F65 (end it at the piece's edge?). With style C (ghost carried) + ghost target the two see-through copies stack on the hex when the pointer is dead centre.
- F64 e2e/drag-targets.mjs (port 5434, check:full "drag-targets"): 390×844 · 844×390 · 1440×900 — every look per drag type, snap (strong / defaults / off), marker rightwards + leftwards, make room, none; tray height unchanged.

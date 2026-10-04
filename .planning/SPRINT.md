# Sprint 10 — The game knows its pieces and its turns by name
Started 2026-10-04 · Milestone v0.6 · Features: F33, F32 (in this order)

## F33 🧱 Zones & pieces
Done when: every seed has a stable id from setup to the end; actions, the tray and the server name seeds by id (no hand-index coupling); hidden zones (bag, rivals' hands) never send ids; old saves + snapshots still load — and check:golden + check:shots say SAME (links for Muzzy).
- [x] 🤖 1. Framework (v0.4 F15): zones + pieces in table/ (zone rules: owner, who may see inside, ordered; pieces with stable ids; take/find/hide helpers) — framework branch dev/table, Table 0.2.0
- [ ] 🤖 2. Seeds get stable ids (assigned from the unshuffled bag list after the shuffle — no new RNG calls); hands / bag / planted seeds carry them; Action.seed + refresh setAside name ids; goldenView unchanged (letters); golden replay translates recorded hand positions → ids — src/engine/{types,setup,draft,turn,refresh,rules,sim,golden,testkit}.ts
- [ ] 🤖 3. Secrets: rules.viewFor sends no ids for the bag or rivals' hands; drew/setAside events carry ids only to that seat; leak tests — src/engine/rules.ts, party/server.test.ts
- [ ] 🤖 4. Tray follows seeds by id: trayOrder of ids (gameStore, turnPlan TRAY_GAP, refreshFx.refillInPlace, SeedTray, Board, usePieceInput, devHook.findCast, onlinePlay incl. startReplay, Dev Kit glyphtenderAdapter) — fixes B018 (snapshot tray gap)
- [ ] 🤖 5. Server + old saves: party/glyphtenderRules action checks by id, turnClock; migrate.ts upgrades saved games + content/snapshots
- [ ] 🤖 6. Prove it — check:golden + check:shots SAME, npm test, build, lint, e2e:game, e2e:pass, e2e:online (one at a time); links for Muzzy
Check: both checks SAME; no id of a hidden seed in any message; B018 fixed.

## F32 🧱 Turns & flow
Done when: the turn order is one flow (Draft snake → Play clockwise, skip fully tangled, refresh step → Over); rules.toAct, "your turn", who may act and undo limits all come from it; the 8 screen copies of "whose turn" are gone — and both checks SAME.
- [ ] 🤖 7. Framework (v0.4 F14): turn flow in table/ — levels (who may act, order preset: snake · clockwise-skip, ends-when), step limits for undo; Table 0.3.0
- [ ] 🤖 8. Rules run on the flow: draft / play / refresh / over as levels; rules.toAct from the flow; golden SAME — src/engine/{draft,tangle,refresh,rules}.ts
- [ ] 🤖 9. Screen asks the flow: canPlay (gameStore), ActionBar notNow, SeedTray myTurn, nope, turnPulse, prompt, turnPlan, onlinePlay.isOthersTurn → one "may this seat act / is it my turn" answer
- [ ] 🤖 10. Undo limits from the flow: cast → move, never past the turn's start (gameStore.undo, ActionBar)
- [ ] 🤖 11. Prove it — same checks as 6; links
- [ ] 🤖 12. TDD (Decisions + engine/store sections) · framework ROADMAP F14/F15 · STATE Key facts
Check: both checks SAME; e2e green.
Ask Muzzy: —
Notes: Decided: seed ids follow the UNSHUFFLED bag list (fullBag index) so an id never hints at the draw order; hidden zones send no ids at all. Golden games keep their recorded hand positions — replay translates them to ids (no re-record). Server and site must deploy together at /deliver (a new server refuses old-style index actions).

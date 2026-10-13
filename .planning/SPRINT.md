# Sprint 27 — The first two turns teach you the game (rails), then tips as things happen
Started 2026-10-13 (overnight, auto) · Milestone v0.14 · Features: F81, F76, F77 (in this order) · Branch: dev/tutorial
Note: F76 needs F72–F74, which are built + checked but wait for Muzzy's OK (sprint 26) — built on them as working (🎛️), per auto mode.

## F81 🔧 Dev Kit Text tab
Done when: Dev Kit → Text edits every string in en.json; Save → the game shows it.
- [x] 🤖 1. framework devkit 0.13.0 Text tab (sections, search, placeholder guard, Copy for Claude, reload on Save) — framework dev/text-tab → dev/tutorial-kits
- [x] 🤖 2. install devkit 0.13.0 + plug textTab into src/devkit-game/tabs.ts
- [x] 🤖 3. screenshots at 1440×900 + 390×844 (search "tutorial locked" → 2 strings)
Check: devkit tests 348/348; e2e devkit-search.

## F76 🎮 The rails (draft + 2 turns)
Done when: the tutorial game's draft + your first 2 turns play exactly as design/tutorial.md §2, one live target at a time, Sprout scripted, then free play.
- [x] 🤖 1. engine `stack` (fixed starting hands + next draws) + rails layout found by scripts/tutorial/find-rails.mjs + proof test — src/engine/setup.ts, content/tutorial/rails.json, src/tutorial/rails.ts, rails.test.ts
- [ ] 🤖 2. rails limit: the referee allows only the current step's target (store/railsLimit.ts → referee.ts); Keep all / Refresh follow the step (ActionBar)
- [ ] 🤖 3. Sprout follows the script (localBot hook) and the game holds while a rails pause is up
- [ ] 🤖 4. the steps: callouts per §2 (draft ×2, turn 1 move / block / plant / over-own / Plant / blocks Blue / no-word pause / refresh J+V, turn 2 move / plant A / Plant +5 / +2 +1 / secret / hand-over) — src/tutorial/railsSteps.ts + TutorialLayer.tsx, words in en.json tutorial.rails
- [ ] 🤖 5. e2e/tutorial-rails.mjs plays the rails by drag/tap at 390×844 + 1440×900 and screenshots each step
Check: e2e:tutorial-rails + Area (game pass tutorial-shell).

## F77 🎮 Tips in play
Done when: after the rails, the 10 first-time tips (§3) show once each, at most 1 per turn, 3 of them pausing.
- [ ] 🤖 1. tip triggers from the rules' events / state (src/tutorial/tips.ts), seen once (kit tips memory), 1 per turn, never during an animation
- [ ] 🤖 2. the 3 pauses (you create · tangled · one to go) hold the game; "Longest counts" needs the word finder to report dropped words
- [ ] 🤖 3. tests per trigger (hand-made positions, testkit.ts)
- [ ] 🤖 4. e2e: a tip shows once and never again; Tips off → none
Check: unit tests + e2e.

Ask Muzzy: —
Notes:
- Framework: ui-kit 0.9.0 + devkit 0.13.0 live together on framework branch **dev/tutorial-kits** — install kits from THAT branch (main has neither).

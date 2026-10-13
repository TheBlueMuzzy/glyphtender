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
- [x] 🤖 2. rails limit: the referee allows only the current step's target (store/railsLimit.ts → referee.ts); Keep all / Refresh follow the step (ActionBar)
- [x] 🤖 3. Sprout follows the script (localBot hook) and the game holds while a rails pause is up
- [x] 🤖 4. the steps: callouts per §2 (draft ×2, turn 1 move / block / plant / over-own / Plant / blocks Blue / no-word pause / refresh J+V, turn 2 move / plant A / Plant +5 / +2 +1 / secret / hand-over) — src/tutorial/railsSteps.ts + TutorialLayer.tsx, words in en.json tutorial.rails
- [x] 🤖 5. e2e/tutorial-rails.mjs plays the rails by drag/tap at 390×844 + 1440×900 and screenshots each step
Check: e2e:tutorial-rails + Area (game pass tutorial-shell).

## F78 🎮 Nudges (pulled in overnight)
Done when: idle (glow 10 s → words 20 s, 3× each; later games words at 30 s) and wrong-action nudges (at once; 3× each, then the shake; every time on the rails) show on your turn; Tips off → none.
- [x] 🤖 1. ui-kit useNudge (framework dev/tutorial-kits) + install
- [x] 🤖 2. HelpLayer: idle + wrong-action nudges (nudges.ts; wrongDrop records a refused drop) — e2e:tutorial-tips
## F79 🎮 Explore mode (pulled in overnight)
Done when: ? beside ☰ in every game; taps explain instead of act (☰ too); only ? / Esc leaves; local games pause, online doesn't; ends itself when the game needs you.
- [x] 🤖 1. explain() + exploreEnds() (pure, tested) + the words (tutorial.explore, ≤ 12 words, never "gain")
- [x] 🤖 2. ? button (TurnBar), ExploreLayer (capture-phase taps → Callout + dim), the bar in the prompt's place (B013 sizer lines), local bots wait — e2e:explore (3 sizes + pass-and-play handoff)

## F77 🎮 Tips in play
Done when: after the rails, the 10 first-time tips (§3) show once each, at most 1 per turn, 3 of them pausing.
- [x] 🤖 1. tip triggers from the rules' events / state (src/tutorial/tips.ts), seen once (kit tips memory), 1 per turn, never during an animation
- [x] 🤖 2. the 3 pauses (you create · tangled · one to go) hold the game; "Longest counts" needs the word finder to report dropped words
- [x] 🤖 3. tests per trigger (hand-made positions, testkit.ts)
- [x] 🤖 4. e2e: a tip shows once and never again; Tips off → none
Check: unit tests + e2e.

Ask Muzzy (from the rails, all built with these defaults — change any):
- The "Plant +5" step's callout sits above the button, so on a phone it covers the top of the 2nd seed row (the seeds aren't needed then). OK, or another spot?
- "lines" and "block" are two Next pauses before your first move (all lines glow while they're up) — one too many?
- Wording: "Hemming glyphlings in can win games." (softened to stay true); the hand-over button says "Play".
From the tips + nudges (defaults in place — change any):
- Online, the 3 pausing tips show as normal tips (no dim, no hold) — online never pauses.
- The rails' 2 dimmed pauses (no word, hand-over) + the 3 tip pauses = 5 in the tutorial game (design said ≤ 4; maxPauses counts tip pauses only).
- Idle glow: "move" adds nothing (your glyphlings already pulse with the whose-turn pulse); in the draft the tray's next glyphling breathes; the glow keeps going while the words show.
- Wording: "Tangled! Your pieces beside it will create +{n} Magic if it stays." (the bonus is only added at the end, if still tangled) · "pale hex" (matches the prompt).
From Explore:
- "{moves} moves" = every hex it can reach (15–25 early on) — the number you want, or directions?
- ✅ Explore taps don't count as "I'm here" online (Muzzy: "it shouldn't — the bot takeover countdown should exit you from explore"); e2e:online-ai checks it.
- Phone on its side / short window: the "Tap ? to go back" reminder is skipped (it would cover the bar, which says the same).
- Tapping something under the dim explains it straight away (instead of only closing the open callout). Word outlines can't be tapped (the board ignores them) — add one?
Notes:
- F77/F78 (helper): HelpLayer (mounted in App, every game) shows tips + nudges, one callout at a time; tipsPlay.ts / nudges.ts / tipsPlace.ts (one placement rule for rails, tips, nudges). e2e browsers get no tips unless ?tips=on (baselines unchanged). My fixes: tangleNone words literally true (12-word guard caught my 14); a tip near the board's top goes below when < calloutRoom (190 px) above it before the turn bar (oneToGo covered ☰ on a phone).
- F79 (helper): one capture-phase listener in ExploreLayer catches every press while Explore is on (no changes to usePieceInput / ☰). Merge conflicts (en.json, tutorial.json, e2e lists) resolved by keeping both. Explore's tangled lines made literally true ("…if it stays").
- e2e:margins failed after F81: 9 Dev Kit tabs no longer fit on a desktop → Dev Kit panel min(540px, 50vw) (framework, reinstalled) → PASS.
- F76 (helpers): rails limit = ONE door in refereeFor (src/store/railsLimit.ts; glow/drop/shake/lift follow it; `shows` lights extra hexes for "lines"); a hold stops input + local bots; Sprout plays rails.json through localBot setBotScript at the normal pace (F50). 19 steps (railsSteps.ts). e2e:tutorial-rails (port 5445) plays them by drag/tap at 390×844 + 1440×900. A word ends your turn without a refresh, so counts/secret/hand-over show at the start of Sprout's turn 3 (held).
- My fix after the shots: a rails callout takes the prompt's place (useTutorial.calloutUp → PromptLine hidden, room kept) — no peeking prompt icon, no "Blue is thinking…" while held; tray/button callouts go above.
- F77 prep: engine droppedWords (golden SAME); tips.ts dueTip (9 tests). F79 prep: explore.ts explain (5 tests), src/store/explore.ts switch. F78 prep: ui-kit useNudge (3 tests).
- Framework: ui-kit 0.9.0 + devkit 0.13.0 live together on framework branch **dev/tutorial-kits** — install kits from THAT branch (main has neither).

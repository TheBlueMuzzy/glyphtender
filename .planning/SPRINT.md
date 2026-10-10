# Sprint 22 — The Story tells the whole game
Started 2026-10-10 · Milestone v0.10 · Features: F61 Turn-by-turn list (+ round-number fix) ∥ framework "who played" → F62 Bot band · Branch dev/story (framework: dev/story)
Muzzy will see: the Story chart's empty top-left lists what each player did in the scrubbed round ("NEST +6", "Refresh 3"…); under the key only awards; online, a darker band marks the rounds a bot played for someone. **Stays the same:** the chart itself, Results + Scorecard, the rest of the game; local AI players never get a band (always bots).

## F61 🎮 Turn-by-turn list on the Story chart
Done when: for the scrubbed round, the chart's top-left lists every player (glyphling, stacked, 2–4) with that round's play — words + Magic ("NEST +6", "NEST · TEN +9"), "Refresh 3", moved only, a tangle mark; it follows drag / tap / ← → scrubbing; below the key = the awards slot only; fits all 8 sizes; rounds are counted right with a shuffled turn order.
- [x] 🤖 1. Fix: round numbers with the shuffled turn order (src/engine/log.ts:70 assumes seat order → use the game's turn order) + log.test.ts; golden games checked
- [x] 🤖 2. The list (src/game/StoryChart.tsx / GameOver.tsx, reuse endText.ts turnCaption pieces, words in content/text/en.json, sizes in content/tuning/endscreen.json with _help/_labels/_ranges)
- [x] 🤖 3. Below the key = awards only (the "{round} · nothing marked" caption goes)
- [x] 🤖 4. All 8 sizes × 2–4 players: e2e/end-screen-shots.mjs checks + Story baselines re-recorded (only those)

## F62 🎮 Bot band on the Story chart
Done when: online, the rounds a bot played for a human (idle takeover, turn timer, left) show a thicker, darker band behind that player's line; host-added AI seats and local AI never do; works for every client at game over.
- [ ] 🤖 5. Framework first (table / rooms): each recorded move says who played it (the person, or a bot playing for them) → installed; Glyphtender's server sends it with the end-of-game log (party/) — server redeploy at /deliver
- [ ] 🤖 6. The band in StoryChart.tsx (width / darkness in endscreen.json) + a Dev Kit Screens preview "End table — online, a bot took over" (src/devkit-game/previews.tsx sample data)
- [ ] 🤖 7. Tests: who-played unit tests; online e2e — an idle takeover → the band on the Story page; check:full

- [ ] 🙋 8. Muzzy: look at the Story page after a game (and online with a takeover)

Check: check:fast after each task · check:full once at the end.
Ask Muzzy: —

## Notes
- F61 task 1 (round fix): log.ts counts a new round by PLACE in the game's turn order (state.turnOrder, default 0,1,2…), not seat number. Golden games: SAME, all 300 — they play the default order, where place = seat, so the rounds in their fingerprints don't change; no re-record. Games already saved with a shuffled order keep their old (wrong) round numbers in the log.
- F61 tasks 2–3 (the list): drawn INSIDE the chart's SVG (check:ui forbids position:absolute overlays in game CSS), top-left of the plot on a soft card (endscreen.json storyListBackdrop 0.9) drawn over everything, taps pass through. Rows in TURN ORDER (the order they played; rows never swap as the line moves); no player names (the shape + colour = the key below; names are in the screen-reader text). Before the line is touched, and at Start: no list (the hint stays under the key). Short charts (phones on their side) put 3–4 players in two columns (storyListSmallest). The slot under the key = that round's awards only; tangle / lead-change captions and turnCaption/markerCaption/tangleBonusCaption + their words are gone (the list says it now).
- F61 task 4: e2e:end now checks, at all 8 sizes x 2p/3p/4p/tie: no list before the line is touched; after a drag, the → key and a quiet round the list's title follows the line, every player in turn order, each row matches the fixture's log, the card is inside the chart and clear of the key, no row cut off, words >= 9 px; the Tangles column lists the bonuses; the slot holds awards only (empty + same size on a quiet round). Screenshots: the untouched Story baselines didn't change (list hidden until the line moves), so a NEW shot end2/end4-story-round6 (8 sizes each = 16 pictures) was added and recorded; nothing else re-recorded.

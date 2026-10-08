# Sprint 18 — Online with friends: nobody waits, everyone knows who's playing
Started 2026-10-08 · Milestone v0.8 Playing online with friends · Features: F52 (framework rooms first), F53 — parallel (different files) · Branch dev/fixes (also carries the v0.5.1 fixes: lobby AI rows, draft-glyphling shake)
Muzzy will see: online, after 30 s of doing nothing on your turn a bar drains on your screen; at 60 s a bot plays for you until you tap anything (everyone else gets the "is idle — a bot is playing" note, then "is back"); an ⓘ at the top left of every game opens its settings + rules. **Stays the same:** the rules, pass-and-play, AI play, every other screen.

## F52 🎮 Idle takeover with a warning bar (Muzzy 2026-10-08)
Done when: online, a human seat that is on the clock (its turn, or its draft placement) and does nothing for idleWarnAfterMs (30 s) gets a draining bar on its own screen; at idleTakeoverAfterMs (60 s) a bot takes the seat mid-turn and plays on; any input from that player (a tap, a key — sent as a throttled "active" ping) resets the clock and, if a bot holds the seat for idleness, gives it back at once; the turn timer (host option) running out hands over the same way; missedTurnsBeforeBot is gone; others get the botIdle / back toasts; framework rooms 0.4.0 tests + e2e:online cover it.
- [ ] 🤖 1. Framework rooms (dev/framework/rooms): "active" ping in the protocol (throttled client side, checked server side) · per-seat idle clock for the seat(s) on the clock · idle_warning to that seat at 30 s · bot takes over at 60 s · active again → seat back · turn timer → same takeover · drop missedTurns · tests · README + VERSION 0.4.0
- [ ] 🤖 2. Framework UI kit: an IdleWarning piece (draining bar + one short line, e.g. "Still there? A bot plays for you soon") and a "A bot is playing for you — tap to play" line · tests · VERSION
- [ ] 🤖 3. Install both into Glyphtender; party/turnClock.ts tells the room who is on the clock; the client sends activity pings on any input during its turn and shows the bar; content/rooms.json idleWarnAfterMs 30000 · idleTakeoverAfterMs 60000 (Dev Kit)
- [ ] 🤖 4. e2e:online — idle → bar → bot → tap → back; others' toasts + 🤖; re-test B024 (Menu → Leave)
- [ ] 🤖 5. GDD (online) + TDD decision; framework design note

## F53 🎮 Rules & settings ⓘ (Muzzy 2026-10-08)
Done when: during any game (local and online) an ⓘ sits at the top left; tapping it opens a modal with this game's settings and the How to play pages (the same words as the menu's, en.json game.rules); a tap anywhere closes it; kit parts only (game-ui); screenshots at all 7 sizes, nothing clipped or touching edges.
- [ ] 🤖 1. ⓘ button in the turn bar's top left (TurnBar.tsx) — kit Button icon
- [ ] 🤖 2. The modal: settings list (players + this game's turn order, garden, 2-letter words, hide seeds, word indicators, turn timer online) + the rules pages; tap anywhere closes
- [ ] 🤖 3. Words in en.json; e2e + screenshots at every size

Check: check:fast after each feature · check:full once at the end · then /deliver v0.5.1.
Ask Muzzy: —

## Notes
- Muzzy 2026-10-08: "if there's a timer, then it just makes sense to make a bot take over the turn after the timer runs out" · "That's also something that should be put into BMUZ" → framework rooms module (it owns seats + bots; the AI is only what plays the seat).
- B024: she used Menu → Leave on her PC (not a phone). e2e shows toast + 🤖 working — re-test after F52.

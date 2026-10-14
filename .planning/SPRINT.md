# Sprint 28 — Menus that feel like one tidy set
Started 2026-10-13 · Milestone v0.14 · Features: F82, F83, F84 (in this order) · Branch: dev/tutorial (the tutorial waits, built, not delivered)
Muzzy (2026-10-13): "The settings menu feels haphazard… Gameplay first… Version and Credit can go under Gameplay and we can drop the about menu. Accessibility could be a section under Display… Display, actually, is only one setting. that should go under Gameplay as well… Start button under new Game should be up next to Main Menu… < = back… remove all scroll bars and replace them with the correct scroll function we made… the menus and sub menus (including credit) should be the same width/height with internal scroller." Size: "full width, but only go a large height as needed. if reached max, then internal scroller" — Main menu + Pause too.

## F82 🧱 One menu frame (framework ui-kit first, then install)
Done when: every kit menu card is ONE width; its height fits its content up to a max, then its body scrolls inside (no scroll bar: drag / wheel / keys, a fade where there's more); one header = ‹ back (left) · title · optional action (right).
- [x] 🤖 1. kit: menu header (‹ back icon button, title, action slot; Esc / phone Back unchanged)
- [x] 🤖 2. kit: one menu width + max height (content-sized below it) for Menu / Modal / Wide / Tall panels
- [x] 🤖 3. kit: ScrollArea without a native bar + a "more" fade (the end screen's data-more fade moves into the kit); one scroller per card (B027: swipes must work on a phone)
- [x] 🤖 4. kit checks (tests, check-ui, the game's lint on the kit files) → install into the game
Check: kit tests + check-ui; e2e:previews short-screen guard.

## F83 🎮 Settings: 2 tabs, Gameplay · Audio
Done when: Settings has tabs Gameplay · Audio (real tabs at every size); Gameplay = sections Play · Display · Accessibility · About (Version, Credits); Credits opens in the same frame with ‹ back.
- [x] 🤖 1. kit Settings: section headings inside a tab (schema)
- [x] 🤖 2. content/ui/settings.json: the new tabs + sections + order
- [x] 🤖 3. Reset tips / Replay tutorial game ask "Are you sure?" first (UI standards: a row that undoes progress confirms)
- [x] 🤖 4. update GDD/TDD (menu layout; D: Muzzy's fixed frame + inner scroller replaces end-screen.md's "only the page scrolls")
Check: e2e:menu + e2e:previews.

## F84 🎮 Every menu screen uses the frame
Done when: New Game (‹ back, Start top right), Credits, How to play / Rules, Mode select, Lobby screens, Submit word, Pause, Main menu all use the one width + header; no native scroll bar on any player-facing screen at the 7 sizes.
- [x] 🤖 1. New Game: ‹ back + Start in the header, options scroll inside (Start still disabled with its reason when no person seat)
- [x] 🤖 2. the other screens
- [x] 🤖 3. e2e: a sweep that fails on a native scroll bar + a real finger swipe on every scrolling card (phone)
- [x] 🤖 4. screenshots at 390×844, 360×780, 844×390, 768×343, 1100 wide, 1440×900, 1920×1080 → re-record the shots baseline (meant change)
Check: check:full.

## Carried over: F80 🙋 Muzzy plays the tutorial (sprint 27)
- [ ] 🙋 looping videos for the 3 "How to play" overview cards · play it many times + others · phone test · reword in Dev Kit → Text
- [ ] 🤖 nudges bigger / easier to see — after Muzzy picks a look · a "suggested word" nudge — after Muzzy picks the form

Notes:
- Framework: ui-kit 0.10.0 → 0.10.2 on framework branch **dev/menu-frame** (off dev/tutorial-kits) — install kits from THAT branch until /deliver merges it. 0.10.1: Modal onBack (Submit word's ‹). 0.10.2: short Play online kept Join in view.
- Kit calls (helper): one width 36rem (--kit-menu-w), max 44rem / 52rem desktop; the yes/no question (Confirm) and the pass-the-device box stay narrower (kit-ask); Lobby room keeps "Leave" (it disconnects — not a ‹); Pause keeps "Back to the garden"; Settings' tab pages share one spot so switching tabs never resizes the card; a menu card opens centred then only grows down (Screen grow="down").
- Replay tutorial game already asks first when a game is running (no game → nothing lost), so only Reset tips got the new "Are you sure?".
- e2e: headless Chrome never draws scroll bars, so the shots sweep checks styles (a scrolling box must have scrollbar-width: none). Stale tests fixed: previews, new-game (rewritten for the card's own scroller, swipe kept), menu, ai, fullscreen, submit-word, end.
- Ask Muzzy: main menu buttons are now the full card width on desktop (576 px) — OK, or narrower? · on a 360-wide phone "New game" wraps to 2 lines beside ‹ and Start.

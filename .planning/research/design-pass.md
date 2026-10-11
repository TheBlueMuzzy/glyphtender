# Design pass (F67, sprint 24, 2026-10-11)

Reviewed: every screen in check:shots (shots-now/, 26 screens × 8 sizes) + the AI / sequence / online4 shots, by two
review helpers against the design rules (breathing room, nothing clipped or overlapping, readable, consistent, space
used sensibly). The worst ones were checked by eye (Claude). Verdict: desktop and upright phone are clean; **sideways
phones and short windows break** — that's where the fixes go.

## Fix now (sprint 24)
| # | Where | What | Sev | Owner |
|---|---|---|---|---|
| 1 | game @768×343, @844×390 (beside the board) | Prompt heading runs into the turn portrait and ☰ ("Happy? Cast it —" under ☰; "No Magic this turn —" across both) — **B019** | High | game layout |
| 2 | pause @768×343 (@844×390 touching) | "Leave game" hangs outside the Pause card, cut off by the screen edge | High | ui-kit card |
| 3 | online @844×390 | "or join a friend's room" cut in half; the code boxes + Join out of sight | High | ui-kit card |
| 4 | lobby @844×390 (4 seats) | Seat list ~1.5 rows tall, the rest below a scroll with no hint — **B017** | High | ui-kit card / Lobby |
| 5 | settings @844×390 | The 6 tabs wrap onto 2 lines and eat the card: < 2 setting rows show | Med-High | ui-kit Tabs → picker when short |
| 6 | end4-reveal @390×844 | 4-player reveal board ~170 px wide, letters ~8 px, empty space below | Med-High | game layout |
| 7 | end results (all sizes) | Stat lines break inside a pair ("· Tangles 3" on its own line) | Medium | game CSS (keep each pair together) |
| 8 | screens over the main menu @844×390 | The menu behind isn't dimmed on New Game / Settings / Online (Credits is) | Medium | ui-kit dim |

## Left as is (decided before — not changes)
- The prompt's own glyphling beside the words + the turn portrait in the corner (Don't re-break: "the prompt always has the glyphling of whoever it's for beside it").
- The board moves once, draft → first turn (B013 note).

## Logged for Muzzy (taste — next design sprint, not tonight)
- Back / Leave buttons sit in different places and styles per screen (top-right outlined, bottom-right, bottom-left plain text).
- Off switch (bright beige) reads "more on" than the on switch (dark green) — a Cozy style colour call.
- "Shuffle" is plain text beside boxed Undo / Cast (kit "quiet" button) — intended?
- New Game AI rows (AI Type / Skill) aren't grouped under their player.
- Lobby: the "you" ring pushes your avatar 4 px out of line; "Host" badge sits after the name, others' status on the right.
- Highlights carousel on phones: the description squeezed to ~140 px between the arrows and avatars.
- Story chart sideways is ~100 px tall; the start marker hides the "0"; tied end markers hide each other; the round tooltip is ~11 px on phones.
- ☰ is boxed in game, bare on the end bar · the Highlights band is wider than the page above it · the pass card sits bottom-right on desktop.
- Settings @1440: the list stops on a half-cut row with room to spare (and Credits / lobby timer text cut mid-line on phones) — let cards grow before scrolling (part of #2–#5's kit work if it falls out naturally).

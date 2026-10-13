# Tutorial — the first game teaches itself
> Defined 2026-10-12 (/define). Research: `research/tutorial.md` (references, standards) · `research/tutorial-teach-list.md` (what to teach, in what order). GDD §5 links here.
> **Muzzy's rule:** "you only show what they need in the moment they need it." A very short overview, a few turns on rails, then real play where help only shows up when it matters.
> Every number below lives in `content/tuning/tutorial.json` (Dev Kit → Tuning → Tutorial — incl. every nudge delay and glow). Every line of text lives in `content/text/en.json → tutorial`, editable in the Dev Kit **Text** tab (F81). The text here is the first draft — change it freely.
> **Wording rules:** Magic is **made / created**, never "gained" (Muzzy 2026-10-13). Every sentence here must be literally true — say "tries to", "usually", "if it can" where the game can't promise it.

## The words we use
- **Callout** — a rounded rectangle of text with a pointer aimed at the thing to look at (Muzzy's look). Never covers its target. One idea, ≤ 12 words, verb first, "you".
- **Rails** — the scripted opening: one live target, everything else dimmed, can't go wrong.
- **Tip** — a callout that shows **once**, the first time something happens. Usually doesn't stop play.
- **Pause** — a rare tip that dims the game and waits for "Got it" (≤ 4 in the whole tutorial game).
- **Nudge** — a callout after X seconds of doing nothing, or straight after a wrong action. Says what you *can* do.
- **Explore** — the **?** button: tap anything and read what it is, instead of using it. Only ? leaves it.
- **Plant** — replaces "cast" in every player-facing word (button: **Plant · +5**).

## 0. Before the tutorial: who gets it
1. A **brand-new player** opens the game → the menu shows **Play**. Online, New Game and pass-and-play are greyed out with a small lock.
2. Tapping a locked item → nudge: *"Finish your first game to unlock this."*
3. **Players who already played** (any finished or saved game on this device) count as done. Nothing locks for Muzzy's friends.
4. **Play** → the overview cards → the tutorial game. Only one game runs at a time.
5. **Leaving:** Pause → **Leave tutorial** → *"Leave the tutorial game? Everything unlocks. You can replay it from Settings."* → Leave / Keep playing.
6. **Finishing** (win or lose) → the normal end screen, plus a toast: *"Everything's unlocked!"*
7. **Settings:** **Tips** on/off (on by default; turns off tips and nudges, not Explore) · **Replay tutorial game** · **Reset tips**.

## 1. The overview (3 cards, under 30 s, swipe or Next)
1. **"Move a glyphling, then plant a seed."** (glyphling hops, seed flies)
2. **"Spell words to make Magic. Most Magic wins."**
3. **"The game ends when any 2 glyphlings are tangled — they can't move."**
→ **"Let's play!"** (Skip on every card goes straight to the draft.)

## 2. The rails (draft + your first 2 turns)
You're Yellow, the tutorial AI is Blue, and you go first. The board, Blue's moves and the bag order are fixed (a found layout — /develop finds one with a script so every step below really works on the Small garden).

**Draft** (snake 1-2-2-1)
1. Callout on your tray glyphling: **"Drag your glyphling to the glowing hex."** One hex glows.
2. Blue places 2 (they travel like any AI draft).
3. **"Now your second one."** Another single hex glows.

**Turn 1 — move, plant, refresh**
4. Callout on your glyphling: **"Glyphlings move in straight lines."** All its legal hexes light up, but one direction stops short at Blue's glyphling.
5. Callout at the stop: **"Pieces block the way."** Then one hex pulses: **"Drag it here."**
6. It lands. Callout on one tray seed (the rest dimmed): **"Now plant a seed from where it landed."**
7. One plant hex glows. The line to it passes over your *other* glyphling. Callout: **"Seeds fly over your own pieces — not other players'."**
8. The seed sits planned. Callout on the button: **"Happy? Tap Plant."**
9. It grows. The seed now blocks one of Blue's paths. Callout: **"Your seed blocks Blue. Hemming glyphlings in wins games."**
10. No word was made. **Pause:** *"No word, no Magic. You can swap seeds you don't want."* → Got it.
11. Two awkward seeds (say J and V) glow. **"Tap J and V, then Refresh."** They shrink, and new ones grow in. One of them is the A you'll need next turn.

**Blue's turn 1 (scripted):** Blue moves and plants a **T** two hexes from your C, in line, with a gap between them.

**Turn 2 — your first word**
12. One move hex glows (you can now reach the gap). **"Move here."**
13. The gap glows, and the A is lit. **"Plant the A between C and T."**
14. The button reads **Plant · +5**. Callout: **"The button shows your Magic first."**
15. Tap Plant → the score pops play: C +2 · A +2 · T +1. Callout: **"Your seeds count +2. Others' count +1."**
16. Callout on the total: **"Magic is secret — only you saw that."**
17. **Pause — hand over:** *"You're on your own now! Tap **?** any time to learn about anything."* → Play.

What the rails taught: draft · move · blocking · plant from the landing spot · flying over your own pieces · Plant commits · area control · refresh · words · ownership +2 · growing someone else's letters · the Plant preview · secret Magic. That's 12 of the 14 must-knows. The overview covers the goal and how the game ends.

## 3. Free play — tips (once each, the first time it happens)
From turn 3 on, Blue is the **tutorial AI** (§5). Tips carry on in later games until each one has been seen (Tips on).
| Tip | Trigger (an engine event or state) | Callout (points at) | Pause? |
|---|---|---|---|
| Your danger | your glyphling starts your turn with 1 move | "Only 1 move left! Move it out, or let it get tangled." (glyphling) | no |
| Their danger | a rival glyphling has 1 move on your turn | "Blue's glyphling has 1 move left. Block it to tangle it." (that glyphling) | no |
| First tangle — you create | a rival glyphling is tangled with your pieces next to it | "Each of your pieces next to a tangled rival creates +3 Magic: +6!" (your pieces pulse) | **yes** |
| First tangle — none of yours | a glyphling is tangled with none of your pieces next to it | "Tangled! Your pieces next to a tangled rival create +3 Magic each." | **yes** |
| One to go | your turn with exactly 1 tangle on the board | "One more tangle ends the game. Ahead? You can end it yourself." | **yes** |
| Two words | your plant makes 2+ words | "One seed, 2 words! Each one makes Magic." (spotlight) | no |
| Longest counts | a shorter word on the same line was dropped | "Only your longest word on a line counts." (the word) | no |
| Swap again | a no-word turn after the rails | "No word — you can swap seeds again." (Refresh) | no |
| Can't plant | you can move but can't plant | "No seed fits — just move this turn." | no |
| The reveal | the Magic reveal starts | "Here's everyone's secret Magic!" | no |
Rules: at most **1 tip per turn** (the rest wait for a later turn) · a tip never shows during an animation · a tip goes away when you do what it says, when you tap it, or after `tipSeconds` (8) · pauses ≤ 4 in the tutorial game.

## 4. Nudges — the gentle "here's what you can do"
**Idle nudges** — the timer runs only on your turn, with nothing animating and no callout up.
| Where you are | at `idleGlow` (10 s) | at `idleText` (20 s) |
|---|---|---|
| Draft | lit hexes pulse | "Drag a glyphling onto a glowing hex." |
| Turn, nothing moved | your glyphlings pulse | "Drag one of your glyphlings to a new spot." |
| Moved, no seed planned | the tray glows | "Drag a seed onto a glowing hex." |
| Seed planned, not planted | Plant pulses | "Happy? Tap Plant — or Undo." |
| Refresh choice open | Refresh + Keep all pulse | "Tap seeds to swap, then Refresh — or Keep all." |
Each idle nudge shows ≤ `idleRepeat` (3) times per game, then it stops. **Later games** (Tips on): only the text step, at `laterIdleText` (30 s) — never the glow.

**Wrong-action nudges** — straight away. On the rails: every time. After the rails: ≤ `wrongRepeat` (3) per kind per game, then just the "no" shake.
| Wrong action | Callout |
|---|---|
| Grab a seed before moving | "Move a glyphling first — then plant from where it lands." |
| Drop a glyphling where it can't go | "Glyphlings move in straight lines and can't pass through pieces." |
| Drop a seed where it can't reach | "Seeds fly straight from your glyphling — not over others' pieces." |
| Grab a rival's glyphling | "That's Blue's. Yours are yellow." |
| Tap Plant with nothing planned | "Drag a seed onto a glowing hex first." |
| Tap a locked menu item | "Finish your first game to unlock this." |
| On the rails: anything but the live target | the same callout as the current step, again |

## 5. The tutorial AI
- **Hidden personality** (name: "Sprout", stand-in — Muzzy may rename), never offered in New Game or online.
- **On the rails:** plays the fixed draft and a fixed turn 1.
- **After the rails:** Apprentice skill and the **smallest vocabulary** (common short words). It isn't greedy: it spells some, blocks a little, and wanders.
- **It tries to get ONE glyphling tangled:** from mid-game (`selfTangleBy` turn 6) it prefers moves that walk one glyphling into a pocket — next to your pieces when it can, so you see the "you create" pause. If the board never offers a pocket, it doesn't happen.
- **It tries not to make the second tangle.** It prefers moves that keep its other glyphling free, so ending the game is usually *your* call (the "One to go" tip).
- **It always plays a legal turn.** These are preferences, not rules: if every move it has tangles itself (say you walled its glyphling in), it takes one and the game ends as normal. It never waits, skips or stalls. After `maxTurns` (20 each) it drops the preferences and plays like any Apprentice.
- Beatable, but you can lose. Target length: one game in about 10–12 minutes.

## 6. Explore mode — the ? button (must, every game)
- A **?** beside ☰ in every game (tutorial, vs AI, pass-and-play, online).
- **Tap ? → Explore.** A bar reads **"Explore — tap anything. Tap ? to go back."** and the ? stays lit.
  - vs AI / pass-and-play: the game pauses (the AI waits, every timer stops).
  - Online: the game does NOT pause (others keep playing; the room's turn timer and idle timer keep running).
- **In Explore, nothing you tap does its normal job — it explains itself instead.** The tapped thing lights up, the rest dims, and a callout says what it is. Tapping ☰ says "Menu — settings, rules and leaving the game" and does NOT open it. Tapping Plant does not plant.
- **Tap empty space** → the callout closes; you're still in Explore. **Only ? leaves Explore** (Esc does the same on a keyboard).
- **Reminder:** entering Explore shows a small callout at the ? — "Tap ? to go back to the game" — and again after `exploreRemind` (15 s) without a tap.
- **Yours vs theirs:** the words change with whose it is — "Your glyphling · 3 moves. Drag it to move." vs "Blue's glyphling · 2 moves. Block it to tangle it." Same for seeds ("Your seed — counts +2 in your words" vs "Blue's seed — +2 in Blue's words, +1 in yours").
- **Things it explains:** glyphlings (yours · a rival's · tangled · 1 move left) · seeds (yours · a rival's · planned) · a glowing hex (move / plant option) · the ghost · a word outline · tray seeds · Plant (with its preview) · Undo · Refresh / Keep all · the turn bar · ☰ · ? itself · an empty hex.
- **Explore ends by itself** when the game needs you — it closes and the game carries on:
  - online: the idle warning appears ("Still there?") · a bot starts playing for you · you're disconnected / reconnecting · the host ends the game or goes back to the lobby
  - any game: the game ends (the reveal starts) · pass-and-play: the handoff screen comes up for the next player
- **While in Explore:** no tips and no nudges. A tutorial pause that comes due waits until you leave Explore. If the thing a callout points at moves or disappears (online), the callout closes.

## 7. What's tuneable (content/tuning/tutorial.json)
`overviewCards` · `tipSeconds` 8 · `tipsPerTurn` 1 · `maxPauses` 4 · `idleGlow` 10 · `idleText` 20 · `idleRepeat` 3 · `laterIdleText` 30 · `wrongRepeat` 3 · `exploreRemind` 15 · `selfTangleBy` 6 · `maxTurns` 20 · `dimAmount` (rails / Explore) · the rails layout (content/tutorial/rails.json — the board, the draft hexes, the bag order, Blue's turn 1).

## Muzzy's answers (2026-10-13)
- Explore is a **must** — "it's useful… there's not that much to tap on after all."
- No rules button in Explore: ☰ keeps settings + rules; in Explore, ☰ only explains itself. Only ? leaves Explore.
- **Sprout** — "adorable and perfect."

# Tutorial — the first game teaches itself
> Defined 2026-10-12 (/define). Research: `research/tutorial.md` (references, standards) · `research/tutorial-teach-list.md` (what to teach, in what order). GDD §5 links here.
> **Muzzy's rule:** "you only show what they need in the moment they need it." A very short overview, a few turns on rails, then real play where help only shows up when it matters.
> Every number below lives in `content/tuning/tutorial.json` (Dev Kit → Tuning → Tutorial). Every line of text lives in `content/text/en.json → tutorial`. The text here is the first draft — change it freely.

## The words we use
- **Callout** — a rounded rectangle of text with a pointer aimed at the thing to look at (Muzzy's look). Never covers its target. One idea, ≤ 12 words, verb first, "you".
- **Rails** — the scripted opening: one live target, everything else dimmed, can't go wrong.
- **Tip** — a callout that shows **once**, the first time something happens. Usually doesn't stop play.
- **Pause** — a rare tip that dims the game and waits for "Got it" (≤ 4 in the whole tutorial game).
- **Nudge** — a callout after X seconds of doing nothing, or straight after a wrong action. Says what you *can* do.
- **Explore** — the **?** button: pause, tap anything, read what it is.
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
| First tangle — you gain | a rival glyphling is tangled with your pieces next to it | "You gain +3 Magic for each of your pieces next to it: +6!" (pieces pulse) | **yes** |
| First tangle — no gain | a glyphling is tangled with none of your pieces next to it | "Tangled! Your pieces next to a tangled rival gain you Magic." | **yes** |
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
- **It gets ONE glyphling tangled:** by mid-game (`selfTangleBy` turn 6) it walks one glyphling into a pocket — next to your pieces when it can, so you get the "you gain" pause.
- **It never makes the second tangle itself.** It keeps its other glyphling free, so ending the game is always *your* call (the "One to go" tip). A `maxTurns` safety (20 each): after that it plays normally.
- Beatable, but you can lose. Target length: one game in about 10–12 minutes.

## 6. Explore mode — the ? button
- A **?** next to ☰ in every game (not just the tutorial).
- Tap ? → the game pauses (vs AI / pass-and-play; online it doesn't pause, and your turn timer keeps running). The board dims a little and a bar reads **"Explore — tap anything."**
- Tap a thing → it lights up (everything else dimmer) and a callout explains it. Tap another thing → that one. Tap empty space → the callout closes. Tap ? again → back to the game.
- **Things it explains:** your glyphling ("3 moves left") · a rival's glyphling · a tangled glyphling (who gained what) · a planted seed (whose; counts +2 for them) · a glowing hex (move / plant option) · a tray seed · the Plant button (its preview) · Refresh / Keep all · Undo · a ghost · a word outline · the turn bar · ☰ · the ? itself.
- The bar also has **Rules** → the How to play pages (rewritten with "plant").

## 7. What's tuneable (content/tuning/tutorial.json)
`overviewCards` · `tipSeconds` 8 · `tipsPerTurn` 1 · `maxPauses` 4 · `idleGlow` 10 · `idleText` 20 · `idleRepeat` 3 · `laterIdleText` 30 · `wrongRepeat` 3 · `selfTangleBy` 6 · `maxTurns` 20 · `dimAmount` (rails / Explore) · the rails layout (content/tutorial/rails.json — the board, the draft hexes, the bag order, Blue's turn 1).

## Ask Muzzy
- Explore mode: must for 1.0, or a should? It's planned as should, because you said "options, not all necessary".
- The 2026-10-08 idea "ⓘ rules & settings button": fold it into Explore's **Rules** (this game's settings + the rules)? Planned: yes.
- Tutorial AI name ("Sprout"?).

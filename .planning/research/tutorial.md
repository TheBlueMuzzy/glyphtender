# Tutorial — discover research (2026-10-12)
> 1.0 must: "tutorial (progressive, first game)" (GDD §7). Diverge stage: directions, not a decision.
> Tags: **[src]** = found in a source this session · **[mem]** = Claude's own knowledge of the game, not re-checked today.

## 1. What the original meant
- The Unity original never built a tutorial. Its plan was always **"progressive disclosure"**:
  - `glyphtender-original/HANDOFF.md` §7 Phase 3 "UX & Onboarding": *"Progressive disclosure tutorial — NOT DONE (depends on AI feeling right)"*; it moves to Phase 6 Polish.
  - HANDOFF.md §8.3 "Tutorial Dependency": *"Progressive disclosure tutorial should NOT be built until AI plays correctly and multiplayer works. Teaching rules when systems aren't complete creates confusion."* → That condition is now met (AI F50, online live in v0.9.3).
  - HANDOFF.md §9.1 design principle #1: *"Area control first, spelling second — This is the game's identity."* A tutorial that teaches only spelling teaches the wrong game.
- No other mention in the original's transcripts, CLAUDE.md or README (searched: tutorial, onboarding, progressive, hint, teach, first game).
- In the remake:
  - `research/original-digest.md`: "Tutorial: none (planned progressive disclosure)."
  - `STATE.md` (Muzzy, 2026-10-12): *"tutorial = the last big sprint; then an art pass."* Earlier (2026-09-30): "tutorial not yet".
  - `research/wordplay.md` §Onboarding: Word Play's **Easy mode is the tutorial**, and its tips appear **when the player makes a mistake** ("tips triggered by mistakes, never penalties"). Idea #6 there: a two-beat score pop (letters, then +1 per own seed) "teaches the scoring rule without text".
  - GDD Should: **hint ("show me a move" — the AI at Archmage)** — a natural partner to any tutorial.
  - Already teaching without words: legal-move glows, the "No" shake, the word spotlight, score pops (+1 / +2 per seed), turn trails, undo-until-Cast.
- Reading of "progressive, first game": teach a little at a time, **inside the first real game**, not a lecture before it.

## 2. How others teach
| Game | How it teaches | Lesson for us |
|---|---|---|
| **Hive** (official app) | Video by the designer + illustrated rulebook + undo "to learn without pressure" [src]. Third-party *Hive with AI*: explains **why an illegal move is illegal**, plus a hint that shows the AI's move [src]. Old Steam Hive had no tutorial; a reviewer "learned by trial and error" on rules "easy to overlook" [src] | Explaining a refused move costs little and works well. Our "No" shake could say *why*. |
| **Santorini** (Roxley app) | Video tutorials, plus a video for every god power [src]. Board highlights carry the rest [mem] | Video is cheap if the board already shows what's legal. Weak for "why would I do that". |
| **Wingspan** (digital) | Optional interactive tutorial: each part on its own, **then a sample game** [src]. Only legal moves allowed, "most learning happens during play" [src]. One player was still "remarkably frustrated… mechanics kept slipping away" [src] | Pieces-then-whole works, but the tutorial can't carry everything. Help must still be there in game 2. |
| **Ticket to Ride** (app) | A guided game vs the AI with a random setup each time, **not forced on first launch**; videos + text in older versions; "ready to play in ~5 min" [src] | A guided real game is the board-game-app standard. Keep it optional and replayable. |
| **Carcassonne** (Tiles & Tactics) | Short interactive steps, one scoring feature at a time (roads → cities → monasteries → farmers) [mem] | One scoring rule per step suits our scoring layers (letters → +1 own → tangle bonus). |
| **Root** (digital) | A guided tutorial per faction, "decent", but you still need a few games [src]. Instant setup and pause-anytime help [src] | Even a great tutorial only gets you started. Plan for games 2–3. |
| **Patchwork / Onitama** (Asmodee) | "Easy interactive tutorial", "quick tutorial from the outset" [src]. Short scripted turns [mem] | Small abstract games get a 2–3 minute tutorial, not 15 minutes. |
| **Scrabble GO / Words With Friends** | Mostly a help centre and feature pop-ups. A WWF review: no real game tutorial, so you "play solo to learn" [src] | Word games assume you know the genre. **We can't**: our twist (place, ownership, tangles) is exactly what word players *don't* know. |
| **Word Play** | Easy mode = the tutorial. A tip appears **at the moment of a mistake** [src, wordplay.md] | Just-in-time beats up-front. |
| **Into the Breach** | A short, skippable first mission with tips; everything else via hover info; enemies show their next move, so the board explains itself [mem; telegraphing src] | Make the board readable and you need far less text. |
| **Slay the Spire** | No tutorial. Keyword tooltips on every card; early runs teach "naturally" [src] | Works when failing is cheap and fast. A 20-minute 2-player game isn't. |
| **Monument Valley** | No onboarding. Opens straight on a tiny puzzle that holds the core mechanic, with a few gesture hints [src] | A first screen can *be* the lesson: one glyphling, one seed, one obvious word. |
| **Baba Is You** | One new idea per batch of levels; tricky rules **isolated in a level where that's the only thing to do** [src]. Complaint: rules dropped in "without groundwork" [src] | One rule per puzzle, and never test a rule you haven't shown. |

### What the writeups say
- **Andersen et al., CHI 2012** (45,000 players, 3 games) [src]: tutorials helped **only the most complex game** (up to +29% play time). For games you can learn by trying, they "may not be justified". **Just-in-time instructions can improve engagement.** Letting players roam freely during the tutorial changed nothing. On-demand help gave mixed results. → Glyphtender is mid-complexity: moving is easy to discover by trying; *why to place where* is not.
- **Game Developer, "Different types of tutorials"** [src]: instructions · examples · a designed experience (Mario 1-1) · event-triggered (Braid shows rewind after your first death) · up-front. No one type always wins.
- **Digital rulebook study (Grumbach)** [src]: teach in **small chunks while playing**. **Senet student project** [src]: testers didn't read the text tutorial, or forgot it, so the team switched to visuals.
- **Japanese mobile dev (Automaton)** [src]: when players drop out, *more* explanation didn't help, because they barely read it.

### What players complain about
**Can't skip it** · **walls of text** · **too long / glacial** ("a lecture, not an invitation") · **hand-holding that blocks trying things** · **can't replay it later** · condescending tone · taught once, forgotten by game 2 (Wingspan, Root) [src: Wayline, NeoGAF, EA forums, Steam].

## 3. Hardest rules to teach (ranked, hardest first)
1. **Secret Magic + "the game ends at 2 tangles"**: your *total* stays hidden, so new players don't know they're ahead, or that ending it is a move. This one is about strategy, not just following the rule.
2. **Tangle bonus** (+3 per adjacent piece, to *others*): it pays the rivals, not the tangler, and self-tangling beside your own seeds gives them nothing. It's backwards from what people expect.
3. **Cast from the landing spot**: the move *is* the aim. Players think "move, then put a letter anywhere" (Scrabble habit).
4. **Ownership +1**: easy to state, hard to *value* ("a short word of mine beats a long shared one"). Score pops already show it; players need it pointed out once.
5. **Hidden-inside words don't count** (GARDENING, not DEN): rarely matters, so teach it only when it happens.
6. **Refresh only when you made no Magic**: players hunt for a refresh button that isn't there. Teach it the first time they score nothing.
- Also easy to miss: casts fly over *your* pieces but not others' · words read top→bottom / left→right · a hemmed-in glyphling is freed if the blocker leaves.
- Easy (the glows already teach them): moving along leylines, can't pass through pieces, the draft.

## 4. Directions
**What we already have:** an AI with difficulty levels, a seeded bag (so the deal can be planned), saved-game fixtures (a board can be loaded mid-game), engine events (word made, tangled, refresh…), and UI-kit toasts / tooltips / dialogs.

### A — Garden lessons (scripted mini-puzzles)
- **The player:** 6–8 tiny boards, one rule each, Baba/Monument Valley style. "Move here so your seed can reach the gap." "Make a word with two of your own seeds." "Tangle Blue next to your seeds." "You're ahead, so end it." Each one is solved in 1–3 turns.
- **Pillars:** the best fit for *cozy cleverness*. Each puzzle has an "aha", and it teaches the *why* (two-birds casts, tangle placement), not just the rules.
- **Size: M–L.** A lesson runner (preset board + hand, a goal check, retry), plus a lot of hand-made content (boards in `content/`). Every rule change means re-checking the lessons.
- **Risks:** takes longest to make. Feels like homework if there are too many. Secret Magic is hard to show on a static board. Gets players to *start* playing, but doesn't stay with them.

### B — Guided first game (a gentle AI + coach bubbles)
- **The player:** a real 2-player Small game vs a friendly Sprout-level AI. A stacked opening deal makes a word easy on turn 1. The engine's events trigger one-time coach bubbles: first move → "your seed flies from where you land"; first word → "+1 for each of your seeds"; first no-Magic turn → refresh; first glyphling with 1 move left → danger; first tangle → the bonus; near the end → "Magic is secret… you could end it now".
- **Pillars:** literally "progressive, first game". *Fellowship* (it's a real game), *secret-Magic tension* (felt in the moment, not explained), and the AI can be tuned to set up a tangle.
- **Size: M.** A coach layer (event → message, shown once) + a tutorial seat preset + a seeded deal. Mostly reuse.
- **Risks:** the AI can't be fully scripted, so some lessons may never trigger (needs a fallback, e.g. the AI walks into a tangle on purpose). The game is long (~15 min), so it needs pause/quit. The bubbles must never cover the board.

### C — Quiet help woven into normal play + a "How to play" page
- **The player:** no tutorial mode at all. Every game (until turned off) has mistake-triggered tips (Word Play): the "No" shake says *why* ("Blue's seed is in the way"), a tap-and-hold explains any piece, and a first-time tip appears for each event. Pause → **How to play**: one short page per rule, each with a looping animation (no walls of text). Optional: the "show me a move" hint (the AI at Archmage).
- **Pillars:** *Always readable* and *try freely*. No homework. Also covers game 2 and later, and online players who never took a tutorial.
- **Size: S–M.** Mostly UI-kit pages + event tips. The animations are the expensive part.
- **Risks:** nothing teaches *strategy* (the tangle bonus and self-tangle won't be discovered). Tips in pass-and-play show to everyone. Easy to end up with too little.

### D — Hybrid: "First game" = 3 quick lessons → guided game → help that stays
- **The player:** New player → a 2-minute opener of 3 micro-lessons (move + cast · make a word, ownership · tangle + bonus). It flows straight into B's guided game with the coach. C's tips and How to play stay in every game afterwards. How to play replays the lessons.
- **Pillars:** covers rules (A), feel (B) and memory (C). Matches Wingspan and Root, the best-reviewed digital adaptations.
- **Size: L** (the sum of the parts, though they share the coach layer and the content format). Could ship as C → B → A in sprints.
- **Risks:** the biggest scope for "the last big sprint". The handover from lessons to game must feel like one thing. More text to localise.

### Every direction needs
- Skippable at every step.
- Replayable from the menu.
- Offered on first launch, never forced (Ticket to Ride).
- Max ~1 line of text per bubble; the board animates the point.
- Cozy wording ("tangled").
- Rule text lives in `content/text/`.
- Never cover the board or the tray.
- Pass-and-play: tips address "Yellow" by colour, not "you".

**Claude leans toward B + a slice of C** (coach bubbles in a real game vs the AI, plus "why" on the No shake and a How to play page). The AI and engine events are already built, and only a real game can teach secret Magic and when to end it. A's puzzles become the How to play page later, if needed.

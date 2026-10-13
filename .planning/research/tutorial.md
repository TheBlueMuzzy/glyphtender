# Tutorial — discover research, round 2 (2026-10-12)
> 1.0 must: "tutorial (progressive, first game)" (GDD §7). Still diverge stage: findings + proposed defaults, not decisions.
> Tags: **[src]** = found in a source this session (URL listed) · **[mem]** = Claude's own knowledge, not re-checked today.
> Honest note: web search found few hard industry numbers. Most "standards" below are one studio's choice or common practice, and are labelled that way.

## 1. Muzzy's vision: a progressive disclosure tutorial (PDT)
*"I love tutorials that give you the overview, then let you play. If you aren't doing the right thing, it gently lets you know what you can do. It only teaches you things when it matters."*
| Piece | What it does |
|---|---|
| **Overview** | Very short, up front. Then you just play. |
| **Just-in-time notes** | Info appears only in the moment it's needed. *Occasionally* (rarely) a note pauses play and asks you to do one specific thing. |
| **Idle nudges** | No action for ~X seconds → a small popup points at the right thing: "Drag 1 of your glyphlings to a new position." |
| **Tips on/off** | In Settings. Off = no popups. |
| **"?" button** | Pauses the game → **Exploration mode**: tap anything → the rest goes dark and see-through, a popup explains what you tapped. Tap something else, tap off, or tap ? again to leave. |
| **Tutorial game** | The first game is 1v1 vs the AI and may pause whenever it wants to show something. **Online is greyed out** until you finish that game OR exit it. Settings → **Replay tutorial game**. |
- The old A–D directions (round 1) are **superseded** by this vision. It is closest to old "B (guided first game) + C (quiet help)", with "?" mode as new.

## 2. What the original meant (kept from round 1)
- Unity original never built one. `HANDOFF.md` §7: *"Progressive disclosure tutorial — NOT DONE (depends on AI feeling right)"*. §8.3: *"should NOT be built until AI plays correctly and multiplayer works."* → now met (AI F50, online in v0.9.3).
- §9.1 principle #1: *"Area control first, spelling second — This is the game's identity."* A tutorial that only teaches spelling teaches the wrong game.
- Muzzy, STATE 2026-10-12: *"tutorial = the last big sprint; then an art pass."*
- Already teaching without words: legal-move glows, the "No" shake, word spotlight, score pops (+1 / +2), turn pulse, undo-until-Cast.

## 3. Hardest rules to teach (kept, hardest first)
1. **Secret Magic + "the game ends at 2 tangles"** — you can't see you're ahead, or that ending it is a move. Strategy, not just a rule.
2. **Tangle bonus** (+3 per adjacent piece, to *others*) — backwards from what people expect; self-tangling beside your own seeds gives nothing away.
3. **Cast from the landing spot** — the move *is* the aim (Scrabble habit says "place anywhere").
4. **Ownership +1** — easy to state, hard to *value* (a short word of mine beats a long shared one).
5. **Hidden-inside words don't count** (GARDENING, not DEN) — teach only when it happens.
6. **Refresh only when you made no Magic** — players hunt for a refresh button. Teach on their first zero-Magic turn.
- Also easy to miss: casts fly over *your* pieces only · words read top→bottom / left→right · a hemmed-in glyphling is freed if the blocker leaves.

## 4. Findings by topic

### 4.1 Just-in-time / FTUE (first-time user experience)
| Finding | Source |
|---|---|
| Tutorials helped only the most complex of 3 games; **just-in-time instructions can improve engagement**; free roaming during the tutorial changed nothing | Andersen et al., CHI 2012 [src, round 1] |
| **"Pull" help** (shown when the player signals a need: hovering, starting a task) beats **"push" help** (shown out of context). Up-front tutorials interrupt, aren't remembered, don't improve performance | NN/g 2023, via secondary sources [src] |
| Coach marks: **one interaction per hint**, never chains of tips; users dismiss fast and don't read; the more hints, the faster they're dismissed; make hints look different from real buttons | NN/g "Mobile instructional overlay" [src] |
| **One concept per teaching moment**; reach the core loop within ~30 s | onboarding practitioner guide [src] |
| Tooltip copy **under ~15 words**; remember what's been seen so tips never repeat | Flook mobile tooltip guide [src] |
| People read ~20% of the words on a screen | UX writing guide [src] |
| Tutorial completion: devtodev calls **70–80% "optimal"**; examples seen: 13%, 40%, 58%, 75% | devtodev, GameAnalytics, Game Developer [src] |
| Biggest drop-off is often **step 1 → step 2** — the very first screens matter most | devtodev [src] |
| Track start / each step / complete / **skip** as events | Unity FTUE tips [src] |
→ **For us:** pause only for things that *must* happen now; everything else is a small note that doesn't stop play. No published "tips per minute" standard was found — NN/g's "never chain them" is the closest rule.

### 4.2 Idle hints
| Game | What happens | Source |
|---|---|---|
| **Candy Crush** | After "a couple of seconds" idle, a possible match pulses/wiggles; it repeats until you move. It isn't always the best move | fan guides [src]; ~5 s, wiggle [mem] |
| **Bejeweled 2** | Free automatic hint after "several seconds" idle; the manual Hint button costs points | Wikipedia [src] |
| **Indie match-3 (MenTaiko)** | Hint after **5 s** idle; **resets the timer when you switch tabs** so it doesn't fire the moment you return; off by default | itch.io devlog [src] |
| **Hearthstone tutorial** | Big arrows + speech bubbles point at the card to play; trying to end your turn too early gets *"Not yet! You have more cards to play!"*; End Turn glows green when you've done everything | wiki [src]; arrows [mem] |
| **Monument Valley** | No onboarding; hints only for players stuck on a maze | critical-play write-up [src] |
| TV Tropes "hint on delay" | Warns it can feel **pushy when the player is just exploring or admiring**. Softest form = a glow on the next thing; then text | [src] |
- **Escalation** (glow → text → arrow) is common practice, but no source gave tier timings [mem]. Match-3's ~5 s suits a game with no thinking time. **A word game needs thinking time**, so our delay must be longer — and should be measured from the *start of your turn*, not your last tap.

### 4.3 "?" / inspect / "What's This?" modes
| Game / system | Enter → while in it → exit | Source |
|---|---|---|
| **Windows "What's This?"** | "?" in the title bar → cursor becomes arrow+? → click any control → popup for it → **cursor resets after one click** (one-shot) | MS / wxWidgets docs [src] |
| **Civilization VI** | "?" icon → Civilopedia (a separate encyclopedia screen, not on the board) | 2K manual [src]; right-click a unit → its entry (Civ V) [mem] |
| **Slay the Spire / Into the Breach** | Hover (PC) or long-press (mobile) any card/unit → keyword boxes; Into the Breach shows enemy intent so the board explains itself | [mem] |
| **Terraforming Mars app** | Separate Rules screen by topic + tutorial lessons from the menu | Meeple Mountain review [src] |
| **Root (digital)** | Highlights show what you can do; tutorials per faction; pause-anytime help | reviews [src] |
| Mobile tooltip practice | Long-press to open; **tap outside to close** (small ✕ buttons get mis-tapped); place above/below the thing, never over key controls; coach marks **dim the background** | Flook, AppStorys [src] |
| Feature request (other app) | "A help button → an overlay that titles every button, tap a title for more" — exactly Muzzy's idea, not shipped there | ProductLift [src] |
- **Muzzy's version is better than Windows' one-shot**: staying in the mode until you leave lets players tap around freely. Few games found do a dim + explain *mode* on the live board — this could be a signature feature.

### 4.4 Locking features until the first game is done
| Game | Lock | Source |
|---|---|---|
| **Hearthstone** (2025) | 3 tutorial matches, **play or skip**; other modes stay locked until the Apprentice Track is **finished or skipped** | Blizzard forum + wiki [src] |
| **Clash Royale** | Training Camp = the tutorial, then stays as practice vs an AI with nothing at stake; multiplayer blocked until your deck has 8 cards | wiki [src] |
| **Legends of Runeterra** | Tutorials → challenges → online play unlocks as you progress | guides [src] |
| **Marvel Snap** | A short scripted tutorial battle (with Nick Fury vs Doctor Doom, "a couple of minutes"); you keep its deck | Untapped wiki [src]; first opponents are bots [mem] |
| **Ticket to Ride app** | Guided game offered, **not forced** | round 1 [src] |
- **"Finish OR skip/quit" is the standard** (Hearthstone). Hard locks with no way out are what players complain about (round 1: "can't skip it").
- A **Klei forum** thread: a one-time hint was missed, the player died, and could never see it again → **players want a way to replay hints** [src]. Settings → "Replay tutorial game" covers this.

### 4.5 Tips toggle in Settings
- Civ VI: advisors can be turned off or limited to some kinds of advice, but some suggestion icons still show [src, CivFanatics].
- Common labels: "Tips", "Tutorial tips", "Hints", "Advisor" [mem]. Default **on** for new players [mem].
- No source found for a standard "Reset tips" button; it shows up in some games and apps [mem].
- → Proposal: one switch, **"Tips"**, kills *both* just-in-time notes and idle nudges. The **"?" button always works** (it's pull help — the player asked).

### 4.6 Making the right moments happen (scripted vs free AI)
- **Hearthstone's Hogger**: fully scripted — same opening hand, same draw order, the boss's turns fixed, actions restricted, **impossible to lose** [src, wiki].
- **Marvel Snap**: one scripted battle, then real (bot) matches [src/mem].
- **Wingspan**: each part alone, then a sample game where only legal moves are allowed [src, round 1].
- → We have the tools for a middle path: a **seeded bag** (stack the first hands so a word and an ownership +1 come easily), a **gentle tutorial AI**, and an AI **"teaching goal"** that walks a glyphling into a tangle at a set point if one hasn't happened yet. Lessons that never trigger naturally get a fallback.

### 4.7 Tone and wording
- **Verb first, second person, short**: "Drag…", "Tap…", "Cast…" [src, UX guides]. Hearthstone's refusal is *positive*: "Not yet! You have more cards to play!" — it says what you *can* do [src].
- **Say what to do, not what's wrong** ("Stay positive" [src]). Make players feel clever and in control [src].
- Match the game's voice: cozy words ("tangled", "grow").

## 5. Standards we'd adopt (proposed defaults — all values in `content/`, editable in the Dev Kit)
| Thing | Default | Why |
|---|---|---|
| Opening overview | **≤ 3 short cards, ≤ 30 s**, skippable, then straight into the game | core loop within 30 s; the first screens lose the most players |
| One tip | **one idea, ≤ 12 words**, verb first, says what you *can* do | NN/g one interaction; <15 words |
| Pausing notes ("do this now") | **≤ 4 in the whole tutorial game** | Muzzy: "rare"; NN/g: chains get dismissed |
| Non-pausing notes | **max 1 on screen; max 1 per turn**; others wait in a queue; each shown once, ever | never chain tips |
| Idle nudge: first step | **glow on the right thing after 10 s** of your turn with no action | word games need thinking time (match-3's 5 s is too fast) |
| Idle nudge: second step | **text popup after 20 s** ("Drag 1 of your glyphlings…") | escalate softly; avoid "pushy" |
| Idle nudge: stop | after a type of nudge has been shown **3 times**, it stops for good | avoid nagging a player who's clearly fine |
| **Wrong-action nudge** *(new, round 3)* | wrong drop → "No" shake + fly back **at once**; in the tutorial game also a text nudge **at once**, saying what you *can* do ("Not yet! Cast a seed first."). No cap in the on-rails part; 3-per-kind cap in free play; after the tutorial = shake only | Hearthstone + Wordle both answer a wrong action instantly, every time, with one short positive line |
| **On-rails steps** *(new, round 3)* | only the one right target is live; everything else dimmed; the step can't fail; ~1 action per step | Candy Crush level 1, Hogger ("impossible to lose") |
| Idle timer resets | on any tap/drag; paused during animations, the AI's turn, "?" mode, a hidden tab | MenTaiko's tab fix |
| Idle nudges after the tutorial | **on, but slower** (e.g. 30 s), until Tips is turned off | help still needed in games 2–3 (Root, Wingspan) |
| "?" mode | pauses, dims the rest (~60% dark), the tapped thing stays lit, popup above/below it; exit = tap ? / tap off; tap another thing = switch | Muzzy + tooltip practice |
| Tips switch | "Tips" in Settings, **on** by default, off = no notes + no nudges; "?" always works | pull help is always fine |
| Tutorial game | Small board, 1v1 vs a gentle AI, seeded first hands; online **and pass-and-play** greyed with a reason ("Finish or leave your first game to play online"), unlocked by **finish OR exit** | Hearthstone finish-or-skip (a "Leave Tutorial" menu item since 2022) |
| Tutorial length *(new, round 3)* | **one game, aim ≤ 10–12 min**; on-rails part ≤ 3 min | Hearthstone = 3 short missions, Arena = 5 short games [mem: ~5 min each]; we teach less, so one game |
| Tutorial AI *(new, round 3)* | free (not scripted) after the rails, weak on purpose, **can still lose** like Sparky; one planned "teaching tangle" of its own glyphling | Arena's Sparky: weak decks, loss still possible; Hogger is fully rigged only because every turn is scripted |
| Replay | Settings → **Replay tutorial game** + **Reset tips** | Klei "can't see it again" complaint |
| Pass-and-play | notes name the colour ("Yellow, drag…"), not "you" | round 1 |
| Tracking (later) | log tutorial start / step / finish / exit, to see where people stop | Unity, devtodev |

## 6. Open questions for Muzzy
1. **Idle delay**: are 10 s (glow) → 20 s (text) right, or should we start there and you tune it in the Dev Kit?
2. **"?" mode online**: it can't pause a real opponent. Show it without pausing, or grey "?" out online?
3. **In "?" mode, which things are tappable?** (glyphlings, seeds, a hex, the tray, the score total, buttons, the turn prompt…) Everything, or a set list?
4. **Which moments get a *pausing* note?** Claude's guess: the first move, the first cast, the first tangle, and "you're ahead — you could end it".
5. **Overview cards**: what are the 3 things? (e.g. move → cast → words make Magic; tangles end the game.)
6. **Exit the tutorial game**: does exiting count as "done" forever (online unlocks), or ask again next launch?
7. **Tutorial AI**: OK for it to make a planned "teaching" move (walk into a tangle) so the lesson always happens?
8. **Tips after the tutorial**: keep idle nudges in later games (slower), or tutorial game only?

## Sources
- NN/g, mobile instructional overlays: https://www.nngroup.com/articles/mobile-instructional-overlay/
- Push vs pull revelations (NN/g, secondary): https://www.educative.io/answers/what-is-the-difference-between-proactive-and-reactive-interface · https://www.cobeisfresh.com/blog/why-contextual-help-outperforms-onboardings-in-ux-design
- Onboarding practitioner guide: https://claudeskills.info/skills/omer-metin/skills-for-antigravity/player-onboarding/
- GameAnalytics FTUE: https://gameanalytics.com/blog/tips-for-a-great-first-time-user-experience-ftue-in-f2p-games · devtodev: https://www.devtodev.com/resources/articles/how-to-optimize-your-game-tutorial · Unity FTUE: https://unity.com/how-to/10-first-time-user-experience-tips-games · https://www.gamedeveloper.com/business/behavior-analysis-of-50-000-mobile-players
- Tooltips: https://flook.co/blog/mobile-tooltip-best-practices · https://appstorys.com/blog-Mobile-App-Tooltips-Complete-Guide · https://mapme.productlift.dev/p/help-overlay-an-explanation-of-each-button-on-the-current-sc-KbnNiI
- Idle hints: https://men0tai0ko.itch.io/match3/devlog/1490027/v190-hint-system-added · https://en.wikipedia.org/wiki/Bejeweled_2 · https://www.imore.com/candy-crush-sage-another-10-hints-guides-extra-lives · https://tvtropes.org/pmwiki/pmwiki.php/Main/HintSystem · https://mechanicsofmagic.com/?p=10679
- Hearthstone: https://hearthstone.wiki.gg/wiki/Tutorial · https://hearthstone.wiki.gg/wiki/New_player_experience · https://us.forums.blizzard.com/en/hearthstone/t/2025-the-new-player-experience-the-apprentice-track/142501 · https://hearthstone.fandom.com/wiki/Hogger_(boss)
- Clash Royale: https://clashroyale.fandom.com/zh/wiki/%E8%AE%AD%E7%BB%83%E8%90%A5 · Runeterra: https://redbull.com/ca-en/legends-of-runeterra-lol-tips-guide · Marvel Snap: https://blog.snap.untapped.gg/marvel-snap-wiki-account-progression
- What's This?: https://learn.microsoft.com/en-us/previous-versions/visualstudio/foxpro/c8z893x3(v=vs.80) · Civ VI manual: https://cdn.2kgames.com/manuals/civilization-vi/switch/na/CIV_VI_NSW_ONLINE_MANUAL_US.pdf · https://forums.civfanatics.com/threads/turn-off-recommendations.667176
- Terraforming Mars: https://www.meeplemountain.com/?p=18715 · Root: https://www.spritesanddice.com/reviews/root-digital-review/ · Klei hints: https://kleiforums.com/forums/topic/91932-option-to-play-cartoon-again-repeat-tutorial-hints/
- Wording: https://careerfoundry.com/blog/ux-design/ux-writing-tips-best-practices · https://www.pippit.ai/resource/microcopy-best-practices-2025-guide-to-ux-writing
- Round 1 sources (Andersen CHI 2012, Wingspan, Ticket to Ride, etc.) were in the previous version of this file (git history, commit b4a8c18).

## Round 3 — Muzzy's named games (2026-10-12)
> Muzzy's words: pop-ups after X s idle **or** after a wrong action are **nudges**. Tutorial game = **on rails** (draft spots told exactly; turn 1 teaches move + blocked paths, cast + blocking + flying over your own pieces, refresh) → then free play vs a hidden **tutorial AI personality** (very basic, tends to get ONE of its own glyphlings tangled), with nudges. Online + pass-and-play locked until it's finished or left.
> Honest note: search found **no published tutorial-completion or day-1 retention numbers** for these 6 games. The only hard number: New Words With Friends' soft launch had **~20% better retention** (Zynga, 2014), but that came from a whole redesign, not the tutorial.

### R3.1 First-time experience
| Game | On rails → free play | Length | Locked until |
|---|---|---|---|
| **Hearthstone** (tutorial reworked 2023) | 3 missions (Rexxar → Garrosh → Lich King, 10/20/30 health). Coin flip + deck order fixed, no mulligan, nearly every action in a set order, no concede. Mission 1: cards cost 0 mana; mana + Hero Power arrive in mission 2. A "Mission Progress" screen between bosses repeats the last lesson [src] | each mission ends on a set turn; whole thing ~15–20 min [mem] | Most modes until the 25-level **Apprentice Track** is finished **or skipped**; Brawl at Lv 18, Arena at Lv 22, classes by level [src]. "Leave Tutorial" menu item since 2022 [src] |
| **MTG Arena** | Sparky guides **5 short tutorial games** vs named AI opponents with fixed decks + draws, one concept each; then bot games vs Sparky [src/mem] | ~5 min per game [mem] | Then 5 **Color Challenges** (beat the AI with each colour); Starter Deck Duel after "Sparky's Challenge" (3 wins vs AI), per players [src, forum]. Wizards "refactored" the new-player flow in 2023 [src]; no numbers published |
| **Candy Crush** | Level 1 = a demo round: a mascot points, a small animated box shows the swipe, the player does it rather than watching. Big Skip button [src]. Fixed opening board, the rest dimmed, only the shown swap allowed [mem]. Each new candy taught on the level it first appears [src/mem] | level 1 ≈ 1 min [mem] | Nothing; the level map *is* the order [mem] |
| **Wordle** | **No tutorial**: one "How to play" card on first visit (goal, 2 rules, **3 examples**, one per colour), then you play. The ? icon reopens it [src/mem] | ~15 s | Nothing |
| **Scrabble GO** | A short guided first turn, then games vs people or a skill-matched practice AI [src: practice mode; mem: guided turn, low confidence] | — | Some modes by level [mem] |
| **Words With Friends** | Help page walks you through: start a game → place a word → swap tiles [src]; guided first word in the app [mem, low confidence]. Solo vs computer added 2014 [src] | — | — |
→ **For us:** card games spread teaching over 3–5 short scripted games. Word games barely teach, because people already know Scrabble. Glyphtender is *not* Scrabble (move first, cast from where you land, tangles), so one game with a scripted start sits between the two.

### R3.2 Nudges — idle and wrong-action
| Game | Idle | Wrong action | Escalation / limits |
|---|---|---|---|
| Hearthstone | the card you must play **glows yellow** (from mission 2) + arrows [src/mem] | End turn too early: **"Not yet! You have more cards to play!"** / **"Not yet! You can still attack."** Too little mana: Jaina says **"I need to wait a turn for my mana to recharge."** [src] | shown **every time**, at once, no cap; the hero says it in character [src] |
| Arena | Sparky's arrows + the playable card glows [mem] | an illegal play won't drop; the prompt explains [mem] | — |
| Candy Crush | a possible match **wiggles after ~5 s**, repeats until you move (round 2) | a bad swap **swaps back**; that's the whole message, no text [mem] | never stops [mem] |
| Wordle | **none** | the row **shakes** + a small toast **"Not in word list"** / **"Not enough letters"** [mem] | every time; toast ~1–2 s [mem] |
| Scrabble GO / WWF | none found | an invalid word is refused with a short message before it's sent [mem] | — |
- **Pattern:** a wrong action is **always answered at once** (no delay), by the piece itself (swap back, shake) plus **one short line that says what you *can* do**. Idle nudges only show up in the fast or scripted games. → Adds the "Wrong-action nudge" row to §5.

### R3.3 How the tutorial opponent is scripted
| Opponent | How | Can you lose? |
|---|---|---|
| **Hogger** (old HS tutorial) | every turn fixed (Riverpaw Gnoll on turn 1 … "Hogger SMASH!" on turn 5); 1 card to play each turn, only **2 real choices** in the whole match [src] | no |
| Rexxar / Garrosh / Lich King (2023) | fixed decks + order; the Lich King's fight hands you a Flamestrike to clear what he summons [src] | no |
| **Sparky** (Arena bot) | 5 one-colour decks of commons; makes poor decisions [src] | yes, through bad draws [src] |
| Candy Crush level 1 | fixed board, one allowed move per step [mem] | no |
→ **For us:** the rails part is Hogger-style (can't fail). After the rails it's Sparky-style: a real AI that's weak on purpose, so the win feels earned. The planned self-tangle is our version of the Lich King's "here's a Flamestrike": the lesson is set up so it can't be missed.

### R3.4 Tip text — real examples
| Game | Text | Words |
|---|---|---|
| Hearthstone | "Not yet! You have more cards to play!" | 8 |
| Hearthstone | "I need to wait a turn for my mana to recharge." (in character) | 10 |
| Wordle | "Guess the Wordle in 6 tries." · "Each guess must be a valid 5-letter word." | 6 · 8 |
| Wordle | "Not in word list" | 4 |
- Confirms ≤ 12 words. New idea: in Hearthstone the **hero says it**. Our nudges could come from **your glyphling** in a speech bubble ("Not yet! Cast a seed first."): cozy, and it points at the right piece for free.

### R3.5 Skill atoms / skill chains (Dan Cook, Lostgarden 2007): the standard way to order lessons
1. A **skill atom** is one loop: the player **acts** → the game **updates** → the player sees **feedback** → their **mental model** gets better.
2. Atoms link into a **skill chain**, a map where each arrow means "needs this first" (you can't stomp an enemy until you can jump).
3. Teach in chain order: each new atom should only need atoms the player has already **done**, not just read about.
4. Every atom needs clear feedback that it worked. An atom the player stops using is **burnout**: the lesson didn't land, or the skill isn't needed.
5. Use the chain to plan *and* to test: watch where in the chain players get stuck. (Raph Koster: real chains nest; they aren't straight lines.) https://lostgarden.com/2007/07/19/the-chemistry-of-game-design/
- **Glyphtender chain (draft for /define):** place in draft → move along a leyline → *blocked paths* → cast from the landing spot → *fly over your own pieces* → a word grows → +1 per own seed → refresh (no Magic) → hemmed in → tangled → tangle bonus → secret Magic + the game ends at 2 tangles. Muzzy's on-rails turn 1 covers the first 5 atoms + refresh, so it already follows the chain. The feature map can reuse the same `needs:` arrows.

### R3.6 What changed in the §5 defaults
- **Added:** wrong-action nudge (instant, positive, no cap during the rails) · on-rails steps (one live target, can't fail) · tutorial length (one game, ≤ 10–12 min) · tutorial AI (weak but can lose, one planned self-tangle) · pass-and-play locked too.
- **Kept:** idle 10 s glow → 20 s text, 3-times cap (only fast games use idle nudges, so ours stays slow), ≤ 12-word tips, unlock on finish or leave, Replay.
- **New open question 9:** should nudges come from the glyphling in a speech bubble (like Hearthstone's hero), or from a plain popup?

Round 3 sources: https://hearthstone.wiki.gg/wiki/Tutorial · https://hearthstone.wiki.gg/wiki/New_player_experience · https://hearthstone.fandom.com/wiki/Hogger_(boss) · https://mtg.wiki/page/Color_Challenge · https://draftsim.com/sparky-decks-mtg-arena/ · https://steamcommunity.com/app/2141910/discussions/0/3839927185135682373 · https://www.tcgplayer.com/content/article/How-to-Play-Magic-The-Gathering-Arena/6ad595a2-2207-40b3-8c1e-0fc18032fb2a/ · https://sportskeeda.com/esports/magic-the-gathering-confirmed-steam-release-can-wizards-fix-problems-game-currently-faces · https://useronboarding.academy/user-onboarding-inspirations/candy-crush · https://userguiding.com/blog/video-game-onboarding · https://klasses.cs.uchicago.edu/archive/2023/winter/22300-1/hello-wordle/how-to-play.txt · https://johnnyjet.com/wordle-is-the-perfect-game-because-its-not-a-giant-time-suck/ · https://www.xatakamovil.com/aplicaciones/scrabble-go-esta-disponible-para-ios-android-famoso-juego-palabras-vuelve-nuevas-funciones · https://www.zyngawithfriends.com/wordswithfriends/support/WWF_How_To_Play.html · https://www.pocketgamer.biz/zynga-soft-launches-new-words-with-friends · https://lostgarden.com/2007/07/19/the-chemistry-of-game-design/ · https://www.raphkoster.com/2007/07/23/cooking-up-chemistry/

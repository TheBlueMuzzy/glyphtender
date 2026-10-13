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
| Idle timer resets | on any tap/drag; paused during animations, the AI's turn, "?" mode, a hidden tab | MenTaiko's tab fix |
| Idle nudges after the tutorial | **on, but slower** (e.g. 30 s), until Tips is turned off | help still needed in games 2–3 (Root, Wingspan) |
| "?" mode | pauses, dims the rest (~60% dark), the tapped thing stays lit, popup above/below it; exit = tap ? / tap off; tap another thing = switch | Muzzy + tooltip practice |
| Tips switch | "Tips" in Settings, **on** by default, off = no notes + no nudges; "?" always works | pull help is always fine |
| Tutorial game | Small board, 1v1 vs a gentle AI, seeded first hands; online **greyed with a reason** ("Finish or leave your first game to play online"), unlocked by **finish OR exit** | Hearthstone finish-or-skip |
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

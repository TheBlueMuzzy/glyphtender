# AI opponent setup menus — how other games do it

Research for the New Game screen's AI seat picker (2026-10-05). Today each seat toggles Person / AI, and an AI seat
opens a card with portrait + name + bio, a ◀ personality ▶ selector and a skill selector. With 3 AI seats that is
three big cards stacked on a phone — the "cluttered / clunky" feeling.

## 1. Summary

Almost every game splits AI setup into **two very different kinds of choice**: *who* you play against (a face, a
name, a style — the fun, flavourful pick) and *how hard* (a dial most players set once and then forget). The games
that feel smooth treat them differently: difficulty is usually **one setting for the whole table** (Mario Kart COM
level, Civilization difficulty, Wingspan/Scythe/Root difficulty, Scrabble GO level) and is **remembered**, while
personality is shown as a **portrait you tap** (Carcassonne's Count / Witch / Juggler, chess.com's bot gallery,
Hearthstone's class heroes, Smash's character cards). Bios are short and live *behind* a tap or in a preview spot,
not printed under every seat. "Random" is the default in the big strategy games (Civ's "Random Leader", Smash's
random fighter) and is shown as a "?" portrait, not a word. The fastest games get a solo game going in **1–3 taps**
by remembering the last setup or offering a "Play Now" button (Civ VI) next to the full setup. Per-seat difficulty
exists (Smash, Scythe, Ticket to Ride) but it is tucked into a small badge on the seat (Smash's "Lv 3"), never a
full row of its own.

## 2. Comparison table

Tap counts are from the main menu to the first move, using defaults; "~" means estimated from screenshots/guides,
not measured.

| Game | Flow | Taps to solo | Personality vs difficulty | Notable idea |
|---|---|---|---|---|
| Civilization VI | Single Player → Play Now, or Create Game / Advanced Setup | 2 (Play Now) | Leaders = personality (each has agendas); one difficulty for the whole game (Settler…Deity, default Prince) | **Play Now** with sensible defaults; leaders default to **Random**; per-AI leader picks hidden in Advanced Setup |
| Carcassonne (Twin Sails) | Local game → add AI seats → pick AI | ~4 | 8 named characters in pairs (Maid/Servant easy … Witch/Warlock hard) — **the character *is* the difficulty** | Personality and skill merged into one cast; flavour bios ("late-night banquets") |
| chess.com Play Bots | Play → Bots → gallery → Choose → Play | ~3 | 100+ bots grouped by tier (Beginner/Intermediate/Advanced/Master); each has portrait, rating, style, opening line | **Gallery grouped by difficulty**, big preview card with a speech bubble greeting; assist mode (challenge/friendly/assisted) is a separate toggle |
| Lichess | Play with the computer → dialog → Play | 2 | No personality; level 1–8 in one row of numbered buttons | Whole setup in one small dialog; remembered |
| Hearthstone Practice | Solo → Practice → Normal/Expert → pick hero | ~4 | 9 class heroes (portraits) + a Normal/Expert switch at the top | **Difficulty as a tab above the portraits**, set once |
| Smash Bros Ultimate | Smash → add CPU card → pick fighter → Fight | ~3 | Each CPU seat is a card; level shown as a small "Lv 3" badge, tap to change; default level set in rules | **Per-seat difficulty as a badge**, not a row; random fighter = "?" tile |
| Mario Kart 8 Deluxe | VS Race → rules screen | ~4 | No personalities; COM level Easy/Normal/Hard for **all** CPUs, separate from speed (cc) | Difficulty split into two dials (speed vs how mean the CPUs are) |
| Wingspan (digital) | New game → seats (Human / AI / Automa / None) + difficulty | ~3 | No personalities; AI difficulty + separate Automa opponent | Seats set to "None" to shrink the table — no separate player-count stepper |
| Scythe Digital | Local game → arrows on each seat cycle Human ↔ bot | ~3 | Faction = flavour; bot difficulty Easy/Medium/Hard **shown by the bot icon's colour** | Per-seat difficulty encoded in colour, zero extra rows |
| Root (Dire Wolf) | Local → pick factions → bots | ~4 | Factions are wildly different (natural personalities); bot difficulty per game; Clockwork bots add "traits" | Optional **trait modifiers** for players who want to tinker, hidden by default |
| Ticket to Ride (2023 app) | Solo → number of AIs + difficulty | ~3 | Avatar cast for everyone; Easy/Normal/Hard | Players complain Easy ≈ Normal — difficulty names must match how it *feels* |
| Catan Universe | Single player → pick AI difficulty | ~3 | Ten AI avatars; difficulty Beginner/Veteran/Expert for the table | Avatars are flavour only; one difficulty |
| Terraforming Mars (Asmodee) | Solo / vs AI → number of AIs + Easy/Normal/Hard | ~3 | No personalities | Players learn on Easy for 2–3 games — easy default matters |
| Scrabble GO | New Game → Single Player → pick level → Start | 4 | No personality; 5 levels (Easy → Grand Master) | Level picked on its own screen — clear but one more tap |
| Words With Friends 2 | Solo Challenge → ladder of themed bots | 2 | Themed characters on a **ladder** (5 ladders × 5 bots) that get harder | Difficulty becomes **progress** — you unlock the next face |
| Board Game Arena | Mostly no bots (community wants humans); a few games use Automa rules | — | — | Proof that "AI" in board-game apps is often a solo variant, not a character |

## 3. Patterns that recur

1. **Difficulty is a table setting, chosen once and remembered.** Civ VI, Mario Kart, Catan Universe, Ticket to
   Ride, Terraforming Mars, Wingspan, Lichess, Scrabble GO, Hearthstone (the Normal/Expert tab). Players pick
   "their level" and rarely want three different levels at one table.
2. **Per-seat difficulty, when it exists, is a tiny badge** — Smash's "Lv 3" on the card, Scythe's bot colour. Never
   a full labelled row per seat.
3. **Personality = a portrait you tap**, with the name under it. The bio is in a **preview spot** (chess.com's big
   card + greeting, Carcassonne's character blurb), shown for the *selected* one only.
4. **Random is the default and looks like a face** — Civ "Random Leader", Smash "?" tile. Random is presented as a
   choice of its own, equal to the named ones.
5. **Quick start next to full setup** — Civ "Play Now", Lichess's one dialog, remembered last setup in most apps.
   The full form is for the second visit, not the first.
6. **Seats are the player count** — Wingspan's "None" seat, Smash's "+ add CPU": you add/remove opponents on the
   seats themselves instead of a separate stepper.
7. **Merging personality and skill into one cast** (Carcassonne, Words With Friends, chess.com tiers) — fewer
   choices, more character, but you lose the free mix (a hard *and* cuddly opponent).
8. **Gentle difficulty names fail if they don't feel different** (Ticket to Ride complaints, Scythe "even Hard is
   easy"). The labels promise a feeling — the AI has to deliver it.

## 4. Three directions for Glyphtender

Shared ground for all three: keep the glyphling as the portrait (it already is), keep "Surprise me" as a "?"
glyphling, keep the rock-paper-scissors visible because knowing *who* you face is part of the strategy.

### Direction A — "Faces on the seats" (compact seat chips + one bottom sheet)

```
 Players  [ - 3 + ]
 ┌───────────────────────────────┐
 │ (o) Rose     You              │
 │ (o) Ivy      Scholar · First ▸│   tap a seat ↓
 │ (?) Moss     Surprise · First ▸│
 └───────────────────────────────┘
 ── sheet ──────────────────────────
  (?)   (S)   (V)   (T)    ← tap a face
  "Did you know QUIXOTIC is worth…?"
  Skill  Apprentice | First Class | Archmage
  Person instead                [Done]
```

- Every seat is **one line**: portrait, name, "personality · skill". Tapping opens a sheet with the four faces, the
  bio of the picked one, and the skill.
- Pros: the screen stays short at 4 players; bios still exist but only one at a time; per-seat mixing stays.
- Cons: one extra tap to change anything; the sheet is a new part to build (the kit may have a dialog to reuse).
- Feeling: **calm and tidy** — the table reads like a guest list; choosing an opponent feels like choosing a guest.

### Direction B — "One skill for the table, a face per seat" (recommended)

```
 Players  [ - 3 + ]
 Rose   (o) You
 Ivy    (S) Scholar       ◀ ▶
 Moss   (?) Surprise me   ◀ ▶
        "Did you know QUIXOTIC…"   ← bio of the last one you touched
 AI skill   Apprentice | First Class | Archmage
```

- Skill moves out of the seats into **one row for all AI** (remembered). Each AI seat is portrait + name + ◀ ▶;
  Person / AI becomes the first or last stop on the same ◀ ▶ (or a long-press), so each seat is one row.
- **One bio line** under the seats shows whoever you just flipped to (fixed height, so nothing jumps).
- Pros: from ~3 rows per AI seat to 1; matches what most games do (Civ, Mario Kart, Catan, Hearthstone); skill is a
  "how good am I" question, answered once. Fewest new parts — Selector + one shared caption.
- Cons: can't put an Apprentice and an Archmage at the same table (rare want; could live behind a later "per-seat
  skill" option); the bio line is shared, so you read one at a time.
- Feeling: **quick and confident** — "I know my level, now who's coming to play?" Personality stays the star.

### Direction C — "Play now, or set the table" (quick start + full form)

```
 ┌──────── New Game ────────┐
 │ [  Play vs 1 AI  ]        │  ← you + Surprise me, last skill
 │ [  Play vs 3 AI  ]        │
 │ [  Same as last time  ]   │
 │    Set up the table ▸     │  ← today's full screen
 └───────────────────────────┘
```

- A short front screen with one-tap starts; the current detailed screen moves behind "Set up the table".
- Pros: 1 tap to a game; "Surprise me" becomes the default way to meet personalities; the full form stays for
  pass-and-play tables.
- Cons: doesn't fix the clutter on the full form by itself — it hides it; adds a screen; less agency up front.
- Feeling: **inviting, zero-friction** — good for "one quick game before bed", which suits a cozy game.

### Recommendation

**Direction B**, with C's "same as last time" for free (the screen already remembers choices via `loadChoices`, so
reopening it *is* a quick start). B removes the most rows (skill is set once instead of per seat), copies the
pattern players already know from Civ / Mario Kart / Hearthstone, and keeps the personality — the part with real
strategy (rock-paper-scissors) and charm — as the visible choice. If per-seat skill turns out to matter in
playtests, add Smash's trick: a small skill badge on the seat, not a row. Direction A is the fallback if 4-seat
tables still feel long on a phone after B.

## 5. Sources

- Civ VI new game / Play Now and Random Leader: https://civilization.fandom.com/wiki/Starting_a_new_game_(Civ6) ·
  https://gamerant.com/civilization-6-guide-set-up-game/ · https://civilization.fandom.com/wiki/Difficulty_level_(Civ6)
- Carcassonne AI characters: https://steamcommunity.com/app/598810/discussions/0/2997669078618143043/ ·
  https://en.wikipedia.org/wiki/Carcassonne_%E2%80%93_Tiles_%26_Tactics
- chess.com bots: https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots ·
  https://chessiverse.com/compare/best-chess-bot-personalities
- Lichess levels: https://lichess.org/forum/general-chess-discussion/what-elo-levels-of-lichess-bots-under-play-with-computer
- Hearthstone Practice: https://hearthstone.fandom.com/wiki/Practice_mode
- Marvel Snap bots: https://marvelsnapzone.com/bots-in-marvel-snap-a-comprehensive-guide/
- Smash CPU levels: https://www.ssbwiki.com/Artificial_intelligence · https://attackofthefanboy.com/guides/super-smash-bros-ultimate-how-to-add-cpu/
- Mario Kart COM setting: https://gamefaqs.gamespot.com/wii-u/700050-mario-kart-8/answers/417388-online-higher-cc-vs-tougher-com-setting
- Wingspan AI / Automa: https://steamcommunity.com/app/1054490/discussions/0/3200367137210404583/ ·
  https://steamcommunity.com/app/1054490/discussions/0/3112519935869023113/
- Scythe Digital bots: https://steamcommunity.com/app/718560/discussions/0/1643164558918524849/ ·
  https://www.commonsensemedia.org/game-reviews/scythe-digital-edition
- Root digital / Clockwork: https://store.steampowered.com/app/1462460/Root__The_Clockwork_Expansion/ ·
  https://gideonsgaming.com/root-digital-edition-review/
- Ticket to Ride app AI: https://steamcommunity.com/app/2477010/discussions/0/596268471289919579/ ·
  https://play.google.com/store/apps/details?id=com.marmalade.tickettoride&hl=en_US
- Catan Universe AI: https://forum.catanuniverse.com/topic/3597/playing-against-only-ai/3 ·
  https://www.pixelatedcardboard.com/catan-universe-review/
- Terraforming Mars digital: https://asmodee.helpshift.com/hc/en/48-terraforming-mars/faq/677-does-this-game-have-a-solo-mode/
- Scrabble GO vs computer: https://scopely.helpshift.com/hc/en/28-scrabble-go/faq/6360-how-do-i-play-against-the-computer-1688045050/
- Words With Friends Solo Challenge: https://zyngasupport.helpshift.com/hc/en/63-words-with-friends-2/faq/18333-what-is-solo-challenge/
- Board Game Arena bots: https://en.boardgamearena.com/doc/Bots_and_Artificial_Intelligence ·
  https://forum.boardgamearena.com/viewtopic.php?t=14352

Not covered: Monument Valley-style cozy games have no AI opponents, so they don't apply here.

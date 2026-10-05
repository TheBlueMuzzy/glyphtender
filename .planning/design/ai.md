# Glyphtender AI — design (beta, v0.7)

Defined with Muzzy 2026-10-04. The brain, tools and learning are the framework's (`../../../framework/.planning/design/ai.md` — read it first); this file is Glyphtender's **instincts**: its goals, readings, beliefs, special decisions, 7 personalities and how we prove each one feels like itself. Source: the original's `festive-booth` AI (`research/original-digest.md §2`) + Muzzy's notes there and in §8 "The soul". Numbers below are **starting values** — they live in `content/ai/` and the Personality Check decides them.

## What it's for
Play solo any time, fill any seat (2–4, local or online), and **prove the catchphrase**: a Bully who barely spells should still beat you by tangling. Serves every pillar — *best speller doesn't always win* (positional personalities win), *cozy garden* (mischief, never meanness), *every seat swappable* (a bot is a seat).

## Experience targets (AI)
| | Target | In players' words | We'll know when… |
|---|---|---|---|
| Primary | **Hunted, but cozy** | "The Bully's coming for my glyphling again!" | players move a glyphling away from the AI *before* it's threatened; they talk about it by name |
| Secondary | **Feels like a person** | "Ha — it thought it was winning!" | it sometimes misreads the secret Magic and calls the game too early (and loses); different personalities are recognisable without being told |
| Not this | a cold engine that always finds the best word · a cheat | | it only ever sees its seat's view; Scholar can be beaten by a positional player |
**Watch-outs:** waiting on AI turns · an AI that wins by spelling alone · a game where the AI never threatens anyone · banter that gets old.

## Goals (7, from the original — one trait each)
| Goal | Trait | Scores an action by… |
|---|---|---|
| TRAP | Aggression | rival moves removed (×5) · a tangle (+50, +3 per own piece next to it — "plan the kill") · rival glyphling left with ≤ 2 moves (+15) · **territory taken** (hexes rivals can no longer reach first) |
| SCORE | Greed | the Magic it makes (preview) · +2 per letter past 4 · +3 per extra word |
| DENY | Spite | blocking a rival's line / near-word · the best Magic a rival could have made there next turn (from imagined hands — the "weed toss") · junk letters cast to block |
| ESCAPE | Caution | own danger drop (×5) · escape routes (×2) · open directions (×3) · −10 if ≤ 2 routes · **territory kept** (pockets only it can reach — "walled garden") |
| BUILD | Patience | setups: gaps / extensions / crossings toward its own future words (×1.5 per own seed near) |
| STEAL | Opportunism | growing a rival's word into one it owns most of (+3 per rival seed when it gets the majority) |
| DUMP | Pragmatism | shedding junk letters (+3 when cast ≥ 3 hexes from every glyphling) |
New vs the original: **territory** (Amazons-style "who reaches each hex first") in TRAP / ESCAPE — the original's lost "zone" idea (Muzzy: "area control first") · every goal also gets the **nudge** from the others (framework), so two-birds casts win ties.

## Readings (0–10) and beliefs
- **Readings:** hand quality (vowel balance, hard letters, duplicates) · my danger (fewest moves among my glyphlings, rivals near) · rivals' danger · board fill · my territory vs theirs · end near (tangled glyphlings, glyphlings on ≤ 1 move).
- **Beliefs (fuzzy):** each rival's Magic, estimated from the words it *saw* them grow (it knows the rule, not the totals); confidence drops each turn it isn't sure and rises when it sees a score happen. → "Am I ahead?" is a belief, never a fact.
- **Imagined hidden:** rivals' seeds + the bag = the letters it hasn't seen, dealt at random (Archmage imagines a few worlds and averages).

## Special decisions (outside the goal roll)
- **Draft:** centre + room to move; pulled toward rivals by Aggression, away by Caution; spreads its two glyphlings if Aggression is low; random among the top 3.
- **Refresh** (made no Magic): sets aside its junk letters; how picky = Pragmatism.
- **Call it** (the self-tangle gamble — §8 of the digest): when it *believes* it's ahead by more than its **Nerve** (per personality, scaled by confidence) and a move ends the game, it takes the goal CALL IT: end the game giving rivals the least tangle bonus. Because beliefs are fuzzy it sometimes calls it wrong → the "Ha, it thought it was winning!" moment.

## Skill (separate dial — `content/ai/skills.json`)
| | Apprentice | First Class | Archmage |
|---|---|---|---|
| Candidates considered | 150 | 300 | 800 |
| Imagined worlds | 1 | 2 | 4 |
| Picks within / top N | 70% · 8 | 80% · 5 | 92% · 3 |
| Belief noise | high | medium | low |
| Vocabulary (Zipf ≥, + personality modifier) | 3.0 (~22k words) | 2.0 (~44k) | 0 (all 63k) |
Vocabulary = the words it can *aim for*; the rules still count any word it makes by accident. Whether tiers should be 4/3/0 (~5k/~20k/all, the old design's intent) is settled by the skill-ladder check (GDD §9).

## Three personalities — rock-paper-scissors (Muzzy, 2026-10-04: "we should only have 3 AI personalities")
**Bully = Hunter** (beats the Speller: hems it in) · **Scholar = Speller** (beats the Turtle: out-scores it) · **Survivor = Turtle** (beats the Hunter: can't be caught). Each has a real weakness. Measured 2026-10-04 (2p, First Class, 50 games): Speller > Turtle 86% ✅ · Turtle > Hunter 84% ✅ · Hunter > Speller 11% ❌ (being worked on — F45). The other four below stay in the data for the Dev Kit but aren't offered to players.

## The original 7 personalities — feel targets (checked by the Personality Check)
Trait ranges + priority from the original (digest §2). Each feel target is **behaviour** measured by a meter over ≥ 300 mixed games at First Class; thresholds are starting guesses, tuned in the check.
| Personality | Bio seed | Feel ("players say") | Feel targets (meters) |
|---|---|---|---|
| **Bully** | "I want to watch you squirm." | "I feel hunted" | tangles a rival in ≥ 60% of games · ends ≥ 50% of its turns within 2 hexes of a rival glyphling · cuts the most rival moves per turn at the table |
| **Scholar** | "Did you know 'QUIXOTIC' is worth…" | "Show-off speller" | longest average word at the table · ≥ 85% of its Magic from words · tangles a rival in ≤ 20% of games |
| **Builder** | "Just setting up for next turn…" | "It's planning something…" | most setups (non-scoring casts that start its own word) · Magic in the 2nd half ≥ 1.5× the 1st |
| **Vulture** | "That was going to be YOUR word." | "It stole my word!" | ≥ 2 steals per game · most steals at the table |
| **Survivor** | "You won't catch me." | "Can't catch it" | own glyphling tangled in ≤ 15% of games · most room to move at the table |
| **Strategist** | "Two words, one move." | "How did it get two words?!" | highest share of multi-word casts (≥ 35% of its scoring casts) — *multi-word specialist, Muzzy to confirm (F37)* |
| **Balanced** | "Whatever works." | "A solid all-rounder" | no meter at the table's extreme · win rate within ±10 points of the average (the yardstick) |
**For all of them:** each wins 35–65% one-on-one against Balanced (nobody dominates; "the best speller doesn't always win") · the tell-apart grid tells each one apart ≥ 70% of the time · Archmage beats Apprentice ≥ 75% for every personality · calls it in some games, and is wrong some of those times.
**Meters reuse the end-screen award detectors** (Lockdown, Pincer, Weed toss, Walled garden, Hijack, Power Play, Close call, Called it — `stats.ts`) so "what the AI does" and "what players get awarded for" are measured the same way.

## Players' side
- **New Game:** each seat = Human or AI; an AI seat picks a **personality** (card: name, portrait — the seat's glyphling for now, bio; or "Surprise me") and a **skill**. Solo default: you + 1 AI.
- **On its turn:** its glyphlings pulse like anyone's; a small "thinking…" on its chip; it moves, aims and casts with the same story as a person, at the speed setting (Settings → AI speed: Slow · Normal · Fast · Instant). No handoff screen for bots.
- **Banter:** a short speech bubble by its chip on **big moments only** (it tangles someone, gets tangled, steals or loses a word, calls it, the reveal) — about 1 turn in 4 for a chatty personality; chattiness per personality. Gentle — even the Bully is mischievous, not mean. Online, everyone sees it.
- **Online:** a player who goes idle → the AI plays for them (Balanced, First Class) until they're back (replaces the greedy bot). Host adding AI seats in the lobby = **should** (Muzzy to confirm, F37).

## Muzzy's calls (F37 — recommended defaults are in place; he can change any)
- Strategist: multi-word specialist (rec.) or DENY-first tactician?
- Banter: big moments only (rec.) · every turn · none until 1.0?
- Online: host can add AI seats in beta (rec.) or takeover only?
- AI names + portraits: personality names as their names ("the Bully") with the seat's glyphling (rec. for beta), or named characters with their own art (1.0)?

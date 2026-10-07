# Simulations with the real AI (Sprint 17)

## F46 — settling GDD §9: board per player count, bag run-out, first player
> 2026-10-07 · `npm run ai:balance -- --games 700 --jobs 24` · **4,200 games** (700 per row × 2/3/4 players × Small/Large) · 37.9 min on the PC (24 processes) · code at commit 86687d7 (v0.4.1 + the arena facts).
> Every seat: First Class skill. Personalities (Scholar / Survivor / Strategist, content/ai/personalities.json) shuffled into seats per game — 2–3 players: each personality at most once; 4 players: all three + one repeat. Seeds 100000 + row × 10000 + game, so the same command replays the same games. Rules as shipped (content/tuning/rules.json: hand 8, min word 2, tangle +3, ends at 2 tangles; 120-seed bag). Every game's facts: `e2e-shots/ai-balance.json` (not committed).
> Seat 0 = Yellow = drafts first and plays first, as the game does today. The draft is a snake (2p: Y B B Y).

### The tables

**Game shape** — "turns" = all players' turns together (each = per player). Margin = the winner's Magic minus the runner-up's. Close = margin ≤ 5. Fill = hexes taken (seeds + glyphlings) at the end.

| Row | Turns (each) | Longest 10% from | Margin avg (median) | Close ≤ 5 | Margin ≤ 10 | Winning Magic | Self-tangle ending | Fill at end | Turns scoring |
|---|---|---|---|---|---|---|---|---|---|
| 2p Small | 51.9 (25.9) | 71 | 24.2 (21) | 14.9% | 25.3% | 194 | 91% | 66% | 87% |
| 2p Large | 68.0 (34.0) | 97 | 33.3 (29) | 11.0% | 20.0% | 255 | 91% | 62% | 86% |
| 3p Small | 49.4 (16.5) | 64 | 14.3 (11) | 26.6% | 47.7% | 124 | 75% | 65% | 86% |
| 3p Large | 68.0 (22.7) | 89 | 21.2 (18) | 15.3% | 31.1% | 173 | 76% | 63% | 86% |
| 4p Small | 46.3 (11.6) | 61 | 10.6 (8) | 36.9% | 58.7% | 91 | 59% | 64% | 86% |
| 4p Large | 64.1 (16.0) | 83 | 13.2 (11) | 30.3% | 50.0% | 124 | 63% | 62% | 86% |

**Bag** — 120 seeds. Every AI turn casts a seed, and every cast takes one seed out of play for good (a draw after Magic or a refresh only tops the hand back up), so the bag empties on exactly turn 120 − 8 × players: **104** (2p) · **96** (3p) · **88** (4p).

| Row | Bag ran out | On turn | Then the game lasted | Bag left at end (median / lowest) | Ended with ≤ 10 left |
|---|---|---|---|---|---|
| 2p Small | 0% | — | — | 50 / 25 | 0% |
| 2p Large | 1.1% (8 games) | 104–105 | 0–5 more turns | 34 / 0 | 14% |
| 3p Small | 0% | — | — | 45 / 24 | 0% |
| 3p Large | 2.1% (15) | 96–98 | 0–4 more | 26 / 0 | 15% |
| 4p Small | 0% | — | — | 41 / 19 | 0% |
| 4p Large | 5.7% (40) | 88–91 | 0–11 more (usually 1–3) | 22 / 0 | 22% |

**Seat wins** — share of games won (a tie splits the win), with its 95% range (if the true rate were fair, a run this size lands inside ± that about 19 times in 20).

| Row | Fair | Seat 0 Yellow (1st) | Seat 1 | Seat 2 | Seat 3 |
|---|---|---|---|---|---|
| 2p Small | 50% | **54.8% ±3.7** | 45.2% ±3.7 | | |
| 2p Large | 50% | 51.8% ±3.7 | 48.2% ±3.7 | | |
| 3p Small | 33.3% | 32.9% ±3.4 | 35.7% ±3.5 | 31.4% ±3.4 | |
| 3p Large | 33.3% | 30.5% ±3.4 | 36.2% ±3.5 | 33.3% ±3.5 | |
| 4p Small | 25% | 27.0% ±3.2 | 25.9% ±3.2 | 26.0% ±3.2 | 21.1% ±3.0 |
| 4p Large | 25% | 26.8% ±3.2 | 25.2% ±3.2 | 25.6% ±3.2 | 22.4% ±3.1 |
| **2p both boards** | 50% | **53.3% ±2.6** | 46.7% ±2.6 | | |
| **3p both** | 33.3% | 31.7% ±2.4 | 36.0% ±2.5 | 32.3% ±2.4 | |
| **4p both** | 25% | 26.9% ±2.3 | 25.5% ±2.3 | 25.8% ±2.3 | **21.8% ±2.1** |

Personalities weren't spread perfectly evenly over seats (random shuffles), so for 2 players I also averaged Yellow's win rate over the six matchups both ways round (Scholar–Survivor, Survivor–Scholar, …): **53.2%** — the same edge, so it isn't who happened to sit in Yellow.

**Personality wins per row** (not a §9 question — a side check that the seats were fair to the personalities, and something the Personality Check should see):

| Row | Scholar | Survivor | Strategist |
|---|---|---|---|
| 2p Small | 55.9% | 47.2% | 46.2% |
| 2p Large | 77.6% | 37.2% | 33.2% |
| 3p Small | 37.9% | 44.9% | 17.2% |
| 3p Large | 56.5% | 34.4% | 9.1% |
| 4p Small | 25.6% | 33.3% | 16.1% |
| 4p Large | 39.6% | 27.9% | 7.3% |

Decision time: the slowest decision in a game was 341 ms median, 618 ms worst (this PC, 24 games at once).

### What it means, in plain English
- **Small boards make closer games; Large boards make longer ones.** On every player count, Large adds ~15–19 turns and widens the winner's lead by ~40–60%. Both boards end about equally full (62–66%) — the game ends at 2 tangles whatever the size, so a bigger board doesn't feel emptier at the end, it just takes longer to get crowded.
- **More players = closer finishes.** Median winning margin: 21 (2p Small) → 11 (3p Small) → 8 (4p Small). In 4-player games more than half are decided by 10 Magic or less.
- **Large boards help the speller run away.** The Scholar (the speller) wins 78% of 2p Large games but 56% of 2p Small ones; on Large there's room to keep building words without being squeezed. Small boards make the positional play (trapping, blocking) matter more.
- **The bag only runs out on Large, and only at the very end** — the last 1–6% longest games, when the game is already about to finish. It never ran out on Small (always ≥ 19 seeds left).
- **Yellow has a small edge in 2-player games** (~53–55%, about 1 extra win in 30 games); none in 3–4 players. In 4 players the **last** seat is slightly behind (~22% vs 25%).
- **Compared with the mindless bots** (research/sims.md, 2026-09-30): game lengths on Small are about the same (2p 51.9 vs 50.9 greedy), but the AI plays 3–4 player Large games ~8–10 turns longer (it doesn't walk into dead ends), which is why the bag now runs out a bit more often (4p Large 5.7% vs 1.6%). The mindless bots showed no seat edge; real play does, a little, in 2p. Self-tangle endings dropped from ~85–95% to 59–91% — and many of the AI's self-tangles are likely on purpose (it "calls it" when it believes it's ahead; this run didn't record which).

### Recommendations (Ask Muzzy)

**1. Board per player count** — today: 2p Small · 3p Large · 4p Large.

| Players | Small | Large | My pick |
|---|---|---|---|
| 2 | 26 turns each, median margin 21, 15% close | 34 each, margin 29, 11% close; the speller wins 78% | **Small** (keep) |
| 3 | 16.5 turns each, margin 11, 27% close | 22.7 each, margin 18, 15% close | **Small** (change) |
| 4 | 11.6 turns each, margin 8, 37% close | 16 each, margin 11, 30% close | **Large** (keep) |

Why: what players do on Small is fight over space sooner — every cast blocks someone, tangles come quicker — and that feels tense and close. On Large they build in their own corner for longer, which feels calmer but lets a good speller pull away. For 3 players, Small gives the same ~16 turns each as a 4-player Large game (the "right" length for a multiplayer game already), finishes ~25% quicker in real time, and nearly doubles the close finishes (27% vs 15%). For 4 players Small is too short to build anything (under 12 turns each), so Large stays. Option if you'd rather 3-player games feel roomier and more "build your garden": keep Large — it's not broken, just looser.

**2. Bag run-out** — what the engine does today when the bag is empty: a turn that makes Magic draws nothing, a turn without Magic offers no refresh (nothing to refill from), hands shrink, and a player with an empty hand just moves. The game still ends on 2 tangles as normal (every game in this run ended; the longest went 11 turns past an empty bag).
- Options: (a) keep "stop drawing" (what the GDD planned, already built) · (b) end the game when the bag is empty · (c) bigger bag for 4p.
- **My pick: (a) keep "stop drawing"**, no rule change. It only happens in the last few turns of the longest Large games (4p Large: 1 game in 18; never on Small), when everyone is already squeezed — players feel their hand thinning as a natural "the end is near" signal rather than a sudden stop. Ending the game on an empty bag (b) would cut short the tangle endgame that the whole game builds to. If you choose 3p Small (above), only 4p and 2p Large can ever run out. A small polish worth considering later: show "bag empty" so the missing refresh isn't a surprise.

**3. First player** — today: Yellow always starts.
- 2 players: Yellow wins **53.3% ±2.6** (1,400 games) — a real but small edge. 3 players: no first-seat edge (31.7% vs 33.3% fair). 4 players: no first-seat edge (26.9% vs 25%), the last seat a little behind (21.8% ±2.1).
- Options: (a) keep Yellow · (b) random first player each game (the seat order then goes on round the table as now) · (c) rotate who starts in a rematch.
- **My pick: (b) random first player.** The edge is small — smaller than one personality matchup (Scholar vs Survivor is 70/30) — so this isn't a balance emergency. But "Yellow always goes first" means the same colour gets the 2-player edge every game, and in 4 players the same colour is always last; random spreads both around so nobody's colour is the lucky one, and it adds a tiny "who's first?" moment at the start. (c) is a nice extra for rematches but needs the random start first.

### Surprising (for later, not §9)
- **The Strategist loses badly in 3–4 player games** (7–17% wins where fair is 25–33%) and **the Scholar beats it head-to-head too** (2p: Scholar wins ~58% against the Strategist), so the rock-paper-scissors only holds on two of its three legs: Scholar > Survivor ✓ (~73%), Survivor > Strategist ✓ (~61%), Strategist > Scholar ✗. Worth a look in the Personality Check (F45) — not a §9 call.
- Every AI turn casts a seed (the "must cast if you can" rule nearly always applies), so the bag's run-out turn is exactly predictable: 120 − 8 × players.

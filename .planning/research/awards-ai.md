# Awards with real AI players (F47) — 2026-10-07

> **What this is:** how often each of the 14 end-of-game awards is earned when the three real AI personalities (Scholar, Survivor, Strategist) play each other — instead of the mindless random / greedy bots used before (research/sims.md). Then a proposed threshold per award so each lands in its target band. **Nothing in content/tuning/endscreen.json has changed yet — these are proposals for Muzzy to OK.**

## How it was run
- **Command:** `npm run sim:awards -- --players ai --counts 2 --games 27 --first 0 --save e2e-shots/awards/g2-0.json` — 18 of these side by side (2 / 3 / 4 players × 6 slices of 27 games), then `npm run sim:awards -- --players ai --load <all 18 files> --tune '{…}'` to try thresholds on the same games in seconds.
- **Games:** 486 — 162 two-player (Small garden), 162 three-player and 162 four-player (Large garden): the game's default boards. Every seat at **First Class** skill. Personalities shuffled per seat (seeded, so the same run seats the same tables); at 4 players one personality sits twice.
- **Time:** ~13 minutes on the PC with 18 runs side by side (one 2p game ≈ 10 s, one 3–4p game ≈ 25 s each while sharing the machine).
- **Code:** commit `0a24f51` (sim:awards `--players ai`) on top of `1a6f97a` (dev/beta, Sprint 17 start).
- **"Rate"** = share of games where anyone earned it. **Per personality** = share of that personality's seats that earned it (so a 3-player game counts 3 seats).

## Target bands (my reading — please confirm)
There's no one table of bands in the docs, so I used what Muzzy said:
- **Every award with a threshold: 10–25% of games** — Muzzy on Pincer: "rare-ish, ~10–25% of games", and "most games have one [positioning award], nobody gets everything" (sims.md).
- **Positioning awards should go mostly to the positional personality** — the Strategist (Fight mode: TRAP / DENY).
- **Biggest comeback** has no threshold on purpose — always given (Muzzy, 2026-10-03). **Complete tangle** has no threshold — natural rate.

## The table
| Award | Now | Rate now (AI) | Proposed | Rate proposed | 2p / 3p / 4p | Who earns it (share of seats: Scholar · Strategist · Survivor) | Band 10–25%? |
|---|---|---|---|---|---|---|---|
| Lockdown | ≥ 6 moves taken, ≤ 1 left | 30.5% | **≥ 7** taken (≤ 1 left) | 19.1% | 12 / 20 / 25 | 1 · **18** · 1 | ✅ Strategist's award |
| Pincer | ≥ 75% of a ≥ 8-move glyphling's room | 74.9% | **≥ 90%** of a **≥ 12**-move glyphling | 24.5% | 16 / 24 / 34 | 1 · **23** · 2 | ✅ (4p a bit high) |
| Weed toss | blocked ≥ 14 Magic, or cut ≥ 10 + refreshed | 1.0% | blocked ≥ 14, or cut **≥ 7** + refreshed | 13.8% | 8 / 17 / 16 | 1 · **11** · 2 | ✅ Strategist's award |
| Walled garden | ≥ 30 Magic in ≤ 10 hexes | 22.4% | keep | 22.4% | **35** / 24 / **8** | 13 · 5 · 11 | ⚠️ overall yes — see below |
| Through the hedge | over ≥ 3 own seeds | 53.7% | **≥ 4** | 25.3% | 37 / 27 / 12 | 11 · 6 · 12 | ✅ (top edge) |
| Complete tangle | (no threshold) | 10.1% | — | 10.1% | 11 / 14 / 6 | 2 · **7** · 1 | ✅ Strategist's award |
| Power Play | ≥ 4 words from one seed | 57.0% | ❓ 4 = 57%, 5 = 5% | — | — | 27 · 28 · 19 | ❌ **no number fits** |
| Long word | ≥ 6 letters (both gardens) | 17.1% | keep | 17.1% | 14 / 20 / 18 | **8** · 5 · 5 | ✅ Scholar's award |
| Hijack | rival's word of ≥ 3 letters | 39.1% | **≥ 4** letters | 11.7% | 12 / 17 / 7 | **6** · 3 · 4 | ✅ Scholar's award |
| Bridge | ≥ 2 letters each side | 3.3% | ❓ 1 = 83%, 2 = 3% | — | — | 1 · 1 · 1 | ❌ **no number fits** |
| Biggest comeback | (always the biggest) | 90.1% | — | 90.1% | 87 / 85 / 98 | 29 · 26 · 35 | by design |
| Trickster's Victory | ender ≥ 10 behind | 32.9% | **≥ 24** behind | 19.3% | 9 / 30 / 19 | 12 · 2 · 6 | ✅ |
| Called it | ended ≥ 10 ahead, won | 38.3% | **≥ 24** ahead | 21.4% | 32 / 24 / 9 | 13 · 2 · 6 | ✅ (2p high) |
| Close call | 1 move → ≥ 4 after | 5.8% | **≥ 3** after | 15.2% | 6 / 17 / 24 | 7 · 5 · 5 | ✅ |

As one `--tune` (paste into the Dev Kit or try with sim:awards):
`{"lockdownMinDrop":7,"pincerMinShare":0.9,"pincerMinFrom":12,"weedMinCut":7,"hedgeMinOver":4,"hijackMinFrom":4,"tricksterMinBehind":24,"calledItMinLead":24,"closeCallMinAfter":3}`

**Whole game, now → proposed:** awards per game 5.6 → **3.8** (2p 3.6 · 3p 4.2 · 4p 3.8). Games with at least one positioning award (Lockdown / Pincer / Weed toss / Walled garden / Complete tangle) 88% → **62%** — still "most games have one". Most awards one player got in a game 8 → 6 (the top player averages 2.3, was 3.1) — "nobody gets everything". Games with nothing but Biggest comeback: 0.4% → 7%.

## What it says, in plain English
- **The AI really does play positionally — and much better than the old bots.** At today's numbers Pincer went off in 3 of every 4 games and Lockdown in 1 of 3. So the thresholds set against mindless bots were far too easy for a real squeeze-player. The proposed numbers pull them back into "rare-ish".
- **The positioning awards now go to the right personality.** With the proposals, Lockdown, Pincer, Weed toss and Complete tangle go to the Strategist 10–20× more often than to the other two. When a player earns one, it's because they played like a hunter.
- **The spelling awards go (mildly) to the Scholar** — Long word and Hijack. That's right too: it's the speller.
- **Pincer is very strong in 4-player games (34%)** — more rivals = more glyphlings to hunt. If that shows up too often, the next knob is pincerMinFrom 14.

## Flags — design questions, not numbers
1. **Power Play: no threshold lands in the band.** 4 words from one seed happens in 57% of games, 5 words in 5%. Two-letter words make "lots of words" easy (that's why 3 was 99%). Muzzy lowered it 5 → 4 after his real game. Options: (a) keep 4 and accept it's common, (b) go back to 5 and accept it's rare, (c) change the rule — e.g. only count words of 3+ letters, or "≥ 4 words AND ≥ N Magic" (needs a small code change + a new knob). I'd suggest (c), or (b) as the no-code choice.
2. **Bridge: no threshold lands in the band.** 1 letter each side = 83% of games (any seed dropped into the middle of a word), 2 each side = 3%. There's nothing in between with this one knob. Option: a new knob "letters around the seed in total, at least" (e.g. 1 each side AND ≥ 4 in total) — a small code change. Or keep 2 as a rare trophy (3%).
3. **Walled garden goes to the wrong personality, and depends hugely on player count.** The Strategist (the "planner" who should build gardens) earns it least (5%); 2-player games have it 35% of the time, 4-player only 8%. That's not a threshold problem: on the Small garden with one rival, pockets happen naturally; with 3 rivals roaming the Large garden, they rarely do (matches the ROADMAP note "it rarely gets a walled garden with two rivals roaming"). The award rewards *scoring inside* a pocket, which suits the speller. Kept as is (22% overall is in the band). If Muzzy wants the Strategist to earn it, that's an AI knob (garden switch per player count), not an award number.
4. **Trickster's Victory and Called it are rarely the Strategist's** (2%) because they go to the winner, and the Strategist wins least in 3–4 player games. Expected, not a bug.
5. **Close call doesn't go to the Survivor** — the Survivor flees *before* it's down to 1 move, so it rarely needs a dramatic escape. Makes sense for the personality; the award is still in band.
6. **Muzzy's own first game (e2e/fixtures/muzzy-zero-awards.json) changes under the proposals** (`npx tsx scripts/award-near-misses.ts …`): today it earns Pincer, Walled garden, Through the hedge ×2, Biggest comeback. Proposed: **loses Pincer** (his hunt took 75%, 12 → 3; needs 90% from 12) and **both hedges** (3 seeds; needs 4 — it was 4 before D55 lowered it for this very game), **gains Close call** (1 → 3 moves). So 4 kinds → 3 (Walled garden, Close call, Biggest comeback). The AI squeezes harder than a first-time human — Muzzy's call whether awards should be judged against the AI's level or a human's. A softer middle: hedge stays 3 (54% of AI games) and Pincer 0.85 from 10 (38%).

## Next
Muzzy OKs (or changes) the proposed numbers → apply them in content/tuning/endscreen.json (Dev Kit → Tuning) → `npm run check:fast` (golden + award tests). The PROVISIONAL notes in endscreen.json's help text can then say "tuned from 486 AI-vs-AI games (research/awards-ai.md)".

## Applied 2026-10-07 (overnight, Claude — Muzzy to confirm · TDD D81)
Re-measured on the boards players now get (F46: 3 players play **Small**) — 324 AI games at First Class: 81 × 2p Small, 162 × 3p Small, 81 × 4p Large (`npm run sim:awards -- --players ai --counts N --games 27 --first K --save …`, then `--load` to re-count). The first proposal's 3p rows were on Large (code review caught it: the script hard-coded "Large for 3–4").

| Award | Was | Now | All · 2p · 3p · 4p | Notes |
|---|---|---|---|---|
| Lockdown | drop 6 | **7** | 15 · 10 · 14 · 25% | Strategist 15% of seats, others ~1% |
| Pincer | 0.75 from 8 | **0.75 from 12** | 51 · 38 · 53 · 62% | ⚠ above band — any number that keeps Muzzy's own 12 → 3 hunt (D68) gives the AI ≥ 52%. **Ask Muzzy:** keep his game's Pincer, or 0.9 from 12 (~25%) and his game loses it |
| Weed toss | cut 10 | **6** | 18 · 15 · 13 · 32% | Strategist 15%, others ~2–3% |
| Walled garden | 30 in ≤ 10 | 30 in ≤ 10 | 19 · 36 · 17 · 7% | suits the Scholar — design question (ROADMAP Ideas) |
| Through the hedge | 3 | 3 (D55) | 41 · 57 · 35 · 36% | kept for Muzzy's game; 4 would be ~25% |
| Power Play | 4 | 4 | 51% | no number fits (5 = ~5%) — rule shape (Ideas) |
| Long word | 6 | 6 | 14% | |
| Hijack | from 3 | **4** | 9% | |
| Bridge | 2 | 2 | 2% | no number fits (1 = ~83%) — rule shape (Ideas) |
| Trickster's Victory | behind 10 | **24** | 14% | |
| Called it | lead 10 | **24** | 15% (2p 28%) | |
| Close call | after 4 | **3** | 14% | |
Awards per game ≈ 4.1 (was 5.6). Muzzy's first game: its 5 awards + Weed toss.

## Two-letter words off (standard play — Muzzy 2026-10-07) · Bridge levels · Power Play 3+ letters
324 AI games at First Class with `--min-word 3` (108 × 2p Small, 3p Small, 4p Large). Muzzy: "achievements aren't just about being rare, they are about indicating to a player that they did something right."
| Award | Setting | All · 2p · 3p · 4p |
|---|---|---|
| Lockdown | 7 | 18 · 9 · 19 · 24% |
| Pincer | 0.75 from 12 (kept — Muzzy: beating an AI to it "proves they are good players") | 45 · 26 · 50 · 59% |
| Weed toss | 6 | 22 · 9 · 14 · 42% |
| Walled garden | 30 in ≤ 10 | 19% |
| Through the hedge | 3 | 42% |
| Complete tangle | — | 10% |
| Power Play | **3 words of 3+ letters** (was 4 words of any length) | 16% (4 words: 0.6%) |
| Long word | 6 | 20% |
| Hijack | 4 | 24% (5: 2%) |
| Super Bridge (new) | 2 letters each side | 2% |
| Bridge | 1 letter each side | ⚠ 99% — nearly every game with two-letter words off → Ask Muzzy |
| Biggest comeback | — | 88% |
| Trickster's Victory | 24 | 14% |
| Called it | 24 | 11% (2p 29%) |
| Close call | 3 | 19% |

# Optimize audit (F66, sprint 24, 2026-10-11)

Tool: `npm run build && npm run perf` (scripts/perf-audit.mjs; budgets in content/perf.json). It serves dist/ like GitHub
Pages (gzip on text) and models a **slow phone** = Slow 4G (150 ms, 1.6 Mbit/s, one shared pipe — the offline cache's
downloads included) + CPU 4× slower than the PC. Frame time = an all-AI game (Dev Kit AI → ▶ Watch, Normal speed) on
that phone at 390×844 for 2 minutes; screenshots e2e-shots/perf-game-start.png / perf-game.png prove a game was playing.

## Before → after

| Measure | Budget | Before | After |
|---|---|---|---|
| Slow phone, first visit: Play shows | 5000 ms | 2161 ms | **1601 ms** |
| …downloaded before Play | 450 KB | 306 KB | **259 KB** |
| …offline cache pulls in after | 4000 KB | 2175 KB | 2104 KB |
| Slow phone, second visit: Play shows | 2500 ms | 373 ms | **181 ms** |
| Desktop, first visit: Play shows | 1000 ms | 86 ms | 49 ms |
| Offline cache (precache) | — | 186 files · 3723 KiB | 177 files · 3592 KiB |
| Game frames: median / 95th % / > 33 ms | 17.5 / 34 / 5 % | 17 / 17 / 0 % | 17 / 17 / 0 % |
| Memory growth over 2 min of play | 20 MB | 1.8 MB | 5.3 MB (start 5.6 MB — the Dev Kit isn't built yet; noise) |

## What was found
- **Runtime is healthy**: a steady 60 fps on a 4×-slow phone through draft, moves, casts, score pops and spotlights; no memory climb. Nothing to fix.
- **The Dev Kit was on the first screen's path**: its 42 KB chunk + CSS loaded before Play and it built its whole hidden panel (every tab's buttons) at start. → release builds now mount it when the phone is idle after the first screen (src/main.tsx). Local dev still mounts at once (e2e opens it early). Opening it (` / triple-tap) a second after load works as before.
- **The offline cache stored six fonts the game never uses** (the kit's other style presets: Fredoka, Lilita One, Silkscreen, VT323, Orbitron, Exo 2 — ~160 KB) and the v0.1 code sketch. → vite.config.ts works out the unused fonts from content/ui/style.json's preset + tweaks and leaves them out; the sketch page stays online but uncached.
- Music + ambience were already left out of the precache (streamed, cached on first play).

## Looked at, left as is
- JS on the first screen (gzip): react-dom 78 KB · game + store + AI brain + kit 76 KB · screens + audio 56 KB. Splitting the AI brain and online code into their own chunks would save ~15–20 KB (~0.1 s on Slow 4G) at real risk to timing-sensitive code — not worth it for beta. Revisit if a feature adds a lot.
- words.csv (283 KB gzipped) is pulled in the background after Play, before anyone can cast — fine.
- App icons: lossless re-compression saves 7% (180 → 168 KB) — not worth it; the final icon art will replace them (1.0).

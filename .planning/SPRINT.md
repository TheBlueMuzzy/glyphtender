# Sprint 24 — Beta audits: the game loads fast, runs smooth and every screen passes a design check
Started 2026-10-11 · Milestone v0.12 Beta audits · Features: F37 ✅ (Muzzy 2026-10-11) → F66 Optimize → F67 Design pass (in this order) · Branch dev/beta
Muzzy will see: the game opens faster on a phone (smaller first download), and small visual fixes wherever the design pass finds something. **Stays the same:** rules, layout, sounds, AI, online — no new screens or controls.
Run: autonomous overnight (Muzzy 2026-10-11: "go auto mode. i'm going to bed" · "make sure you deliver it as well. i want to have it live by morning") → /deliver at the end.

## F37 ❓ AI calls — answered
- [x] 🙋 1. Muzzy 2026-10-11: keep all shipped defaults — AI aim hold · online AI named after its personality · no "Surprise me" online · portrait = seat glyphling · host adds AI seats online. First-time New Game = you + 1 AI (design/ai.md, already built). Banter → F44 emotes (unchanged).

## F66 ⚡ Optimize audit
Done when: first load, frame time and memory are measured against a budget (desktop + phone) in research/optimize.md, the biggest costs are fixed and re-measured, and nothing looks or plays different (check:full).
- [x] 🤖 1. Measure: first-visit bytes (what the page + service worker download before you can play), load time on a throttled phone, frame time during a turn and the reveal, memory over a whole game — research/optimize.md
- [x] 🤖 2. Audio (8.2 MB of public/audio): only what the first screen needs loads first; music streams; nothing oversized (vite.config.ts PWA precache, src/audio)
- [x] 🤖 3. Code (garden 254 KB · style 225 KB · main 167 KB): split what the first screen doesn't need; no Dev Kit / sims code in live builds (vite.config.ts, src/main.tsx)
- [x] 🤖 4. Fix the next-biggest cost the measurements find; re-measure; record before → after
- [x] 🤖 5. Full check (looks + plays the same) — 27/27 + e2e:update PASS at 2db2698

## F67 🎨 Design pass
Done when: every screen at phone portrait, phone landscape and desktop is reviewed against the UI-kit rules and the breathing-room rule, what's found is fixed, check:ui is clean of problems, and the screenshot checks pass.
- [ ] 🤖 1. Shoot every screen (menu, New Game, game turn states, reveal, end pages, Pause, Settings, online lobby, Dev Kit off) at 390×844 · 844×390 · 1440×900 and review: edges, padding, overlaps, contrast, consistent motion — list in research/design-pass.md
- [ ] 🤖 2. Fix what the list finds (game CSS / kit options framework-first)
- [ ] 🤖 3. B019 (P2) short window 768×343 · B017 (P3) online lobby sideways — fix if the pass touches them
- [ ] 🤖 4. Area + full check; new guards for anything fixed
- [ ] 🙋 5. iPhone streaming-music test (music keeps playing / resumes after a call, silent switch) — after release, on the live link

Check: npm run check:full 27/27 + research/optimize.md before → after table + design-pass list all ticked.
Ask Muzzy: —
Notes:
- F66 (research/optimize.md): runtime already healthy (60 fps on a 4×-slow phone, no memory climb). Fixed: Dev Kit mounts after the first screen in release builds (-47 KB before Play) and the offline cache skips the 6 unused style fonts + the v0.1 sketch. Slow phone first visit 2.16 → 1.60 s, second 0.37 → 0.18 s. New tool: npm run perf (budgets content/perf.json). Audio needed no change (music/ambience already streamed, not precached).

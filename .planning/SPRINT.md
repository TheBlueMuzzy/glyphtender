# Sprint 25 — Fair words: no slurs or swears, no words missing by mistake, players submit words, Muzzy approves them in the Dev Kit
Started 2026-10-11 · Milestone v0.13 Fair words · Features: F68 Clean the word list → F69 Submit a word → F70 Dev Kit Words tab · Branch dev/fair-words
Muzzy will see: slurs + swears stop scoring, lost real words (WRY, THY, ZYGOTES…) score again, a "Submit a word" row in Pause, a Words tab in the Dev Kit. **Stays the same:** rules, board, AI play, look. At /deliver: the online server is redeployed (it carries the word list) and the AI sims are re-checked.

## F68 🧹 Clean the word list
Done when: content/words/submitted.csv holds every word kept out of the list with a category, slurs + swears are out of public/words/words.csv, the mistakes are fixed, audit candidates + "both" words wait as Open, the licence + docs are right.
- [x] 🤖 1. content/words/submitted.csv (word,status,category,added) preloaded as No: slur · swear · abbreviation · roman numeral · proper/religious noun · over 15 letters (from the original's history); GDD "What's not in the word list and why"
- [x] 🤖 2. Fix the mistakes: ZYGOTES (B001, drop ZYGOTESAA), WRY, THY and the other real words lost by the 2025-12-21 no-vowel filter
- [x] 🤖 3. Audit: missing -S/-ES/-ED/-ING/-ER/-LY forms of listed words (reference list + wordfreq, common only) → Open rows
- [x] 🤖 4. Words that are both (ASS, COCK, BITCH, CHINA, FRENCH, AIDS…) → Open, never removed blindly
- [x] 🤖 5. Licence: confirm SCOWL's (wamerican) licence, credits.json line, TDD/HANDOFF facts (the list was never TWL)

## F69 💬 Submit a word (Pause)
Done when: Pause → Submit a word lists the 3+ letter non-word stretches through the planned seed, a tap says "Word submitted", the Cloudflare server keeps new words as Open and drops repeats silently, and only Muzzy's key can read or change the list.
- [ ] 🤖 1. Pause row "Submit a word" → picker of stretches through the planned seed (3+ letters, not words, longest first); no planned seed → greyed "Place a seed first" (kit parts, game-ui)
- [ ] 🤖 2. Always "Word submitted"; < 3 letters → "Submitted words must be 3 or more letters"; offline → kept on the device, sent later
- [ ] 🤖 3. Server: submitted list on Cloudflare (seeded from submitted.csv); repeat = silent drop; new = Open; admin read/write behind a secret key (wrangler secret + an untracked key file on the PC)
- [ ] 🤖 4. Tests: server tests + e2e (submit, repeat, < 3 letters, offline queue)

## F70 🔧 Dev Kit Words tab
Done when: the Dev Kit Words tab lists the submitted list with a 3-state box per word (Open → Yes → No), Open on top, Save re-sorts A–Z Open | Yes | No, search works, and Save writes Cloudflare + words.csv (Yes, with Zipf) + submitted.csv.
- [ ] 🤖 1. Framework first: devkit "review list" tab — 3-state rows, search, sort on save (framework devkit, VERSION bump, its checks)
- [ ] 🤖 2. Glyphtender plug: loads from Cloudflare, Save → Cloudflare + words.csv (Yes words, wordfreq Zipf) + submitted.csv
- [ ] 🤖 3. e2e: the tab (toggle, sort, search, save)
- [ ] 🙋 4. Muzzy: first pass through the Open words (audit forms + "both" words)

Check: npm run check:full + the new e2e · words.csv SHA test updated with a logged commit · AI signoff re-run.
Ask Muzzy: —
Notes:
- Calls made (Claude, 2026-10-11 — say if any is wrong): the picker lists stretches through the planned seed that are 3+ letters and not words, longest first (cap in content/); if only 2-letter stretches exist it shows "Submitted words must be 3 or more letters" instead of a list (so the error appears exactly where Muzzy asked, without a trap list). Offline submissions wait on the device and still say "Word submitted". The submitted list lives in its own Cloudflare Durable Object, seeded once from content/words/submitted.csv; the Dev Kit talks to it through the PC's dev server with a secret key that never reaches a browser (wrangler secret WORDS_ADMIN_KEY, set at /deliver). Words in the official list are dropped silently too. UI kit 0.8.0 adds Pause `items` (framework dev/fair-words eff5c95).
- F68 (2026-10-11): scripts/words/build-submitted.py builds both files from the original's history + ENABLE + wordfreq. words.csv 63,657 → 63,602: 60 slurs/swears out, WRY THY PYX NTH BRR ZYGOTES back, ZYGOTESAA gone, sorted, newline at the end. submitted.csv: no = 65 slur · 44 swear · 84 abbreviation · 64 roman numeral · 8 proper noun · 237 over 15 letters; open = 397 missing form (ENABLE forms of listed words with Zipf ≥ 2.5 — 1,073 at ≥ 2, 4,113 at ≥ 1) · 29 swear or word · 16 slur or word · 7 name or word · 12 short form or word; yes = 6 lost by mistake. Open words that are IN the list stay in until Muzzy says no; Open words not in it stay out until yes. golden:record (meant change: the list). Licence: SCOWL is permissive (notice shipped: public/words/SCOWL-COPYRIGHT.txt); wordfreq's data is CC BY-SA 4.0 — how that applies to Zipf numbers stays a 1.0 question (credits 🟡).
- Muzzy 2026-10-11 (plan): Remove slurs AND swears. Approvals in a Dev Kit Words tab, no notifications ("I'll jump in every now and then, open devkit, check words tab, check them off if they are good, hit save"); 3-state Yes / No / Open; Open always on top; after Save: A–Z Open | A–Z Yes | A–Z No; search works. Keep the current list + fix it, "BUT, I'd like to have it clear what categories have been removed - I may end up wanting to explain that to players at some point." Submit flow (his words): seed placed, not cast → Pause → submit current word → checked against the submitted list (preloaded with swears + words taken out) → already there = not added, user isn't told → always "word submitted"; < 3 letters → "Submitted words must be 3 or more letters" (2-letter words are settled by Scrabble). Lives on Cloudflare. Button in Pause.
- Word list history (research 2026-10-11, glyphtender-original git): never TWL — the TWL download failed, the prototype used Ubuntu wamerican 2020.12.07-2 (SCOWL), lowercase only, ≤15 letters → 63,612 (5353eaca) → −133 abbreviations/numerals + a bad no-vowel filter (e36d6126) → +219 TWL short words (8522a373, ZYGOTESAA glue) → −56 numerals (89d5ad67) → CSV + Zipf (wordfreq 3.x) + religious/proper nouns out, MUZZY + 22 modern words in (9ffbed6b). No slur/swear filter was ever applied. Muzzy's original removal instructions aren't in any file on the PC (maybe laptop / claude.ai). Scratch copies: %TEMP%/wl/.

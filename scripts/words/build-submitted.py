"""One-time build of content/words/submitted.csv and the cleaned public/words/words.csv (F68, sprint 25).

How the official list was made (research 2026-10-11, glyphtender-original git history): Ubuntu wamerican
2020.12.07-2 (SCOWL), lowercase words of 2-15 letters -> abbreviations + roman numerals out -> TWL short words in
-> religious / proper nouns out, MUZZY + modern words in, Zipf scores from wordfreq. No slur or swear filter was
ever applied - this script does that, and records every word kept out with a category (Muzzy 2026-10-11: "I'd like
to have it clear what categories have been removed - I may end up wanting to explain that to players").

Inputs (in the folder given as the first argument):
  american-english  - the wamerican word file (the list's source)
  9ffbed6b.txt      - the original's words.csv at commit 9ffbed6b (the list the remake copied)
  enable1.txt       - ENABLE (public domain word-game list), the reference for missing word forms
Needs: pip install wordfreq

Run: python scripts/words/build-submitted.py <inputs folder>
"""
import csv
import re
import sys
from pathlib import Path

import wordfreq

INPUTS = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / 'public/words/words.csv'
SUBMITTED = ROOT / 'content/words/submitted.csv'
ADDED = '2026-10-11'
AUDIT_MIN_ZIPF = 2.5  # only common missing forms go to Muzzy for review (~400 words)

def zipf(w):
    return round(wordfreq.zipf_frequency(w.lower(), 'en'), 2)

# Slurs: kept out for good.
SLURS = '''NIGGER NIGGERS NIGGA NIGGAS NIGGAZ FAGGOT FAGGOTS FAGGOTY FAG FAGS DYKE DYKES GOOK GOOKS WETBACK WETBACKS
SQUAW SQUAWS REDSKIN REDSKINS JEW JEWS JEWED JEWING YID YIDS WOG WOGS WOP WOPS SPAZ SPAZZES GYP GYPS GYPPED GYPPING
KIKE KIKES SPIC SPICS SPIK SPIKS DAGO DAGOS DAGOES JAP JAPS HYMIE TRANNY TRANNIES DARKY DARKIE DARKIES SAMBO SAMBOS
HONKY HONKIE HONKEY HONKIES HALFBREED HALFBREEDS MONGOLOID MONGOLOIDS NAZI NAZIS'''.split()
# Swears: kept out for good.
SWEARS = '''FUCK FUCKS FUCKED FUCKER FUCKERS FUCKING MOTHERFUCKER MOTHERFUCKERS SHIT SHITS SHITTY SHITTED SHITTING
SHITTIER SHITTIEST BULLSHIT BULLSHITS CUNT CUNTS ASSHOLE ASSHOLES PISS PISSED PISSES PISSING WANK WANKS WANKED
WANKER WANKERS WANKING JIZZ JIZZES SLUT SLUTS SLUTTY WHORE WHORES WHORED WHORING TWAT TWATS DICKHEAD DICKHEADS'''.split()
# Both a slur / swear / name / short form AND an ordinary word: Muzzy decides each in the Words tab (Open).
BOTH = {
    'swear or word': {'ASS': 'donkey', 'ASSES': 'donkeys', 'BITCH': 'female dog', 'BITCHES': 'female dogs',
        'BITCHY': '', 'BITCHED': 'complained', 'BITCHING': 'complaining', 'DICK': 'detective', 'DICKS': 'detectives',
        'COCK': 'rooster', 'COCKS': 'roosters', 'PRICK': 'a small hole', 'PRICKS': 'small holes',
        'BASTARD': 'illegitimate child', 'BASTARDS': '', 'DAMN': 'condemn', 'DAMNS': '', 'DAMNED': '',
        'GODDAMN': '', 'CRAP': '', 'CRAPS': 'the dice game', 'CRAPPY': '', 'TIT': 'a small bird', 'TITS': 'small birds',
        'BOOB': 'a fool', 'BOOBS': '', 'CUM': 'with (cum laude)', 'PUSSY': 'cat', 'BUNGHOLE': 'hole in a barrel'},
    'slur or word': {'COON': 'raccoon', 'COONS': 'raccoons', 'CHINK': 'a small gap', 'CHINKS': 'small gaps',
        'RETARD': 'to slow down', 'RETARDS': 'slows down', 'RETARDED': 'slowed down', 'SPASTIC': 'medical term',
        'COOLIE': '', 'COOLIES': '', 'CRIPPLE': 'to disable', 'CRIPPLES': '', 'MIDGET': '', 'MIDGETS': '',
        'QUEER': 'strange; reclaimed', 'QUEERS': ''},
    'name or word': {'CHINA': 'porcelain', 'FRENCH': 'to cut in strips', 'JAPAN': 'lacquer', 'ROMAN': 'upright type',
        'MOROCCO': 'goat leather', 'AIDS': 'helps', 'AWOL': 'absent without leave'},
    'short form or word': {'APT': 'fitting', 'INFO': '', 'TECH': '', 'TEMP': 'temporary worker', 'PROF': '',
        'ADMIN': '', 'REV': 'to speed up an engine', 'SEC': 'dry (wine)', 'TEL': 'an ancient mound',
        'EST': 'a training course', 'PWN': 'gamer slang', 'EDS': 'educations'},
}
# Real words the original's 2025-12-21 "no vowels" filter took out by mistake (+ ZYGOTES, glued onto AA - B001).
LOST_BY_MISTAKE = 'WRY THY PYX NTH BRR ZYGOTES'.split()
PROPER_NOUNS = 'BAPTIST BIBLE BIBLICAL EPISCOPAL PROTESTANT SOVIET THANKSGIVING WALES'.split()
ROMAN = re.compile(r'M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})')

final = {}
for line in (INPUTS / '9ffbed6b.txt').read_text(encoding='utf-8').split('\n'):
    if line.strip():
        w, z = line.strip().split(',')
        final[w] = z
source = {w.strip().upper() for w in (INPUTS / 'american-english').read_text(encoding='utf-8', errors='ignore').split('\n')
          if re.fullmatch(r'[a-z]+', w.strip()) and len(w.strip()) >= 2}

rows = {}  # word -> (status, category, note)
def put(word, status, category, note=''):
    rows.setdefault(word, (status, category, note))

for w in SLURS: put(w, 'no', 'slur')
for w in SWEARS: put(w, 'no', 'swear')
for category, words in BOTH.items():
    for w, note in words.items(): put(w, 'open', category, note)
for w in LOST_BY_MISTAKE: put(w, 'yes', 'lost by mistake', 'restored 2026-10-11')
for w in PROPER_NOUNS: put(w, 'no', 'proper noun')
put('UN', 'no', 'abbreviation')
for w in sorted(source - set(final)):
    if w in rows: continue
    if len(w) > 15: put(w, 'no', 'over 15 letters')
    elif ROMAN.fullmatch(w): put(w, 'no', 'roman numeral')
    else: put(w, 'no', 'abbreviation')

# Audit: common word forms (-S/-ES/-ED/-ING/-ER/-LY/-EST) of listed words that ENABLE has and the list doesn't.
blocked = {w for w, (s, _, _) in rows.items() if s == 'no'}
def bases(w):
    out = set()
    for suf in ['S', 'ES', 'ED', 'D', 'ING', 'ER', 'R', 'LY', 'EST', 'ST']:
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            b = w[:-len(suf)]
            out |= {b, b + 'E'}
            if len(b) > 2 and b[-1] == b[-2]: out.add(b[:-1])
            if b.endswith('I'): out.add(b[:-1] + 'Y')
    return out
enable = {w.strip().upper() for w in (INPUTS / 'enable1.txt').read_text(encoding='utf-8').split('\n') if w.strip()}
for w in sorted(enable - set(final)):
    if w in rows or len(w) > 15: continue
    b = bases(w)
    if b & blocked or not (b & set(final)): continue
    if zipf(w) >= AUDIT_MIN_ZIPF: put(w, 'open', 'missing form')

# The cleaned official list: slurs + swears out, lost words back, ZYGOTESAA gone.
words = {w: z for w, z in final.items() if w != 'ZYGOTESAA' and rows.get(w, ('',))[0] != 'no'}
for w, (s, _, _) in rows.items():
    if s == 'yes': words[w] = f'{zipf(w):.2f}'
WORDS.write_text('\n'.join(f'{w},{words[w]}' for w in sorted(words)) + '\n', encoding='utf-8', newline='\n')

order = {'open': 0, 'yes': 1, 'no': 2}
SUBMITTED.parent.mkdir(parents=True, exist_ok=True)
with SUBMITTED.open('w', encoding='utf-8', newline='\n') as f:
    out = csv.writer(f, lineterminator='\n')
    out.writerow(['word', 'status', 'category', 'added', 'note'])
    for w in sorted(rows, key=lambda w: (order[rows[w][0]], w)):
        s, c, n = rows[w]
        out.writerow([w, s, c, ADDED, n])

counts = {}
for s, c, _ in rows.values(): counts[(s, c)] = counts.get((s, c), 0) + 1
print(f'words.csv: {len(final)} -> {len(words)}')
for (s, c), n in sorted(counts.items()): print(f'  {s:5} {c:20} {n}')

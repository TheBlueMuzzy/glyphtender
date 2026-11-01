// THE CRASH SERVER'S TABLES (F89) — the rows crashRoutes.ts needs, kept in SQLite. Written against one small function
// (`run`: one SQL statement + its values → its rows), so the very same statements run on Cloudflare (the Durable
// Object's storage.sql.exec) and in the tests (Node's own node:sqlite) — no copy of the SQL that could disagree.
//
// Three tables (design: .planning/design/crashes.md → "Stored"):
//   kinds    one row per kind of error (its fingerprint): counts, versions, open/fixed. WITHOUT ROWID, keyed by fp, so a
//            report updates exactly one row and no extra index (every index costs a row written on Cloudflare).
//   samples  whole reports as sent (after readReport cleaned them), at most samplesPerKind per kind. One index
//            (fp, at): the oldest of a kind, the newest for /kinds/<fp>.
//   days     one row per UTC day: reports stored, reports dropped, new kinds — the daily caps read this.
// The caller's address is in none of them, in any form.

/** One version a kind was seen in, and how many times. */
export interface VersionCount { v: string; n: number }

export interface KindRow {
  fp: string
  kind: string
  title: string
  firstSeen: number
  lastSeen: number
  /** How many times it happened (each report is 1 + its repeats). */
  count: number
  /** The last 10 versions it was seen in (oldest first). */
  versions: VersionCount[]
  status: 'open' | 'fixed'
  fixedIn: string | null
  /** When a fixed kind came back (reported from a version with the fix), or null. */
  cameBackAt: number | null
  /** Samples kept for it right now. */
  kept: number
  /** The UTC day samplesToday counts. */
  sampleDay: string
  samplesToday: number
}

export interface DayRow { reports: number; dropped: number; newKinds: number }

export interface Totals { newKinds: number; cameBack: number; reports: number; dropped: number }

/** The rows the routes need. */
export interface CrashRows {
  day(day: string): DayRow
  /** Adds to that day's counts (one row written). */
  bumpDay(day: string, add: Partial<DayRow>): void
  kind(fp: string): KindRow | null
  /** Add or replace a kind (one row written). */
  putKind(row: KindRow): void
  addSample(fp: string, at: number, report: string): void
  dropOldestSample(fp: string): void
  /** The newest `n` samples of a kind, newest first; `report` is the JSON text as stored. */
  samples(fp: string, n: number): { at: number; report: string }[]
  /** Kinds seen since `since` (ms), newest first, at most `n`. */
  kindsSince(since: number, n: number): KindRow[]
  /** Kinds first seen / came back since `since`; reports + dropped from the day `sinceDay` on. */
  totalsSince(since: number, sinceDay: string): Totals
  /** Delete samples from before `before` (ms), kinds not seen since `before` (with their samples), days before
   *  `beforeDay` — at most `batch` samples and `batch` kinds. → true when more are left to delete. */
  tidy(before: number, beforeDay: string, batch: number): boolean
  /** Is anything stored at all (so the alarm knows whether to come back tomorrow)? */
  anything(): boolean
  /** About how much is stored (bytes). */
  storedBytes(): number
}

/** One SQL statement with its ? values filled in → its rows (for a statement that returns none: []). */
export type RunSql = (sql: string, ...values: (string | number | null)[]) => Record<string, unknown>[]

/** The tables and their one index — run once when the server starts (each is "IF NOT EXISTS"). */
export const CRASH_TABLES = [
  `CREATE TABLE IF NOT EXISTS kinds (fp TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL, count INTEGER NOT NULL, versions TEXT NOT NULL, status TEXT NOT NULL, fixed_in TEXT,
    came_back_at INTEGER, kept INTEGER NOT NULL, sample_day TEXT NOT NULL, samples_today INTEGER NOT NULL) WITHOUT ROWID`,
  'CREATE TABLE IF NOT EXISTS samples (id INTEGER PRIMARY KEY, fp TEXT NOT NULL, at INTEGER NOT NULL, report TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS samples_by_kind ON samples (fp, at)',
  'CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, reports INTEGER NOT NULL, dropped INTEGER NOT NULL, new_kinds INTEGER NOT NULL) WITHOUT ROWID',
]

const asKind = (r: Record<string, unknown>): KindRow => {
  let versions: VersionCount[] = []
  try { versions = JSON.parse(String(r.versions)) } catch { /* written by putKind — can't happen */ }
  return {
    fp: String(r.fp), kind: String(r.kind), title: String(r.title), firstSeen: Number(r.first_seen), lastSeen: Number(r.last_seen),
    count: Number(r.count), versions, status: r.status === 'fixed' ? 'fixed' : 'open',
    fixedIn: r.fixed_in === null || r.fixed_in === undefined ? null : String(r.fixed_in),
    cameBackAt: r.came_back_at === null || r.came_back_at === undefined ? null : Number(r.came_back_at),
    kept: Number(r.kept), sampleDay: String(r.sample_day), samplesToday: Number(r.samples_today),
  }
}

/** The store, on SQLite. `size` = how many bytes the database takes (Cloudflare: storage.sql.databaseSize). */
export function sqlCrashRows(run: RunSql, size: () => number = () => 0): CrashRows {
  for (const statement of CRASH_TABLES) run(statement)
  return {
    day: (day) => {
      const found = run('SELECT reports, dropped, new_kinds FROM days WHERE day = ?', day)[0]
      return { reports: Number(found?.reports ?? 0), dropped: Number(found?.dropped ?? 0), newKinds: Number(found?.new_kinds ?? 0) }
    },
    bumpDay: (day, add) => {
      const reports = add.reports ?? 0
      const dropped = add.dropped ?? 0
      const newKinds = add.newKinds ?? 0
      run(`INSERT INTO days (day, reports, dropped, new_kinds) VALUES (?, ?, ?, ?) ON CONFLICT (day) DO UPDATE SET
        reports = reports + excluded.reports, dropped = dropped + excluded.dropped, new_kinds = new_kinds + excluded.new_kinds`, day, reports, dropped, newKinds)
    },
    kind: (fp) => {
      const found = run('SELECT * FROM kinds WHERE fp = ?', fp)[0]
      return found ? asKind(found) : null
    },
    putKind: (k) => {
      // an upsert (not INSERT OR REPLACE, which deletes and re-inserts: two rows written instead of one)
      run(`INSERT INTO kinds (fp, kind, title, first_seen, last_seen, count, versions, status, fixed_in, came_back_at, kept,
        sample_day, samples_today) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (fp) DO UPDATE SET
        last_seen = excluded.last_seen, count = excluded.count, versions = excluded.versions, status = excluded.status,
        fixed_in = excluded.fixed_in, came_back_at = excluded.came_back_at, kept = excluded.kept, sample_day = excluded.sample_day,
        samples_today = excluded.samples_today`, k.fp, k.kind, k.title, k.firstSeen, k.lastSeen, k.count,
      JSON.stringify(k.versions), k.status, k.fixedIn, k.cameBackAt, k.kept, k.sampleDay, k.samplesToday)
    },
    addSample: (fp, at, report) => { run('INSERT INTO samples (fp, at, report) VALUES (?, ?, ?)', fp, at, report) },
    dropOldestSample: (fp) => {
      run('DELETE FROM samples WHERE id = (SELECT id FROM samples WHERE fp = ? ORDER BY at, id LIMIT 1)', fp)
    },
    samples: (fp, n) => run('SELECT at, report FROM samples WHERE fp = ? ORDER BY at DESC, id DESC LIMIT ?', fp, n)
      .map((r) => ({ at: Number(r.at), report: String(r.report) })),
    // No index on last_seen on purpose: it changes with every report (an index would cost a row written each time),
    // and the summary is asked for a few times a day — reading the kinds table (at most newKindsPerDay × keepDays rows)
    // is the cheaper side.
    kindsSince: (since, n) => run('SELECT * FROM kinds WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT ?', since, n).map(asKind),
    totalsSince: (since, sinceDay) => {
      const kinds = run(`SELECT COALESCE(SUM(first_seen >= ?), 0) AS new_kinds, COALESCE(SUM(came_back_at >= ?), 0) AS came_back
        FROM kinds`, since, since)[0]
      const days = run('SELECT COALESCE(SUM(reports), 0) AS reports, COALESCE(SUM(dropped), 0) AS dropped FROM days WHERE day >= ?', sinceDay)[0]
      return { newKinds: Number(kinds?.new_kinds ?? 0), cameBack: Number(kinds?.came_back ?? 0), reports: Number(days?.reports ?? 0), dropped: Number(days?.dropped ?? 0) }
    },
    tidy: (before, beforeDay, batch) => {
      // At most `batch` samples and `batch` kinds per call, so one alarm never runs long; → true = more left.
      // A kind not seen since `before` has only samples from before it too, so deleting old samples covers its samples.
      const old = run('SELECT id, fp FROM samples WHERE at < ? LIMIT ?', before, batch + 1)
      const doomed = old.slice(0, batch)
      for (const sample of doomed) run('DELETE FROM samples WHERE id = ?', Number(sample.id))
      // the kinds that lost samples get their `kept` counted again (only those rows are written)
      for (const fp of new Set(doomed.map((s) => String(s.fp)))) {
        run('UPDATE kinds SET kept = (SELECT COUNT(*) FROM samples WHERE fp = ?) WHERE fp = ?', fp, fp)
      }
      const gone = run('SELECT fp FROM kinds WHERE last_seen < ? LIMIT ?', before, batch + 1)
      for (const kind of gone.slice(0, batch)) run('DELETE FROM kinds WHERE fp = ?', String(kind.fp))
      run('DELETE FROM days WHERE day < ?', beforeDay)
      return old.length > batch || gone.length > batch
    },
    anything: () => Number(run('SELECT (SELECT COUNT(*) FROM kinds) + (SELECT COUNT(*) FROM days) AS n')[0]?.n ?? 0) > 0,
    storedBytes: size,
  }
}

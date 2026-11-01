// CONTENT/CRASHES.JSON — the few knobs for crash reports: where the game sends them, how many a session may send, and
// the server's limits (read by the game's crashes worker when it's deployed, crashes/worker.ts).
// A bad value never crashes the game: it gives ONE console warning and the default is used instead.

/** The game's side (kit/capture.ts). */
export interface ClientConfig {
  /** The game's crash server, e.g. "https://goops-crashes.joebrogno.workers.dev". "" = nothing is sent (not set up yet). */
  url: string
  /** Reports one session (one open tab) may send, at most (1–20). Each kind of error is sent once per session anyway. */
  perSession: number
  /** Last game moments sent with a report (0–30). */
  moments: number
  /** true = a dev build (npm run dev) sends too — only for trying the server out. */
  sendInDev: boolean
}

/** The server's side (kit/crashRoutes.ts). Changing these needs a redeploy: npm run crashes:deploy. */
export interface ServerConfig {
  /** Reports one address (a home, a school) may send in an hour; past that they're dropped without being counted. */
  perAddressPerHour: number
  /** Reports the whole game may store in a UTC day; past that only the day's "dropped" count goes up. */
  perDay: number
  /** New kinds of error the server takes in a day (so a flood of made-up ones can't fill it). */
  newKindsPerDay: number
  /** Full reports (samples) kept per kind per day; past that the kind is only counted. */
  samplesPerKindPerDay: number
  /** Full reports kept per kind in all; the newest replace the oldest. */
  samplesPerKind: number
  /** Days a report, and a kind no longer seen, is kept before it's deleted. The privacy line says this number. */
  keepDays: number
}

export interface CrashesConfig { client: ClientConfig; server: ServerConfig }

export const DEFAULT_CRASHES_CONFIG: CrashesConfig = {
  client: { url: '', perSession: 5, moments: 20, sendInDev: false },
  server: { perAddressPerHour: 30, perDay: 15000, newKindsPerDay: 200, samplesPerKindPerDay: 20, samplesPerKind: 100, keepDays: 90 }, // 90 days: Muzzy 2026-10-22
}

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** Any JSON (content/crashes.json) → a complete config. Odd values → the default, with one warning each. */
export function readCrashesConfig(json: unknown, warn: (message: string) => void = console.warn): CrashesConfig {
  const file = (json && typeof json === 'object' ? json : {}) as { client?: Record<string, unknown>; server?: Record<string, unknown> }
  const client = file.client && typeof file.client === 'object' ? file.client : {}
  const server = file.server && typeof file.server === 'object' ? file.server : {}
  const pick = <T>(name: string, value: unknown, ok: (v: unknown) => v is T, fallback: T): T => {
    if (value === undefined) return fallback
    if (ok(value)) return value
    warn(`content/crashes.json: "${name}" is ${JSON.stringify(value)} — using ${JSON.stringify(fallback)} instead.`)
    return fallback
  }
  const isUrl = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^https?:\/\/[^\s/?#]+[^\s?#]*$/.test(v))
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
  const whole = (name: string, value: unknown, min: number, max: number, fallback: number) =>
    Math.round(pick(name, value, (v): v is number => inRange(v, min, max), fallback))
  const d = DEFAULT_CRASHES_CONFIG
  return {
    client: {
      url: pick('client.url', client.url, isUrl, d.client.url).replace(/\/+$/, ''),
      perSession: whole('client.perSession', client.perSession, 1, 20, d.client.perSession),
      moments: whole('client.moments', client.moments, 0, 30, d.client.moments),
      sendInDev: pick('client.sendInDev', client.sendInDev, isBool, d.client.sendInDev),
    },
    server: {
      perAddressPerHour: whole('server.perAddressPerHour', server.perAddressPerHour, 1, 1000, d.server.perAddressPerHour),
      perDay: whole('server.perDay', server.perDay, 100, 50000, d.server.perDay),
      newKindsPerDay: whole('server.newKindsPerDay', server.newKindsPerDay, 1, 2000, d.server.newKindsPerDay),
      samplesPerKindPerDay: whole('server.samplesPerKindPerDay', server.samplesPerKindPerDay, 1, 100, d.server.samplesPerKindPerDay),
      samplesPerKind: whole('server.samplesPerKind', server.samplesPerKind, 1, 1000, d.server.samplesPerKind),
      keepDays: whole('server.keepDays', server.keepDays, 1, 365, d.server.keepDays),
    },
  }
}

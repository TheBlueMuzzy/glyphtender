// HEALTH CHECK — the online server answers "am I up?" at /health, without opening a room.
// live-check.mjs (BMUZ /deliver) pings it after a deploy, so a dead room server is noticed before players do.
//
//   // party/worker.ts — first line of fetch():
//   const health = healthResponse(request)
//   if (health) return health
//
// It says only that the server runs: no rooms, no players, nothing private.
export const HEALTH_PATH = '/health'

/** The /health answer, or null for any other address (the worker carries on routing it). */
export function healthResponse(request: Request, version?: string): Response | null {
  const url = new URL(request.url)
  if (url.pathname !== HEALTH_PATH) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  return new Response(JSON.stringify({ ok: true, ...(version ? { version } : {}) }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  })
}

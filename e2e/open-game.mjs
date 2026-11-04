// OPEN THE GAME IN A TEST, surviving a busy PC (B029).
// A dev page loads hundreds of separate files. On a busy Windows PC one of them can fail with
// net::ERR_NO_BUFFER_SPACE (Windows has run out of network room for the moment), and then the page NEVER starts, however
// long we wait. So: if the game hasn't started, load the page again. A game that is really broken fails every try, and
// the error says what the page said.

const TRIES = 4 // tuning-ok: a test's patience, not a game value
const WAIT_MS = 30_000 // tuning-ok: a test's patience for one page load on a very busy PC

export async function openGame(page, url, tag = url) {
  const errors = []
  const heard = (m) => { if (m.type() === 'error') errors.push(m.text()) }
  page.on('console', heard)
  try {
    for (let attempt = 1; ; attempt++) {
      errors.length = 0
      try {
        await page.goto(url)
        await page.waitForFunction(() => window.__glyphtender?.store, null, { timeout: WAIT_MS })
        return
      } catch (e) {
        const seen = await page.evaluate(() => ({ ready: document.readyState, root: document.getElementById('root')?.childElementCount })).catch(() => null)
        const why = `page ${JSON.stringify(seen)}; console errors: ${errors.join(' | ') || 'none'}`
        if (attempt >= TRIES) throw new Error(`${tag}: the game never started in ${TRIES} tries — ${why}`, { cause: e })
        console.log(`  (${tag}: the game didn't start, trying again — ${why})`)
      }
    }
  } finally {
    page.off('console', heard)
  }
}

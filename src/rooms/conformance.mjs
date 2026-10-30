// THE ROOMS MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Rooms": online, the server owns the truth — so the Dev Kit's tools that change play (Restore,
// Pause) must be off in an online game: the adapter's canRestore() (and canPause(), if it has one) answer false online.
// 0.9.0 (F95): a player who closed the tab mid-match can get back in — the kit remembers the room (lastRoom.ts, which
// useRoom keeps up to date and forgets on leave / kick / game over), so the game must not keep its own copy of the
// room code (sessionStorage forgets it when the tab closes), and its menu offers "Rejoin match" (matchToRejoin()).
export const title = 'Rooms'

export async function check(t) {
  {
    const name = 'the Dev Kit can\'t change an online game (canRestore / canPause false online)'
    const adapter = t.adapterFile()
    if (!t.has('devkit') || !adapter || !t.exists(adapter)) t.skip(name, 'no Dev Kit adapter in this game')
    else {
      const text = t.read(adapter)
      const always = t.linesMatching([{ path: adapter, text }], /\bcan(Restore|Pause)\s*:\s*\(\s*\)\s*=>\s*true\b|\bcan(Restore|Pause)\s*\(\s*\)\s*\{\s*return\s+true\b/)
      if (always.length) t.fail(name, ['The game has Rooms, but its adapter always allows this:', ...always.map((l) => '  ' + l)],
        `${adapter}: canRestore: () => !isOnline() — restoring or pausing would change the game for everyone else in the room.`)
      else if (!/\bcanRestore\b/.test(text)) t.fail(name, [`${adapter} has no canRestore.`], 'Add canRestore: () => !isOnline() to the adapter.')
      else t.pass(name, `${adapter}: canRestore isn't always true`)
    }
  }
  {
    const name = 'a closed tab can rejoin its match: the kit remembers the room, the menu offers "Rejoin match"'
    if (olderThan(t.version, '0.9.0')) return t.skip(name, `this copy of the rooms kit is ${t.version} — rejoin came in 0.9.0 (node <framework>/rooms/scripts/install-rooms.mjs .)`)
    const code = t.gameCode()
    if (!code.some((f) => /\buseRoom\s*[<(]/.test(f.text))) return t.skip(name, 'the game doesn\'t use useRoom')
    // The game's online code (files that use the rooms kit) keeping something in sessionStorage = its own room code
    const online = code.filter((f) => /from\s+['"][^'"]*\/rooms\//.test(f.text))
    const ownCopy = t.linesMatching(online, /\bsessionStorage\b/)
    const problems = []
    if (ownCopy.length) problems.push('The game keeps its own copy of the room (sessionStorage — gone when the tab closes, and never forgotten on leave):', ...ownCopy.map((l) => '  ' + l))
    if (!code.some((f) => /\bmatchToRejoin\b/.test(f.text))) problems.push('Nothing offers "Rejoin match" (no matchToRejoin() in the game code).')
    if (problems.length) t.fail(name, problems, 'Remove the game\'s own room-code storage (useRoom remembers and forgets it — src/rooms/lastRoom.ts). On the main menu, while matchToRejoin() has a match, add { label: rejoinWords.rejoin } → useRoom(code, { create: false, rejoin: true }). Recipe: rooms README "Rejoin".')
    else t.pass(name, 'matchToRejoin() on the menu, no room code of its own')
  }
}

/** "0.8.0" older than "0.9.0"? (A missing version counts as old.) */
function olderThan(version, than) {
  const parts = (v) => String(v ?? '0').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const [a, b] = [parts(version), parts(than)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  }
  return false
}

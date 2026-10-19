// THE ROOMS MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Rooms": online, the server owns the truth — so the Dev Kit's tools that change play (Restore,
// Pause) must be off in an online game: the adapter's canRestore() (and canPause(), if it has one) answer false online.
export const title = 'Rooms'

export async function check(t) {
  const name = 'the Dev Kit can\'t change an online game (canRestore / canPause false online)'
  const adapter = t.adapterFile()
  if (!t.has('devkit') || !adapter || !t.exists(adapter)) return t.skip(name, 'no Dev Kit adapter in this game')
  const text = t.read(adapter)
  const always = t.linesMatching([{ path: adapter, text }], /\bcan(Restore|Pause)\s*:\s*\(\s*\)\s*=>\s*true\b|\bcan(Restore|Pause)\s*\(\s*\)\s*\{\s*return\s+true\b/)
  if (always.length) t.fail(name, ['The game has Rooms, but its adapter always allows this:', ...always.map((l) => '  ' + l)],
    `${adapter}: canRestore: () => !isOnline() — restoring or pausing would change the game for everyone else in the room.`)
  else if (!/\bcanRestore\b/.test(text)) t.fail(name, [`${adapter} has no canRestore.`], 'Add canRestore: () => !isOnline() to the adapter.')
  else t.pass(name, `${adapter}: canRestore isn't always true`)
}

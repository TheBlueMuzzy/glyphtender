// THE TABLE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Table": the rules are the Table's pure Rules contract and the move record replays (snapshots and
// bug captures lean on it). The proof is selfTest.ts: it plays whole games through the game's Rules and checks every
// promise in core.ts, replay included. The game calls it from its own tests (it knows its rules and setups); this
// finds those tests and runs them.
export const title = 'Table'

const SNIPPET = `tests/rules.test.ts:
        import { expect, it } from 'vitest'
        import { selfTest } from '../src/table/selfTest'
        import { rules } from '../src/engine/rules'          // the game's Rules
        it('keeps every Table promise (replay too)', () =>
          expect(selfTest(rules, [/* a few setups */], { seatCount: (s) => s.seats.length })).toEqual([]))`

export async function check(t) {
  const name = 'the rules keep the Table\'s promises and the move record replays (selfTest)'
  const callers = t.files({ dirs: ['src', 'tests', 'test'], skip: ['src/table'] })
    .filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path) && /\bselfTest\s*\(/.test(f.text))
    .map((f) => f.path)
  if (!callers.length) {
    return t.fail(name, ['No game test calls the Table\'s selfTest, so nothing proves the rules replay.'], `Add a test that runs it on the game's Rules — ${SNIPPET}`)
  }
  const run = t.run('npx', ['vitest', 'run', ...callers])
  if (run.code === 0) return t.pass(name, callers.join(', '))
  const lines = run.out.split(/\r?\n/).filter((l) => /game \d+|FAIL|AssertionError|Error|×/.test(l)).slice(0, 12)
  t.fail(name, [`npx vitest run ${callers.join(' ')} failed:`, ...lines.map((l) => '  ' + l.trim())],
    'Each line names a game and a move: fix the Rules (src/…/rules) so that promise holds — apply() must not change the state it\'s given, legalActions and check() must agree, the move record must replay to the same game.')
}

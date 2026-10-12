// REVIEW LIST TOOL — a list of things to look at one by one and mark Open / Yes / No (Glyphtender: submitted words).
//   Each row is one button: click it (or Space / Enter) and its box goes Open (empty) → Yes (✓) → No (✗) → Open.
//   A game's extra marks (extraMarks, e.g. B = British, V = vulgar) come next in the same cycle — No → B → V → Open —
//   and the box shows their letter (Muzzy 2026-10-12: one multi-state box, no extra buttons). They sort after No.
//   Order: Open first, then Yes, then No, A–Z inside each. The list does NOT move while you click (rows never jump
//   under the cursor) — it sorts again when it loads and after a Save. A dot = changed, not saved yet.
//   After a good Save the tab loads the list again from the game, so a game that lists only undecided rows (Glyphtender,
//   Muzzy 2026-10-12: "it becomes a checklist for me") sees the decided ones leave.
//   Save hands the game ONLY the changed rows (its save(changes)). If that fails, the reason shows and the changes stay.
//   The Dev Kit's search box filters the rows by label and detail while this tab is open (the `query` prop).
// A game lists it with reviewTab(…) (reviewTabEntry.ts); the list itself comes from the game's load().
import { useEffect, useState } from 'react'
import { CAN_SAVE, copyText } from '../saveContent'
import { Highlight, SearchCount } from '../search/Section'
import { searchTerms } from '../search/searchLogic'
import {
  applyChanges, countsLine, listChanges, nextStatus, reviewForClaude, searchReview, shownStatus, sortReview, statusName, toggleMark, type Marks,
} from './reviewLogic'
import type { ExtraMark, ReviewItem, ReviewTabOptions } from './reviewTypes'
import './review.css'

type Status = { kind: 'ok' | 'error' | 'info'; text: string }

type Props = Omit<ReviewTabOptions, 'id'> & {
  query?: string // the Dev Kit search box's text (DevKit.tsx passes it while this tab is open); '' = show everything
}

const BOX_MARK: Record<string, string> = { open: '', yes: '✓', no: '✗' } // what the box shows (an extra mark shows its letter)
const NO_EXTRAS: ExtraMark[] = []

export function ReviewTab({ label, load, save, what = 'item', extraMarks = NO_EXTRAS, query = '' }: Props) {
  const extras = extraMarks
  const nameOf = (status: string) => statusName(status, extras)
  const [items, setItems] = useState<ReviewItem[] | null>(null) // as saved, in the order shown (null = loading)
  const [loadProblem, setLoadProblem] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0) // Retry bumps it, which loads again
  const [marks, setMarks] = useState<Marks>({}) // unsaved changes: id → new status
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null) // shown if the clipboard is blocked

  // Load the list (when the Dev Kit opens, and on Retry). `live` ignores an answer that comes back after it's gone.
  useEffect(() => {
    let live = true
    load().then(
      (list) => live && setItems(sortReview(list, extras)),
      (e: unknown) => live && setLoadProblem(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [load, attempt, extras])

  function retry() {
    setLoadProblem(null)
    setItems(null)
    setAttempt((n) => n + 1)
  }

  if (loadProblem) {
    return (
      <div className="rv">
        <p className="devkit-status is-error" role="alert">Couldn't load the {label} list: {loadProblem}</p>
        <button className="devkit-btn" onClick={retry}>Retry</button>
      </div>
    )
  }
  if (!items) return <p className="devkit-not-plugged">Loading…</p>

  const changes = listChanges(items, marks)

  async function saveChanges() {
    if (!items) return
    setSaving(true)
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      await save(changes)
      setItems(applyChanges(items, marks, extras)) // the marks become the saved statuses, and the list sorts again
      setMarks({})
      setStatus({ kind: 'ok', text: `Saved ${changes.length}.` })
      // Then the list as the game now has it — a game whose load() lists only what's still to decide (Glyphtender: Open
      // words) drops the decided rows here. If this load fails, the sorted list above stays. Rows stay locked (saving)
      // until it's back, so no click lands on a list that's about to be replaced.
      try {
        setItems(sortReview(await load(), extras))
      } catch {
        // keep the list above
      }
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save — your changes are still here: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  async function copyForClaude() {
    if (!items) return
    const text = reviewForClaude(document.title, label, items, marks, !CAN_SAVE, extras)
    if (await copyText(text)) {
      setCopyFallback(null)
      setStatus({ kind: 'ok', text: 'Copied — paste it into your chat with Claude.' })
    } else {
      setCopyFallback(text)
      setStatus({ kind: 'error', text: 'The browser blocked copying — select the text below and copy it.' })
    }
  }

  const terms = searchTerms(query)
  const shown = searchReview(items, query)

  return (
    <div className="rv">
      <SearchCount query={query} found={shown.length} what={what} where={label} />
      <p className="rv-counts" role="status">{countsLine(items, marks, extras)}</p>
      {terms.length === 0 && (
        <p className="rv-legend">
          Click to change: ☐ open → ✓ yes → ✗ no{extras.map((m) => ` → ${m.letter} ${m.name.toLowerCase()}`).join('')} → ☐ · <span className="dk-dot" /> = not saved yet · sorts again after Save
        </p>
      )}
      {items.length === 0 && <p className="devkit-not-plugged">Nothing to review yet.</p>}

      <ul className="rv-list">
        {shown.map((item) => {
          const now = shownStatus(item, marks)
          const changed = item.id in marks
          return (
            <li key={item.id}>
              <button
                type="button"
                className={changed ? 'rv-row is-changed' : 'rv-row'}
                data-status={now}
                disabled={saving}
                onClick={() => setMarks((m) => toggleMark(item, m, extras))}
                aria-label={`${item.label}: ${nameOf(now)} (click for ${nameOf(nextStatus(now, extras))})${changed ? ', not saved yet' : ''}`}
                title={`${nameOf(now)} — click for ${nameOf(nextStatus(now, extras))}`}
              >
                <span className="rv-box" aria-hidden="true">{BOX_MARK[now] ?? extras.find((m) => m.id === now)?.letter ?? '?'}</span>
                <span className="rv-text">
                  <span className="rv-label"><Highlight text={item.label} terms={terms} /></span>
                  {item.detail && <span className="rv-detail"><Highlight text={item.detail} terms={terms} /></span>}
                </span>
                {changed && <span className="dk-dot" title="Changed, not saved yet" />}
              </button>
            </li>
          )
        })}
      </ul>

      <footer className="devkit-footer">
        {/* Live build: no dev server to save through, so Copy for Claude is the main button (see CAN_SAVE) */}
        {CAN_SAVE && (
          <button className="devkit-btn devkit-btn-main" disabled={changes.length === 0 || saving} onClick={saveChanges}>
            Save
          </button>
        )}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} onClick={copyForClaude}>
          Copy for Claude
        </button>
        <button className="devkit-btn" disabled={changes.length === 0 || saving} onClick={() => setMarks({})} title="Put every row back to what's saved">
          Undo unsaved
        </button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
        {copyFallback && <textarea className="rv-copy" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />}
      </footer>
    </div>
  )
}

// ONE STRING ON SCREEN — a row of the Text tab (TextTab.tsx): its name ("pages › 2 › body") and full key, then a
// text box that grows to fit the words, and ↺ (back to the saved words). A changed box is highlighted.
// Under it: the {placeholders} the game fills in, and an orange warning for any the edit lost.
import { useLayoutEffect, useRef } from 'react'
import { Highlight } from '../search/Section'
import { missingPlaceholders, missingWarning, placeholdersIn, type TextField } from './textLogic'

type Props = {
  field: TextField
  value: string // the words now
  savedValue: string // the words in the file
  terms: string[] // search words to highlight
  onChange: (value: string) => void
}

// Browsers that can size a box to its text in CSS (field-sizing: content) don't need the measuring below
const cssFits = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')

/** Make a text box exactly as tall as its words (no inner scroll bar). Skipped while hidden — it has no size then. */
function fit(box: HTMLTextAreaElement | null) {
  if (!box || cssFits || box.clientWidth === 0) return
  box.style.height = 'auto'
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px` // + the border
}

export function TextRow({ field, value, savedValue, terms, onChange }: Props) {
  const box = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => fit(box.current), [value])
  // The panel opens, turns, or a phone rotates: measure again once the box has a width
  useLayoutEffect(() => {
    const el = box.current
    if (!el || cssFits || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const watch = new ResizeObserver(() => {
      if (el.clientWidth !== width) fit(el)
      width = el.clientWidth
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const changed = value !== savedValue
  const fills = placeholdersIn(savedValue)
  const missing = missingPlaceholders(savedValue, value)
  return (
    <div className={changed ? 'tx-row is-changed' : 'tx-row'} data-key={field.key}>
      <label className="tx-name" htmlFor={`tx:${field.key}`}>
        {changed && <span className="tt-dot" title="Changed, not saved yet" />}
        <span className="tx-label"><Highlight text={field.label} terms={terms} /></span>
        <code className="tx-key"><Highlight text={field.key} terms={terms} /></code>
      </label>
      <div className="tx-edit">
        <textarea
          id={`tx:${field.key}`}
          ref={box}
          className="tx-box"
          rows={1}
          spellCheck
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="tt-reset"
          disabled={!changed}
          onClick={() => onChange(savedValue)}
          title={`Back to the saved words: ${savedValue}`}
          aria-label={`Reset ${field.key} to the saved words`}
        >
          ↺
        </button>
      </div>
      {fills.length > 0 && (
        <p className="tx-fills">
          The game fills in: {fills.map((name) => <code key={name}>{`{${name}}`}</code>)}
        </p>
      )}
      {missing.map((name) => (
        <p key={name} className="tx-warn" role="alert">⚠ {missingWarning(name)}</p>
      ))}
    </div>
  )
}

/** A number or true/false in the text file: shown, not edited. */
export function ReadOnlyRow({ field, terms }: { field: TextField; terms: string[] }) {
  return (
    <div className="tx-row tx-row-fixed" data-key={field.key}>
      <span className="tx-name">
        <span className="tx-label"><Highlight text={field.label} terms={terms} /></span>
        <code className="tx-key"><Highlight text={field.key} terms={terms} /></code>
      </span>
      <span className="tx-fixed" title="Not words — edit it in the file">{JSON.stringify(field.value)}</span>
    </div>
  )
}

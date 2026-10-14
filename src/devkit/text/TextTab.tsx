// TEXT TOOL — every word players read, from the game's content/text/en.json, in text boxes.
//   Sections = the file's top-level keys (an object inside = a sub-section, indented); a list of pages stays inside
//   its section, each string named from there: "pages › 2 › body". "_help" notes show grey under their section.
//   Numbers and true/false are shown, not edited. How it's all worked out: textLogic.ts.
//   A changed box is highlighted, with ↺ back to the saved words. A box that lost a {placeholder} the game fills in
//   shows a warning — Save waits until it's back.
//   Save writes the whole file (same keys, same order, same layout — formatJson.ts) and the game hot-reloads its
//   words (the save asks the dev server for Vite's reload: saveContentFile's reload option).
//   Just before saving it reads the file fresh, so words another tab saved meanwhile (the AI tab's bios) are kept.
//   The Dev Kit's search box filters the strings by key or words while this tab is open (the `query` prop).
import { useContext, useState } from 'react'
import { copyForClaudeText } from '../color/colorLogic'
import { CAN_SAVE, copyText, saveContentFile } from '../saveContent'
import { Highlight, SearchCount, Section, SectionIndex } from '../search/Section'
import { DevKitSearch } from '../search/searchContext'
import { searchTerms } from '../search/searchLogic'
import { setSectionsOpen } from '../search/sectionState'
import {
  allFields,
  changedKeys,
  countFields,
  flattenText,
  listTextChanges,
  placeholderProblems,
  searchText,
  sectionIdsTo,
  textSections,
  textValues,
  withTexts,
  type TextSection,
  type TextValues,
} from './textLogic'
import { ReadOnlyRow, TextRow } from './TextRow'
import '../tuning/tuning.css'
import './text.css'

type Props = {
  file: string // where it's saved, e.g. "content/text/en.json"
  data: object // the file as the game imported it
  label?: string // the tab's name, for messages ("Nothing in Text matches…")
  query?: string // the Dev Kit search box's text; '' = show everything
}

type Status = { kind: 'ok' | 'error' | 'info'; text: string }

// After a Save, Vite's hot reload re-runs the game's tabs.ts (it imports the file), so this tab starts over with the
// new words. Its "Saved …" line is kept here for that moment (file → line + when), so it doesn't vanish.
const justSaved = new Map<string, { status: Status; at: number }>()
function takeJustSaved(file: string): Status | null {
  const kept = justSaved.get(file)
  justSaved.delete(file)
  return kept && Date.now() - kept.at < 5000 ? kept.status : null
}

/** The file as it is on disk right now (the dev server serves it as is), or null if it can't be read. */
async function readFresh(file: string): Promise<object | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL ?? '/'}${file}`, { cache: 'no-store' })
    const data: unknown = res.ok ? await res.json() : null
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

export function TextTab({ file, data, label = 'Text', query = '' }: Props) {
  const search = useContext(DevKitSearch)
  const [leaves, setLeaves] = useState(() => flattenText(data)) // the file's shape (what Save writes the words into)
  const [{ notes, sections }, setSections] = useState(() => textSections(data))
  const [loaded] = useState(() => textValues(leaves)) // as the page loaded — Copy for Claude starts from this
  const [saved, setSaved] = useState(loaded) // what's in the file
  const [values, setValues] = useState(loaded) // what's in the boxes
  const [status, setStatus] = useState<Status | null>(() => takeJustSaved(file))
  const [copyFallback, setCopyFallback] = useState<string | null>(null) // shown if the clipboard is blocked

  const unsaved = changedKeys(values, saved)
  const problems = placeholderProblems(values, saved)
  const problemCount = Object.keys(problems).length
  const change = (key: string, words: string) => setValues((v) => ({ ...v, [key]: words }))

  async function save() {
    if (problemCount > 0) return
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      // The file fresh from disk (another tab may have saved words in it since the page loaded), with these edits on top
      const fresh = (await readFresh(file)) ?? withTexts(leaves, saved)
      const freshLeaves = flattenText(fresh)
      const edits: TextValues = Object.fromEntries(unsaved.map((key) => [key, values[key]]))
      const next = withTexts(freshLeaves, edits)
      await saveContentFile(file, next, { reload: true })
      const nextLeaves = flattenText(next)
      const nextValues = textValues(nextLeaves)
      setLeaves(nextLeaves)
      setSections(textSections(next))
      setSaved(nextValues)
      setValues(nextValues)
      const lost = unsaved.filter((key) => !(key in nextValues))
      const done: Status = {
        kind: lost.length ? 'error' : 'ok',
        text: lost.length
          ? `Saved ${file}, but ${lost.join(', ')} isn't in the file any more — not written.`
          : `Saved ${file} — the game reloads its words.`,
      }
      justSaved.set(file, { status: done, at: Date.now() })
      setStatus(done)
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }

  async function copyForClaude() {
    const text = copyForClaudeText(document.title, listTextChanges(loaded, values), unsaved.length === 0, !CAN_SAVE, 'Text', file)
    if (await copyText(text)) {
      setCopyFallback(null)
      setStatus({ kind: 'ok', text: 'Copied — paste it into your chat with Claude.' })
    } else {
      setCopyFallback(text)
      setStatus({ kind: 'error', text: 'The browser blocked copying — select the text below and copy it.' })
    }
  }

  const terms = searchTerms(query)
  const searching = terms.length > 0
  const shown = searchText(sections, query, values)
  const found = shown.reduce((n, s) => n + allFields(s).filter((f) => f.kind === 'text').length, 0)
  const isChanged = (s: TextSection) => allFields(s).some((f) => values[f.key] !== saved[f.key])

  // One section and the ones inside it (indented)
  const renderSection = (s: TextSection, depth: number) => (
    <div key={s.id} className={depth > 0 ? 'tx-sub' : undefined}>
      <Section
        id={s.id}
        title={s.title}
        count={countFields(s)}
        terms={terms}
        defaultOpen={sections.length === 1 && depth === 0}
        changed={isChanged(s)}
        onGoTo={() => {
          setSectionsOpen(sectionIdsTo(s), true) // the sections around it too, or it stays hidden
          search.goTo(s.id)
        }}
      >
        {s.notes.map((note) => <p key={note} className="tt-help tx-note"><Highlight text={note} terms={terms} /></p>)}
        {s.fields.map((f) =>
          f.kind === 'text' ? (
            <TextRow key={f.key} field={f} value={values[f.key]} savedValue={saved[f.key]} terms={terms} onChange={(w) => change(f.key, w)} />
          ) : (
            <ReadOnlyRow key={f.key} field={f} terms={terms} />
          ),
        )}
        {s.children.map((c) => renderSection(c, depth + 1))}
      </Section>
    </div>
  )

  return (
    <div className="tt tx">
      <SearchCount query={query} found={found} what="string" where={label} />
      {!searching && (
        <>
          {notes.map((note) => <p key={note} className="tt-help tx-note">{note}</p>)}
          <p className="tt-legend">
            <span className="tt-dot" /> = changed, not saved yet · ↺ = back to the saved words · <code>{'{name}'}</code> = filled in by the game, keep it
          </p>
          <SectionIndex label={label} sections={sections.map((s) => ({ id: s.id, title: s.title, count: countFields(s) }))} />
        </>
      )}
      {shown.map((s) => renderSection(s, 0))}

      <footer className="devkit-footer">
        <p className="tx-count" role="status">
          {unsaved.length === 0 ? 'No changes' : unsaved.length === 1 ? '1 change' : `${unsaved.length} changes`}
          {problemCount > 0 && ` · Save waits: ${problemCount === 1 ? '1 text has' : `${problemCount} texts have`} lost a {placeholder} (⚠ above)`}
        </p>
        {/* Live build: no dev server to save through, so Copy for Claude is the main button (see CAN_SAVE) */}
        {CAN_SAVE && (
          <button className="devkit-btn devkit-btn-main" disabled={unsaved.length === 0 || problemCount > 0} onClick={save}>
            Save
          </button>
        )}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} onClick={copyForClaude}>
          Copy for Claude
        </button>
        <button className="devkit-btn" disabled={unsaved.length === 0} onClick={() => setValues(saved)} title="Put every text back to what's saved">
          {CAN_SAVE ? 'Undo unsaved' : 'Undo changes'}
        </button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
        {copyFallback && <textarea className="tt-copy" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />}
      </footer>
    </div>
  )
}

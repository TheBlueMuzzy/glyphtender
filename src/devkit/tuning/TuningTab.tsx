// TUNING TOOL — every number in the game's content/tuning/*.json files, as a slider + a number box.
//   Settings sit in titled sections that open and close (search/Section.tsx) — the file's "_sections", else one per
//   file — with readable names from "_labels" and a help line from "_help" (how: tuningSections.ts). Chips at the top
//   jump to a section. The Dev Kit's search box (DevKit.tsx) filters them (DevKitSearch).
//   true/false values get a checkbox; colours ("#rrggbb") a colour picker; other text is shown, not edited.
//   Slider ranges: the file's optional "_ranges" { "key.path": [min, max, step] }, else a guess (tuningLogic.ts).
// Live: each change is sent to the game as it happens (liveTuning.ts) — the game shows it if it reads its tuning
// through liveTuning / useLiveTuning. ↺ on a row = back to the saved value. A dot = changed, not saved yet.
import { useContext, useState } from 'react'
import { CAN_SAVE, copyText, saveContentFile } from '../saveContent'
import { copyForClaudeText } from '../color/colorLogic'
import { Highlight, Section, SectionIndex } from '../search/Section'
import { DevKitSearch } from '../search/searchContext'
import { searchTerms } from '../search/searchLogic'
import { FieldRow } from './FieldRow'
import { sendTuning } from './liveTuning'
import { sectionOrder, tuningFiles, type TuningFile } from './tuningFiles'
import { groupOf, listTuningChanges, tuningChanged, valueAt, withValue, type TuningData } from './tuningLogic'
import { searchTuning, tuningSections, type TuningItem } from './tuningSections'
import '../color/color.css'
import './tuning.css'

type Files = Record<string, TuningData> // file name → its data

const byName = (files: TuningFile[]): Files => Object.fromEntries(files.map((f) => [f.name, f.data]))
const pathOf = (name: string) => `content/tuning/${name}.json`

type Props = {
  files?: TuningFile[]
  order?: string[] // section titles in the order to list them (content/devkit.json "sectionOrder")
  query?: string // the search text — normally from the Dev Kit's search box (DevKitSearch); '' = show everything
}

export function TuningTab({ files = tuningFiles, order = sectionOrder, query: ownQuery }: Props) {
  const search = useContext(DevKitSearch)
  const query = ownQuery ?? search.query
  const [loaded] = useState(() => byName(files)) // as the page loaded — ranges and Copy for Claude start from this
  const [sections] = useState(() => tuningSections(files, order)) // names and sections never change while it runs
  const [values, setValues] = useState(loaded) // what the game uses right now
  const [saved, setSaved] = useState(loaded) // what's in the files
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null) // shown if the clipboard is blocked

  const names = Object.keys(loaded)
  const unsaved = names.filter((name) => tuningChanged(values[name], saved[name]))

  function change(name: string, path: string, value: unknown) {
    const data = withValue(values[name], path, value)
    setValues((v) => ({ ...v, [name]: data }))
    sendTuning(name, data) // live in the game
  }

  function undo() {
    for (const name of unsaved) sendTuning(name, saved[name])
    setValues(saved)
  }

  // Save: each changed file is written whole — its _help and _ranges come along untouched
  async function save() {
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      for (const name of unsaved) await saveContentFile(pathOf(name), values[name])
      setSaved(values)
      setStatus({ kind: 'ok', text: `Saved ${unsaved.map(pathOf).join(', ')} — refresh and it stays.` })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }

  async function copyForClaude() {
    const changes = names.flatMap((name) => listTuningChanges(name, loaded[name], values[name]))
    const text = copyForClaudeText(document.title, changes, unsaved.length === 0, !CAN_SAVE, 'Tuning', 'content/tuning/')
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
  const shown = searching ? searchTuning(sections, query) : sections
  const isChanged = (item: TuningItem) => valueAt(values[item.file], item.path) !== valueAt(saved[item.file], item.path)

  return (
    <div className="tt">
      {!searching && (
        <>
          <p className="tt-legend">
            <span className="tt-dot" /> = changed, not saved yet · ↺ = back to the saved value · changes show in the game live
          </p>
          <SectionIndex label="Tuning" sections={sections.map((s) => ({ id: s.id, title: s.title, count: s.items.length }))} />
        </>
      )}
      {shown.map((section) => (
        <Section
          key={section.id}
          id={section.id}
          title={section.title}
          count={section.items.length}
          terms={terms}
          defaultOpen={sections.length === 1}
          changed={section.items.some(isChanged)}
          onGoTo={() => search.goTo(section.id)}
        >
          {section.note && <p className="tt-help"><Highlight text={section.note} terms={terms} /></p>}
          {section.items.map((item, i) => {
            const group = section.grouped ? groupOf(item.path) : ''
            const newGroup = group && group !== groupOf(section.items[i - 1]?.path ?? '')
            return (
              <div key={`${item.file}:${item.path}`}>
                {newGroup && <h4 className="tt-group">{group}</h4>}
                <FieldRow
                  filePath={pathOf(item.file)}
                  item={item}
                  value={valueAt(values[item.file], item.path)}
                  savedValue={valueAt(saved[item.file], item.path)}
                  loadedValue={valueAt(loaded[item.file], item.path)}
                  ranges={values[item.file]._ranges}
                  terms={terms}
                  onChange={(value) => change(item.file, item.path, value)}
                />
              </div>
            )
          })}
        </Section>
      ))}

      <footer className="devkit-footer">
        {/* Live build: no dev server to save through, so Copy for Claude is the main button (see CAN_SAVE) */}
        {CAN_SAVE && (
          <button className="devkit-btn devkit-btn-main" disabled={unsaved.length === 0} onClick={save}>
            Save
          </button>
        )}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} onClick={copyForClaude}>
          Copy for Claude
        </button>
        <button className="devkit-btn" disabled={unsaved.length === 0} onClick={undo} title="Put every value back to what's saved">
          {CAN_SAVE ? 'Undo unsaved' : 'Undo changes'}
        </button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
        {copyFallback && <textarea className="tt-copy" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />}
      </footer>
    </div>
  )
}

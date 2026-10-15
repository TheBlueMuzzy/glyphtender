// COLOR TOOL — the colour-blind preview, every UI kit colour with a picker each, and the UI kit's shape & feel values
// (corners, outlines, shadows, press feel, timings, menu sizes — styleValues.ts) with a slider or a box each.
//   They come from content/ui/style.json: the preset's values, with "tweaks" on top.
// ↺ on a row = back to the preset. A dot next to a name = changed, not saved yet.
// The Dev Kit's search box filters the rows (the `query` prop); the colour-blind preview hides while searching.
// Under the Select tab (a DevKitPick, select/pickContext.ts): only the picked object's style values, in one section,
//   same rows, same Save. They're shared: a button's corners are every button's.
// A game's own colours (e.g. a 3D table) go in a game tab: src/devkit-game/ (ColourRow is free to use there).
import { useContext, useEffect, useState, type ReactNode } from 'react'
import { Highlight, SearchCount, Section } from '../search/Section'
import { DevKitSearch } from '../search/searchContext'
import { countFound, searchTerms } from '../search/searchLogic'
import { CAN_SAVE, copyText, saveContentFile } from '../saveContent'
import { DevKitPick } from '../select/pickContext'
import { ColourBlindPreview } from './ColourBlindPreview'
import { ColourRow } from './ColourRow'
import { StyleRow } from './StyleRow'
import { UI_COLOUR_SECTION, UI_SHAPE_SECTION, copyForClaudeText, isUiShape, searchUiColours, listChanges, sameColour, tweaksToSave, uiChanged, uiColoursFrom, uiLabel } from './colorLogic'
import { shapeDefault, UI_SHAPES, uiShapesFrom } from './styleValues'
import { styleFile, uiKit } from './uiKit'
import './color.css'

export function ColorTab({ query = '' }: { query?: string }) {
  const picking = useContext(DevKitPick)
  const searching = searchTerms(query).length > 0 // query: the Dev Kit's search box ('' = show everything)
  if (picking && !(uiKit && styleFile && picking.pick.style.length > 0)) return null // nothing to show for this pick
  return (
    <div className="ct">
      {!searching && !picking && (
        <>
          <p className="ct-legend">
            <span className="ct-dot" /> = changed, not saved yet · tap a swatch to pick a colour, or type a hex
          </p>
          <ColourBlindPreview />
        </>
      )}
      {uiKit && styleFile ? (
        <UiColoursEditor query={picking ? '' : query} />
      ) : searching ? (
        <SearchCount query={query} found={0} what="colour" where="Color" />
      ) : (
        <p className="ct-legend">This game doesn't use the Game UI kit (src/ui/kit + content/ui/style.json), so there are no UI colours to edit here.</p>
      )}
    </div>
  )
}

function UiColoursEditor({ query }: { query: string }) {
  const { goTo } = useContext(DevKitSearch)
  const picking = useContext(DevKitPick)
  // Only shown when both exist (see ColorTab)
  const kit = uiKit!
  const file = styleFile!
  const presetName = file.preset
  const preset = kit.presets[presetName] ?? kit.presets.clean
  const presetTitle = presetName.charAt(0).toUpperCase() + presetName.slice(1) // "Cartoon"
  const fromFile = () => ({ ...uiColoursFrom(preset, file.tweaks), ...uiShapesFrom(preset, file.tweaks) })

  const [colours, setColours] = useState(fromFile) // what the game shows right now (colours + shape & feel)
  const [saved, setSaved] = useState(fromFile) // what's in the file
  const [savedTweaks, setSavedTweaks] = useState(file.tweaks ?? {}) // style.json "tweaks" as saved
  const [loaded] = useState(fromFile) // as the page loaded — Copy for Claude lists changes since then
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null) // shown if the clipboard is blocked

  const dirty = uiChanged(colours, saved)
  const terms = searchTerms(query)
  const found = terms.length > 0
    ? searchUiColours(query)
    : [{ ...UI_COLOUR_SECTION, titleHit: false }, { ...UI_SHAPE_SECTION, titleHit: false }]

  // Live preview: the UI restyles through the kit's style engine
  useEffect(() => {
    const tweaks = tweaksToSave(preset, colours, savedTweaks)
    kit.applyStyle({ preset: presetName, tweaks })
    // applyStyle only sets values: one put back to the kit's default (a menu size) is taken off the page again
    for (const { token } of UI_SHAPES) {
      if (preset[token] === undefined && tweaks[token] === undefined) document.documentElement.style.removeProperty(`--${token}`)
    }
  }, [kit, preset, presetName, colours, savedTweaks])

  const row = (token: string, display: ReactNode) => {
    const reset = isUiShape(token) ? shapeDefault(preset, token) : String(preset[token])
    const props = {
      label: uiLabel(token),
      display,
      value: colours[token],
      changed: !sameColour(colours[token], saved[token]),
      resetTo: reset,
      resetHint: `Back to the ${presetTitle} preset`,
      onChange: (v: string) => setColours((c) => ({ ...c, [token]: v })),
    }
    return isUiShape(token) ? <StyleRow key={token} token={token} {...props} /> : <ColourRow key={token} {...props} />
  }

  // Save: style.json gets only the colours that differ from the preset
  async function save() {
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      const tweaks = tweaksToSave(preset, colours, savedTweaks)
      await saveContentFile('content/ui/style.json', { ...file, tweaks })
      setSavedTweaks(tweaks)
      setSaved(colours)
      setStatus({ kind: 'ok', text: 'Saved content/ui/style.json — refresh and it stays.' })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }

  async function copyForClaude() {
    const text = copyForClaudeText(document.title, listChanges(loaded, colours), !dirty, !CAN_SAVE, 'UI style')
    if (await copyText(text)) {
      setCopyFallback(null)
      setStatus({ kind: 'ok', text: 'Copied — paste it into your chat with Claude.' })
    } else {
      setCopyFallback(text)
      setStatus({ kind: 'error', text: 'The browser blocked copying — select the text below and copy it.' })
    }
  }

  // Under the Select tab: the picked object's style values only
  const pickedTokens = picking ? picking.pick.style.filter((t) => t in colours) : []
  if (picking && pickedTokens.length === 0) return null

  return (
    <>
      {picking ? (
        <Section
          id={`select:${picking.pick.objectId}:style`}
          title="UI style"
          count={pickedTokens.length}
          terms={[]}
          defaultOpen
          changed={pickedTokens.some((t) => !sameColour(colours[t], saved[t]))}
        >
          <p className="ct-legend">Shared — changes every {picking.pick.label.toLowerCase()} (and anything else using it) · content/ui/style.json</p>
          {pickedTokens.map((token) => row(token, uiLabel(token)))}
        </Section>
      ) : (
        <>
          <SearchCount query={query} found={countFound(found)} what="style value" where="Color" />
          {found.map((section) => (
            <Section
              key={section.id}
              id={section.id}
              title={section.title}
              count={section.items.length}
              terms={terms}
              defaultOpen
              changed={section.items.some(({ token }) => !sameColour(colours[token], saved[token]))}
              onGoTo={() => goTo(section.id)}
            >
              <p className="ct-legend">content/ui/style.json · ↺ = back to the {presetTitle} preset</p>
              {section.items.map(({ token, name }) => row(token, <Highlight text={`${name} (${token})`} terms={terms} />))}
            </Section>
          ))}
        </>
      )}

      <footer className="devkit-footer">
        {/* Live build: no dev server to save through, so Copy for Claude is the main button (see CAN_SAVE) */}
        {CAN_SAVE && (
          <button className="devkit-btn devkit-btn-main" disabled={!dirty} onClick={save}>
            {picking ? 'Save style' : 'Save'}
          </button>
        )}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} onClick={copyForClaude}>
          Copy for Claude
        </button>
        <button className="devkit-btn" disabled={!dirty} onClick={() => setColours(saved)} title="Put every UI style value back to what's saved">
          {CAN_SAVE ? 'Undo unsaved' : 'Undo changes'}
        </button>
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
        {copyFallback && <textarea className="ct-copy" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />}
      </footer>
    </>
  )
}

// SETTINGS — drawn from a list, never built by hand. Copy settings.default.json to your game's
// content/ui/settings.json, then switch rows off ("on": false) or add your own. Add a row → it appears.
//   <Settings schema={settingsJson} onChange={(values) => applyAudioSettings(audio, values)} />   (framework audio module)
// Row types: slider · toggle · selector · stepper · button (calls onAction(id)) · link (opens url)
//            · destructive (asks first, then onAction(id)) · info (read-only, e.g. the version)
//            · heading (0.10.0: a section title in the tab's list, e.g. { "id": "secPlay", "type": "heading", "label": "Play" }).
// A button row with "confirm": "<question>" asks first too (a plain OK, not the red one), then calls onAction(id).
// Values are remembered in the browser, in a slot of the game's own (or pass your own load/save).
// At start-up, call applyAccessibility(loadSettings(schema)) so text size and reduce motion apply
// before Settings opens.
import { useState } from 'react'
import { Panel, Row, Screen } from '../layout'
import { Button, ListRow, ScrollArea, Selector, Slider, Stepper, Tabs, Text, Toggle } from '../controls'
import { screens } from '../screens'
import { askConfirm } from './dialogs'
import { MenuHeader } from './MenuHeader'
import defaultSchema from './settings.default.json'

export type SettingValue = number | boolean | string
export type SettingsValues = Record<string, SettingValue>
export type SettingRow = {
  id: string; type: string; label: string; detail?: string; on?: boolean; default?: SettingValue
  min?: number; max?: number; step?: number; options?: string[] // slider / stepper / selector
  url?: string; button?: string // link / destructive
  confirm?: string // destructive (always asks), or a button row: the question to ask before it acts
}
export type SettingsSchema = { tabs: { id: string; label: string; rows: SettingRow[] }[] }

// What a tab really shows: rows switched off or hidden go; a heading goes too when no row is left under it
// (before the next heading, or the end) — so a section never shows a title over nothing.
function visibleRows(rows: SettingRow[], hide: string[]) {
  const shown = rows.filter((row) => row.on !== false && !hide.includes(row.id))
  return shown.filter((row, i) => row.type !== 'heading' || (shown[i + 1] && shown[i + 1].type !== 'heading'))
}

// Only rows that hold a value are saved (not buttons, links or info lines).
const holdsValue = (row: SettingRow) => ['slider', 'toggle', 'selector', 'stepper'].includes(row.type)
export function defaultValues(schema: SettingsSchema, tabId?: string): SettingsValues {
  const rows = schema.tabs.filter((tab) => !tabId || tab.id === tabId).flatMap((tab) => tab.rows)
  return Object.fromEntries(rows.filter(holdsValue).map((row) => [row.id, row.default ?? 0]))
}

// Saving: localStorage by default. Private browsing can refuse it — then settings last until reload.
// Every game on <user>.github.io shares one browser storage, so each game gets its own slot, named
// after the first folder in its address: <user>.github.io/roll-better/ → "kit-settings:roll-better".
// Only the first folder counts, so every page and ?screen= link inside a game uses the same slot.
// (A game at the top of its own site, like localhost:5173/, gets "kit-settings:".)
export function settingsStorageKey() {
  if (typeof location === 'undefined') return 'kit-settings'
  const firstFolder = location.pathname.split('/').slice(1, -1)[0] ?? ''
  return `kit-settings:${firstFolder}`
}
function loadFromBrowser(storageKey: string): SettingsValues | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null
  } catch { return null }
}
function saveToBrowser(storageKey: string, values: SettingsValues) {
  try { localStorage.setItem(storageKey, JSON.stringify(values)) } catch { /* not remembered, still works */ }
}

// A saved value only counts if it still fits its row (the list may have changed since it was saved):
// a toggle needs true/false, a selector one of its options, a slider or stepper a number in range.
function fitsRow(row: SettingRow, value: unknown) {
  switch (row.type) {
    case 'toggle': return typeof value === 'boolean'
    case 'selector': return typeof value === 'string' && (row.options ?? []).includes(value)
    case 'slider': case 'stepper': {
      const max = row.max ?? (row.type === 'slider' ? 100 : 99) // the same ranges Slider and Stepper use
      return typeof value === 'number' && value >= (row.min ?? 0) && value <= max
    }
    default: return false
  }
}

// Defaults, then every saved value that fits its row. Values for ids not in the list are kept as saved.
function withSaved(schema: SettingsSchema, saved: SettingsValues | null): SettingsValues {
  const values = defaultValues(schema)
  const rows = schema.tabs.flatMap((tab) => tab.rows)
  for (const [id, value] of Object.entries(saved ?? {})) {
    const row = rows.find((r) => r.id === id)
    if (!row || (holdsValue(row) && fitsRow(row, value))) values[id] = value
  }
  // Kit 0.4.4 renamed Audio's "Mute everything" (muteAll, true = silent) to "Sound" (sound, true = plays). An older
  // save with no Sound value yet: Sound is the opposite of what it saved, and muteAll goes (the next save drops it).
  if (saved && typeof saved.sound !== 'boolean' && typeof saved.muteAll === 'boolean') {
    values.sound = !saved.muteAll
    delete values.muteAll
  }
  return values
}

// At start-up: applyAccessibility(loadSettings(schema)) — pass the same storageKey as <Settings>, if you gave it one.
export function loadSettings(schema: SettingsSchema = defaultSchema, storageKey = settingsStorageKey()): SettingsValues {
  return withSaved(schema, loadFromBrowser(storageKey))
}

// Text size and reduce motion drive the kit itself: text is in rem, so the page's font size scales
// every word (gaps and 44px targets stay put), and data-reduce-motion stops animations (blocks.css).
export function applyAccessibility(values: SettingsValues, root = document.documentElement) {
  if (typeof values.textSize === 'string') root.style.fontSize = values.textSize
  root.toggleAttribute('data-reduce-motion', values.reduceMotion === true)
}

export const settingsWords = { title: 'Settings', back: 'Back', reset: 'Reset to defaults' }
type SettingsProps = {
  schema?: SettingsSchema
  onChange?: (values: SettingsValues, changedId: string) => void
  onAction?: (id: string) => void // button and destructive rows
  info?: Record<string, string> // text for info rows, e.g. { version: '1.2.0' }
  onBack?: () => void
  storageKey?: string // the browser save slot; each game gets its own by default (see settingsStorageKey)
  load?: () => SettingsValues | null; save?: (values: SettingsValues) => void // or the game's own saving
  words?: Partial<typeof settingsWords>
  labels?: Record<string, string> // translated tab and row labels, by id: { audio: 'Sonido' }
  hide?: string[] // row ids to leave out right now, e.g. in-game-only rows when opened from the main menu
}

export function Settings({ schema = defaultSchema, onChange, onAction, info = {}, onBack = () => screens.pop(),
  storageKey = settingsStorageKey(), load = () => loadFromBrowser(storageKey), save = (values) => saveToBrowser(storageKey, values), words, labels = {}, hide = [] }: SettingsProps) {
  const w = { ...settingsWords, ...words }
  const [values, setValues] = useState(() => withSaved(schema, load()))
  const tabs = schema.tabs
    .map((tab) => ({ ...tab, rows: visibleRows(tab.rows, hide) }))
    .filter((tab) => tab.rows.length > 0) // (a tab of only headings has none left by now)
  const [tabId, setTabId] = useState<string | undefined>(tabs[0]?.id)
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]
  const labelOf = (item: { id: string; label: string }) => labels[item.id] ?? item.label

  function update(next: SettingsValues, changedId: string) {
    setValues(next)
    save(next)
    applyAccessibility(next)
    onChange?.(next, changedId)
  }
  const set = (id: string) => (value: SettingValue) => update({ ...values, [id]: value }, id)

  function control(row: SettingRow, label: string) {
    const value = values[row.id]
    switch (row.type) {
      case 'slider': return <Slider label={label} value={Number(value)} min={row.min} max={row.max} step={row.step} onChange={set(row.id)} />
      case 'toggle': return <Toggle label={label} on={value === true} onChange={set(row.id)} />
      case 'selector': return <Selector label={label} options={row.options ?? []} value={String(value)} onChange={set(row.id)} />
      case 'stepper': return <Stepper label={label} value={Number(value)} min={row.min} max={row.max} step={row.step} onChange={set(row.id)} />
      case 'info': return <Text kind="caption">{info[row.id] ?? String(row.default ?? '')}</Text>
      case 'destructive': return (
        <Button variant="danger" onClick={() => askConfirm({ title: `${label}?`, message: row.confirm, danger: true,
          words: { yes: row.button ?? label }, onConfirm: () => onAction?.(row.id) })}>{row.button ?? label}</Button>
      )
      default: return null
    }
  }
  // Links only open web and mail addresses (never javascript: or file:)
  const openLink = (url?: string) => { if (url && /^(https?:|mailto:)/i.test(url)) window.open(url, '_blank', 'noopener') }
  // A button row with "confirm" asks first ("Change your name?" + its question), then acts — a plain OK, not the red one
  const pressButton = (row: SettingRow, label: string) => () => row.confirm
    ? askConfirm({ title: `${label}?`, message: row.confirm, words: { yes: row.button ?? label }, onConfirm: () => onAction?.(row.id) })
    : onAction?.(row.id)
  const openRow = (row: SettingRow) =>
    row.type === 'link' ? () => openLink(row.url) : row.type === 'button' ? pressButton(row, labelOf(row)) : undefined

  const tabPicker = {
    label: w.title, tabs: tabs.map(labelOf), value: tab ? labelOf(tab) : '',
    onChange: (label: string) => setTabId(tabs.find((t) => labelOf(t) === label)?.id),
  }

  // One tab's list: its rows (headings as section titles), then Reset — which scrolls with the rows, so short
  // landscape phones keep their room for rows
  const page = (t: (typeof tabs)[number]) => <>
    {t.rows.map((row) => row.type === 'heading' ? (
      <div key={row.id} className="kit-settings-heading"><Text kind="heading">{labelOf(row)}</Text></div>
    ) : (
      <ListRow key={row.id} label={labelOf(row)} detail={row.detail} onClick={openRow(row)}>
        {openRow(row) ? <Text kind="caption">›</Text> : control(row, labelOf(row))}
      </ListRow>
    ))}
    {t.rows.some(holdsValue) && (
      <Row justify="end">
        <Button variant="ghost" onClick={() => update({ ...values, ...defaultValues(schema, t.id) }, t.id)}>{w.reset}</Button>
      </Row>
    )}
  </>

  return (
    <Screen label={w.title} grow="down">
      <Panel depth={2} gap="m" className="kit-wide">
        <MenuHeader title={w.title} onBack={onBack} backLabel={w.back} />
        {/* 3 tabs or fewer: always the tab bar, on one line. More: phones and short screens get ◀ Audio ▶ instead
            (8 tabs would fill half the screen). One tab: no picker at all. */}
        {tabs.length > 1 && tabs.length <= 3 && <div className="kit-settings-few"><Tabs {...tabPicker} /></div>}
        {tabs.length > 3 && <>
          <div className="kit-settings-tabs"><Tabs {...tabPicker} /></div>
          <div className="kit-settings-picker"><Selector {...tabPicker} options={tabPicker.tabs} /></div>
        </>}
        {/* Every tab's page is drawn in the same spot, so the TALLEST one sets the card's height: switching tabs never
            resizes the card or moves its header (Muzzy 2026-10-13). Only the current one shows; the others are inert
            and hidden from screen readers. A new tab starts scrolled to its top (key). */}
        {tab && (
          <ScrollArea key={tab.id} label={labelOf(tab)}>
            <div className="kit-settings-pages">
              {tabs.map((t) => {
                const current = t.id === tab.id
                return (
                  <div key={t.id} className="kit-settings-page" data-current={current || undefined}
                    aria-hidden={!current || undefined} inert={!current || undefined}>{page(t)}</div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </Panel>
    </Screen>
  )
}

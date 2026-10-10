// THE BMUZ DEV KIT — developer tools that live inside the game. From the Game Framework (devkit/):
// copied into the game's src/devkit/ by install-devkit — don't edit it here, change it in the framework.
// main.tsx loads it (via mount.tsx) with a dynamic import: always in dev; in release builds only while
// content/devkit.json "inReleaseBuilds" is true (through beta). When it's false, the live build has none of it.
// Release builds can't Save (no dev server) — tools offer Copy for Claude instead (CAN_SAVE in saveContent.ts).
//   Open:  the ` key (desktop) or triple-tap the top-right corner (phone)
//   Close: Esc, the ✕ button, or ` again
// Tools are tabs on their own full-width row under the title: the kit's own (KIT_TABS), then the game's own from src/devkit-game/tabs.ts.
// More than fit → ◀ ▶ and page dots (carousel/Carousel.tsx), never a sideways scroll bar.
// Under the tabs: a search box (search/SearchBar.tsx) that searches ONLY the open tab ("Search Tuning…"): the tab gets
// the text as its `query` prop and filters its own rows, highlighted. Picking another tab clears it. In a tab with
// sections, tapping a section title in the results clears the search and takes you there. Esc clears it, then closes.
// The one rule (DEVKIT.md): tools edit content/ JSON files, never code.
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { gameTabs } from '../devkit-game/tabs'
import { CaptureTab } from './capture/CaptureTab'
import { Carousel } from './carousel/Carousel'
import { ColorTab } from './color/ColorTab'
import { CAN_SAVE } from './saveContent'
import { SearchBar } from './search/SearchBar'
import { DevKitSearch } from './search/searchContext'
import { goToSection } from './search/sectionState'
import { SnapshotsTab } from './snapshots/SnapshotsTab'
import { TuningTab } from './tuning/TuningTab'
import { tuningFiles } from './tuning/tuningFiles'
import './devkit.css'
import './search/search.css'

// Searched for by the release check (check-devkit.mjs) — it must never appear in a build with the Dev Kit off
const DEVKIT_MARKER = 'bmuz-devkit-console'

/**
 * One tool = one tab. A game adds its own in src/devkit-game/tabs.ts.
 * Search: while the tab is open, its Panel gets the search box's text as `query` ('' = not searching) and filters
 * its own rows (search/searchLogic.ts + search/Section.tsx help; useContext(DevKitSearch).goTo jumps to a section).
 * searchable: false hides the search box on that tab (a tool with nothing to search).
 */
export type DevKitTab = { id: string; label: string; Panel: ComponentType<{ query?: string }>; searchable?: boolean }

// Loaded on first use, and only in dev: in a release build import.meta.env.DEV is false, so this import is dropped
const ScreensTab = import.meta.env.DEV ? lazy(() => import('./previews/PreviewsTab')) : null
function ScreensPanel({ query }: { query?: string }) {
  return ScreensTab && <Suspense fallback={<p className="devkit-not-plugged">Loading…</p>}><ScreensTab query={query} /></Suspense>
}

// While a screen preview is open it owns the keys (Esc closes it) and the whole window, so the panel stands aside
const previewOpen = () => document.querySelector('dialog.devkit-preview[open]') !== null

const KIT_TABS: DevKitTab[] = [
  { id: 'color', label: 'Color', Panel: ColorTab },
  // Only when the game has content/tuning/*.json files
  ...(tuningFiles.length > 0 ? [{ id: 'tuning', label: 'Tuning', Panel: TuningTab }] : []),
  // These two need the game's adapter (registerDevKitGame, devkitGame.ts); without it they say how to add it
  { id: 'snapshots', label: 'Snapshots', Panel: SnapshotsTab },
  { id: 'bugs', label: 'Bugs', Panel: CaptureTab },
  // Screen previews: DEV ONLY — never in a release build, even while inReleaseBuilds is true (previews/PreviewsTab.tsx)
  ...(ScreensTab ? [{ id: 'screens', label: 'Screens', Panel: ScreensPanel }] : []),
]

const CORNER_SIZE_PX = 64 // the invisible top-right square you triple-tap on a phone
const TRIPLE_TAP_MS = 700 // all three taps must land within this time
const GHOST_CLICK_MS = 500 // see closeFromButton

// Is the player typing in one of the game's text boxes? Then ` is just a character, not the Dev Kit key.
// (The Dev Kit's own boxes never need a `, so there it still opens/closes the panel.)
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || el.closest?.('.devkit')) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function DevKit({ tabs = [...KIT_TABS, ...gameTabs] }: { tabs?: DevKitTab[] }) {
  const [open, setOpen] = useState(false)
  const [tabId, setTabId] = useState(tabs[0]?.id)
  const [query, setQuery] = useState('')
  const openRef = useRef(open) // the key handler below reads these (it's set up once)
  const queryRef = useRef(query)
  const panel = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    queryRef.current = query
  }, [query])
  useEffect(() => {
    openRef.current = open
    // The game's toasts and tooltips are browser popovers, which float above any z-index.
    // Making the panel a popover too puts it on top of whatever is showing when it opens.
    const el = panel.current
    if (!el?.showPopover) return // older browsers: `hidden` alone shows/hides it
    if (open && !el.matches(':popover-open')) el.showPopover()
    if (!open && el.matches(':popover-open')) el.hidePopover()
  }, [open])

  // A game that goes full screen on a tap (a phone's first tap) puts the page in the browser's top layer ABOVE the
  // open panel, hiding it. Showing the popover again lifts it back on top.
  useEffect(() => {
    const lift = () => {
      const el = panel.current
      if (!openRef.current || !el?.showPopover || !el.matches(':popover-open')) return
      el.hidePopover()
      el.showPopover()
    }
    document.addEventListener('fullscreenchange', lift)
    return () => document.removeEventListener('fullscreenchange', lift)
  }, [])

  // ` toggles, Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewOpen()) return
      if ((e.key === '`' || e.code === 'Backquote') && !isTyping(e.target)) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && openRef.current) {
        e.stopPropagation() // the Dev Kit eats this Esc so the game doesn't also react to it
        if (queryRef.current) setQuery('') // first Esc clears the search, the next one closes
        else setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Triple-tap the top-right corner (phones have no ` key)
  const lastTripleTap = useRef(-Infinity)
  useEffect(() => {
    let taps: number[] = []
    const onDown = (e: PointerEvent) => {
      const inCorner = e.clientX > window.innerWidth - CORNER_SIZE_PX && e.clientY < CORNER_SIZE_PX
      const onPanel = (e.target as HTMLElement | null)?.closest?.('.devkit')
      if (!inCorner || onPanel || previewOpen()) return
      const now = performance.now()
      taps = taps.filter((t) => now - t < TRIPLE_TAP_MS)
      taps.push(now)
      if (taps.length >= 3) {
        taps = []
        lastTripleTap.current = now
        setOpen((o) => !o)
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [])

  // The third tap's "click" arrives after the panel has opened — right on top of ✕. Ignore that one.
  const closeFromButton = () => {
    if (performance.now() - lastTripleTap.current > GHOST_CLICK_MS) setOpen(false)
  }

  // Search: only the open tab, and only if it can be searched
  const activeTab = tabs.find((t) => t.id === tabId)
  const searchable = activeTab !== undefined && activeTab.searchable !== false

  // Each tab keeps its own scroll position (they share one scrolling area)
  const scrollTops = useRef<Record<string, number>>({})
  const view = tabId
  const shownView = useRef(view)
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box || shownView.current === view) return
    box.scrollTop = scrollTops.current[view] ?? 0
    shownView.current = view
  }, [view])
  const remember = () => {
    if (scroller.current) scrollTops.current[shownView.current] = scroller.current.scrollTop
  }
  const pickTab = (id: string) => {
    remember()
    setQuery('')
    setTabId(id)
  }
  // A section title tapped in the results: the search clears, the section opens and is scrolled to
  const goTo = (sectionId: string) => {
    setQuery('')
    goToSection(sectionId)
  }

  // The panel stays mounted while hidden, so unsaved edits survive closing and reopening it.
  return (
    <aside ref={panel} {...{ popover: 'manual' }} className="devkit" data-devkit={DEVKIT_MARKER} hidden={!open} aria-label="Dev Kit">
      {/* Two rows: a small title + ✕, then the tool tabs across the panel's FULL width (more tabs per page) */}
      <header className="devkit-top">
        <div className="devkit-title-row">
          <strong className="devkit-title">Dev Kit</strong>
          <button className="devkit-close" onClick={closeFromButton} aria-label="Close the Dev Kit" title="Close (Esc)">
            ✕
          </button>
        </div>
        {/* More tools than fit (a phone): a dot carousel, never a sideways scroll bar */}
        <Carousel className="devkit-tabs" label="Tools" role="tablist" active={tabs.findIndex((t) => t.id === tabId)}>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tabId}
              className="devkit-tab"
              onClick={() => pickTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </Carousel>
        {searchable && <SearchBar value={query} onChange={setQuery} label={activeTab.label} />}
      </header>
      {!CAN_SAVE && (
        <p className="devkit-live-note">Live build: changes last until you refresh — copy them for Claude to keep.</p>
      )}
      {/* One scrolling area for every tab (each remembers its own scroll position) */}
      <div ref={scroller} className="devkit-scroll">
        <DevKitSearch.Provider value={{ goTo }}>
          {tabs.map((t) => (
            <section key={t.id} className="devkit-body" hidden={t.id !== tabId} role="tabpanel" aria-label={t.label}>
              <t.Panel query={t.id === tabId ? query : ''} />
            </section>
          ))}
        </DevKitSearch.Provider>
      </div>
    </aside>
  )
}

// SCREENS TOOL (screen previews) — look at screens that are normally gated (the end screen, a handoff, an online
// lobby with 4 players…) without playing your way there. DEV ONLY: DevKit.tsx loads this tab behind
// import.meta.env.DEV, so no release build has it, even while content/devkit.json "inReleaseBuilds" is true.
//   The list comes from the game: src/devkit-game/previews.tsx (gamePreviews.ts; the API is in previewTypes.ts).
//   Picking one opens it in a sandbox over the game (PreviewOverlay.tsx + frame.tsx + sandbox.ts): sample data
//   in a separate copy of the game, badged PREVIEW. Close it and the real game is exactly where it was.
//   A screen with Moments (the game's `moments` in the same file) lists them under its name: tapping one opens the
//   screen with that moment ready to ▶ / 🔁 and its feel knobs beside it (moments/MomentsPanel.tsx).
//   The Dev Kit's search box (while this tab is open) finds screens by name, group, note or variant, and by their moments.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { checkMoments, momentsFor, searchScreens } from '../moments/momentLogic'
import type { DevKitMoment } from '../moments/momentTypes'
import { Highlight, SearchCount } from '../search/Section'
import { searchTerms } from '../search/searchLogic'
import { PREVIEWS_FILE, loadGameMoments, loadGamePreviews } from './gamePreviews'
import { PreviewOverlay } from './PreviewOverlay'
import { dropBackGuard, pushBackGuard } from './overlayLogic'
import { groupPreviews, type DevKitPreview } from './previewTypes'
import './previews.css'

type Open = { preview: DevKitPreview; variant: string | undefined; moment?: string }

type Props = {
  load?: () => Promise<DevKitPreview[]>
  loadMoments?: () => Promise<DevKitMoment[]>
  query?: string // the Dev Kit's search box (while this tab is open)
}

export default function PreviewsTab({ load = loadGamePreviews, loadMoments = loadGameMoments, query = '' }: Props) {
  const [previews, setPreviews] = useState<DevKitPreview[] | null>(null)
  const [moments, setMoments] = useState<DevKitMoment[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState<Open | null>(null)

  useEffect(() => {
    Promise.all([load(), loadMoments()]).then(([list, found]) => {
      setPreviews(list)
      setMoments(found)
    }, (e: Error) => setProblem(e.message))
  }, [load, loadMoments])

  const show = (preview: DevKitPreview, variant?: string, moment?: string) => {
    pushBackGuard() // here, not in an effect — see PreviewOverlay.tsx
    setOpen({ preview, variant: variant ?? preview.variants?.[0]?.id, moment })
  }
  const close = (fromBack: boolean) => {
    dropBackGuard(fromBack)
    setOpen(null)
  }

  if (problem) return <p className="devkit-not-plugged">Couldn't load the previews: {problem}</p>
  if (!previews) return <p className="devkit-not-plugged">Loading…</p>
  if (previews.length === 0) {
    return (
      <p className="devkit-not-plugged">
        No screen previews yet. Add <code>{PREVIEWS_FILE}</code> with <code>export const previews: DevKitPreview[]</code> —
        see <code>src/devkit/previews/previewTypes.ts</code>.
      </p>
    )
  }

  const momentProblems = checkMoments(moments, previews.map((p) => p.id))
  const terms = searchTerms(query)
  const found = searchScreens(previews, moments, query)
  const shownMoments = (id: string) => found.find((f) => f.preview.id === id)?.moments ?? []
  return (
    <div className="pv">
      <p className="pv-intro">Opens a screen with sample data in a sandbox over the game. Nothing in it is saved or sent; ✕ / Esc / Back returns you here.</p>
      {momentProblems.length > 0 && (
        <ul className="pv-problems" role="alert">{momentProblems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <SearchCount query={query} found={found.length} what="screen" where="Screens" />
      {groupPreviews(found.map((f) => f.preview)).map(({ group, previews: list }) => (
        <section key={group} className="pv-section">
          <h3 className="pv-heading"><Highlight text={group} terms={terms} /></h3>
          <ul className="pv-list">
            {list.map((p) => (
              <li key={p.id} className="pv-row">
                <div className="pv-info">
                  <span className="pv-name"><Highlight text={p.label} terms={terms} />{p.hint && <span className="pv-hint">{p.hint}</span>}</span>
                  {p.note && <span className="pv-note"><Highlight text={p.note} terms={terms} /></span>}
                </div>
                <div className="pv-buttons">
                  {p.variants && p.variants.length > 0
                    ? p.variants.map((v) => (
                        <button key={v.id} className="devkit-btn" data-preview={p.id} data-variant={v.id} onClick={() => show(p, v.id)}>{v.label}</button>
                      ))
                    : <button className="devkit-btn" data-preview={p.id} onClick={() => show(p)}>Open</button>}
                </div>
                {shownMoments(p.id).length > 0 && (
                  <div className="pv-moments" aria-label={`${p.label} moments`}>
                    <span className="pv-moments-title">Moments</span>
                    {shownMoments(p.id).map((m) => (
                      <button key={m.id} className="pv-moment" data-moment={m.id} onClick={() => show(p, undefined, m.id)} title={m.note}>
                        <Highlight text={m.label} terms={terms} />
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {open && createPortal(
        <PreviewOverlay key={open.preview.id} preview={open.preview} variant={open.variant}
          moments={momentsFor(moments, open.preview.id)} allMoments={moments} focusMoment={open.moment}
          onVariant={(variant) => setOpen({ ...open, variant })} onClose={close} />,
        document.body,
      )}
    </div>
  )
}

// FONTS TOOL (Dev Kit 0.17.0) — pick the game's Title, Heading, Body and Numbers fonts by trying them side by side.
//   Fonts in the game: every font it can use — the UI kit's own and the game's (content/ui/fonts.json, files in
//     public/fonts/) — each with its licence chip (🟢 fine to sell · 🟡 credit it · 🔴 not for sale / unknown).
//   One section per role: a dropdown, and the same sample line in EVERY font at that role's real size — tap one to pick
//     it. It's live in the game at once. A pixel font says whether it's crisp at that size. ↺ = back to saved.
//   Library (npm run dev only): every font in the designer's font folder (vite/fontLibrary.ts says which folder).
//     Try = it joins the comparisons; Add to game = copied into public/fonts/, listed in fonts.json and credits.json.
//     Save waits while a role uses a library font that isn't in the game yet (the game must ship what it shows).
//   Save writes the four values into content/ui/style.json "tweaks" (styleStore.ts — shared with the Color tab).
// The sample lines: the game's fonts.json "samples": { "title": "…", "heading": "…", "body": "…", "numbers": "…" }.
import { useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Highlight, SearchCount, Section } from '../search/Section'
import { DevKitSearch } from '../search/searchContext'
import { matchesAll, searchTerms } from '../search/searchLogic'
import { CAN_SAVE, copyText } from '../saveContent'
import { copyForClaudeText, type Change } from '../color/colorLogic'
import { useStyle } from '../color/styleStore'
import { shapeDefault } from '../color/styleValues'
import { gameFontsFile, styleStore, uiKit, type KitFont } from '../color/uiKit'
import { addLibraryFont, libraryFontUrl, loadLibrary, previewFont, type LibraryFont, type LibraryList } from './fontLibrary'
import {
  ALPHABET, ALPHABET_CAPS, DEFAULT_SAMPLES, FONT_ROLES, FONT_TOKENS, crispness, cssPixels, fontChoices, fontValue, fontWords, gameFontFor,
  isFont, licenceChip, prettyFontName, rolesOnLibraryFonts, type FontChoice, type FontRole,
} from './fontsLogic'
import './fonts.css'

const LIBRARY_SHOWN = 60 // library rows shown at once (it may hold hundreds) — search to narrow

export function FontsTab({ query = '' }: { query?: string }) {
  if (!styleStore || !uiKit) {
    return <p className="ct-legend ft">This game doesn't use the Game UI kit (src/ui/kit + content/ui/style.json), so there are no fonts to pick here.</p>
  }
  return <FontsEditor query={query} />
}

function FontsEditor({ query }: { query: string }) {
  const { goTo } = useContext(DevKitSearch)
  const store = styleStore!
  const { live, saved, loaded } = useStyle(store)
  const [gameFonts, setGameFonts] = useState<KitFont[]>(gameFontsFile?.fonts ?? [])
  const [trying, setTrying] = useState<FontChoice[]>([])
  const [library, setLibrary] = useState<LibraryList | null>(null)
  const [libraryProblem, setLibraryProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // the library path being tried / added
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null)

  const terms = searchTerms(query)
  const samples = { ...DEFAULT_SAMPLES, ...((gameFontsFile as { samples?: Partial<typeof DEFAULT_SAMPLES> } | undefined)?.samples ?? {}) }
  const choices = fontChoices(uiKit!.kitFonts ?? [], gameFonts, trying)
  const blocked = rolesOnLibraryFonts(live, choices)
  const dirty = FONT_TOKENS.some((t) => live[t] !== saved[t])

  // The game's fonts are declared on the page (the game does it at start-up too; again after Add to game)
  useEffect(() => {
    uiKit!.loadGameFonts?.({ fonts: gameFonts }, import.meta.env.BASE_URL)
  }, [gameFonts])

  // The font library (dev only)
  useEffect(() => {
    if (!CAN_SAVE) return
    let gone = false
    loadLibrary().then(
      (list) => { if (!gone) setLibrary(list) },
      (e: Error) => { if (!gone) setLibraryProblem(e.message) },
    )
    return () => { gone = true }
  }, [])

  // Each role's size in the game right now, in px (the kit's text sizes; they follow text size + heading step)
  const page = getComputedStyle(document.documentElement)
  const remPx = parseFloat(page.fontSize) || 16
  const rolePx = (role: FontRole) => cssPixels(page.getPropertyValue(`--${role.size}`), remPx) || 18

  const pick = (role: FontRole, value: string) => store.set({ [role.token]: value })

  async function tryLibraryFont(font: LibraryFont) {
    if (gameFontFor(font.path, gameFonts) || trying.some((t) => t.libraryPath === font.path)) return
    // Same name as a font the game already has (but a different file)? Keep them apart
    const taken = choices.some((c) => c.name === font.name)
    const name = taken ? `${prettyFontName(font.path)} (library)` : font.name
    setBusy(font.path)
    try {
      await previewFont(name, libraryFontUrl(font.path))
      setTrying((t) => [...t, { name, source: 'library', licence: 'unknown', licenceNote: 'Not in the game yet — Add to game, then check its licence', libraryPath: font.path }])
      setStatus({ kind: 'ok', text: `${name} is in the comparisons now — pick it in any role.` })
    } catch {
      setStatus({ kind: 'error', text: `Couldn't load ${font.path} — the file may be broken or not a font the browser reads.` })
    }
    setBusy(null)
  }

  async function addToGame(path: string) {
    setBusy(path)
    setStatus({ kind: 'info', text: 'Adding to the game…' })
    try {
      const { font, wrote, already } = await addLibraryFont(path)
      const tried = trying.find((t) => t.libraryPath === path)
      setGameFonts((fonts) => (fonts.some((f) => f.file === font.file) ? fonts : [...fonts, font]))
      setTrying((t) => t.filter((f) => f.libraryPath !== path))
      // Roles that were trying it now point at the game's copy
      if (tried) {
        const moved: Record<string, string> = {}
        for (const role of FONT_ROLES) if (isFont(live[role.token], tried.name)) moved[role.token] = fontValue(font.name)
        if (Object.keys(moved).length > 0) store.set(moved)
      }
      setStatus({
        kind: 'ok',
        text: already
          ? `${font.name} was already in the game.`
          : `Added ${font.name}: ${wrote.join(', ')}. Its licence says 🔴 unknown until someone reads it — fix "licence" in content/ui/fonts.json.`,
      })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't add it: ${(e as Error).message}` })
    }
    setBusy(null)
  }

  async function save() {
    setStatus({ kind: 'info', text: 'Saving…' })
    try {
      await store.save(FONT_TOKENS)
      setStatus({ kind: 'ok', text: 'Saved the fonts to content/ui/style.json — refresh and they stay.' })
    } catch (e) {
      setStatus({ kind: 'error', text: `Couldn't save: ${(e as Error).message}` })
    }
  }

  async function copyForClaude() {
    const changes: Change[] = FONT_ROLES.filter((r) => loaded[r.token] !== live[r.token]).map((r) => ({
      name: `${r.label} font (${r.token})`,
      from: fontWords(loaded[r.token], live),
      to: `${fontWords(live[r.token], live)} — "${live[r.token]}"`,
    }))
    let text = copyForClaudeText(document.title, changes, !dirty, !CAN_SAVE, 'Font', 'content/ui/style.json')
    if (blocked.length > 0) text += `\n(${blocked.map((r) => r.label).join(', ')} use a font from the font library that isn't in the game yet.)`
    if (await copyText(text)) {
      setCopyFallback(null)
      setStatus({ kind: 'ok', text: 'Copied — paste it into your chat with Claude.' })
    } else {
      setCopyFallback(text)
      setStatus({ kind: 'error', text: 'The browser blocked copying — select the text below and copy it.' })
    }
  }

  const fontFound = (c: FontChoice) => matchesAll(terms, [c.name, c.source, c.note, c.licenceNote, licenceChip(c.licence).words])
  const shownChoices = choices.filter(fontFound)
  const libraryFonts = (library?.fonts ?? []).filter((f) => matchesAll(terms, [f.name, f.path]))
  const found = shownChoices.length + (library ? libraryFonts.length : 0)

  return (
    <div className="ct ft">
      <SearchCount query={query} found={found} what="font" where="Fonts" />
      {terms.length === 0 && (
        <p className="ct-legend">
          Tap a sample to use that font — it shows in the game at once. <span className="ct-dot" /> = changed, not saved yet. 🟢 fine in a game you sell ·
          🟡 credit it · 🔴 not for sale / unknown.
        </p>
      )}

      <Section id="fonts:in the game" title="Fonts in the game" count={shownChoices.length} terms={terms} defaultOpen={false} onGoTo={() => goTo('fonts:in the game')}>
        <p className="ct-legend">The UI kit's own + the game's (content/ui/fonts.json, files in public/fonts/)</p>
        <ul className="ft-list">
          {shownChoices.map((c) => (
            <li key={c.name} className="ft-list-row">
              <LicenceChip licence={c.licence} />
              <span className="ft-list-name" style={{ fontFamily: fontValue(c.name) }}><Highlight text={c.name} terms={terms} /></span>
              <span className="ft-tag">{c.source === 'kit' ? 'UI kit' : c.source === 'game' ? 'game' : 'library'}</span>
              <span className="ft-list-note">{[c.licenceNote ?? licenceChip(c.licence).words, c.note].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </Section>

      {FONT_ROLES.map((role) => {
        const px = rolePx(role)
        const value = live[role.token]
        const fallback = shapeDefault(store.preset, role.token) // the style's own font for this role
        const changed = value !== saved[role.token]
        const onLibrary = blocked.includes(role)
        const tried = onLibrary ? trying.find((t) => isFont(value, t.name)) : undefined
        return (
          <Section
            key={role.id}
            id={`fonts:${role.label}`}
            title={`${role.label} font`}
            count={shownChoices.length + (terms.length === 0 ? 1 : 0)}
            terms={terms}
            defaultOpen={role.id === 'title'}
            changed={changed}
            onGoTo={() => goTo(`fonts:${role.label}`)}
          >
            <p className="ct-legend">{role.what} · shown at {Math.round(px * 10) / 10} px, as in the game</p>
            <div className="ft-now">
              <label className="ft-now-label">
                {changed && <span className="ct-dot" title="Changed, not saved yet" />}
                <span className="ft-now-what">{role.label}:</span>
                <select
                  className="ct-choice ft-pick"
                  value={choices.find((c) => value !== fallback && isFont(value, c.name))?.name ?? (value === fallback ? '' : value)}
                  onChange={(e) => pick(role, e.target.value === '' ? fallback : fontValue(e.target.value))}
                  aria-label={`${role.label} font — pick one`}
                >
                  <option value="">{fontWords(fallback, live)} — the style's own</option>
                  {value !== fallback && !choices.some((c) => isFont(value, c.name)) && <option value={value}>{value}</option>}
                  {choices.map((c) => <option key={c.name} value={c.name}>{licenceChip(c.licence).light} {c.name}{c.source === 'library' ? ' (library — not in the game)' : ''}</option>)}
                </select>
              </label>
              <button
                className="ct-reset"
                disabled={!changed}
                onClick={() => store.undo([role.token])}
                title={`Back to saved: ${fontWords(saved[role.token], live)}`}
                aria-label={`Reset the ${role.label} font — back to saved (${fontWords(saved[role.token], live)})`}
              >
                ↺
              </button>
            </div>
            {onLibrary && tried?.libraryPath && (
              <p className="ft-warn">
                {tried.name} is from your font library, not in the game yet — Save waits.{' '}
                <button className="devkit-btn" disabled={busy !== null} onClick={() => addToGame(tried.libraryPath!)}>Add to game</button>
              </p>
            )}
            <div className="ft-samples" role="group" aria-label={`${role.label} font — compare`}>
              {terms.length === 0 && (
                <Sample role={role} label={fontWords(fallback, live)} tag="style's own" family={fallback} px={px} sample={samples[role.id]} picked={value === fallback} onPick={() => pick(role, fallback)} />
              )}
              {shownChoices.map((c) => (
                <Sample
                  key={c.name}
                  role={role}
                  label={<Highlight text={c.name} terms={terms} />}
                  tag={c.source === 'library' ? 'library' : undefined}
                  family={fontValue(c.name)}
                  px={px}
                  sample={samples[role.id]}
                  licence={c.licence}
                  pixelSize={c.pixelSize}
                  picked={value !== fallback && isFont(value, c.name)}
                  onPick={() => pick(role, fontValue(c.name))}
                />
              ))}
            </div>
          </Section>
        )
      })}

      {CAN_SAVE && (
        <Section id="fonts:Library" title="Font library" count={library ? libraryFonts.length : 0} terms={terms} defaultOpen={false} onGoTo={() => goTo('fonts:Library')}>
          {libraryProblem && <p className="devkit-status is-error">Couldn't read the font library: {libraryProblem}</p>}
          {library && !library.found && (
            <p className="ct-legend">No font library at {library.folder}. Put fonts there, or point to another folder in devkit.local.json (the game's folder): {'{ "fontLibrary": "D:/Fonts" }'}</p>
          )}
          {library?.found && (
            <>
              <p className="ct-legend">
                {library.folder} · {library.fonts.length}{library.more ? '+' : ''} fonts · Try = into the comparisons above · Add to game = copied into public/fonts/ with its licence files
              </p>
              <ul className="ft-list">
                {libraryFonts.slice(0, LIBRARY_SHOWN).map((f) => {
                  const inGame = gameFontFor(f.path, gameFonts)
                  const isTried = trying.some((t) => t.libraryPath === f.path)
                  return (
                    <li key={f.path} className="ft-list-row ft-lib-row">
                      <span className="ft-list-name"><Highlight text={f.name} terms={terms} /></span>
                      <span className="ft-list-note"><Highlight text={f.path} terms={terms} /></span>
                      <span className="ft-lib-actions">
                        {inGame ? (
                          <span className="ft-tag">in the game{inGame.name !== f.name ? ` as ${inGame.name}` : ''} ✓</span>
                        ) : (
                          <>
                            <button className="devkit-btn" disabled={isTried || busy !== null} onClick={() => tryLibraryFont(f)}>{isTried ? 'Trying' : 'Try'}</button>
                            <button className="devkit-btn" disabled={busy !== null} onClick={() => addToGame(f.path)}>Add to game</button>
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {libraryFonts.length > LIBRARY_SHOWN && (
                <p className="ct-legend">Showing {LIBRARY_SHOWN} of {libraryFonts.length} — type in the search box to narrow.</p>
              )}
            </>
          )}
        </Section>
      )}

      <footer className="devkit-footer">
        {CAN_SAVE && (
          <button className="devkit-btn devkit-btn-main" disabled={!dirty || blocked.length > 0} onClick={save}
            title={blocked.length > 0 ? 'Add the library font to the game first' : undefined}>
            Save
          </button>
        )}
        <button className={CAN_SAVE ? 'devkit-btn' : 'devkit-btn devkit-btn-main'} onClick={copyForClaude}>Copy for Claude</button>
        <button className="devkit-btn" disabled={!dirty} onClick={() => store.undo(FONT_TOKENS)} title="Put every font back to what's saved">
          {CAN_SAVE ? 'Undo unsaved' : 'Undo changes'}
        </button>
        {blocked.length > 0 && <p className="devkit-status is-error">{blocked.map((r) => r.label).join(', ')}: a library font — Add to game before saving.</p>}
        {status && <p className={`devkit-status is-${status.kind}`} role="status">{status.text}</p>}
        {copyFallback && <textarea className="ct-copy" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />}
      </footer>
    </div>
  )
}

function LicenceChip({ licence }: { licence: string }) {
  const chip = licenceChip(licence)
  return <span className="ft-chip" title={chip.words} aria-label={chip.words}>{chip.light}</span>
}

type SampleProps = {
  role: FontRole
  label: ReactNode
  tag?: string
  family: string
  px: number
  sample: string
  licence?: string
  pixelSize?: number
  picked: boolean
  onPick: () => void
}

/** One font in a role's comparison: its name, licence and crispness, then the sample line in it at the role's size. Tap = pick. */
function Sample({ role, label, tag, family, px, sample, licence, pixelSize, picked, onPick }: SampleProps) {
  const crisp = crispness(pixelSize, px)
  const look = { fontFamily: family, fontSize: `${px}px`, textTransform: role.caps ? 'var(--text-case)' : undefined } as CSSProperties
  return (
    <button type="button" className="ft-sample" aria-pressed={picked} onClick={onPick}>
      <span className="ft-sample-head">
        {licence && <LicenceChip licence={licence} />}
        <span className="ft-sample-name">{label}</span>
        {tag && <span className="ft-tag">{tag}</span>}
        {crisp && <span className={crisp.crisp ? 'ft-crisp' : 'ft-soft'}>{crisp.words}</span>}
        {picked && <span className="ft-picked">✓ in use</span>}
      </span>
      <span className="ft-sample-text" style={look}>{sample}</span>
      <span className="ft-sample-text ft-sample-abc" style={look}>{role.caps ? ALPHABET_CAPS : ALPHABET}</span>
    </button>
  )
}

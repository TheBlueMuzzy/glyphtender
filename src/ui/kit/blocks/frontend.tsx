// FRONT END — MainMenu, ModeSelect, HowToPlay, Credits.
// Each one is a screen: open it with screens.push('…'), and Back / Esc close it.
// A button only appears when you pass its function (no onQuit → no Quit button).
import { Children, useEffect, useState, type ReactNode } from 'react'
import { Grid, Panel, Row, Screen, Stack } from '../layout'
import { Button, Card, Badge, ScrollArea, Text, type ButtonArt } from '../controls'
import { screens } from '../screens'
import { Pips } from './hud'
import { MenuHeader } from './MenuHeader'
import { fill } from './words'
import { shown } from '../shown'

// MAIN MENU — the game's name, then its big buttons. The first one is the main (primary) one.
// Two ways to give the buttons:
//   items: your own list, in your order — [{ label: 'Play', onClick: play }, { label: 'Play online', onClick: online }].
//          primary: true marks the main button(s); if none is marked, the first one is.
//   or the named ones (onContinue, onPlay, onSettings…): shown in that fixed order. Ignored when items is given.
export const mainMenuWords = { continue: 'Continue', play: 'Play', settings: 'Settings', howToPlay: 'How to play', credits: 'Credits', quit: 'Quit' }
// locked: true = greyed like a disabled button, but a tap still calls onClick, so the game can say why
// (e.g. a Callout: "Finish your first game to unlock this"). Screen readers hear it as unavailable.
// art (0.11.0): the game's own button pictures for this item (Button art: { up, down?, label?, size? }).
// detail (0.23.0): a short second line inside the button, under its label — e.g. Continue's "Turn 7 · 5 min ago"
// (the saves module's continueLine). Inside the button, so the menu never jumps when it appears.
export type MainMenuItem = { label: string; onClick: () => void; primary?: boolean; locked?: boolean; art?: ButtonArt; detail?: string }
// titleArt (0.11.0): the game's logo picture in place of the title words (the words are still its name for screen readers).
// backdrop (0.11.0): a picture behind the whole menu (Screen backdrop; keeps its shape, crops what spills over).
type MainMenuProps = {
  title: string; subtitle?: string; version?: string; children?: ReactNode // children: extra buttons
  titleArt?: string; backdrop?: string
  items?: MainMenuItem[]
  onContinue?: () => void; onPlay?: () => void; onSettings?: () => void
  onHowToPlay?: () => void; onCredits?: () => void; onQuit?: () => void
  continueDetail?: string // the second line inside Continue (0.23.0), e.g. "Turn 7 · 5 min ago"
  words?: Partial<typeof mainMenuWords>
}
export function MainMenu({ title, subtitle, version, children, items, words, titleArt, backdrop, continueDetail, ...on }: MainMenuProps) {
  const w = { ...mainMenuWords, ...words }
  const named = ([
    { label: w.continue, onClick: on.onContinue, detail: continueDetail }, { label: w.play, onClick: on.onPlay },
    { label: w.settings, onClick: on.onSettings }, { label: w.howToPlay, onClick: on.onHowToPlay },
    { label: w.credits, onClick: on.onCredits }, { label: w.quit, onClick: on.onQuit },
  ] as Partial<MainMenuItem>[]).filter((item) => item.onClick) as MainMenuItem[]
  const buttons = items ?? named
  const anyMarked = buttons.some((item) => item.primary)
  const isPrimary = (item: MainMenuItem, i: number) => (anyMarked ? item.primary : i === 0)
  // On a phone on its side the buttons go in two columns from six on — the extra buttons (children) count too
  // (0.24.0: Glyphtender's 5 items + Full screen stayed one column and ran off the top once the version footer took a row)
  const buttonCount = buttons.length + Children.toArray(children).length
  // scroll (0.35.1, F145): taller than the window (200% text on a phone, upright or on its side) → the whole menu
  // scrolls as one, the version line under it — before, the buttons slid over the tagline and the version. When it
  // fits, it looks just as before (the centre opens in the middle).
  return (
    <Screen scroll label={title} bottom={version && <span className="kit-menu-version"><Text kind="caption">{version}</Text></span>} backdrop={backdrop}>
      <Stack gap="xl" className="kit-menu kit-main-menu kit-centred">
        <Stack gap="xs">
          {/* the game's name stays the same in every language (0.37.0, F156: translate="no") */}
          {titleArt ? <img className="kit-title-art" src={titleArt} alt={title} draggable={false} translate="no" /> : <Text kind="display" translate="no">{title}</Text>}
          {subtitle && <Text kind="caption">{subtitle}</Text>}
        </Stack>
        <Stack gap="s" className="kit-main-menu-buttons" data-many={buttonCount >= 6 || undefined}>
          {buttons.map((item, i) => (
            <Button key={`${i}-${item.label}`} variant={isPrimary(item, i) ? 'primary' : 'secondary'} onClick={item.onClick} art={item.art}
              sound={item.locked ? false : undefined} aria-disabled={item.locked || undefined} data-locked={item.locked || undefined}>
              {item.label}{item.detail && <span className="kit-button-detail">{item.detail}</span>}
            </Button>
          ))}
          {shown(children) && <div className="kit-main-menu-extra">{children}</div>}
        </Stack>
      </Stack>
    </Screen>
  )
}

// MODE SELECT — a card per mode (Solo, Party, Online…); pick one, then Start. ‹ (top left) goes back.
export const modeSelectWords = { title: 'Choose a mode', start: 'Start', back: 'Back' }
type Mode = { id: string; name: string; description?: string; badge?: string }
type ModeSelectProps = {
  modes: Mode[]; value: string; onChange: (id: string) => void; onStart: () => void
  onBack?: () => void; words?: Partial<typeof modeSelectWords>
}
export function ModeSelect({ modes, value, onChange, onStart, onBack = () => screens.pop(), words }: ModeSelectProps) {
  const w = { ...modeSelectWords, ...words }
  return (
    <Screen label={w.title} grow="down">
      <Panel depth={2} gap="m" className="kit-wide">
        <MenuHeader title={w.title} onBack={onBack} backLabel={w.back} />
        <ScrollArea label={w.title}>
          <Grid gap="m" min="s" fill>
            {modes.map((mode) => (
              <Card key={mode.id} title={mode.name} selected={mode.id === value} onClick={() => onChange(mode.id)}>
                {mode.description && <Text kind="caption">{mode.description}</Text>}
                {mode.badge && <Badge variant="primary">{mode.badge}</Badge>}
              </Card>
            ))}
          </Grid>
        </ScrollArea>
        <Row gap="s" justify="end">
          <Button onClick={onStart}>{w.start}</Button>
        </Row>
      </Panel>
    </Screen>
  )
}

// HOW TO PLAY — pages you flip through (a title, a picture, a few lines each).
// onSkip: a Skip button on every page but the last (e.g. a first-game overview: Skip goes straight to the game).
// ‹ (top left, 0.10.0) closes it — onClose, by default screens.pop(); the page's own Back / Next stay at the bottom.
// The page (title, picture, words) scrolls inside the card when it's taller than the room.
export const howToPlayWords = { title: 'How to play', next: 'Next', back: 'Back', close: 'Close', done: 'Got it', skip: 'Skip', page: 'Page {n} of {total}' }
type HowToPage = { title: string; body: ReactNode; image?: string }
type HowToPlayProps = { pages: HowToPage[]; onDone?: () => void; onSkip?: () => void; onClose?: () => void; words?: Partial<typeof howToPlayWords> }
export function HowToPlay({ pages, onDone = () => screens.pop(), onSkip, onClose = () => screens.pop(), words }: HowToPlayProps) {
  const w = { ...howToPlayWords, ...words }
  const [index, setIndex] = useState(0)
  const page = pages[index]
  const last = index === pages.length - 1
  return (
    <Screen label={w.title} grow="down">
      <Panel depth={2} gap="m" className="kit-modal">
        <MenuHeader title={w.title} onBack={onClose} backLabel={w.close} />
        <ScrollArea key={index} label={page.title}>
          <Stack gap="m">
            <Text kind="heading">{page.title}</Text>
            {page.image && <img className="kit-picture" src={page.image} alt="" />}
            <Text>{page.body}</Text>
          </Stack>
        </ScrollArea>
        <Row gap="s" justify="between">
          <Pips count={pages.length} filled={index + 1} label={fill(w.page, { n: index + 1, total: pages.length })} />
          <Row gap="s">
            {onSkip && !last && <Button variant="ghost" onClick={onSkip}>{w.skip}</Button>}
            {index > 0 && <Button variant="ghost" sound="back" onClick={() => setIndex(index - 1)}>{w.back}</Button>}
            <Button onClick={() => (last ? onDone() : setIndex(index + 1))}>{last ? w.done : w.next}</Button>
          </Row>
        </Row>
      </Panel>
    </Screen>
  )
}

// CREDITS — the people, then every font/art/sound credit from the game's content/credits.json
// (pass the file's contents as `assets`). Entries without a credit line use author + licence. ‹ (top left) goes back.
// notices (0.22.0): the licence texts of the code packages the game ships — release.mjs writes them to
// public/third-party-notices.txt at each release (F85). When that file is there, a button opens it; no file → no button.
// Pass another address, or false to leave it out.
export const creditsWords = { title: 'Credits', assets: 'Fonts, art & sound', code: 'Open-source code', notices: 'Open-source licences', back: 'Back' }
type CreditEntry = { credit?: string; author?: string; licence?: string; url?: string }
type CreditsProps = {
  people?: { role: string; names: string[] }[]; assets?: CreditEntry[]
  notices?: string | false
  onBack?: () => void; words?: Partial<typeof creditsWords>
}
export function Credits({ people = [], assets = [], notices = 'third-party-notices.txt', onBack = () => screens.pop(), words }: CreditsProps) {
  const w = { ...creditsWords, ...words }
  const hasNotices = useFileExists(notices)
  return (
    <Screen label={w.title} grow="down">
      <Panel depth={2} gap="m" className="kit-modal">
        <MenuHeader title={w.title} onBack={onBack} backLabel={w.back} />
        <ScrollArea label={w.title}>
          <Stack gap="l">
            {people.map((group) => (
              <Stack key={group.role} gap="xs">
                <Text kind="heading">{group.role}</Text>
                {group.names.map((name) => <Text key={name} translate="no">{name}</Text>)}
              </Stack>
            ))}
            {assets.length > 0 && (
              <Stack gap="xs">
                <Text kind="heading">{w.assets}</Text>
                {assets.map((a, i) => <Text key={i} kind="caption">{a.credit ?? `${a.author}, ${a.licence}`}</Text>)}
              </Stack>
            )}
            {hasNotices && notices && (
              <Stack gap="xs">
                <Text kind="heading">{w.code}</Text>
                <Button variant="ghost" onClick={() => window.open(notices, '_blank', 'noopener')}>{w.notices}</Button>
              </Stack>
            )}
          </Stack>
        </ScrollArea>
      </Panel>
    </Screen>
  )
}

// Is this text file really there? (A dev server answers every unknown address with the game's own page, so only a
// plain-text answer counts.) False until it knows.
function useFileExists(url: string | false) {
  const [found, setFound] = useState(false)
  useEffect(() => {
    if (!url || typeof fetch !== 'function') return
    let live = true
    fetch(url, { method: 'HEAD' })
      .then((r) => { if (live) setFound(r.ok && (r.headers.get('content-type') ?? '').includes('text/plain')) })
      .catch(() => {})
    return () => { live = false }
  }, [url])
  return found
}

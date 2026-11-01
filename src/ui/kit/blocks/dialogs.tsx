// DIALOGS & FEEDBACK — Modal, Confirm, WhatsNew, Toasts, Tooltip, RewardPopup, EmptyState, Spinner.
// Modal, Confirm and RewardPopup are screens: open them through the screen stack, so Esc,
// phone Back and "only the top screen takes taps" all work. Toasts and tooltips use the
// browser's own popover, so they float above everything without any positioning code.
// (The popover attributes go in as {...{ popover: 'auto' }} spreads: React 18's TypeScript types
// don't list them yet, React 19's do, and both versions put them on the page the same way.)
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { Grid, Panel, Row, Screen, Stack } from '../layout'
import { Button, Card, Text } from '../controls'
import { screens } from '../screens'
import { MenuHeader } from './MenuHeader'
import { shown } from '../shown'
import { fill } from './words'
import { MAX_WHATS_NEW_LINES, readLastSeen, shortVersion, whatsNewDecision, whatsNewProblems, writeLastSeen,
  type WhatsNewVersions } from './whatsNew'

// MODAL — a dialog box on top of whatever is open. actions = its buttons (bottom right).
// className: added to the box (kit-modal), for a block's own layout (Pause: kit-pause; Confirm: kit-ask, narrower).
// It's a menu card (0.10.0): the one menu width, the MenuHeader title row, as tall as its contents — it opens in the
// middle and then only grows downward (Screen grow="down"). Put a ScrollArea in it for anything long.
// onBack: a ‹ in the header (0.10.1) — for a modal that is a sub-menu (the game's Submit a word), instead of a Back
// button in `actions`; backLabel = how a screen reader says it.
// headerAction (0.27.0): one control on the RIGHT of the header row (MenuHeader's `action`), e.g. a compact Respec on
// an Upgrades dialog — `actions` stays the bottom buttons.
type ModalProps = {
  title: string; children?: ReactNode; actions?: ReactNode; headerAction?: ReactNode; className?: string
  onBack?: () => void; backLabel?: string
}
export function Modal({ title, children, actions, headerAction, className, onBack, backLabel }: ModalProps) {
  return (
    <Screen dialog label={title} grow="down">
      <Panel depth={2} gap="m" className={className ? `kit-modal ${className}` : 'kit-modal'}>
        <MenuHeader title={title} onBack={onBack} backLabel={backLabel} action={headerAction} />
        {children}
        {shown(actions) && <Row gap="s" justify="end">{actions}</Row>}
      </Panel>
    </Screen>
  )
}

// CONFIRM — "Are you sure?". danger paints the yes-button red (reset progress, quit, delete).
// A question, not a menu: it stays narrower than the menu cards (kit-ask, --kit-ask-w).
// Either button closes it first, then calls your function. Closing it any other way (Esc, phone
// Back, tapping the dim) counts as Cancel. onCancel runs once at most, and never after onConfirm.
export const confirmWords = { yes: 'OK', no: 'Cancel' }
export type ConfirmProps = {
  title: string; message?: string; danger?: boolean
  onConfirm: () => void; onCancel?: () => void; words?: Partial<typeof confirmWords>
}
export function Confirm({ title, message, danger, onConfirm, onCancel, words }: ConfirmProps) {
  const w = { ...confirmWords, ...words }
  const answered = useRef(false) // true once Yes or Cancel has run
  const close = (then?: () => void) => { answered.current = true; screens.pop(); then?.() }

  // Closed without an answer → that's a Cancel. Checked a moment after closing, because React's
  // StrictMode (while developing) closes and reopens every screen once, which isn't a real close.
  const isOpen = useRef(false)
  useEffect(() => {
    isOpen.current = true
    return () => {
      isOpen.current = false
      queueMicrotask(() => {
        if (isOpen.current || answered.current) return
        answered.current = true
        onCancel?.()
      })
    }
  }, [onCancel])
  return (
    <Modal title={title} className="kit-ask" actions={<>
      <Button variant="secondary" onClick={() => close(onCancel)}>{w.no}</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={() => close(onConfirm)}>{w.yes}</Button>
    </>}>
      {message && <Text>{message}</Text>}
    </Modal>
  )
}

// askConfirm({ title, onConfirm }) opens a Confirm from anywhere (Settings and Pause use it).
// ScreenStack always has the kit's own screens (0.25.0), so nothing to add; `...kitScreens` in a game's list still works.
let pendingConfirm: ConfirmProps | null = null
export function askConfirm(props: ConfirmProps) {
  pendingConfirm = props
  screens.push('confirm')
}
export const kitScreens = {
  confirm: () => (pendingConfirm ? <Confirm {...pendingConfirm} /> : null),
  'whats-new': () => (pendingWhatsNew ? <WhatsNew {...pendingWhatsNew} /> : null),
}

// WHAT'S NEW (0.35.0) — "here's what changed", once, on the first launch after an update (design §4c; the rule and the
// last-seen record: whatsNew.ts). Never by itself: the game calls showWhatsNew when it's safe — its main menu showing:
//   import whatsNew from '../content/text/whats-new.json'      { "notesUrl"?: "https://…", "versions": { "0.4.0": [3–5 lines] } }
//   useEffect(() => { showWhatsNew({ version: appVersion, ...whatsNew, words: text.whatsNew }) }, [])
// It opens as a kit screen (Esc, Back, tapping the dim close it) and is remembered as seen when it opens, so any way
// of closing counts. A first install, the same version, a build-only bump or a version with no entry show nothing.
// notesUrl: a "Full notes" button (the devlog / changelog page; http(s) only, opens a new tab).
export const whatsNewWords = { title: 'What’s new in v{version}', notes: 'Full notes', close: 'Got it' }
export type WhatsNewProps = {
  version: string; lines: readonly string[]; notesUrl?: string; onClose?: () => void; words?: Partial<typeof whatsNewWords>
}
const webAddress = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : undefined)
export function WhatsNew({ version, lines, notesUrl, onClose, words }: WhatsNewProps) {
  const w = { ...whatsNewWords, ...words }
  const notes = webAddress(notesUrl)
  return (
    <Modal title={fill(w.title, { version: shortVersion(version) })} actions={<>
      {notes && <Button variant="secondary" onClick={() => window.open(notes, '_blank', 'noopener')}>{w.notes}</Button>}
      <Button sound="back" onClick={() => { screens.pop(); onClose?.() }}>{w.close}</Button>
    </>}>
      <Stack gap="s">
        {lines.slice(0, MAX_WHATS_NEW_LINES).map((line, i) => <Text key={i}>{line}</Text>)}
      </Stack>
    </Modal>
  )
}

let pendingWhatsNew: WhatsNewProps | null = null
export type ShowWhatsNewOptions = {
  version: string; versions?: WhatsNewVersions; notesUrl?: string; words?: Partial<typeof whatsNewWords>; storageKey?: string
}
/** Show the What's new panel if this launch should (returns true when it opened). Call it from the main menu. */
export function showWhatsNew({ version, versions = {}, notesUrl, words, storageKey }: ShowWhatsNewOptions): boolean {
  if (import.meta.env?.DEV) for (const p of whatsNewProblems(versions)) console.warn(`[ui-kit] whats-new.json: ${p}`)
  const { entry, remember } = whatsNewDecision(version, readLastSeen(storageKey), versions)
  if (remember) writeLastSeen(remember, storageKey)
  if (!entry) return false
  pendingWhatsNew = { version: entry.version, lines: entry.lines, notesUrl, words }
  screens.push('whats-new')
  return true
}

// TOASTS — short messages that fade away ("Saved", "Sam joined"). Call toast('Saved') from
// anywhere; put <ToastStack /> once near the top of your app (outside the ScreenStack).
// dismissible: tapping the toast (or its ✕ Close button) hides it early.
// <ToastStack place="bottom" />: where they show — 'top' (default), 'center' or 'bottom' of the screen
// (of the game picture, in a letterboxed game that sets --kit-frame-w / --kit-frame-h).
// place="at" (0.14.0): at a point the GAME picks, e.g. just above the action where the player is looking. The game sets
// --kit-toasts-at (CSS px from the top of the game picture, e.g. '412px'); the stack's BOTTOM edge sits there (newest
// at the bottom, nearest the point; older ones pushed up) and it glides when the point moves (never jumps).
export type Toast = { id: number; text: string; variant: 'neutral' | 'danger'; dismissible: boolean }
export const MAX_TOASTS = 3 // older ones make room for new ones
let toastList: readonly Toast[] = []
let nextToastId = 1
const toastListeners = new Set<() => void>()
const setToasts = (next: readonly Toast[]) => { toastList = next; toastListeners.forEach((l) => l()) }

export const toasts = {
  get current() { return toastList },
  subscribe(listener: () => void) { toastListeners.add(listener); return () => { toastListeners.delete(listener) } },
  dismiss(id: number) { setToasts(toastList.filter((t) => t.id !== id)) },
}
type ToastOptions = { variant?: Toast['variant']; seconds?: number; dismissible?: boolean }
export function toast(text: string, { variant = 'neutral', seconds = 3, dismissible = false }: ToastOptions = {}) {
  const id = nextToastId++
  setToasts([...toastList, { id, text, variant, dismissible }].slice(-MAX_TOASTS))
  setTimeout(() => toasts.dismiss(id), seconds * 1000)
  return id
}

export const toastWords = { label: 'Messages', close: 'Close' }
export type ToastPlace = 'top' | 'center' | 'bottom' | 'at'
// variant="plain" (0.15.0): messages as glowing words on the game (HudText's look), no plate — a message isn't a button,
// so it must not look like one (Muzzy's rule; Goops 2026-10-18). A dismissible toast keeps its plate: it IS tappable.
export function ToastStack({ label, place = 'top', variant = 'panel', words }: { label?: string; place?: ToastPlace; variant?: 'panel' | 'plain'; words?: Partial<typeof toastWords> }) {
  const w = { ...toastWords, ...words }
  const list = useSyncExternalStore(toasts.subscribe, () => toasts.current, () => toasts.current)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { // show the popover only while there's something to say
    const el = box.current
    if (!el?.showPopover) return // very old browsers: toasts just sit in the page
    const open = el.matches(':popover-open')
    if (list.length && !open) el.showPopover()
    if (!list.length && open) el.hidePopover()
  }, [list.length])
  return (
    <div ref={box} {...{ popover: 'manual' }} className="kit-toasts" data-place={place} role="status" aria-label={label ?? w.label}>
      {list.map((t) => t.dismissible ? (
        <Panel key={t.id} depth={2} gap="s" className="kit-toast" data-variant={t.variant} data-dismissible
          onClick={() => toasts.dismiss(t.id)}>
          <span>{t.text}</span>
          <Button variant="ghost" icon sound="back" aria-label={w.close}>✕</Button>
        </Panel>
      ) : variant === 'plain' ? (
        // the same markup as HudText (hud.tsx imports this file, so it's written out here rather than imported)
        <div key={t.id} className="kit-toast kit-hud-text" data-plain data-variant={t.variant}>
          <Stack gap="xs"><Text kind="heading">{t.text}</Text></Stack>
        </div>
      ) : (
        <Panel key={t.id} depth={2} gap="xs" className="kit-toast" data-variant={t.variant}>{t.text}</Panel>
      ))}
    </div>
  )
}

// TOOLTIP — a small ⓘ button; tap or click it to show a hint next to it (tap anywhere to hide).
export function Tooltip({ text, label = 'More info', icon = 'ⓘ' }: { text: ReactNode; label?: string; icon?: ReactNode }) {
  const id = useId()
  return (
    <>
      <Button variant="ghost" icon aria-label={label} {...{ popoverTarget: id }} className="kit-tooltip-button">{icon}</Button>
      <Panel id={id} {...{ popover: 'auto' }} role="tooltip" depth={2} gap="xs" className="kit-tooltip">{text}</Panel>
    </>
  )
}

// REWARD POPUP — "You got…" with a tile per reward and one button to collect.
export const rewardWords = { title: 'Rewards!', collect: 'Collect' }
type Reward = { icon?: ReactNode; amount?: ReactNode; label: string }
export function RewardPopup({ rewards, onCollect, words }: { rewards: Reward[]; onCollect?: () => void; words?: Partial<typeof rewardWords> }) {
  const w = { ...rewardWords, ...words }
  return (
    <Modal title={w.title} actions={<Button onClick={() => { screens.pop(); onCollect?.() }}>{w.collect}</Button>}>
      <Grid gap="s" min="s">
        {rewards.map((r) => (
          <Card key={r.label} title={<>{r.icon} {r.amount}</>}><Text kind="caption">{r.label}</Text></Card>
        ))}
      </Grid>
    </Modal>
  )
}

// EMPTY STATE — what a list shows when there's nothing in it yet, with an optional button.
type EmptyProps = { title: string; message?: string; icon?: ReactNode; actionLabel?: string; onAction?: () => void }
export function EmptyState({ title, message, icon, actionLabel, onAction }: EmptyProps) {
  return (
    <Stack gap="s" className="kit-empty">
      {shown(icon) && <Text kind="display">{icon}</Text>}
      <Text kind="heading">{title}</Text>
      {message && <Text kind="caption">{message}</Text>}
      {actionLabel && onAction && <Button variant="secondary" onClick={onAction}>{actionLabel}</Button>}
    </Stack>
  )
}

// SPINNER — "working on it". The label is read out by screen readers.
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="kit-spinner kit-spinner-big" role="status" aria-label={label} />
}

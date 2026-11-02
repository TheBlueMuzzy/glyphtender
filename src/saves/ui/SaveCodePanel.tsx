// SAVE CODE PANEL — the ready-made screen behind Settings → "Save code", built from UI kit parts (Modal, Button,
// TextInput, ScrollArea, toast, askConfirm). Copy the code out, download it as a file, paste a code in, or load a
// file — and, when the game has a cloud (F96), make a short LINK CODE, type one in, or delete it ("Delete my data").
// This folder (src/saves/ui/) is only installed in games that have the UI kit (src/ui/kit/) — it's the saves
// module's one link to another module, and it's optional: a game without the UI kit uses saveCode.ts directly.
//
// Register it as a screen (the screen stack gives it Esc, phone Back and "only the top screen takes taps"):
//   <ScreenStack screens={{ ...screens, saveCode: () => <SaveCodePanel saves={[progress, settings]} health={health}
//      nudge={nudge} cloud={{ url: cloudAddress(import.meta.env.VITE_SAVES_CLOUD) }} onLoaded={() => location.reload()} /> }}>
// and open it from the Settings row: onAction={(id) => id === SAVE_CODE_ROW && screens.push('saveCode')}
import { useEffect, useRef, useState } from 'react'
import { askConfirm, Button, Modal, Row, ScrollArea, Stack, Text, TextInput, screens, toast } from '../../ui/kit'
import { CLOUD_WORDS, deleteLinkCode, linkCodeHere, loadLinkCode, makeLinkCode, type CloudOptions } from '../cloud'
import { savesConfig } from '../config'
import { HEALTH_WORDS, type SaveHealth } from '../health'
import type { BackupNudge } from '../nudge'
import type { Save, SlotSaves } from '../saves'
import { copyText, downloadSaveFile, makeSaveCode, partlyLoaded, readSaveCode, readSaveFile, saveFileName, type CodeResult } from '../saveCode'
import { SAVE_PANEL_WORDS } from './panelWords'

type AnySave = Save<any> | SlotSaves<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- any of the game's saves

export interface SaveCodePanelProps {
  saves: AnySave[]
  /** checkSaveHealth()'s result — its most serious warning is shown at the top. */
  health?: SaveHealth | null
  /** Copying or downloading the code counts as a backup for the "back up your save" nudge. */
  nudge?: BackupNudge
  /** The game's link-code cloud: { url: cloudAddress(import.meta.env.VITE_SAVES_CLOUD) }. No url = no Link code part. */
  cloud?: CloudOptions
  /** After a code or file was loaded (the game reloads its state — location.reload() is the simplest). */
  onLoaded?: () => void
  words?: Partial<typeof SAVE_PANEL_WORDS>
}

export function SaveCodePanel({ saves, health, nudge, cloud, onLoaded, words: wordsIn }: SaveCodePanelProps) {
  const words = { ...SAVE_PANEL_WORDS, ...wordsIn }
  const [code, setCode] = useState('')
  const [pasted, setPasted] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const warning = health?.warnings.find((w) => w.level === 'risk')
  // Link code: the one this device made or used (while it still works), what's typed, and which button is busy
  const [link, setLink] = useState(() => (cloud?.url ? linkCodeHere(saves, cloud) : null))
  const [typedLink, setTypedLink] = useState('')
  const [busy, setBusy] = useState<'make' | 'get' | null>(null)

  useEffect(() => {
    let live = true
    makeSaveCode(saves).then((made) => { if (live) setCode(made) })
    return () => { live = false }
  }, [saves])

  async function copy() {
    const ok = await copyText(code)
    toast(ok ? words.copied : words.copyFailed, { variant: ok ? 'neutral' : 'danger' })
    if (ok) nudge?.backedUp()
  }

  function download() {
    const ok = downloadSaveFile(code, saveFileName(saves))
    if (ok) nudge?.backedUp()
    else toast(words.downloadFailed, { variant: 'danger' })
  }

  /** Ask first, then bring a save in (a pasted code, a file, or a link code) — the same merge for all three. */
  function load(read: () => Promise<CodeResult>, fromLink = false) {
    askConfirm({
      title: words.askTitle, message: words.askMessage, words: { yes: words.load },
      onConfirm: async () => {
        if (fromLink) setBusy('get') // the server can take a moment: Get my save shows it's working
        const result = await read()
        if (fromLink) { setBusy(null); if (cloud) setLink(linkCodeHere(saves, cloud)) }
        // Part of it came in (F137): the game shows the old values until it reloads — ask, with the same reload a
        // full load uses (no onLoaded from the game: say so, as before)
        if (partlyLoaded(result) && !result.ok && onLoaded) {
          setPasted('')
          setTypedLink('')
          askConfirm({ title: words.partlyTitle, message: `${result.message} ${words.partlyReload}`, words: { yes: words.reload, no: words.later }, onConfirm: onLoaded })
          return
        }
        if (!result.ok) { toast(result.message, { variant: 'danger', seconds: 6 }); return }
        toast(words.loaded)
        setPasted('')
        setTypedLink('')
        onLoaded?.()
      },
    })
  }

  async function loadFile(file: File | undefined) {
    if (!file) return
    const text = await readSaveFile(file)
    load(() => readSaveCode(text, saves))
    if (fileInput.current) fileInput.current.value = '' // the same file can be picked again
  }

  async function makeLink() {
    if (!cloud) return
    setBusy('make')
    const made = await makeLinkCode(saves, cloud)
    setBusy(null)
    if (!made.ok) { toast(made.message, { variant: 'danger', seconds: 6 }); return }
    setLink({ link: made.link, expiresAt: made.expiresAt })
    nudge?.backedUp() // a copy is safe on the server now
  }

  async function copyLink() {
    if (!link) return
    const ok = await copyText(link.link)
    toast(ok ? words.linkCopied : words.copyFailed, { variant: ok ? 'neutral' : 'danger' })
  }

  function getLink() {
    if (cloud) load(() => loadLinkCode(typedLink, saves, cloud), true)
  }

  function deleteData() {
    if (!cloud) return
    askConfirm({
      title: words.deleteTitle, message: words.deleteMessage, danger: true, words: { yes: words.delete },
      onConfirm: async () => {
        const result = await deleteLinkCode(saves, cloud)
        toast(result.message, { variant: result.ok ? 'neutral' : 'danger', seconds: 6 })
        setLink(linkCodeHere(saves, cloud))
      },
    })
  }

  return (
    <Modal title={words.title} onBack={() => screens.pop()} backLabel={words.close}>
      <ScrollArea label={words.title}>
        <Stack gap="m">
          <Text kind="body">{warning ? warning.message : words.intro}</Text>
          {!warning && health && <Text kind="caption">{HEALTH_WORDS.ok}</Text>}
          <TextInput label={words.yourCode} value={code} readOnly onFocus={(e) => e.currentTarget.select()} data-save-code="" />
          <Row gap="s">
            <Button variant="primary" onClick={copy} disabled={!code}>{words.copy}</Button>
            <Button variant="secondary" onClick={download} disabled={!code}>{words.download}</Button>
          </Row>
          <TextInput label={words.paste} value={pasted} onChange={(e) => setPasted(e.currentTarget.value)} autoComplete="off" spellCheck={false} data-save-paste="" />
          <Row gap="s">
            <Button variant="secondary" onClick={() => load(() => readSaveCode(pasted, saves))} disabled={!pasted.trim()}>{words.load}</Button>
            <Button variant="ghost" onClick={() => fileInput.current?.click()}>{words.loadFile}</Button>
          </Row>
          <input ref={fileInput} type="file" accept=".txt,text/plain" hidden onChange={(e) => loadFile(e.currentTarget.files?.[0])} />

          {cloud?.url && (
            // Every line is always here (only the words and buttons change), so the card never grows mid-use
            <Stack gap="m">
              <Text kind="heading">{words.linkTitle}</Text>
              <Text kind="body">{words.linkIntro}</Text>
              <TextInput label={words.yourLink} value={link?.link ?? ''} placeholder={words.noLinkYet} readOnly onFocus={(e) => e.currentTarget.select()} data-link-code="" />
              <Text kind="caption">{link ? CLOUD_WORDS.worksUntil(link.expiresAt) : words.linkLasts(savesConfig().cloud.keepDays)}</Text>
              <Row gap="s">
                {link ? (
                  <>
                    <Button variant="secondary" onClick={copyLink}>{words.copyLink}</Button>
                    <Button variant="danger" onClick={deleteData}>{words.deleteData}</Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={makeLink} loading={busy === 'make'}>{words.makeLink}</Button>
                )}
              </Row>
              <TextInput label={words.typeLink} value={typedLink} onChange={(e) => setTypedLink(e.currentTarget.value)} placeholder="K7QM-2XRP" autoComplete="off" autoCapitalize="characters" spellCheck={false} data-link-typed="" />
              <Row gap="s">
                <Button variant="secondary" onClick={getLink} disabled={!typedLink.trim()} loading={busy === 'get'}>{words.getLink}</Button>
              </Row>
              <Text kind="caption">{CLOUD_WORDS.privacy(savesConfig().cloud.keepDays)}</Text>
            </Stack>
          )}
        </Stack>
      </ScrollArea>
    </Modal>
  )
}

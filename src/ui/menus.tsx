// MENUS — the home page and the screens it opens, all built from the UI kit.
// Words: content/text/en.json · settings rows: content/ui/settings.json · look: content/ui/style.json
import { useEffect, useState } from 'react'
import { Button, Callout, Credits, HowToPlay, MainMenu, Pause, Settings, fill, screens } from './kit'
import { getAudio, useAudioSnapshot } from '../audio'
import { GameOverScreen } from '../game/GameOver'
import { leaveToMenu, newGameFromEnd, openNewGame } from './newGame'
import { resetTips, settings, settingsChanged } from './gameSettings'
import { canFullscreen, hiddenFullscreenRows, isInstalled, setFullscreen, useFullscreen } from './fullscreen'
import { LobbyScreen } from './online/LobbyScreen'
import { OnlineStartScreen } from './online/OnlineStartScreen'
import { useOnline } from './online/session'
import { wordSwitchesLine } from './online/onlineOptions'
import { useGameStore } from '../store/gameStore'
import text from '../../content/text/en.json'
import credits from '../../content/credits.json'
import version from '../../version.json'
import tutorialTuning from '../../content/tuning/tutorial.json'
import { useTutorial } from '../tutorial/progress'
import { leaveTutorial, openTutorial, replayTutorial, showUnlockedToast, startTutorialGame } from '../tutorial/start'

// Online needs a live server: shown in local dev, and on the live site only once VITE_PARTY_HOST is set at build time.
const onlineAvailable = import.meta.env.DEV || !!import.meta.env.VITE_PARTY_HOST

// HOME — title, tagline, and the menu buttons in our order (Play is the main button).
// A brand-new device (F74): Play opens the tutorial's overview, and Play online is locked — a tap on it says why.
export function MainMenuScreen() {
  const w = text.mainMenu
  const tutorialDone = useTutorial((s) => s.done)
  const [lockedHint, setLockedHint] = useState(false)
  useEffect(() => {
    if (!lockedHint) return
    const timer = setTimeout(() => setLockedHint(false), tutorialTuning.tipSeconds * 1000)
    return () => clearTimeout(timer)
  }, [lockedHint])
  const closing = (go: () => void) => () => { setLockedHint(false); go() } // any other button closes the locked hint
  // Full screen / Leave full screen — only where it can work and isn't already app-like (fullscreen.ts)
  const fullscreen = useFullscreen((s) => s.on)
  const fullscreenButton = canFullscreen() && !isInstalled()
  return (
    <MainMenu
      title={w.title}
      subtitle={w.subtitle}
      items={[
        { label: w.play, onClick: closing(tutorialDone ? openNewGame : openTutorial), primary: true },
        ...(onlineAvailable ? [tutorialDone
          ? { label: w.playOnline, onClick: () => screens.push('online') }
          : { label: w.playOnline, onClick: () => setLockedHint(true), locked: true }] : []),
        { label: w.settings, onClick: closing(() => screens.push('settings')) },
      ]}
    >
      {fullscreenButton && (
        <Button variant="ghost" onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? w.exitFullscreen : w.fullscreen}</Button>
      )}
      {lockedHint && <Callout target="[data-locked]" text={text.tutorial.locked} placement="bottom" onDismiss={() => setLockedHint(false)} />}
    </MainMenu>
  )
}

// PLAY ONLINE (src/ui/online/) — name + Create / Join, then the lobby while in a room.
export { LobbyScreen, OnlineStartScreen }

// SETTINGS — rows come from content/ui/settings.json ("on": false hides a row). The game follows its own
// rows at once (Gameplay → Tray position), even when Settings is opened from Pause mid-game.
export function SettingsScreen() {
  const onAction = (id: string) => {
    if (id === 'credits') screens.push('credits')
    if (id === 'resetTips') resetTips()
    if (id === 'replayTutorial') replayTutorial()
  }
  // (Esc on a computer turns Full screen off from outside this screen: key = start again from the saved values)
  const resaved = useFullscreen((s) => s.resaved)
  return <Settings key={resaved} schema={settings} info={{ version: `v${version.version}` }} hide={hiddenFullscreenRows()} onAction={onAction} onChange={settingsChanged} />
}

// CREDITS — people from en.json, then every asset listed in content/credits.json.
export function CreditsScreen() {
  return <Credits people={text.credits.people} assets={credits} />
}

// PAUSE — the Menu button in the game: back to the garden, the Rules, Settings, Submit a word (F69), or leave (asks
// first). Under the title: "2-letter words: on/off" for this game (F53).
export function PauseScreen() {
  useAudioSnapshot(getAudio(), 'paused') // the garden goes quiet and muffled while paused (content/audio.json snapshots)
  // Online: the title carries the room code ("Paused · Room BAKU"), so it's always one tap away
  const code = useOnline((s) => s.code)
  const online = useGameStore((s) => s.online !== null)
  const w = online && code ? { ...text.game.pause, title: fill(text.online.pauseTitle, { code }) } : text.game.pause
  // The one setting you can't see while playing (F53 — Muzzy 2026-10-08): are 2-letter words allowed this game?
  const twoLetter = useGameStore((s) => (s.game ? s.game.config.rules.minWordLength <= 2 : null))
  // …and F71: this game's British spelling / vulgar words, when on (online: the host's) — "2-letter words: off · Vulgar words on"
  const switches = useGameStore((s) => wordSwitchesLine(s.game?.config.extraWords))
  const twoLetterNote = twoLetter === null ? undefined : twoLetter ? text.game.pauseNote.twoLetterOn : text.game.pauseNote.twoLetterOff
  const note = twoLetterNote && switches ? `${twoLetterNote} · ${switches}` : twoLetterNote
  // Submit a word (F69): always there; with no seed placed, its screen says to place one first (a greyed row's hint
  // wrapped onto two lines on a phone)
  const submitRow = { label: text.game.submitWord.pauseRow, onClick: () => screens.push('submitWord') }
  // The tutorial game (F74): Leave tutorial — its confirm says leaving unlocks everything
  const tutorial = useTutorial((s) => s.active)
  const leave = text.tutorial.leave
  const words = tutorial ? { ...w, quit: leave.button, quitTitle: leave.title, quitMessage: leave.message } : w
  return <Pause words={words} note={note} items={[submitRow]} onHowToPlay={() => screens.push('rules')} onSettings={() => screens.push('settings')} onQuit={tutorial ? leaveTutorial : leaveToMenu} />
}

// RULES — a short how-to-play in three pages (words: en.json → game.rules), opened from Pause.
export function RulesScreen() {
  const { pages, ...words } = text.game.rules
  return <HowToPlay pages={pages} words={words} />
}

// TUTORIAL OVERVIEW (F74) — 3 cards before the tutorial game; the last card's button (or Skip) deals it.
export function TutorialOverviewScreen() {
  const { pages, ...words } = text.tutorial.overview
  return <HowToPlay pages={pages} words={words} onDone={startTutorialGame} onSkip={startTutorialGame} />
}

// GAME OVER — the end table over the tangled garden (src/game/GameOver.tsx).
export function GameOverDialog() {
  useEffect(showUnlockedToast, []) // the tutorial game just finished: "Everything's unlocked!"
  return <GameOverScreen onNewGame={newGameFromEnd} onMenu={leaveToMenu} />
}

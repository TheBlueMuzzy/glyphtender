// THE "SOMETHING BROKE" SCREEN — shown instead of a blank page when the game breaks (a React error nobody caught).
// Built from UI kit parts only (Screen, Panel, Text, Button), so it looks like the rest of the game in every style.
// This folder (src/crashes/ui/) is only installed in games that have the UI kit (src/ui/kit/), like the saves screens.
// The game doesn't place it itself: crashRootOptions() (crashRoot.tsx) shows it when React gives up.
import { Button, Panel, Screen, Text } from '../../ui/kit'

export const CRASH_SCREEN_WORDS = {
  title: 'Something broke',
  reported: 'The problem was reported.',
  reload: 'Reload',
}

export interface CrashScreenProps {
  /** true → "The problem was reported." under the title. */
  reported?: boolean
  /** What Reload does. Default: reload the page. */
  onReload?: () => void
  /** From content/text/en.json, when the game has its own words. */
  words?: Partial<typeof CRASH_SCREEN_WORDS>
}

export function CrashScreen({ reported, onReload = () => location.reload(), words: wordsIn }: CrashScreenProps) {
  const words = { ...CRASH_SCREEN_WORDS, ...wordsIn }
  return (
    <Screen label={words.title}>
      <Panel depth={2} gap="m" className="kit-menu">
        <Text kind="title">{words.title}</Text>
        {reported && <Text kind="caption">{words.reported}</Text>}
        <Button onClick={onReload}>{words.reload}</Button>
      </Panel>
    </Screen>
  )
}

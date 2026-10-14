// MENU HEADER — the one top row every menu card shares (0.10.0): ‹ back on the left, the title, an action on the right.
//   <MenuHeader title="Settings" onBack={() => screens.pop()} />
//   <MenuHeader title="New game" onBack={close} action={<Button onClick={start}>Start</Button>} />
// ‹ only shows when onBack is given (Pause has Resume instead). It's a square icon button that sounds like a Back,
// read out as backLabel ("Back"). Muzzy 2026-10-13: "'main menu' as a button there might feel weird. where a back
// button would do the same with much less space. < = back."
// The title takes the room that's left and wraps onto a second line on a narrow phone; the ‹ and the action keep
// their size. A title that isn't plain words (e.g. "Room ABCD" with a box round the code) can be passed as-is.
import type { ReactNode } from 'react'
import { Button, Text } from '../controls'

type MenuHeaderProps = { title: ReactNode; onBack?: () => void; backLabel?: string; action?: ReactNode }

export function MenuHeader({ title, onBack, backLabel = 'Back', action }: MenuHeaderProps) {
  return (
    <div className="kit-menu-header">
      {onBack && <Button variant="secondary" icon sound="back" aria-label={backLabel} onClick={onBack}>‹</Button>}
      <div className="kit-menu-header-title">{typeof title === 'string' ? <Text kind="title">{title}</Text> : title}</div>
      {action && <div className="kit-menu-header-action">{action}</div>}
    </div>
  )
}

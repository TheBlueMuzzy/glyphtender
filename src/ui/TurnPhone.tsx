// TURN YOUR PHONE (F97) — Glyphtender is played upright. A phone (or tablet) held on its side gets this screen over
// everything until it's turned back; desktop windows never do, however short (no touch screen = never shown).
// "On its side" = wider than tall AND shorter than content/tuning/layout.json turnPhoneHeight AND a touch screen.
// Built from kit parts here first; queued for the UI kit (extract.mjs) so other games get it too.
import { useEffect, useState } from 'react'
import { EmptyState, Screen } from './kit'
import { useLayoutTuning } from '../game/useTuning'
import text from '../../content/text/en.json'

const sidewaysQuery = (maxHeight: number) => `(orientation: landscape) and (max-height: ${maxHeight}px) and (pointer: coarse)`

/** true while the device is a phone held on its side (re-checked on every turn of the phone and every live edit). */
function useSideways(maxHeight: number) {
  const [sideways, setSideways] = useState(() => matchMedia(sidewaysQuery(maxHeight)).matches)
  useEffect(() => {
    const query = matchMedia(sidewaysQuery(maxHeight))
    const update = () => setSideways(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [maxHeight])
  return sideways
}

export function TurnPhone() {
  const { turnPhoneHeight } = useLayoutTuning()
  const sideways = useSideways(turnPhoneHeight)
  if (!sideways) return null
  const w = text.turnPhone
  return (
    <div className="turn-phone" data-knobs="turnPhone">
      <Screen label={w.title} dialog>
        <EmptyState icon={w.icon} title={w.title} message={w.message} />
      </Screen>
    </div>
  )
}

// Is there something to draw? (0.33.3, F134) React draws the number 0 as "0", so `{badge && <Badge>{badge}</Badge>}`
// with badge = 0 leaves a stray "0" on the page, outside the badge. `{shown(badge) && …}` is false only for nothing —
// undefined, null, false or '' — so a 0 shows as "0" inside its badge, where it belongs.
import type { ReactNode } from 'react'

export const shown = (node: ReactNode) => node !== undefined && node !== null && node !== false && node !== ''

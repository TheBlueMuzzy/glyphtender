// BADGE — a small tag: "NEW", "3", "Host". variant: neutral | primary | danger | success (0.31.0: a good / gained tag,
// e.g. StatList's ▲ on net pay or a rank up).
import type { ReactNode } from 'react'

export function Badge({ variant = 'neutral', children }: { variant?: 'neutral' | 'primary' | 'danger' | 'success'; children: ReactNode }) {
  return <span className="kit-badge" data-variant={variant}>{children}</span>
}

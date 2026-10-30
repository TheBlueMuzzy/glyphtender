// Where the small PAUSED badge sits while the panel is closed (Dev Kit 0.18.1).
// content/devkit.json "pauseBadgeSpot": one of BADGE_SPOTS. Left out (or misspelled) = "left" (middle of the left edge).
// Why not the top: games put their HUD row there (Goops "CRACKS 0/10" on a 390-wide phone sat under the badge), and
// the bottom is where a HUD's bars go (Goops INTEGRITY, under both bottom corners too); the middle of a side edge was clear
// of Goops's HUD at 390x844, 844x390 and 1440x900 (2026-10-18).
// Every spot keeps clear of the phone's notch / home bar (CSS env(safe-area-inset-*), devkit.css).
// check:framework warns when the game's spot covers its HUD on an upright phone, and names the clear ones (badgeClear.mjs, 0.21.0).
export const BADGE_SPOTS = ['bottom', 'bottom-left', 'bottom-right', 'top', 'top-left', 'top-right', 'left', 'right'] as const
export type BadgeSpot = (typeof BADGE_SPOTS)[number]
export const DEFAULT_BADGE_SPOT: BadgeSpot = 'left'

/** The file's value if it's a known spot, else the default. */
export function readBadgeSpot(value: unknown): BadgeSpot {
  return (BADGE_SPOTS as readonly unknown[]).includes(value) ? (value as BadgeSpot) : DEFAULT_BADGE_SPOT
}

const settings = import.meta.glob<{ pauseBadgeSpot?: unknown }>('../../../content/devkit.json', { eager: true, import: 'default' })
export const badgeSpot: BadgeSpot = readBadgeSpot(Object.values(settings)[0]?.pauseBadgeSpot)

// THE DRAG SETTINGS (content/tuning/drag.json) as a live ref: each drag type's carry style and target look, and the
// carry / target feel numbers. Read when a drag starts — by a person's drag (usePieceInput), an AI's or an online
// rival's draft (useBotDraft) and a planned move's glide (useGlide) — so everyone's pieces move the same way, and a
// Dev Kit edit applies from the next drag.
import { liveTuning } from '../devkit/tuning/liveTuning'
import dragFile from '../../content/tuning/drag.json'
import type { TargetFeel } from '../ui/kit'

export type DragType = keyof typeof dragFile.styles
export const dragTuning = liveTuning('drag', dragFile)

/** drag.json's target numbers, in the ui-kit's TargetFeel shape (read on every use, so a Dev Kit edit applies). */
export const targetFeel = (): TargetFeel => {
  const t = dragTuning.current
  return { makeRoom: t.makeRoom, roomTime: t.roomTime, snapRadius: t.snapRadius, snapPull: t.snap, tetherBend: t.tetherBend, arrowSize: t.arrowSize }
}

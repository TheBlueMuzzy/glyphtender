// THE DRAG SETTINGS (content/tuning/drag.json) as a live ref: each drag type's carry style and target look, and the
// carry / target feel numbers. Read when a drag starts — by a person's drag (usePieceInput), an AI's or an online
// rival's draft (useBotDraft) and a planned move's glide (useGlide) — so everyone's pieces move the same way, and a
// Dev Kit edit applies from the next drag.
import { liveTuning } from '../devkit/tuning/liveTuning'
import dragFile from '../../content/tuning/drag.json'

export type DragType = keyof typeof dragFile.styles
export const dragTuning = liveTuning('drag', dragFile)

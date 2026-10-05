// What every Glyphtender goal shares: the shapes it's written against and a few small helpers.
// A goal scores ONE move for ONE thing it wants ({ value, why }); the brain (kit/brain.ts) compares the values
// within a goal only, so each goal may use whatever scale is natural to it. Design: .planning/design/ai.md "Goals".
import type { Context, Goal } from '../kit/types'
import type { SeatView } from '../../engine/rules'
import type { Action, GameState } from '../../engine/types'
import { vocabularyOf, type TurnAction } from '../look'

export type GlyphContext = Context<SeatView, GameState>
export type GlyphGoal = Goal<SeatView, Action, GameState>

/** The move as a turn, or null for a draft / refresh (goals only judge turns). */
export const asTurn = (action: Action): TurnAction | null => (action.type === 'turn' ? action : null)

/** The lowest Zipf a word needs for this bot to aim for it (skill vocabulary + personality modifier). */
export const vocabulary = (ctx: GlyphContext) => vocabularyOf(ctx.skill.extras)

/** The rival seats (everyone but the bot). */
export const rivalsOf = (ctx: GlyphContext) => Array.from({ length: ctx.world.config.players }, (_, s) => s).filter((s) => s !== ctx.seat)

/** No opinion: the same value for every move. */
export const NOTHING = { value: 0 }

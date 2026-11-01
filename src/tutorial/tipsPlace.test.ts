// Where a tutorial callout about the tray / buttons goes first (tipsPlace.ts offBoardSide, F91). The page itself (that it
// really covers no board hex at 390×844 and 360×780) is checked by e2e/tutorial-rails.mjs.
import { describe, expect, it } from 'vitest'
import { offBoardSide } from './tipsPlace'

describe('offBoardSide', () => {
  it('the prompt on top (upright phone, boardVertical above 0): below its target — never over the board', () => {
    expect(offBoardSide(true)).toBe('bottom')
  })
  it('the prompt just above the tray (desktop, boardVertical 0): above, in the prompt’s place — as before', () => {
    expect(offBoardSide(false)).toBe('top')
  })
})

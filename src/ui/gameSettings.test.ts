import { describe, expect, it } from 'vitest'
import settings from '../../content/ui/settings.json'
import { defaultValues } from './kit'
import { fromSettings, settingsChanged, useGameSettings } from './gameSettings'

describe('the game’s own settings', () => {
  it('Tray position is a Gameplay row, Standard by default (tall: tray below · wide: right)', () => {
    const row = settings.tabs.find((t) => t.id === 'gameplay')!.rows.find((r) => r.id === 'trayPosition')!
    expect(row).toMatchObject({ type: 'selector', options: ['Standard', 'Flipped'], default: 'Standard' })
    expect(fromSettings(defaultValues(settings))).toEqual({ trayFlipped: false, aiSpeed: 'normal' })
  })

  it('changing it in Settings flips the game screen at once', () => {
    settingsChanged({ ...defaultValues(settings), trayPosition: 'Flipped' })
    expect(useGameSettings.getState().trayFlipped).toBe(true)
    settingsChanged({ ...defaultValues(settings), trayPosition: 'Standard' })
    expect(useGameSettings.getState().trayFlipped).toBe(false)
  })
})

describe('AI speed (F42)', () => {
  it('is a Gameplay row: Slow · Normal · Fast · Instant, Normal by default — the names content/ai/pace.json speeds uses', () => {
    const row = settings.tabs.find((t) => t.id === 'gameplay')!.rows.find((r) => r.id === 'aiSpeed')!
    expect(row).toMatchObject({ type: 'selector', options: ['Slow', 'Normal', 'Fast', 'Instant'], default: 'Normal' })
    settingsChanged({ ...defaultValues(settings), aiSpeed: 'Instant' })
    expect(useGameSettings.getState().aiSpeed).toBe('instant')
    settingsChanged({ ...defaultValues(settings), aiSpeed: 'Normal' })
    expect(useGameSettings.getState().aiSpeed).toBe('normal')
  })
})

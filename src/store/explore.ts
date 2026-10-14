// EXPLORE MODE'S SWITCH (F79, design/tutorial.md §6) — on while the player is in the ? mode. Its own tiny store (no
// imports) so the tutorial layer (no tips or nudges while exploring), the bots (a local game pauses) and the input
// (taps explain instead of act) can all read it without importing each other.
import { create } from 'zustand'

export const useExplore = create<{ on: boolean }>()(() => ({ on: false }))
export const setExploring = (on: boolean) => useExplore.setState({ on })

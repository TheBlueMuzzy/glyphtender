// A SEAT'S CHOICES — as label | picker rows (Muzzy 2026-10-14: "Row 1 [Player X] [Person] > [Player X] [AI - Scholar],
// Row 2 [Skill] [Apprentice]"): New Game's seats cycle ◀ Person · AI - Surprise me · AI - Scholar · … ▶ on the seat's
// own row, then (an AI) its bio and a Skill row. ONE piece for every place an AI is picked: New Game's seats and the
// online lobby's "Add an AI player" card (Muzzy 2026-10-08: "they should be the same") — there the first row is
// "AI Type" with the plain names (every seat it adds is an AI), and no "Surprise me" (the name would give it away).
// Each picker is as wide as its longest choice (the kit's Selector), on the right like every row's control; the bio is
// right-aligned under the first picker (2026-10-13: "Anchor the … personality descriptions to the right") and never
// changes size as you flip through: an invisible copy of every bio, piled in one spot, holds it as tall as the longest.
// Words: content/text/en.json → newGame, ai.
import text from '../../content/text/en.json'
import { Selector, Text } from './kit'
import { SURPRISE, skillIds } from './newGame'
import './newGame.css'

const w = text.newGame
const aiWords = text.ai.personality as Record<string, { name: string; type?: string; bio: string }>
const personalityWords = (id: string) => (id === SURPRISE ? w.surprise : aiWords[id] ?? { name: id, bio: '' })
// The personality's type ("Strategist"), else its name ("Surprise me")
const typeName = (id: string): string => { const words: { name: string; type?: string } = personalityWords(id); return words.type || words.name }
const skillName = (id: string) => (text.ai.skill as Record<string, string>)[id] ?? id

/** What a seat is: a person, or an AI (personality + skill). */
export interface SeatPick { ai: boolean; personality: string; skill: string }

export interface AiPickerRowsProps {
  /** Which personalities to offer (New Game puts "Surprise me" first; online has none). */
  personalities: string[]
  value: SeatPick
  onChange: (pick: SeatPick) => void
  /** The first row's label and the pickers' names: New Game's "Player 2"; the lobby's "AI Type". */
  label: string
  /** "Person" in front of the AI choices, which then read "AI - Scholar" (New Game's seats; the lobby only adds AIs). */
  withPerson?: boolean
  /** Extra attributes for the rows (e.g. data-seat for the e2e checks). */
  attrs?: Record<string, string | number | undefined>
}

export function AiPickerRows({ personalities, value, onChange, label, withPerson, attrs }: AiPickerRowsProps) {
  const choices = [...(withPerson ? [null] : []), ...personalities] // (null = Person)
  const nameOf = (id: string | null) => (id === null ? w.person : withPerson ? w.aiChoice.replace('{type}', typeName(id)) : typeName(id))
  const shown = value.ai || !withPerson ? value.personality : null
  return (
    <div className="new-game-ai" {...attrs}>
      <Text kind="label">{label}</Text>
      <Selector label={label} options={choices.map(nameOf)} value={nameOf(shown)}
        onChange={(name) => {
          const id = choices.find((c) => nameOf(c) === name)
          onChange(id === null || id === undefined ? { ...value, ai: false } : { ...value, ai: true, personality: id })
        }} />
      {(value.ai || !withPerson) && <>
        <span className="new-game-bio" data-ai-bio>
          {personalities.map((id) => <span key={id} className="new-game-bio-sizer" aria-hidden="true"><Text kind="caption">{personalityWords(id).bio}</Text></span>)}
          <span><Text kind="caption">{personalityWords(value.personality).bio}</Text></span>
        </span>
        <Text kind="label">{w.skill}</Text>
        <Selector label={withPerson ? `${label}: ${w.skill}` : w.skill} options={skillIds().map(skillName)} value={skillName(value.skill)}
          onChange={(name) => onChange({ ...value, skill: skillIds().find((id) => skillName(id) === name) ?? value.skill })} />
      </>}
    </div>
  )
}

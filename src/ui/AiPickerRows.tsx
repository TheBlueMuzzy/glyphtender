// AN AI SEAT'S CHOICES — AI Type ◀ personality ▶ · its bio · Skill ◀ skill ▶, as label | selector rows (both selectors
// the same width, right edges aligned — newGame.css .new-game-ai). ONE piece for every place an AI is picked: New Game's
// AI seats and the online lobby's "Add an AI player" card (Muzzy 2026-10-08: "they should be the same").
// The rows never change size as you flip through personalities: an invisible copy of every bio, piled in one spot,
// holds the bio space as tall as the longest. Words: content/text/en.json → newGame, ai.
import text from '../../content/text/en.json'
import { Selector, Text } from './kit'
import { SURPRISE, skillIds } from './newGame'
import './newGame.css'

const w = text.newGame
const aiWords = text.ai.personality as Record<string, { name: string; type?: string; bio: string }>
const personalityWords = (id: string) => (id === SURPRISE ? w.surprise : aiWords[id] ?? { name: id, bio: '' })
// What the AI Type selector shows: the personality's type ("Strategist"), else its name ("Surprise me")
const typeName = (id: string): string => { const words: { name: string; type?: string } = personalityWords(id); return words.type || words.name }
const skillName = (id: string) => (text.ai.skill as Record<string, string>)[id] ?? id

export interface AiPickerRowsProps {
  /** Which personalities to offer (New Game puts "Surprise me" first; online has none). */
  personalities: string[]
  personality: string
  skill: string
  onChange: (part: { personality?: string; skill?: string }) => void
  /** For screen readers: whose choices these are ("Player 2"). */
  name?: string
  /** Extra attributes for the rows (e.g. data-seat for the e2e checks). */
  attrs?: Record<string, string | number | undefined>
}

export function AiPickerRows({ personalities, personality, skill, onChange, name, attrs }: AiPickerRowsProps) {
  const label = (what: string) => (name ? `${name}: ${what}` : what)
  return (
    <div className="new-game-ai" {...attrs}>
      <Text kind="label">{w.aiType}</Text>
      <Selector label={label(w.personality)} options={personalities.map(typeName)} value={typeName(personality)}
        onChange={(shown) => onChange({ personality: personalities.find((id) => typeName(id) === shown) ?? personality })} />
      <span className="new-game-bio" data-ai-bio>
        {personalities.map((id) => <span key={id} className="new-game-bio-sizer" aria-hidden="true"><Text kind="caption">{personalityWords(id).bio}</Text></span>)}
        <span><Text kind="caption">{personalityWords(personality).bio}</Text></span>
      </span>
      <Text kind="label">{w.skill}</Text>
      <Selector label={label(w.skill)} options={skillIds().map(skillName)} value={skillName(skill)}
        onChange={(shown) => onChange({ skill: skillIds().find((id) => skillName(id) === shown) ?? skill })} />
    </div>
  )
}
